const express = require("express");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");

const parseList = (list) => {
  if (!list) return undefined;
  const arr = Array.isArray(list) ? list : list.split(",");
  const clean = arr.map((e) => e.trim()).filter((e) => e.length > 0);
  return clean.length > 0 ? clean : undefined;
};

function createSendRouter(pgPool) {
  const router = express.Router();

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

  return router;
}

module.exports = createSendRouter;
