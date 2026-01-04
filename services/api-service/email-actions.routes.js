const express = require("express");
const amqp = require("amqplib");

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const QUEUE_NAME = "embedding_required_queue";
const WEAVIATE_CLASS_NAME = "EmailChunks";

async function queueForEmbedding(emailData) {
  try {
    const conn = await amqp.connect(RABBITMQ_URL); // <--- Use local constant
    const channel = await conn.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });

    const msg = Buffer.from(JSON.stringify(emailData));
    channel.sendToQueue(QUEUE_NAME, msg, { persistent: true });

    await channel.close();
    await conn.close();
    console.log(`[🔄] Re-queued email ${emailData.email_id} for embedding.`);
  } catch (err) {
    console.error("RabbitMQ Publish Error:", err);
  }
}

function createEmailActionsRouter(pgPool, weaviateClient) {
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

  router.patch("/:id/status", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const { tenant_id } = req.user;

    try {
      const checkRes = await pgPool.query(
        "SELECT status FROM emails WHERE email_id = $1 AND tenant_id = $2",
        [id, tenant_id]
      );

      if (checkRes.rows.length === 0) {
        return res.status(404).json({ error: "Email not found" });
      }

      const previousStatus = checkRes.rows[0].status;

      await pgPool.query(
        "UPDATE emails SET status = $1 WHERE email_id = $2 AND tenant_id = $3",
        [status, id, tenant_id]
      );

      if (status === "trash") {
        console.log(`[🗑️] Deleting vectors for email ${id}...`);
        const collection = weaviateClient.collections.get(WEAVIATE_CLASS_NAME);

        await collection.data.deleteMany(
          collection.filter.byProperty("email_id").equal(id)
        );
      } else if (
        (status === "inbox" || status === "archive") &&
        previousStatus === "trash"
      ) {
        const emailRes = await pgPool.query(
          "SELECT subject, sender, body_text FROM emails WHERE email_id = $1",
          [id]
        );

        if (emailRes.rows.length > 0) {
          const email = emailRes.rows[0];
          console.log(`[♻️] Restoring vectors for email ${id}...`);

          await queueForEmbedding({
            email_id: id,
            tenant_id: tenant_id,
            body_text: email.body_text,
            subject: email.subject,
            from: email.sender,
          });
        }
      }

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

  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const { tenant_id } = req.user;

    try {
      console.log(`[❌] Permanently deleting email ${id}...`);

      // A. Delete from Weaviate (Vectors)
      try {
        const collection = weaviateClient.collections.get(WEAVIATE_CLASS_NAME);
        await collection.data.deleteMany(
          collection.filter.byProperty("email_id").equal(id)
        );
      } catch (vecError) {
        console.warn(
          "Vector delete warning (might not exist):",
          vecError.message
        );
      }

      // B. Delete from Postgres (Data)
      await pgPool.query(
        "DELETE FROM emails WHERE email_id = $1 AND tenant_id = $2",
        [id, tenant_id]
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Permanent Delete Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = createEmailActionsRouter;
