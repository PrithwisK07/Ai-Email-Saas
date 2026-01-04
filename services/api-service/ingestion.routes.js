const express = require("express");
const amqp = require("amqplib");
const Imap = require("imap");
const { simpleParser } = require("mailparser");
const { convert } = require("html-to-text");

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

// This function receives the db pool and returns a new router
function createIngestionRouter(pgPool) {
  const router = express.Router();

  router.post("/sync", async (req, res) => {
    // Fix: Robust ID extraction
    const user_id = req.user.id;
    const tenant_id = req.user.user?.tenant_id || req.user.tenant_id;

    console.log(`[+] Starting INCREMENTAL sync for User: ${user_id}`);

    // --- 1. DETERMINE SYNC DATE ---
    let searchDateStr;
    try {
      const userRes = await pgPool.query(
        "SELECT last_synced_at FROM users WHERE user_id = $1",
        [user_id]
      );

      const lastSync = userRes.rows[0]?.last_synced_at;
      let sinceDate;

      if (lastSync) {
        sinceDate = new Date(lastSync);
        sinceDate.setDate(sinceDate.getDate() - 1);
        console.log(
          `[📅] Memory found. Syncing since: ${sinceDate.toISOString()}`
        );
      } else {
        sinceDate = new Date("2025-12-28"); // Default start
        console.log(
          `[📅] First sync. Defaulting to: ${sinceDate.toISOString()}`
        );
      }

      searchDateStr = formatImapDate(sinceDate);
    } catch (dbErr) {
      console.error("DB Error fetching sync date:", dbErr);
      return res.status(500).json({ error: "Database error" });
    }

    const imapConfig = {
      user: "karmakarprithwis566@gmail.com",
      password: "hypc tmqc vmcb zmlx",
      host: "imap.gmail.com",
      port: 993,
      tls: true,
      authTimeout: 10000,
      tlsOptions: { rejectUnauthorized: false },
    };

    let connection;
    let channel;

    try {
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
              `[🔎] Searching IMAP for emails SINCE ${searchDateStr}...`
            );

            imap.search(["ALL", ["SINCE", searchDateStr]], (err, results) => {
              if (err) {
                imap.end();
                return reject(err);
              }
              if (!results || results.length === 0) {
                console.log("[ℹ️] No new emails found since " + searchDateStr);
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
                      let cleanText = parsed.text;
                      if (parsed.html) {
                        cleanText = convert(parsed.html, {
                          wordwrap: 130,
                          selectors: [
                            { selector: "a", options: { ignoreHref: true } },
                          ],
                        });
                      }

                      // --- 👇 FIX: EXTRACT ATTACHMENTS 👇 ---
                      const attachments = parsed.attachments
                        ? parsed.attachments.map((att) => ({
                            filename: att.filename,
                            contentType: att.contentType,
                            size: att.size,
                            // Convert Buffer to Base64 for JSON storage
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
                        attachments: attachments, // <--- Add to payload
                      });
                    }
                  });
                });
              });

              f.once("error", (err) =>
                reject(new Error("Fetch error: " + err.message))
              );
              f.once("end", () => {
                imap.end();
                return resolve(allParsedEmails);
              });
            });
          });
        });

        imap.once("error", (err) =>
          reject(new Error("IMAP connection error: " + err.message))
        );
        imap.connect();
      });

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
        [user_id]
      );
      console.log(`[💾] Memory updated.`);

      res.json({
        message: `Sync complete. Queued ${parsedEmails.length} new emails.`,
        count: parsedEmails.length,
        since: searchDateStr,
      });
    } catch (error) {
      console.error("Sync Error:", error.message);
      res.status(500).send("Sync failed: " + error.message);
    } finally {
      if (channel) await channel.close();
      if (connection) await connection.close();
    }
  });

  router.get("/list", async (req, res) => {
    const { tenant_id, user_id } = req.user;

    try {
      // 1. GET USER SETTINGS (Default to 30 days if not set)
      const userRes = await pgPool.query(
        "SELECT settings FROM users WHERE user_id = $1",
        [user_id]
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
          [tenant_id]
        );
      }

      await pgPool.query(
        `UPDATE emails 
         SET status = 'inbox', snooze_until = NULL, snoozed_at = NULL 
         WHERE status = 'snoozed' AND snooze_until < NOW() AND tenant_id = $1`,
        [tenant_id]
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
            snoozed_at
         FROM emails 
         WHERE tenant_id = $1 
         ORDER BY sent_at DESC;`,
        [tenant_id]
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
