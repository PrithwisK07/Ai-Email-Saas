const express = require("express");
const amqp = require("amqplib");
const Imap = require("imap");
const { simpleParser } = require("mailparser");
const { convert } = require("html-to-text");
const { google } = require("googleapis"); // <--- Import Google

// --- Constants ---
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const QUEUE_NAME = "email_processing_queue";

function formatImapDate(date) {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

// --- HELPER: Generate XOAuth2 Token String for IMAP ---
// IMAP requires the token in a specific Base64 format:
// "user={email}^Aauth=Bearer {token}^A^A"
function buildXOAuth2Token(user, accessToken) {
  const authData = `user=${user}\x01auth=Bearer ${accessToken}\x01\x01`;
  return Buffer.from(authData, "utf-8").toString("base64");
}

function createIngestionRouter(pgPool) {
  const router = express.Router();

  // --- HELPER: Get Dynamic Gmail Credentials ---
  async function getGmailCreds(userId) {
    // 1. Fetch Refresh Token from DB
    const res = await pgPool.query(
      "SELECT email, refresh_token FROM google_tokens WHERE user_id = $1",
      [userId],
    );

    if (res.rows.length === 0) {
      throw new Error("Gmail not connected. Please connect in Settings.");
    }

    const { email, refresh_token } = res.rows[0];

    // 2. Setup Google Client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({ refresh_token });

    // 3. Get Fresh Access Token
    // This handles the refresh automatically if the access token is expired
    const response = await oauth2Client.getAccessToken();
    const accessToken = response.token;

    return { email, accessToken };
  }

  router.post("/sync", async (req, res) => {
    // Robust ID extraction
    const user_id = req.user.id || req.user.user_id;
    const tenant_id = req.user.user?.tenant_id || req.user.tenant_id;

    console.log(`[+] Starting INCREMENTAL sync for User: ${user_id}`);

    try {
      // --- 1. GET DYNAMIC CREDENTIALS ---
      // 👇 This replaces your hardcoded strings
      const { email, accessToken } = await getGmailCreds(user_id);

      const xoauth2Token = buildXOAuth2Token(email, accessToken);

      // --- 2. DETERMINE SYNC DATE ---
      let searchDateStr;
      const userRes = await pgPool.query(
        "SELECT last_synced_at FROM users WHERE user_id = $1",
        [user_id],
      );

      const lastSync = userRes.rows[0]?.last_synced_at;

      if (lastSync) {
        const sinceDate = new Date(lastSync);
        sinceDate.setDate(sinceDate.getDate() - 1); // Overlap by 1 day for safety
        searchDateStr = formatImapDate(sinceDate);
        console.log(`[📅] Syncing since: ${sinceDate.toISOString()}`);
      } else {
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - 3); // Default: Last 30 days
        searchDateStr = formatImapDate(sinceDate);
        console.log(
          `[📅] First sync. Defaulting to: ${sinceDate.toISOString()}`,
        );
      }

      // --- 3. CONFIGURE IMAP WITH OAUTH ---
      const imapConfig = {
        xoauth2: xoauth2Token, // <--- Use the Base64 token string
        user: email, // <--- Still needed for identification
        host: "imap.gmail.com",
        port: 993,
        tls: true,
        authTimeout: 10000,
        tlsOptions: { rejectUnauthorized: false },
      };

      // --- 4. CONNECT & FETCH ---
      let connection;
      let channel;

      console.log("Connecting to RabbitMQ...");
      connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createChannel();
      await channel.assertQueue(QUEUE_NAME, { durable: true });

      const parsedEmails = await new Promise((resolve, reject) => {
        const imap = new Imap(imapConfig);
        const allParsedEmails = [];

        function openInbox(cb) {
          imap.openBox("[Gmail]/All Mail", true, cb);
        }

        imap.once("ready", () => {
          openInbox((err, box) => {
            if (err)
              return reject(new Error("Error opening INBOX: " + err.message));

            console.log(
              `[🔎] Searching IMAP for emails SINCE ${searchDateStr}...`,
            );

            imap.search(["ALL", ["SINCE", searchDateStr]], (err, results) => {
              if (err) {
                imap.end();
                return reject(err);
              }
              if (!results || results.length === 0) {
                console.log("[ℹ️] No new emails found.");
                imap.end();
                return resolve([]);
              }

              console.log(`[🔎] Found ${results.length} raw messages.`);
              const f = imap.fetch(results, { bodies: "" });

              f.on("message", (msg, seqno) => {
                let messageUID;
                msg.once("attributes", (attrs) => {
                  messageUID = attrs.uid;
                });

                msg.on("body", (stream) => {
                  simpleParser(stream, (err, parsed) => {
                    if (!err && messageUID) {
                      const isMassMail = parsed.headers.get("x-mailwise-mass");

                      if (isMassMail) {
                        console.log(
                          `[🚫] Skipping Mass Mail echo: ${parsed.subject}`,
                        );
                        return;
                      }

                      let cleanText = parsed.text;
                      if (parsed.html) {
                        cleanText = convert(parsed.html, {
                          wordwrap: 130,
                          selectors: [
                            { selector: "a", options: { ignoreHref: true } },
                          ],
                        });
                      }

                      const attachments = parsed.attachments
                        ? parsed.attachments.map((att) => ({
                            filename: att.filename,
                            contentType: att.contentType,
                            size: att.size,
                            content: att.content.toString("base64"),
                            encoding: "base64",
                          }))
                        : [];

                      allParsedEmails.push({
                        tenant_id: tenant_id,
                        user_id: user_id,
                        internal_message_id: messageUID,
                        subject: parsed.subject,
                        from: parsed.from ? parsed.from.text : "Unknown",
                        recipient: parsed.to ? parsed.to.text : null,
                        date: parsed.date,
                        textBody: cleanText,
                        htmlBody: parsed.html,
                        attachments: attachments,
                      });
                    }
                  });
                });
              });

              f.once("error", (err) =>
                reject(new Error("Fetch error: " + err.message)),
              );
              f.once("end", () => {
                imap.end();
                return resolve(allParsedEmails);
              });
            });
          });
        });

        imap.once("error", (err) => {
          // Provide a clearer error if authentication fails
          if (err.source === "authentication") {
            return reject(
              new Error(
                "IMAP Authentication Failed. Try reconnecting Gmail in settings.",
              ),
            );
          }
          reject(new Error("IMAP connection error: " + err.message));
        });

        imap.connect();
      });

      // --- 5. QUEUE & FINISH ---
      if (parsedEmails.length > 0) {
        console.log(`[🚀] Publishing ${parsedEmails.length} emails...`);
        parsedEmails.sort((a, b) => new Date(a.date) - new Date(b.date));

        for (const email of parsedEmails) {
          const msgBuffer = Buffer.from(JSON.stringify(email));
          channel.sendToQueue(QUEUE_NAME, msgBuffer, { persistent: true });
        }
      }

      await pgPool.query(
        "UPDATE users SET last_synced_at = NOW() WHERE user_id = $1",
        [user_id],
      );

      if (channel) await channel.close();
      if (connection) await connection.close();

      res.json({
        message: `Sync complete. Queued ${parsedEmails.length} new emails.`,
        count: parsedEmails.length,
        since: searchDateStr,
      });
    } catch (error) {
      console.error("Sync Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/list", async (req, res) => {
    const { tenant_id, user_id } = req.user;

    try {
      // 1. GET USER SETTINGS (Default to 30 days if not set)
      const userRes = await pgPool.query(
        "SELECT settings FROM users WHERE user_id = $1",
        [user_id],
      );
      const retentionDays =
        userRes.rows[0]?.settings?.trash_retention_days || 30;

      // 2. PERMANENT DELETE (If retention is NOT 'never')
      if (retentionDays !== "never") {
        // Note: Vectors are already deleted when moved to trash,
        // so we only need to clean the SQL table here.
        await pgPool.query(
          `DELETE FROM emails 
             WHERE status = 'trash' 
             AND updated_at < NOW() - INTERVAL '${retentionDays} days' 
             AND tenant_id = $1`,
          [tenant_id],
        );
      }

      await pgPool.query(
        `UPDATE emails 
         SET status = 'inbox', snooze_until = NULL, snoozed_at = NULL 
         WHERE status = 'snoozed' AND snooze_until < NOW() AND tenant_id = $1`,
        [tenant_id],
      );

      const result = await pgPool.query(
        `SELECT 
            email_id, 
            subject, 
            sender,
            recipients,
            body_text, 
            body_html,  
            sent_at, 
            ai_metadata,
            status,
            is_starred,
            label,
            snooze_until,
            snoozed_at,
            is_read
         FROM emails 
         WHERE tenant_id = $1 
         ORDER BY sent_at DESC;`,
        [tenant_id],
      );

      const emails = result.rows.map((row) => ({
        ...row,
        id: row.email_id,
        preview: row.body_text ? row.body_text.substring(0, 100) + "..." : "",
      }));

      res.json(emails);
    } catch (error) {
      console.error("Error fetching email list:", error);
      res.status(500).json({ error: "Failed to fetch list" });
    }
  });

  return router;
}

module.exports = createIngestionRouter;
