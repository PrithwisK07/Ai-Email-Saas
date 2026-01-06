const express = require("express");

function createContactsRouter(pgPool) {
  const router = express.Router();

  router.get("/suggestions", async (req, res) => {
    const { tenant_id } = req.user;

    try {
      // 1. Fetch all unique Senders (people who emailed you)
      const senderRes = await pgPool.query(
        `SELECT DISTINCT sender FROM emails WHERE tenant_id = $1`,
        [tenant_id]
      );

      // 2. Fetch 'Sent' metadata (people you emailed via app)
      // We explicitly look for emails where we saved metadata
      const sentRes = await pgPool.query(
        `SELECT ai_metadata FROM emails 
         WHERE tenant_id = $1 AND status = 'sent' AND ai_metadata IS NOT NULL`,
        [tenant_id]
      );

      const contactSet = new Set();

      // Helper regex to extract just the email: "Name <email@com>" -> "email@com"
      const extractEmail = (str) => {
        if (!str) return null;
        const match = str.match(
          /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/
        );
        return match ? match[1].toLowerCase() : null;
      };

      // Process Senders
      senderRes.rows.forEach((row) => {
        const e = extractEmail(row.sender);
        if (e) contactSet.add(e);
      });

      // Process Sent Metadata (to, cc, bcc arrays)
      sentRes.rows.forEach((row) => {
        const meta = row.ai_metadata;
        if (meta) {
          ["to", "cc", "bcc"].forEach((field) => {
            if (Array.isArray(meta[field])) {
              meta[field].forEach((raw) => {
                const e = extractEmail(raw);
                if (e) contactSet.add(e);
              });
            }
          });
        }
      });

      // Convert Set to Array and Sort
      const suggestions = Array.from(contactSet).sort();

      res.json(suggestions);
    } catch (error) {
      console.error("Contacts Error:", error);
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  return router;
}

module.exports = createContactsRouter;
