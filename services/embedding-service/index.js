// This loads the .env file from the *root* of our project
require("dotenv").config({ path: "../../.env" });

const amqp = require("amqplib");
// Import the 'vectors' object along with the main client
const weaviate = require("weaviate-client");
const { vectors } = require("weaviate-client");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");

// --- Constants ---
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const QUEUE_NAME = "embedding_required_queue";
const WEAVIATE_CLASS_NAME = "EmailChunks";

// --- Weaviate Schema (MODIFIED) ---
// This now uses our working Ollama vectorizer setup
async function setupWeaviateSchema(client) {
  console.log("Checking Weaviate schema...");
  try {
    const classExists = await client.collections.exists(WEAVIATE_CLASS_NAME);

    if (classExists) {
      console.log('Weaviate class "EmailChunks" already exists.');
      return;
    }

    console.log(`Creating "${WEAVIATE_CLASS_NAME}" class in Weaviate...`);

    const schemaConfig = {
      name: WEAVIATE_CLASS_NAME,

      // We are now vectorizing based on all three fields
      vectorizers: vectors.text2VecOllama({
        apiEndpoint: "http://ollama:11434",
        model: "nomic-embed-text",
        properties: ["from", "subject", "chunk_text"], // <-- ADD 'from'
      }),

      properties: [
        {
          name: "email_id",
          dataType: "uuid",
        },
        {
          name: "tenant_id",
          dataType: "uuid",
        },
        {
          name: "subject",
          dataType: "text",
        },
        // --- ADD THIS BLOCK ---
        {
          name: "from",
          dataType: "text",
        },
        // --- END OF BLOCK ---
        {
          name: "chunk_text",
          dataType: "text",
        },
      ],
    };

    await client.collections.create(schemaConfig);
    console.log("✅ Weaviate schema created successfully.");
  } catch (error) {
    console.error("❌ Error setting up Weaviate schema:", error.message);
    throw error;
  }
}

// --- Main Function (MODIFIED) ---
async function main() {
  // 4. LangChain Text Splitter
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 512, // Max characters per chunk
    chunkOverlap: 50, // Characters to overlap between chunks
  });

  console.log("Starting embedding service...");

  let rabbitConnection;
  let rabbitChannel;

  try {
    // --- 1. Connect to Weaviate ---
    console.log("Connecting to Weaviate...");
    const weaviateClient = await weaviate.connectToLocal({
      timeout: 300000,
    });
    console.log("✅ Weaviate connected.");

    // --- 2. Setup Weaviate Schema ---
    await setupWeaviateSchema(weaviateClient);

    // --- 3. (REMOVED) Pre-loading the local model ---
    // We don't need this, Ollama handles it.

    // --- 4. Connect to RabbitMQ ---
    rabbitConnection = await amqp.connect(RABBITMQ_URL);
    rabbitChannel = await rabbitConnection.createChannel();
    await rabbitChannel.assertQueue(QUEUE_NAME, { durable: true });

    console.log("✅ RabbitMQ connected. Waiting for messages...");

    // --- 5. Start Consuming Messages ---
    rabbitChannel.prefetch(1);
    rabbitChannel.consume(
      QUEUE_NAME,
      async (msg) => {
        if (msg === null) return;

        let embeddingData;
        try {
          // --- Get Message ---
          embeddingData = JSON.parse(msg.content.toString());
          const { email_id, body_text, tenant_id, subject, from } =
            embeddingData;

          if (!body_text || body_text.trim().length === 0) {
            console.log(`[🟡] Skipping email ${email_id}: No body text.`);
            rabbitChannel.ack(msg);
            return;
          }

          console.log(`[📥] Received email ${email_id}. Chunking text...`);

          // --- Chunk the Document ---
          const rawChunks = await textSplitter.splitText(body_text);
          const chunks = rawChunks.filter((chunk) => chunk.trim().length > 0);
          console.log(`[...- Split into ${chunks.length} chunks.`);

          if (chunks.length === 0) {
            console.log(
              `[🟡] Skipping email ${email_id}: No text left after filtering.`,
            );
            rabbitChannel.ack(msg);
            return;
          }

          if (chunks.length > 300) {
            console.log(
              `[⚠️] Email ${email_id} has ${chunks.length} chunks (> 300). Skipping to avoid heavy embedding load.`,
            );
            rabbitChannel.ack(msg);
            return;
          }

          // --- (REMOVED) Generate Embeddings Locally ---
          // We don't need Xenova. Weaviate will do this.

          // --- Prepare Weaviate Objects (MODIFIED) ---
          // We only send the properties. Weaviate creates the vector.
          const objectsToStore = chunks.map((chunk, i) => ({
            properties: {
              email_id: email_id,
              tenant_id: tenant_id,
              subject: subject || "",
              from: from || "",
              chunk_text: chunk,
            },
            // NO 'vectors' property needed!
          }));

          console.log(
            "Sample object to store (no vector):",
            JSON.stringify(objectsToStore[0], null, 2),
          );

          // --- (REMOVED) Vector verification steps ---

          // --- Store in Weaviate ---
          // Weaviate will see these objects, grab 'chunk_text',
          // send it to Ollama, and store the result.
          const collection =
            weaviateClient.collections.get(WEAVIATE_CLASS_NAME);

          const batchResponse =
            await collection.data.insertMany(objectsToStore);

          const successCount = Object.keys(batchResponse.uuids).length;
          console.log(
            `[✅] Stored ${successCount} chunks for email ${email_id} in Weaviate.`,
          );

          if (
            batchResponse.errors &&
            Object.keys(batchResponse.errors).length > 0
          ) {
            console.error(
              `[❌] Errors during batch import for ${email_id}:`,
              batchResponse.errors,
            );
          }

          // --- Acknowledge the Message ---
          rabbitChannel.ack(msg);
        } catch (error) {
          console.error(`[❌] Error processing embedding: ${error.message}`);
          // Re-queue the message if something failed
          rabbitChannel.nack(msg, false, true);
        }
      },
      {
        noAck: false, // We will manually ack/nack
      },
    );
  } catch (error) {
    console.error("Failed to start embedding service:", error.message);
    process.exit(1);
  }
}

main();
