require("dotenv").config("../../.env");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { google } = require("googleapis");
const authenticateToken = require("./auth.middleware");

const JWT_SECRET = process.env.JWT_SECRET;

// This function receives the db pool and returns a new router
function createAuthRouter(pgPool, genAI) {
  const router = express.Router();

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );

  router.use(express.json());

  router.get("/google/connect", (req, res) => {
    const userId = req.query.user_id;

    if (!userId || userId === "undefined" || userId === "null") {
      return res.status(400).json({ error: "Missing user_id parameter" });
    }

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://mail.google.com/",
      ],
      state: userId,
      prompt: "consent",
    });

    res.redirect(url);
  });

  router.get("/google/callback", async (req, res) => {
    const { code, state } = req.query;
    const userId = state;

    if (!userId || userId === "undefined") {
      console.error("OAuth Callback Error: Missing state (user_id)");
      return res.redirect(
        "http://localhost:3000/?status=failed&reason=missing_user",
      );
    }

    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();

      const { email, name, picture } = userInfo.data;

      await pgPool.query(
        `INSERT INTO google_tokens (user_id, email, refresh_token, access_token, expiry_date)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE 
         SET refresh_token = EXCLUDED.refresh_token, 
             access_token = EXCLUDED.access_token,
             expiry_date = EXCLUDED.expiry_date,
             email = EXCLUDED.email`,
        [
          userId,
          email,
          tokens.refresh_token,
          tokens.access_token,
          tokens.expiry_date,
        ],
      );

      await pgPool.query(
        `UPDATE users SET name = $1, avatar_url = $2 WHERE user_id = $3`,
        [name, picture, userId],
      );

      res.redirect(`http://localhost:3000/?status=connected&email=${email}`);
    } catch (error) {
      console.error("OAuth Error:", error);
      res.redirect("http://localhost:3000/?status=failed");
    }
  });

  router.post("/register", async (req, res) => {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res
        .status(400)
        .json({ error: "Email, password, and name are required." });
    }

    let client;
    try {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      client = await pgPool.connect();

      const tenantQuery = `INSERT INTO tenants (name) VALUES ($1) RETURNING tenant_id`;
      const tenantRes = await client.query(tenantQuery, [name]);
      const newTenantId = tenantRes.rows[0].tenant_id;

      const userQuery = `
        INSERT INTO users (tenant_id, email, hashed_password) 
        VALUES ($1, $2, $3) 
        RETURNING user_id, email, tenant_id
      `;
      const userRes = await client.query(userQuery, [
        newTenantId,
        email.toLowerCase(),
        hashedPassword,
      ]);

      const newUser = userRes.rows[0];

      await client.query("COMMIT");

      res.status(201).json({
        message: "User registered successfully!",
        // Generate Token
        token: jwt.sign(
          {
            user_id: newUser.user_id,
            tenant_id: newUser.tenant_id,
            email: newUser.email,
          },
          JWT_SECRET,
          { expiresIn: "1d" },
        ),
        user: {
          id: newUser.user_id,
          email: newUser.email,
          name: name,
          is_gmail_connected: false,
        },
      });
    } catch (error) {
      if (client) {
        await client.query("ROLLBACK");
      }

      if (error.code === "23505") {
        return res
          .status(409)
          .json({ error: "A user with this email already exists." });
      }

      console.error("Error during registration:", error);
      res.status(500).json({ error: "Registration failed." });
    } finally {
      if (client) {
        client.release();
      }
    }
  });

  // We will add the /login route here later
  router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    }

    let client;
    try {
      // --- Step 1: Find the user in the database ---
      client = await pgPool.connect();
      const userQuery = `SELECT * FROM users WHERE email = $1`;
      const userRes = await client.query(userQuery, [email.toLowerCase()]);

      if (userRes.rowCount === 0) {
        // User not found. Send a generic error to prevent "email enumeration" attacks.
        return res.status(401).json({ error: "Invalid email or password." });
      }

      const user = userRes.rows[0];

      // --- Step 2: Compare the password with the hash ---
      const isMatch = await bcrypt.compare(password, user.hashed_password);

      if (!isMatch) {
        // Password doesn't match. Send the same generic error.
        return res.status(401).json({ error: "Invalid email or password." });
      }

      const tokenCheck = await pgPool.query(
        "SELECT 1 FROM google_tokens WHERE user_id = $1",
        [user.user_id],
      );
      const isGmailConnected = tokenCheck.rows.length > 0;

      const payload = {
        user: {
          id: user.user_id,
          tenant_id: user.tenant_id,
          email: user.email,
        },
      };

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1d" });

      res.json({
        message: "Login successful!",
        token: token,
        user: {
          id: user.user_id,
          name: user.name,
          email: user.email,
          is_gmail_connected: isGmailConnected,
        },
      });
    } catch (error) {
      console.error("Error during login:", error);
      res.status(500).json({ error: "Login failed." });
    } finally {
      if (client) {
        client.release();
      }
    }
  });

  router.get("/settings", authenticateToken, async (req, res) => {
    try {
      // FIX: Access 'req.user.user.id' instead of 'req.user.user_id'
      // The middleware decodes the token, and your token has a 'user' property inside.
      const userId = req.user.id;

      const userResult = await pgPool.query(
        "SELECT name, avatar_url, settings FROM users WHERE user_id = $1",
        [userId],
      );

      const tokenResult = await pgPool.query(
        "SELECT email FROM google_tokens WHERE user_id = $1",
        [userId],
      );

      const userRow = userResult.rows[0];
      const tokenRow = tokenResult.rows[0];

      res.json({
        name: userRow?.name || "",
        avatar_url: userRow?.avatar_url || "",
        ...(userRow?.settings || {}),
        is_gmail_connected: !!tokenRow,
        connected_email: tokenRow?.email || null,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  // [PATCH] /settings
  router.patch("/settings", authenticateToken, async (req, res) => {
    const { name, ...jsonSettings } = req.body;
    const userId = req.user.id;
    if (!userId) return res.status(401).json({ error: "Invalid Token" });

    try {
      const client = await pgPool.connect();
      try {
        await client.query("BEGIN");

        // 1. Update Name (if provided)
        if (name) {
          await client.query("UPDATE users SET name = $1 WHERE user_id = $2", [
            name,
            userId,
          ]);
        }

        // 2. Update JSON Settings (if provided)
        if (Object.keys(jsonSettings).length > 0) {
          await client.query(
            "UPDATE users SET settings = COALESCE(settings, '{}'::jsonb) || $1::jsonb WHERE user_id = $2",
            [JSON.stringify(jsonSettings), userId],
          );
        }

        await client.query("COMMIT");
        res.json({ success: true });
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  return router;
}

// Export the function that creates the router
module.exports = createAuthRouter;
