const amqp = require("amqplib");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const { Pool } = require("pg");

// Load env vars if running standalone (optional safety check)
require("dotenv").config({ path: "../../.env" });

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const QUEUE_NAME = "email_outbound_queue";
const MAX_RETRIES = 3;

// --- Database Connection (To fetch User Tokens) ---
const pgPool = new Pool({
  user: process.env.POSTGRES_USERNAME,
  host: process.env.POSTGRES_HOST || "localhost",
  database: process.env.POSTGRES_DATABASE,
  password: process.env.POSTGRES_PWD,
  port: 5432,
});

/**
 * Creates a Nodemailer Transporter dynamically for a specific user
 * using their stored OAuth2 Refresh Token.
 */
async function getUserTransporter(userId) {
  // 1. Fetch the user's Refresh Token from DB
  const res = await pgPool.query(
    "SELECT email, refresh_token FROM google_tokens WHERE user_id = $1",
    [userId],
  );

  if (res.rows.length === 0) {
    throw new Error(`User ${userId} has not connected their Gmail account.`);
  }

  const { email, refresh_token } = res.rows[0];

  // 2. Setup Google OAuth Client
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );

  oauth2Client.setCredentials({ refresh_token });

  // 3. Request a fresh Access Token (Google handles expiration automatically)
  const accessTokenResponse = await oauth2Client.getAccessToken();
  const accessToken = accessTokenResponse.token;

  // 4. Return the configured Transporter
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

async function startSenderWorker() {
  try {
    console.log("Starting Multi-Tenant Sender Worker...");
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    await channel.assertQueue(QUEUE_NAME, { durable: true });

    // Rate Limiting: Process 1 email at a time per worker instance
    channel.prefetch(1);

    console.log(`✅ Sender Worker listening on ${QUEUE_NAME}...`);

    channel.consume(QUEUE_NAME, async (msg) => {
      if (msg === null) return;

      const emailTask = JSON.parse(msg.content.toString());

      // We now expect 'user_id' in the payload to identify the sender
      const {
        user_id,
        to,
        subject,
        html,
        attachments,
        headers,
        retryCount = 0,
      } = emailTask;

      try {
        console.log(
          `[🔄] Preparing email for User ${user_id} -> ${to} (Attempt ${retryCount + 1}/${MAX_RETRIES + 1})`,
        );

        // 1. Get the dynamic transporter for THIS user
        const transporter = await getUserTransporter(user_id);

        // 2. Send the email
        await transporter.sendMail({
          from: "me", // 'me' is a magic keyword in Gmail API that uses the auth user's email
          to: to,
          subject: subject,
          html: html,
          attachments: attachments,
          headers: headers, // Important for Mass Mail Watermarking
        });

        console.log(`[✅] Sent to ${to}`);

        // Rate Limit (1s delay to be safe with Gmail API limits)
        await new Promise((r) => setTimeout(r, 1000));

        channel.ack(msg);
      } catch (error) {
        console.error(`[❌] Failed to send to ${to}:`, error.message);

        if (retryCount < MAX_RETRIES) {
          console.log(`[🔄] Re-queueing for retry...`);

          const newTask = { ...emailTask, retryCount: retryCount + 1 };

          // Exponential backoff: 2s, 4s, 6s...
          await new Promise((r) => setTimeout(r, 2000 * (retryCount + 1)));

          channel.sendToQueue(
            QUEUE_NAME,
            Buffer.from(JSON.stringify(newTask)),
            { persistent: true },
          );

          channel.ack(msg);
        } else {
          console.error(`[💀] Max retries reached for ${to}. Dropping email.`);
          // TODO: Update DB status to 'failed' here if needed
          channel.ack(msg);
        }
      }
    });
  } catch (error) {
    console.error("Sender Worker failed to start:", error);
  }
}

module.exports = startSenderWorker;
