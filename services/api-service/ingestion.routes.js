const express = require("express");
const amqp = require("amqplib");
const Imap = require("imap");
const { simpleParser } = require("mailparser");
const { convert } = require("html-to-text");

// --- Constants ---
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const QUEUE_NAME = "email_processing_queue";

// This function receives the db pool and returns a new router
function createIngestionRouter(pgPool) {
  const router = express.Router();

  /**
   * [POST] /ingestion/sync
   * Fetches emails for the authenticated user and publishes them to the queue
   * with a tenant_id.
   */
  router.post("/sync", async (req, res) => {
    // We get these from the authenticateToken middleware
    const { tenant_id, user_id } = req.user;

    console.log(`[+] Starting sync for Tenant: ${tenant_id}, User: ${user_id}`);

    // --- TODO: This is our last "cheat" ---
    // In a real app, we would query the 'email_accounts' table
    // using the 'user_id' to get the encrypted credentials.
    // For this test, we'll use the same hardcoded values.
    const imapConfig = {
      user: "karmakarprithwis566@gmail.com",
      password: "hypc tmqc vmcb zmlx",
      host: "imap.gmail.com",
      port: 993,
      tls: true,
      authTimeout: 5000,
      tlsOptions: { rejectUnauthorized: false },
    };
    // --- End of TODO ---

    let connection;
    let channel;
    try {
      // --- 1. Connect to RabbitMQ ---
      console.log("Connecting to RabbitMQ...");
      connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createChannel();
      await channel.assertQueue(QUEUE_NAME, { durable: true });

      // --- 2. Fetch Emails (IMAP Logic) ---
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

            imap.search(["ALL", ["SINCE", "Dec 31, 2025"]], (err, results) => {
              if (err || !results || results.length === 0) {
                imap.end();
                return resolve([]);
              }

              const f = imap.fetch(results, { bodies: "" });

              f.on("message", (msg, seqno) => {
                let messageUID;
                msg.once("attributes", (attrs) => {
                  messageUID = attrs.uid;
                });

                msg.on("body", (stream) => {
                  simpleParser(stream, (err, parsed) => {
                    if (!err && messageUID) {
                      // --- NEW DATA CLEANING LOGIC ---
                      let cleanText = parsed.text; // Use .text as a fallback

                      if (parsed.html) {
                        // If HTML is available, it's a better source of truth.
                        // Convert it to clean, readable plain text.
                        cleanText = convert(parsed.html, {
                          wordwrap: 130, // null to disable, 130 is a good default
                          // This ignores links, which are often noisy in emails
                          selectors: [
                            { selector: "a", options: { ignoreHref: true } },
                          ],
                        });
                      }
                      // --- END NEW LOGIC ---

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

      if (parsedEmails.length === 0) {
        return res.json({ message: "No new emails to sync." });
      }

      // --- 3. Publish to Queue (Now with tenant_id) ---
      console.log(
        `[🚀] Publishing ${parsedEmails.length} emails for tenant ${tenant_id}...`
      );

      parsedEmails.sort((a, b) => new Date(b.date) - new Date(a.date));

      for (const email of parsedEmails) {
        const msgBuffer = Buffer.from(JSON.stringify(email));
        channel.sendToQueue(QUEUE_NAME, msgBuffer, { persistent: true });
      }

      res.json({
        message: `Successfully queued ${parsedEmails.length} new emails.`,
        emails: parsedEmails,
      });
    } catch (error) {
      console.error("An error occurred during sync:", error.message);
      res.status(500).send("An error occurred during sync: " + error.message);
    } finally {
      if (channel) await channel.close();
      if (connection) await connection.close();
      console.log("RabbitMQ connection closed.");
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
