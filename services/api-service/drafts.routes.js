const express = require("express");
const { v4: uuidv4 } = require("uuid");

function createDraftsRouter(pgPool) {
  const router = express.Router();

  router.post("/", async (req, res) => {
    // 1. Destructure payload
    const { id, to, cc, bcc, subject, html = "", attachments = [] } = req.body;

    if (!req.user || !req.user.tenant_id) {
      console.log("❌ Unauthorized: No user found in request");
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { tenant_id } = req.user;

    try {
      const emailId = id || uuidv4();
      const internalId = `<${emailId}@draft.MailWise.app>`;

      const bodyText = html ? html.replace(/<[^>]*>?/gm, "") : "";

      // Convert TO array to String because your DB column is TEXT
      const recipientsString = Array.isArray(to) ? to.join(", ") : to || "";

      const meta = JSON.stringify({
        to, // Store array in JSON for UI
        cc,
        bcc,
        attachments,
        is_draft: true,
      });

      const check = await pgPool.query(
        "SELECT 1 FROM emails WHERE email_id = $1",
        [emailId],
      );

      if (check.rowCount > 0) {
        console.log("📝 Updating existing draft:", emailId);
        await pgPool.query(
          `UPDATE emails 
           SET subject = $1, 
               body_html = $2, 
               body_text = $3, 
               ai_metadata = $4, 
               recipients = $5, 
               sent_at = NOW() 
           WHERE email_id = $6`,
          [
            subject || "(Draft)",
            html,
            bodyText,
            meta,
            recipientsString,
            emailId,
          ],
        );
      } else {
        console.log("📝 Creating new draft:", emailId);
        await pgPool.query(
          `INSERT INTO emails (
              email_id, internal_message_id, subject, sender, 
              body_text, body_html, sent_at, tenant_id, 
              ai_metadata, recipients, status
          )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft')`,
          [
            emailId,
            internalId,
            subject || "(Draft)",
            "",
            bodyText,
            html,
            new Date(),
            tenant_id,
            meta,
            recipientsString,
          ],
        );
      }

      console.log("✅ Draft saved successfully");
      res.json({ message: "Draft saved", id: emailId });
    } catch (err) {
      console.error("❌ Draft Save Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    if (!req.user || !req.user.tenant_id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // Hard delete the draft row since the "Sent" copy will come in via Sync/IMAP
      const result = await pgPool.query(
        "DELETE FROM emails WHERE email_id = $1 AND tenant_id = $2",
        [id, req.user.tenant_id],
      );

      if (result.rowCount === 0) {
        return res
          .status(404)
          .json({ error: "Draft not found or unauthorized" });
      }

      console.log(`🗑️ Draft deleted: ${id}`);
      res.json({ message: "Draft deleted successfully" });
    } catch (err) {
      console.error("Delete Draft Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createDraftsRouter;
