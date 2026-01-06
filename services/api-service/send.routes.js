const express = require("express");
const nodemailer = require("nodemailer");
const amqp = require("amqplib");
const { v4: uuidv4 } = require("uuid");

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const QUEUE_NAME = "email_outbound_queue";

const parseList = (list) => {
  if (!list) return undefined;
  const arr = Array.isArray(list) ? list : list.split(",");
  const clean = arr.map((e) => e.trim()).filter((e) => e.length > 0);
  return clean.length > 0 ? clean : undefined;
};

function createSendRouter(pgPool) {
  const router = express.Router();

  // Helper: Queue a single email task to RabbitMQ
  async function queueEmailTask(task) {
    let conn, channel;
    try {
      conn = await amqp.connect(RABBITMQ_URL);
      channel = await conn.createChannel();
      await channel.assertQueue(QUEUE_NAME, { durable: true });
      channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(task)), {
        persistent: true,
      });
      console.log(`[🚀] Queued email to: ${task.to}`);
    } catch (err) {
      console.error("RabbitMQ Queue Error:", err);
      throw err;
    } finally {
      if (channel) await channel.close();
      if (conn) await conn.close();
    }
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "karmakarprithwis566@gmail.com",
      pass: "hypc tmqc vmcb zmlx",
    },
  });

  router.post("/", async (req, res) => {
    const { to, cc, bcc, subject, html, attachments } = req.body;
    const { tenant_id } = req.user;

    try {
      const cleanTo = parseList(to);
      const cleanCc = parseList(cc);
      const cleanBcc = parseList(bcc);

      if (!cleanTo) throw new Error("Recipient 'To' is required.");

      // 1. Send via Nodemailer
      const info = await transporter.sendMail({
        from: '"AI Email App" <karmakarprithwis566@gmail.com>',
        to: cleanTo,
        cc: cleanCc,
        bcc: cleanBcc,
        subject: subject || "No Subject",
        html: html,
        attachments: attachments,
      });

      console.log(`[✅] Email sent: ${info.messageId}`);

      // 2. Save to Database
      const internalId = `<${uuidv4()}@mailwise.app>`;

      // --- FIX: SAVE RECIPIENTS IN METADATA ---
      const meta = JSON.stringify({
        intent: "sent",
        status: "sent",
        to: cleanTo, // <--- Saving this so we can display it later
        cc: cleanCc,
        bcc: cleanBcc,
        attachments: attachments,
      });

      if (pgPool) {
        await pgPool.query(
          `INSERT INTO emails (internal_message_id, subject, sender, body_text, body_html, sent_at, tenant_id, ai_metadata, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sent')`,
          [
            internalId,
            subject || "No Subject",
            "karmakarprithwis566@gmail.com",
            html.replace(/<[^>]*>?/gm, ""),
            html,
            new Date(),
            tenant_id,
            meta,
          ]
        );
      }

      res.json({ message: "Email sent and saved!", messageId: info.messageId });
    } catch (err) {
      console.error("Send Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/mass", async (req, res) => {
    const { recipients, subject, html, attachments } = req.body;
    const { tenant_id } = req.user;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res
        .status(400)
        .json({ error: "Recipients list is required for mass mail." });
    }

    try {
      console.log(`[📢] Starting Mass Mail for ${recipients.length} users...`);

      // 1. Loop and Queue
      // We process the loop mostly in parallel to speed up queuing
      await Promise.all(
        recipients.map(async (email) => {
          if (!email || !email.includes("@")) return;

          await queueEmailTask({
            to: email.trim(),
            subject,
            html,
            attachments,
            headers: { "X-Mailwise-Mass": "true" },
            retryCount: 0,
          });
        })
      );

      // 2. Save "Campaign" Record to DB
      // Instead of saving 500 rows, we save one record representing the batch.
      const internalId = `<${uuidv4()}@mailwise.app>`;
      const meta = JSON.stringify({
        intent: "mass-mail",
        status: "processing",
        total_recipients: recipients.length,
        attachments: attachments,
        // Save just a sample or the full list depending on your preference
        recipients_snapshot: recipients,
      });

      if (pgPool) {
        await pgPool.query(
          `INSERT INTO emails (internal_message_id, subject, sender, body_text, body_html, sent_at, tenant_id, ai_metadata, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sent')`, // 'sent' folder so it shows in UI
          [
            internalId,
            subject || "No Subject",
            "karmakarprithwis566@gmail.com",
            "Mass Mail Content...",
            html,
            new Date(),
            tenant_id,
            meta,
          ]
        );
      }

      res.json({
        success: true,
        message: `Queued ${recipients.length} emails for delivery.`,
      });
    } catch (error) {
      console.error("Mass Mail Error:", error);
      res.status(500).json({ error: "Failed to queue mass emails." });
    }
  });

  return router;
}

module.exports = createSendRouter;
