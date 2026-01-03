const amqp = require("amqplib");
const nodemailer = require("nodemailer");

// Constants
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const QUEUE_NAME = "email_outbound_queue";

// SMTP Config (Same as before)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "accessdenied2026@gmail.com",
    pass: "ibtb bzoc qqpf vkjn",
  },
});

async function startEmailWorker() {
  try {
    console.log("Starting Email Worker...");
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    await channel.assertQueue(QUEUE_NAME, { durable: true });

    // Rate Limit: Only process 1 email at a time to avoid hitting Gmail limits too fast
    channel.prefetch(1);

    console.log(`✅ Email Worker listening on ${QUEUE_NAME}...`);

    channel.consume(QUEUE_NAME, async (msg) => {
      if (msg === null) return;

      try {
        const emailTask = JSON.parse(msg.content.toString());
        const { to, subject, html } = emailTask;

        console.log(`[📨] Sending email to: ${to}`);

        // Send the email
        await transporter.sendMail({
          from: '"Recruitments, Access Denied" <accessdenied2026@gmail.com>',
          to: to, // Send to ONE person
          subject: subject,
          html: html,
        });

        console.log(`[✅] Sent to ${to}`);

        // Wait 1 second to be nice to Gmail's servers (Rate Limiting)
        await new Promise((resolve) => setTimeout(resolve, 1000));

        channel.ack(msg);
      } catch (error) {
        console.error(`[❌] Failed to send to ${to}:`, error.message);
        // In a real app, you might nack() to retry, but for now we ack to avoid infinite loops
        channel.ack(msg);
      }
    });
  } catch (error) {
    console.error("Email Worker failed to start:", error);
  }
}

module.exports = startEmailWorker;
