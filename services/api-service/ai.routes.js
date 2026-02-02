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
      const { tenant_id } = req.user;

      if (!q) {
        return res.status(400).json({ error: "Missing 'search' query param" });
      }

      console.log(`[🔍] Search Query: "${q}" (Tenant: ${tenant_id})`);

      // --- Tier 1: Fast & Precise (Literal + Keyword) ---
      // We run these first because they are cheap (Postgres) and highly relevant.
      const [keywordResults, literalResults] = await Promise.all([
        runKeywordSearch(q, tenant_id),
        runLiteralSearch(q, tenant_id),
      ]);

      // Merge Tier 1 results immediately to check count
      let combinedResults = mergeResults([], keywordResults, literalResults);

      console.log(`[📊] Tier 1 Hits: ${combinedResults.length}`);

      // --- Tier 2: Semantic Fallback ---
      // Only run expensive Vector search if we don't have enough exact matches.
      const SEARCH_THRESHOLD = 5;

      if (combinedResults.length < SEARCH_THRESHOLD) {
        console.log(
          "[🧠] Tier 1 yielded low results. Engaging Semantic Search...",
        );
        const semanticResults = await runSemanticSearch(q, tenant_id);

        // Merge again (Helper handles deduplication based on ID)
        combinedResults = mergeResults(
          semanticResults,
          keywordResults,
          literalResults,
        );
      } else {
        console.log("[⚡] Tier 1 sufficient. Skipping Semantic Search.");
      }

      if (combinedResults.length === 0) {
        return res.json([]);
      }

      // --- Final Sorting: Timeline (Newest First) ---
      // Users usually want the most recent context for their query.
      combinedResults.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));

      console.log(`[✅] Returning ${combinedResults.length} sorted emails.`);
      res.json(combinedResults);
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
      `[✨] Received summarization request for email: ${emailId} (Tenant: ${tenant_id})`,
    );

    try {
      // --- STEP 1: Retrieve email text ---
      console.log("Retrieving full email text from Postgres...");
      const pgClient = await pgPool.connect();
      let context;

      try {
        const dbResult = await pgClient.query(
          "SELECT body_text FROM emails WHERE email_id = $1 AND tenant_id = $2",
          [emailId, tenant_id],
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
            flashErr.message,
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
      `[🤖] Received AI draft request for tenant: ${tenant_id} (Auto-send: ${!!auto_send})`,
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
        literalResults,
      );

      // Get the *full text* from the top 8 results
      const topEmails = hybridResults.slice(0, 8);

      if (topEmails.length === 0) {
        console.log("⚠️ No context found for this query.");
        return res.json({
          answer:
            "I'm sorry, I couldn't find any relevant emails to answer that question.",
        });
      }

      // --- Step 2: Augment (Combine) the full email texts into context ---
      const contextBlock = topEmails
        .map((email) => {
          // Format date to be human-readable (e.g., "Mon, Feb 2, 2026")
          const dateStr = new Date(email.sent_at).toLocaleDateString("en-US", {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });

          return `
            [EMAIL START]
            ID: ${email.id}
            Date: ${dateStr}
            From: ${email.sender}
            To: ${email.recipients || "Me"}
            Subject: ${email.subject}
            Content:
            ${email.body_text}
            [EMAIL END]
          `;
        })
        .join("\n\n");

      const currentDate = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      // --- Step 3: Generate the answer with Gemini Pro ---
      console.log("Sending context and query to Gemini Pro...");

      const prompt = `
      You MUST answer the user's question strictly and exclusively based on the provided CONTEXT.

      Do NOT use outside knowledge.
      Do NOT guess.
      Do NOT infer beyond what is explicitly written.
      Do NOT hallucinate.

      CURRENT TIME:
      ${currentDate}
      Use this only to resolve relative date references (e.g., "yesterday", "last week") using email metadata.

      RULES:

      1. Context-only answering
        - Your answer must be fully supported by the provided context.
        - Every claim must be traceable to the context text.

      2. If the context contains enough information:
        - Provide a detailed, well-structured answer.
        - Explain the reasoning step-by-step.
        - Include relevant details or quotes from the context when applicable.
        - When referencing a specific email, cite its Sender or Subject.
        - Pay close attention to dates, participants, and email metadata.

      3. If the context does NOT contain enough information:
        - Respond exactly with:
          "I'm sorry, I couldn't find that information in your emails."
        - Do not add anything else.

      4. Expansion constraint
        - Expand the answer only to the degree supported by the context.
        - Do not introduce new facts, assumptions, or interpretations.

      INPUT FORMAT:

      CONTEXT:
      ------
      ${contextBlock}
      ------

      USER QUESTION:
      ${query}

      OUTPUT:
      Provide the best possible answer following all rules above.
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
            flashErr.message,
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
        `[📝] Extracted Text Length: ${textContent.length} characters`,
      );
      if (textContent.length > 0) {
        console.log(
          `[📝] Preview: "${textContent
            .substring(0, 50)
            .replace(/\n/g, " ")}..."`,
        );
      } else {
        console.warn(
          "⚠️ Text content is empty! File might be empty or encoding issue.",
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

  router.post("/autocomplete", async (req, res) => {
    const { context } = req.body; // The text preceding the cursor
    if (!context) return res.status(400).json({ error: "Context required" });

    try {
      const prompt = `
        You are a predictive text engine for professional emails.
        Analyze the following incomplete text: "${context}"
        
        Task: Provide the most likely next 5-10 words to complete the thought.
        - Do NOT repeat the input text.
        - Output ONLY the completion text.
        - If the sentence is complete, provide a logical next sentence.
        - Keep it professional and concise.
      `.trim();

      const result = await genAI.models.generateContent({
        model: "gemini-2.5-flash", // Flash is faster (crucial for autocomplete)
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      let completion = result.text.trim();

      // Clean up common AI quirks (like quotes around the response)
      completion = completion.replace(/^"/, "").replace(/"$/, "");

      res.json({ completion });
    } catch (error) {
      console.error("Autocomplete failed:", error);
      res.status(500).json({ error: "Failed to predict text" });
    }
  });

  /**
   * [POST] /ai/polish
   * Fixes grammar, spelling, and tone.
   */
  router.post("/polish", async (req, res) => {
    const { text } = req.body;

    if (!text) return res.status(400).json({ error: "Text required" });

    try {
      const prompt = `
        Act as a professional copyeditor. 
        Correct the grammar, spelling, and capitalization in the text below.
        Maintain the original meaning and tone. 
        Return ONLY the corrected HTML content. Do not add markdown blocks.
        
        Text to fix:
        ${text}
      `.trim();

      const result = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      let corrected = result.text.trim();

      // Remove markdown code blocks if Gemini adds them
      corrected = corrected.replace(/```html/g, "").replace(/```/g, "");

      res.json({ corrected });
    } catch (error) {
      console.error("Polish failed:", error);
      res.status(500).json({ error: "Failed to fix grammar" });
    }
  });

  // --- HELPER FUNCTIONS (ALL UPDATED) ---
  async function runSemanticSearch(queryTxt, tenantId) {
    // Only run if query is long enough to have semantic meaning
    if (queryTxt.length < 3) return [];

    try {
      const collection = weaviateClient.collections.get(WEAVIATE_CLASS_NAME);
      const searchResults = await collection.query.nearText(queryTxt, {
        limit: 10,
        returnProperties: ["email_id", "chunk_text"],
        returnMetadata: ["certainty"],
        where: {
          path: ["tenant_id"],
          operator: "Equal",
          value: tenantId,
        },
      });

      const semanticObjects = searchResults.objects;
      if (semanticObjects.length === 0) return [];

      const emailIds = [
        ...new Set(semanticObjects.map((o) => o.properties.email_id)),
      ];

      // Fetch full email details
      const pgResult = await pgPool.query(
        `SELECT email_id, subject, sender, recipients, body_html, body_text, sent_at 
         FROM emails 
         WHERE email_id = ANY($1::uuid[]) AND tenant_id = $2`,
        [emailIds, tenantId],
      );

      return pgResult.rows.map((email) => {
        // Find best chunk for snippet
        const bestChunk = semanticObjects.find(
          (c) => c.properties.email_id === email.email_id,
        );
        return {
          ...email,
          id: email.email_id, // Standardize ID
          search_source: "semantic", // Debugging tag
          matching_chunk: bestChunk ? bestChunk.properties.chunk_text : "",
        };
      });
    } catch (error) {
      console.error("Error in semantic search:", error.message);
      return [];
    }
  }

  async function runKeywordSearch(queryTxt, tenantId) {
    try {
      const pgClient = await pgPool.connect();
      try {
        // Using `websearch_to_tsquery` is smarter than split/join.
        // It handles quotes and logic (e.g., "invoice -paid") automatically.
        const query = `
          SELECT
            email_id,
            subject,
            sender,
            recipients,
            body_html,
            body_text,
            sent_at,
            ts_headline('english', body_text, websearch_to_tsquery('english', $1)) AS matching_chunk
          FROM emails
          WHERE
            tenant_id = $2 AND
            tsv_body @@ websearch_to_tsquery('english', $1)
          ORDER BY sent_at DESC
          LIMIT 20; 
        `;
        const res = await pgClient.query(query, [queryTxt, tenantId]);

        return res.rows.map((row) => ({
          ...row,
          id: row.email_id,
          search_source: "keyword",
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
    // 1. If it looks like an email, search Sender/Recipients
    const isEmail = queryTxt.includes("@");

    try {
      const pgClient = await pgPool.connect();
      try {
        let query;
        let params;

        if (isEmail) {
          // Strict sender search
          query = `
                SELECT email_id, subject, sender, recipients, body_html, body_text, sent_at
                FROM emails 
                WHERE tenant_id = $1 AND sender ILIKE $2
                ORDER BY sent_at DESC LIMIT 10
            `;
          params = [tenantId, `%${queryTxt}%`];
        } else {
          // Strict Subject search
          query = `
                SELECT email_id, subject, sender, body_html, body_text, sent_at
                FROM emails 
                WHERE tenant_id = $1 AND subject ILIKE $2
                ORDER BY sent_at DESC LIMIT 10
            `;
          params = [tenantId, `%${queryTxt}%`];
        }

        const res = await pgClient.query(query, params);

        return res.rows.map((row) => ({
          ...row,
          id: row.email_id,
          search_source: "literal",
          // For literal matches, the "chunk" is just the start of the body or subject
          matching_chunk: `Matched: ${row.subject}`,
        }));
      } finally {
        pgClient.release();
      }
    } catch (error) {
      console.error("Error in literal search:", error.message);
      return [];
    }
  }

  // Refined Merge Function
  function mergeResults(semantic, keyword, literal) {
    const combined = new Map();

    // Helper to add items to map (if not exists)
    const addList = (list) => {
      list.forEach((item) => {
        if (!combined.has(item.id)) {
          combined.set(item.id, item);
        }
      });
    };

    // Priority Order: Literal -> Keyword -> Semantic
    // (We add them in this order so the "source" tag respects priority)
    addList(literal);
    addList(keyword);
    addList(semantic);

    // Convert to array (Sorting happens in the main route handler now)
    return Array.from(combined.values());
  }

  return router;
}

module.exports = createAiRouter;
