require("dotenv").config({ path: "../../.env" });
const amqp = require("amqplib");
const { Pool } = require("pg");

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const QUEUE_NAME = "email_processing_queue";
const EMBEDDING_QUEUE_NAME = "embedding_required_queue";

const dbPool = new Pool({
  user: process.env.POSTGRES_USERNAME,
  host: "localhost",
  database: process.env.POSTGRES_DATABASE,
  password: process.env.POSTGRES_PWD,
  port: 5432,
});

async function main() {
  console.log("🚀 Starting FAST processing service (No Intent Detection)...");

  let rabbitConnection;
  let rabbitChannel;

  try {
    const dbClient = await dbPool.connect();
    console.log("✅ PostgreSQL connected successfully.");
    dbClient.release();

    rabbitConnection = await amqp.connect(RABBITMQ_URL);
    rabbitChannel = await rabbitConnection.createChannel();
    await rabbitChannel.assertQueue(QUEUE_NAME, { durable: true });
    await rabbitChannel.assertQueue(EMBEDDING_QUEUE_NAME, { durable: true });

    rabbitChannel.prefetch(10);

    console.log("✅ RabbitMQ connected. Waiting for emails...");

    rabbitChannel.consume(
      QUEUE_NAME,
      async (msg) => {
        if (msg === null) return;

        try {
          const emailData = JSON.parse(msg.content.toString());
          const { tenant_id, attachments } = emailData;

          const safeSubject = emailData.subject || "(No Subject)";

          const dbClient = await dbPool.connect();
          try {
            const checkRes = await dbClient.query(
              "SELECT 1 FROM emails WHERE internal_message_id = $1",
              [emailData.internal_message_id],
            );

            if (checkRes.rowCount > 0) {
              console.log(
                `[🟡] Duplicate: "${safeSubject.substring(0, 30)}..."`,
              );
            } else {
              const aiMetadata = {
                intent: "none",
                status: "unprocessed",
                attachments: attachments || [],
              };

              const insertRes = await dbClient.query(
                `INSERT INTO emails (thread_id, internal_message_id, subject, sender, recipients, body_text, body_html, sent_at, tenant_id, ai_metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING email_id`,
                [
                  null,
                  emailData.internal_message_id,
                  safeSubject,
                  emailData.from || "No Sender",
                  emailData.recipient || "",
                  emailData.textBody || "",
                  emailData.htmlBody || "",
                  emailData.date || new Date(),
                  tenant_id,
                  JSON.stringify(aiMetadata),
                ],
              );

              const newEmailId = insertRes.rows[0].email_id;
              console.log(
                `[✅] Inserted: "${safeSubject.substring(0, 30)}..."`,
                ` ${emailData.recipient}`,
              );

              const embeddingMsg = {
                email_id: newEmailId,
                body_text: emailData.textBody,
                tenant_id: tenant_id,
                subject: safeSubject,
                from: emailData.from,
              };

              rabbitChannel.sendToQueue(
                EMBEDDING_QUEUE_NAME,
                Buffer.from(JSON.stringify(embeddingMsg)),
                { persistent: true },
              );
            }
          } finally {
            dbClient.release();
          }

          rabbitChannel.ack(msg);
        } catch (error) {
          console.error(`[❌] Error: ${error.message}`);

          const isFatal =
            error instanceof SyntaxError || error.message.includes("undefined");
          if (isFatal) {
            console.log("[🗑️] Discarding bad message to prevent loop.");
            rabbitChannel.ack(msg);
          } else {
            rabbitChannel.nack(msg, false, true);
          }
        }
      },
      { noAck: false },
    );
  } catch (error) {
    console.error("Fatal Error:", error.message);
    process.exit(1);
  }
}

main();
