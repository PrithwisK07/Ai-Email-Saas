const express = require("express");
const nodemailer = require("nodemailer");
const amqp = require("amqplib");
const { v4: uuidv4 } = require("uuid");
const { google } = require("googleapis");

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

  // --- HELPER: Get Dynamic Transporter for User ---
  async function getUserTransporter(userId) {
    // 1. Fetch Refresh Token from DB
    const res = await pgPool.query(
      "SELECT email, refresh_token FROM google_tokens WHERE user_id = $1",
      [userId],
    );

    if (res.rows.length === 0) {
      throw new Error("Gmail not connected. Please connect in Settings.");
    }
    const { email, refresh_token } = res.rows[0];

    // 2. Create OAuth Client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({ refresh_token });

    // 3. Get fresh Access Token
    const accessTokenResponse = await oauth2Client.getAccessToken();
    const accessToken = accessTokenResponse.token;

    // 4. Create Nodemailer Transporter
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: email,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: refresh_token,
        accessToken: accessToken,
      },
    });
  }

  // --- HELPER: Queue a single email task to RabbitMQ ---
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

  // =================================================================
  // [POST] /send -> Single Email (Immediate Send)
  // =================================================================
  router.post("/", async (req, res) => {
    const { to, cc, bcc, subject, html, attachments } = req.body;
    const { tenant_id, id: user_id } = req.user;

    try {
      const cleanTo = parseList(to);
      const cleanCc = parseList(cc);
      const cleanBcc = parseList(bcc);

      if (!cleanTo) throw new Error("Recipient 'To' is required.");

      // 1. Get Dynamic Transporter for THIS user
      const transporter = await getUserTransporter(user_id);

      // 2. Send via Nodemailer
      const info = await transporter.sendMail({
        from: "me", // Gmail replaces 'me' with authenticated user
        to: cleanTo,
        cc: cleanCc,
        bcc: cleanBcc,
        subject: subject || "No Subject",
        html: html,
        attachments: attachments,
      });

      console.log(`[✅] Email sent: ${info.messageId}`);

      // 3. Save to Database
      const internalId = `<${uuidv4()}@mailwise.app>`;
      const meta = JSON.stringify({
        intent: "sent",
        status: "sent",
        to: cleanTo,
        cc: cleanCc,
        bcc: cleanBcc,
        attachments: attachments,
      });

      if (pgPool) {
        // Fetch sender email for DB record
        const userRes = await pgPool.query(
          "SELECT email FROM google_tokens WHERE user_id = $1",
          [user_id],
        );
        const senderEmail = userRes.rows[0]?.email || "unknown@mailwise.app";

        await pgPool.query(
          `INSERT INTO emails (internal_message_id, subject, sender, body_text, body_html, sent_at, tenant_id, ai_metadata, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sent')`,
          [
            internalId,
            subject || "No Subject",
            senderEmail,
            html.replace(/<[^>]*>?/gm, ""),
            html,
            new Date(),
            tenant_id,
            meta,
          ],
        );
      }

      res.json({ message: "Email sent and saved!", messageId: info.messageId });
    } catch (err) {
      console.error("Send Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // =================================================================
  // [POST] /send/mass -> Mass Mail (Queued via RabbitMQ)
  // =================================================================
  router.post("/mass", async (req, res) => {
    const { recipients, subject, html, attachments } = req.body;
    const { tenant_id, user_id } = req.user;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res
        .status(400)
        .json({ error: "Recipients list is required for mass mail." });
    }

    try {
      console.log(`[📢] Starting Mass Mail for ${recipients.length} users...`);

      // 1. Loop and Queue
      await Promise.all(
        recipients.map(async (email) => {
          if (!email || !email.includes("@")) return;

          await queueEmailTask({
            user_id, // <--- IMPORTANT: Pass user_id so worker knows who is sending
            to: email.trim(),
            subject,
            html,
            attachments,
            headers: { "X-Mailwise-Mass": "true" }, // Watermark to prevent echo
            retryCount: 0,
          });
        }),
      );

      // 2. Save "Campaign" Record to DB
      const internalId = `<${uuidv4()}@mailwise.app>`;
      const meta = JSON.stringify({
        intent: "mass-mail",
        status: "processing",
        total_recipients: recipients.length,
        attachments: attachments,
        recipients_snapshot: recipients,
      });

      if (pgPool) {
        // Fetch sender email for DB record
        const userRes = await pgPool.query(
          "SELECT email FROM google_tokens WHERE user_id = $1",
          [user_id],
        );
        const senderEmail =
          userRes.rows[0]?.email || "mass-mailer@mailwise.app";

        await pgPool.query(
          `INSERT INTO emails (internal_message_id, subject, sender, body_text, body_html, sent_at, tenant_id, ai_metadata, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sent')`,
          [
            internalId,
            subject || "No Subject",
            senderEmail,
            "Mass Mail Content...",
            html,
            new Date(),
            tenant_id,
            meta,
          ],
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
