const amqp = require("amqplib");
const nodemailer = require("nodemailer");

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const QUEUE_NAME = "email_outbound_queue";
const MAX_RETRIES = 3;

// Reuse your transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "karmakarprithwis566@gmail.com",
    pass: "hypc tmqc vmcb zmlx",
  },
});

async function startSenderWorker() {
  try {
    console.log("Starting Sender Worker...");
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    await channel.assertQueue(QUEUE_NAME, { durable: true });
    channel.prefetch(1); // Process 1 at a time (Rate Limiting)

    console.log(`✅ Sender Worker listening on ${QUEUE_NAME}...`);

    channel.consume(QUEUE_NAME, async (msg) => {
      if (msg === null) return;

      const emailTask = JSON.parse(msg.content.toString());
      const {
        to,
        subject,
        html,
        attachments,
        headers,
        retryCount = 0,
      } = emailTask;

      try {
        console.log(
          `[📨] Sending to: ${to} (Attempt ${retryCount + 1}/${
            MAX_RETRIES + 1
          })`
        );

        await transporter.sendMail({
          from: '"MailWise" <karmakarprithwis566@gmail.com>',
          to: to,
          subject: subject,
          html: html,
          attachments: attachments,
          headers: headers,
        });

        console.log(`[✅] Sent to ${to}`);

        // Rate Limiting (1s delay)
        await new Promise((r) => setTimeout(r, 1000));

        channel.ack(msg);
      } catch (error) {
        console.error(`[❌] Failed to send to ${to}:`, error.message);

        if (retryCount < MAX_RETRIES) {
          console.log(`[🔄] Re-queueing for retry...`);

          // REPUBLISH with incremented retry count
          const newTask = { ...emailTask, retryCount: retryCount + 1 };

          // Delay the retry slightly (optional backoff hack)
          await new Promise((r) => setTimeout(r, 2000 * (retryCount + 1)));

          channel.sendToQueue(
            QUEUE_NAME,
            Buffer.from(JSON.stringify(newTask)),
            { persistent: true }
          );

          // ACK the original failed message (since we created a new one)
          channel.ack(msg);
        } else {
          console.error(`[💀] Max retries reached for ${to}. Dropping email.`);
          // Here you could save to a "FailedEmails" DB table
          channel.ack(msg); // Remove from queue permanently
        }
      }
    });
  } catch (error) {
    console.error("Sender Worker failed:", error);
  }
}

module.exports = startSenderWorker;
