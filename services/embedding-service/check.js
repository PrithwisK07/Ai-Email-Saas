const weaviate = require("weaviate-client");
const fs = require("fs"); // Import the Node.js File System module

const COLLECTION_NAME = "EmailChunks";
const OUTPUT_FILE = "data.json";

async function dumpAllData() {
  console.log("Connecting to Weaviate...");
  const client = await weaviate.connectToLocal();
  console.log("Connected.");

  const allData = [];

  try {
    const collection = client.collections.get(COLLECTION_NAME);

    // ✅ THE FIX:
    // Use .iterator() which is the async iterable for a for...await...of loop.
    // My previous code incorrectly used .query.fetchObjects()
    const query = collection.iterator();

    console.log(
      `Fetching all objects from '${COLLECTION_NAME}'... (this may take a moment)`
    );

    for await (const item of query) {
      // We'll save just the properties, not the full Weaviate object
      allData.push(item.properties);
    }

    console.log(`[✅] Fetched a total of ${allData.length} objects.`);
    console.log(`Writing data to ${OUTPUT_FILE}...`);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allData, null, 2));

    console.log(`[✅] Successfully saved all data to ${OUTPUT_FILE}`);
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    // Always close the connection
    await client.close();
  }
}

dumpAllData();
