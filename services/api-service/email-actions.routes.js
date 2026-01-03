const express = require("express");

function createEmailActionsRouter(pgPool) {
  const router = express.Router();

  // PATCH /:id/star -> Toggle Star status
  router.patch("/:id/star", async (req, res) => {
    const { id } = req.params;
    const { is_starred } = req.body; // Expect boolean
    const { tenant_id } = req.user;

    try {
      await pgPool.query(
        "UPDATE emails SET is_starred = $1 WHERE email_id = $2 AND tenant_id = $3",
        [is_starred, id, tenant_id]
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Star Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /:id/status -> Move to Inbox, Archive, or Trash
  router.patch("/:id/status", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'inbox', 'archive', 'trash'
    const { tenant_id } = req.user;

    try {
      await pgPool.query(
        "UPDATE emails SET status = $1 WHERE email_id = $2 AND tenant_id = $3",
        [status, id, tenant_id]
      );
      console.log(status);
      res.json({ success: true });
    } catch (error) {
      console.error("Status Update Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  router.patch("/:id/label", async (req, res) => {
    const { id } = req.params;
    const { label } = req.body; // 'Meeting', 'Task', 'Info', 'General'
    const { tenant_id } = req.user;

    try {
      await pgPool.query(
        "UPDATE emails SET label = $1 WHERE email_id = $2 AND tenant_id = $3",
        [label, id, tenant_id]
      );
      console.log(label);
      res.json({ success: true });
    } catch (error) {
      console.error("Label Update Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  router.patch("/:id/snooze", async (req, res) => {
    const { id } = req.params;
    const { snooze_until } = req.body;
    const { tenant_id } = req.user;

    try {
      await pgPool.query(
        `UPDATE emails 
         SET status = 'snoozed', 
             snooze_until = $1, 
             snoozed_at = NOW()  -- <--- Track when it was snoozed
         WHERE email_id = $2 AND tenant_id = $3`,
        [snooze_until, id, tenant_id]
      );
      console.log(snooze_until);
      res.json({ success: true });
    } catch (error) {
      console.error("Snooze Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = createEmailActionsRouter;
