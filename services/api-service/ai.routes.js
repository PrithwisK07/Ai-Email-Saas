const express = require("express");
const nodemailer = require("nodemailer");
const multer = require("multer");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");

const upload = multer({
  storage: multer.memoryStorage(),
});

// This function receives all our clients
function createAiRouter(pgPool, weaviateClient, genAI) {
  const router = express.Router();
  const WEAVIATE_CLASS_NAME = "EmailChunks";

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "karmakarprithwis566@gmail.com",
      pass: "hypc tmqc vmcb zmlx",
    },
  });

  /**
   * [GET] /ai/search
   * Performs SECURE HYBRID search
   */
  router.get("/search", async (req, res) => {
    try {
      const q = req.query.search;
      const { tenant_id } = req.user; // Get tenant_id from the token

      if (!q) {
        return res.status(400).json({ error: "Missing 'search' query param" });
      }

      console.log(`[🔍] Received HYBRID search for tenant: ${tenant_id}`);

      // --- Step 1: Run all three searches in parallel ---
      const [semanticResults, keywordResults, literalResults] =
        await Promise.all([
          runSemanticSearch(q, tenant_id),
          runKeywordSearch(q, tenant_id),
          runLiteralSearch(q, tenant_id), // For email addresses
        ]);

      // --- Step 2: Merge and Re-rank results ---
      const finalResults = mergeResults(
        semanticResults,
        keywordResults,
        literalResults
      );

      if (finalResults.length === 0) {
        console.log("⚠️ No matching results found for this tenant.");
        return res.json([]);
      }

      // --- Step 3: Hydrate results with full email data ---
      // finalResults is now a list of full email objects, no re-fetch needed.

      console.log(`[✅] Found ${finalResults.length} matching emails.`);
      res.json(finalResults);
    } catch (e) {
      console.error("❌ Error in /search route:", e.message);
      res.status(500).send(e.message);
    }
  });

  /**
   * [GET] /ai/summarize/:emailId
   * Performs SECURE RAG summarization
   */
  router.get("/summarize/:emailId", async (req, res) => {
    const { emailId } = req.params;
    const { tenant_id } = req.user;

    console.log(
      `[✨] Received summarization request for email: ${emailId} (Tenant: ${tenant_id})`
    );

    try {
      // --- STEP 1: Retrieve email text ---
      console.log("Retrieving full email text from Postgres...");
      const pgClient = await pgPool.connect();
      let context;

      try {
        const dbResult = await pgClient.query(
          "SELECT body_text FROM emails WHERE email_id = $1 AND tenant_id = $2",
          [emailId, tenant_id]
        );

        if (dbResult.rows.length === 0) {
          return res.status(404).json({ error: "Email not found." });
        }

        context = dbResult.rows[0].body_text;
      } finally {
        pgClient.release();
      }

      if (!context || context.trim().length === 0) {
        return res
          .status(400)
          .json({ error: "Email has no text content to summarize." });
      }

      // --- STEP 2: Build prompt ---
      const prompt = `
      You are an expert AI assistant specializing in deeply detailed, extractive summaries of emails and email threads.

      Your job is to produce a precise, information-dense HTML summary strictly based on the provided email context.

      ### STRICT REQUIREMENTS — FOLLOW EXACTLY:

      1. **Be Extractive, Not Interpretive**
        - Only use information explicitly present in the context.
        - No assumptions. No invented details.

      2. **Depth + Specificity**
        - Pull out every meaningful detail: dates, names, deliverables, next steps, requests, timelines, etc.

      3. **HTML Formatting (Mandatory)**
        - <h3> for headings
        - <p> for short explanations
        - <ul> / <li> for bullet lists
        - Wrap URLs in <a href="URL">URL</a>
        - Do NOT include <html> or <body> tags

      4. **Sections to Produce**
        - <h3>Main Topics</h3>
        - <h3>Questions Asked</h3>
        - <h3>Action Items, Deadlines & Deliverables</h3>
        - <h3>Decisions or Conclusions</h3>
        - <h3>Sentiment / Tone</h3>

      5. If a section has no content, write:
        - <p>None identified.</p>

      6. The output MUST be **fully structured HTML**, no explanation outside the HTML.

      ---

      ### CONTEXT:
      ${context}

      ---

      ### HTML SUMMARY:
      `;

      // --- STEP 3: Try Pro, fallback to Flash ---
      let summary;
      try {
        console.log("[🧠] Trying gemini-2.5-pro...");
        const proRes = await genAI.models.generateContent({
          model: "gemini-2.5-pro",
          contents: prompt,
        });
        summary = proRes.text;
        console.log("[✅] Summary generated using gemini-2.5-pro");
      } catch (err) {
        console.error("[⚠️] gemini-2.5-pro failed. Error:", err.message);
        console.log("[⚡] Falling back to gemini-2.5-flash...");

        try {
          const flashRes = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
          });
          summary = flashRes.text;
          console.log("[✅] Summary generated using gemini-2.5-flash");
        } catch (flashErr) {
          console.error(
            "[❌] gemini-2.5-flash ALSO failed. Error:",
            flashErr.message
          );
          return res.status(500).json({
            error: "Both Pro and Flash summarization failed.",
          });
        }
      }

      res.send(summary);
    } catch (error) {
      console.error("Error during summarization:", error);
      res.status(500).json({ error: "Summarization failed" });
    }
  });

  /**
   * [POST] /ai/draft
   * Generates a new email draft or reply using Gemini Pro JSON Mode.
   */
  router.post("/draft", async (req, res) => {
    const { prompt, context, auto_send } = req.body;
    const { tenant_id, user_id } = req.user;

    if (!prompt) {
      return res.status(400).json({ error: "A 'prompt' is required." });
    }

    console.log(
      `[🤖] Received AI draft request for tenant: ${tenant_id} (Auto-send: ${!!auto_send})`
    );

    // --- Step 1: Define the structured JSON output ---
    const jsonSchema = {
      type: "OBJECT",
      properties: {
        to: { type: "ARRAY", items: { type: "STRING" } },
        cc: { type: "ARRAY", items: { type: "STRING" } },
        bcc: { type: "ARRAY", items: { type: "STRING" } },
        subject: { type: "STRING" },
        body: { type: "STRING" },
      },
      required: ["to", "cc", "bcc", "subject", "body"],
    };

    // --- Step 2: Build the UPGRADED Professional Prompt ---
    const fullPrompt = `
        You are an expert Executive Communications Assistant. Your job is to draft professional, effective emails.

        The user needs a **complete, multi-paragraph draft**, not a short snippet.

        ### INSTRUCTIONS:
        1. **Structure:**
          - **Salutation:** Professional greeting.
          - **Opening:** Clear statement of purpose.
          - **Details:** 1-2 paragraphs expanding on the context, reasoning, or specific details requested.
          - **Call to Action:** Clear next steps or requests.
          - **Sign-off:** Professional closing.

        2. **Formatting:** Use clean HTML tags inside the JSON string:
          - Use <p> for paragraphs.
          - Use <ul>/<li> for lists if multiple items are mentioned.
          - Use <br> for line breaks in signatures.

        3. **Recipients:**
          - Extract email addresses from the prompt for 'to', 'cc', 'bcc'.
          - If none specified, return empty arrays [].

        4. **Context Handling:**
          - If a "context" email is provided below, write a reply that references specific points from it. Do not just copy it.

        USER REQUEST:
        "${prompt}"

        REPLYING TO CONTEXT (If any):
        ${context || "No context provided (Drafting from scratch)"}
      `;

    let response;
    try {
      // --- Step 3: Generate Draft with Gemini Pro ---
      response = await genAI.models.generateContent({
        model: "gemini-2.5-pro",
        contents: fullPrompt,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: jsonSchema,
        },
      });
    } catch (err) {
      console.error("[⚠️] gemini-2.5-pro failed. Error:", err.message);
      console.log("[⚡] Falling back to gemini-2.5-flash...");
      try {
        response = await genAI.models.generateContent({
          model: "gemini-2.5-flash",
          contents: fullPrompt,
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: jsonSchema,
          },
        });
      } catch (error) {
        console.log("[❌] gemini-2.5-flash ALSO failed. Error:", error.message);
        console.error("Error during AI draft/send:");
        return res.status(500).json({ error: "AI operation failed." });
      }
    }

    let rawText = response.text;

    // Remove markdown code blocks if they exist
    if (rawText.startsWith("```")) {
      rawText = rawText
        .replace(/^```json\n?/, "")
        .replace(/^```\n?/, "")
        .replace(/```$/, "");
    }

    const draftJson = JSON.parse(rawText);

    console.log(`[✅] Draft generated successfully.`);

    // --- Step 4: Handle Auto-Send ---
    if (auto_send === true) {
      // Safety Check: Do we have a recipient?
      if (!draftJson.to || draftJson.to.length === 0) {
        console.log("[⚠️] Auto-send requested but no recipient found by AI.");
        return res.json({
          ...draftJson,
          auto_send_status: "failed",
          error: "AI could not identify a 'to' address from your prompt.",
        });
      }

      console.log(`[🚀] Auto-sending email to: ${draftJson.to.join(", ")}`);

      try {
        const info = await transporter.sendMail({
          from: '"AI Email Assistant" <karmakarprithwis566@gmail.com>',
          to: draftJson.to.join(", "),
          cc: draftJson.cc ? draftJson.cc.join(", ") : undefined,
          bcc: draftJson.bcc ? draftJson.bcc.join(", ") : undefined,
          subject: draftJson.subject,
          html: draftJson.body,
        });

        console.log(`[✅] Email sent! Message ID: ${info.messageId}`);

        return res.json({
          ...draftJson,
          auto_send_status: "success",
          messageId: info.messageId,
        });
      } catch (sendError) {
        console.error("Error sending email:", sendError);
        return res.json({
          ...draftJson,
          auto_send_status: "failed",
          error: sendError.message,
        });
      }
    }

    // If not auto-sending, just return the draft for review
    res.json(draftJson);
  });

  /**
   * [POST] /ai/ask
   * Performs RAG-based Question/Answering for the logged-in user.
   */
  router.post("/ask", async (req, res) => {
    const { query } = req.body;
    const { tenant_id } = req.user;

    if (!query) {
      return res.status(400).json({ error: "A 'query' is required." });
    }

    console.log(`[❓] Received Q&A query for tenant: ${tenant_id}`);

    try {
      // --- Step 1: Retrieve relevant context using HYBRID SEARCH ---
      console.log("Running Hybrid Search for context...");
      const [semanticResults, keywordResults, literalResults] =
        await Promise.all([
          runSemanticSearch(query, tenant_id),
          runKeywordSearch(query, tenant_id),
          runLiteralSearch(query, tenant_id),
        ]);

      const hybridResults = mergeResults(
        semanticResults,
        keywordResults,
        literalResults
      );

      // Get the *full text* from the top 5 results
      const topEmails = hybridResults.slice(0, 5);

      if (topEmails.length === 0) {
        console.log("⚠️ No context found for this query.");
        return res.json({
          answer:
            "I'm sorry, I couldn't find any relevant emails to answer that question.",
        });
      }

      // --- Step 2: Augment (Combine) the full email texts into context ---
      const context = topEmails
        .map(
          (email) => `
          From: ${email.sender}
          Subject: ${email.subject}
          Body:
          ${email.body_text} 
        `
        )
        .join("\n\n--- [End of Email] ---\n\n");

      // --- Step 3: Generate the answer with Gemini Pro ---
      console.log("Sending context and query to Gemini Pro...");

      const prompt = `
You are an advanced AI assistant. You MUST base your answer strictly and exclusively 
on the information provided in the CONTEXT below.

Your job is to create a **detailed, thorough, well-structured** answer — 
not a short one-liner — *as long as the required details exist inside the context*.

REQUIREMENTS:
1. If the context contains enough information, provide:
   - A detailed explanation
   - Supporting details, references, or quotes from the context
   - Clear reasoning steps
   - Any relevant breakdowns or clarifications

2. If the context does NOT contain enough information to answer the question, 
   you MUST respond exactly with:
   **"I'm sorry, I couldn't find that information in your emails."**

3. You are NOT allowed to use outside knowledge or guess.

4. Expand your answer ONLY to the degree supported by the context. Be detailed 
   but grounded strictly in the text.

---

CONTEXT:
------
${context}
------

USER'S QUESTION:
${query}

---

Now produce the best possible answer following the rules above.
ANSWER:
`;

      let summary;
      try {
        console.log("[🧠] Trying gemini-2.5-pro...");
        const proRes = await genAI.models.generateContent({
          model: "gemini-2.5-pro",
          contents: prompt,
        });
        summary = proRes.text;
        console.log("[✅] Summary generated using gemini-2.5-pro");
      } catch (err) {
        console.error("[⚠️] gemini-2.5-pro failed. Error:", err.message);
        console.log("[⚡] Falling back to gemini-2.5-flash...");

        try {
          const flashRes = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
          });
          summary = flashRes.text;
          console.log("[✅] Summary generated using gemini-2.5-flash");
        } catch (flashErr) {
          console.error(
            "[❌] gemini-2.5-flash ALSO failed. Error:",
            flashErr.message
          );
          return res.status(500).json({
            error: "Both Pro and Flash summarization failed.",
          });
        }
      }

      res.send(summary);
    } catch (error) {
      console.error("Error during Q&A:", error.message);
      res.status(500).json({ error: "Q&A generation failed." });
    }
  });

  router.post("/extract-emails", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        console.error("❌ No file received in request.");
        return res.status(400).json({ error: "No file uploaded" });
      }

      // 1. DEBUG LOGS: Check if file actually arrived
      console.log("------------------------------------------------");
      console.log(`[📂] File Received: ${req.file.originalname}`);
      console.log(`[📂] Size: ${req.file.size} bytes`);
      console.log(`[📂] MIME: ${req.file.mimetype}`);

      let textContent = "";

      // 2. EXTRACTION LOGIC
      if (req.file.mimetype === "application/pdf") {
        console.log("[⚙️] Parsing as PDF...");
        const data = await pdf(req.file.buffer);
        textContent = data.text;
      } else if (
        req.file.mimetype.includes("wordprocessingml") ||
        req.file.originalname.endsWith(".docx")
      ) {
        console.log("[⚙️] Parsing as DOCX...");
        const result = await mammoth.extractRawText({
          buffer: req.file.buffer,
        });
        textContent = result.value;
      } else {
        // 3. CATCH-ALL: Treat everything else (txt, csv, unknown) as plain text
        console.log("[⚙️] Parsing as Plain Text (Buffer -> UTF8)...");
        textContent = req.file.buffer.toString("utf8");
      }

      // 4. DEBUG LOG: Check what we read
      console.log(
        `[📝] Extracted Text Length: ${textContent.length} characters`
      );
      if (textContent.length > 0) {
        console.log(
          `[📝] Preview: "${textContent
            .substring(0, 50)
            .replace(/\n/g, " ")}..."`
        );
      } else {
        console.warn(
          "⚠️ Text content is empty! File might be empty or encoding issue."
        );
      }

      // 5. REGEX EXTRACTION
      const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
      const matches = textContent.match(emailRegex) || [];
      const uniqueEmails = [
        ...new Set(matches.map((e) => e.toLowerCase().trim())),
      ];

      console.log(`[✅] Found ${uniqueEmails.length} emails:`, uniqueEmails);

      res.json({ emails: uniqueEmails });
    } catch (error) {
      console.error("❌ Extraction Critical Error:", error);
      res.status(500).json({ error: "Failed to parse file: " + error.message });
    }
  });

  // --- HELPER FUNCTIONS (ALL UPDATED) ---
  async function runSemanticSearch(queryTxt, tenantId) {
    let semanticChunks = [];
    try {
      const collection = weaviateClient.collections.get(WEAVIATE_CLASS_NAME);
      const searchResults = await collection.query.nearText(queryTxt, {
        limit: 10,
        returnProperties: ["email_id", "chunk_text", "from", "subject"], // Get all properties
        returnMetadata: ["certainty"],
        where: {
          path: ["tenant_id"],
          operator: "Equal",
          value: tenantId,
        },
      });
      semanticChunks = searchResults.objects;
    } catch (error) {
      console.error("Error in semantic search:", error.message);
      return [];
    }

    if (semanticChunks.length === 0) return [];

    const emailIdsToFetch = [
      ...new Set(semanticChunks.map((obj) => obj.properties.email_id)),
    ];

    try {
      const pgResult = await pgPool.query(
        `SELECT email_id, subject, sender, body_html, body_text, sent_at 
         FROM emails 
         WHERE email_id = ANY($1::uuid[]) AND tenant_id = $2`,
        [emailIdsToFetch, tenantId]
      );

      return pgResult.rows.map((email) => {
        const bestChunk = semanticChunks
          .filter((c) => c.properties.email_id === email.email_id)
          .sort((a, b) => b.metadata.certainty - a.metadata.certainty)[0];

        return {
          ...email,
          id: email.email_id,
          score: bestChunk.metadata.certainty,
          matching_chunk: bestChunk.properties.chunk_text,
        };
      });
    } catch (pgError) {
      console.error("Error hydrating semantic results:", pgError.message);
      return [];
    }
  }

  async function runKeywordSearch(queryTxt, tenantId) {
    try {
      const tsQuery = queryTxt.split(" ").join(" & ");
      const pgClient = await pgPool.connect();
      try {
        const query = `
          SELECT
            email_id,
            subject,
            sender,
            body_html,
            body_text,
            sent_at,
            ts_rank_cd(tsv_body, to_tsquery('english', $1)) AS score,
            ts_headline('english', body_text, to_tsquery('english', $1)) AS matching_chunk
          FROM emails
          WHERE
            tenant_id = $2 AND
            tsv_body @@ to_tsquery('english', $1)
          ORDER BY score DESC
          LIMIT 10;
        `;
        const res = await pgClient.query(query, [tsQuery, tenantId]);

        return res.rows.map((row) => ({
          ...row,
          id: row.email_id,
        }));
      } finally {
        pgClient.release();
      }
    } catch (error) {
      console.error("Error in keyword search:", error.message);
      return [];
    }
  }

  async function runLiteralSearch(queryTxt, tenantId) {
    if (!queryTxt.includes("@") && !queryTxt.includes(".")) {
      return [];
    }

    try {
      const pgClient = await pgPool.connect();
      try {
        const query = `
          SELECT
            email_id,
            subject,
            sender,
            body_html,
            body_text,
            sent_at,
            0.5 AS score, 
            ts_headline('english', body_text, to_tsquery('english', $2)) AS matching_chunk
          FROM emails e
          WHERE
            tenant_id = $1 AND
            (sender ILIKE $2 OR body_text ILIKE $2)
          LIMIT 5;
        `;
        const res = await pgClient.query(query, [tenantId, `%${queryTxt}%`]);

        return res.rows.map((row) => ({
          ...row,
          id: row.email_id,
        }));
      } finally {
        pgClient.release();
      }
    } catch (error) {
      console.error("Error in literal search:", error.message);
      return [];
    }
  }

  function mergeResults(semantic, keyword, literal) {
    const combined = new Map();

    // Add in order of priority (most important last)
    for (const result of keyword) {
      combined.set(result.email_id, result);
    }
    for (const result of semantic) {
      combined.set(result.email_id, result);
    }
    for (const result of literal) {
      combined.set(result.email_id, result);
    }

    const finalResults = Array.from(combined.values());
    finalResults.sort((a, b) => b.score - a.score);

    return finalResults;
  }

  return router;
}

module.exports = createAiRouter;
