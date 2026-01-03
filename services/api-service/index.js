// This loads the .env file from the *root* of your project
require("dotenv").config({ path: "../../.env" });
const { GoogleGenAI } = require("@google/genai");
const authRoutes = require("./auth.routes");
const authenticateToken = require("./auth.middleware");
const ingestionRoutes = require("./ingestion.routes");
const aiRoutes = require("./ai.routes");
const createSendRouter = require("./send.routes");
const startEmailWorker = require("./email.worker");
const calendarRoutes = require("./calendar.routes");
const createDraftsRouter = require("./drafts.routes");
const createEmailActionsRouter = require("./email-actions.routes");

const express = require("express");
const weaviate = require("weaviate-client");
const { Pool } = require("pg");
const cors = require("cors");

// --- Constants ---
const PORT = 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- Client Initializations ---
const pgPool = new Pool({
  user: process.env.POSTGRES_USERNAME,
  host: process.env.POSTGRES_HOST || "localhost",
  database: process.env.POSTGRES_DATABASE,
  password: process.env.POSTGRES_PWD,
  port: 5432,
});

const genAI = new GoogleGenAI(GEMINI_API_KEY);
let weaviateClient; // Will be initialized in main()

// --- Main Server Function ---
async function main() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.use(cors({ origin: "http://localhost:3000" }));

  try {
    // --- 1. Connect to Clients ---
    console.log("Connecting to PostgreSQL...");
    const dbClient = await pgPool.connect();
    console.log("✅ PostgreSQL connected.");
    dbClient.release();

    console.log("Connecting to Weaviate...");
    weaviateClient = await weaviate.connectToLocal();
    console.log("✅ Weaviate connected.");

    // --- 3. Define API Endpoints ---

    // Mount public auth routes
    app.use("/auth", authRoutes(pgPool, genAI));

    // Mount secure ingestion routes
    app.use("/ingestion", authenticateToken, ingestionRoutes(pgPool));

    app.use("/drafts", authenticateToken, createDraftsRouter(pgPool));

    // Mount secure AI routes
    // We pass all clients to our new AI router
    app.use("/ai", authenticateToken, aiRoutes(pgPool, weaviateClient, genAI));

    app.use("/send", authenticateToken, createSendRouter(pgPool));

    app.use("/calendar", authenticateToken, calendarRoutes());

    app.use("/emails", authenticateToken, createEmailActionsRouter(pgPool));

    startEmailWorker();

    // --- 4. Start the server ---
    app.listen(PORT, () => {
      console.log(`✅ API service listening at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start API service:", error.message);
    process.exit(1);
  }
}

// --- START THE SERVER ---
main();
