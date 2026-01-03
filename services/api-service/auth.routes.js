require("dotenv").config("../../.env");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

// This function receives the db pool and returns a new router
function createAuthRouter(pgPool, genAI) {
  const router = express.Router();

  /**
   * [POST] /auth/register
   * Registers a new tenant and a new user.
   * Body: { "email": "user@example.com", "password": "mypassword123", "name": "My Company" }
   */
  router.use(express.json());
  router.post("/register", async (req, res) => {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res
        .status(400)
        .json({ error: "Email, password, and name are required." });
    }

    let client;
    try {
      // --- Step 1: Hash the password ---
      // We use a "salt" of 10 rounds, which is a standard, secure setting.
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // --- Step 2: Start a database transaction ---
      // A transaction is all-or-nothing. If creating the user fails,
      // we'll "roll back" and undo the tenant creation.
      // This prevents orphaned data.
      client = await pgPool.connect();
      await client.query("BEGIN");

      // --- Step 3: Create the new Tenant ---
      const tenantQuery = `INSERT INTO tenants (name) VALUES ($1) RETURNING tenant_id`;
      const tenantRes = await client.query(tenantQuery, [name]);
      const newTenantId = tenantRes.rows[0].tenant_id;

      // --- Step 4: Create the new User, linked to the tenant ---
      const userQuery = `
        INSERT INTO users (tenant_id, email, hashed_password) 
        VALUES ($1, $2, $3) 
        RETURNING user_id, email
      `;
      const userRes = await client.query(userQuery, [
        newTenantId,
        email.toLowerCase(),
        hashedPassword,
      ]);

      // --- Step 5: Commit the transaction ---
      // Both queries succeeded, so we "save" our changes.
      await client.query("COMMIT");

      res.status(201).json({
        message: "User registered successfully!",
        user: userRes.rows[0],
      });
    } catch (error) {
      // --- Step 6: Rollback on error ---
      // If anything failed, undo all changes from this block.
      if (client) {
        await client.query("ROLLBACK");
      }

      // Check for a "unique constraint" error (i.e., email already exists)
      if (error.code === "23505") {
        return res
          .status(409)
          .json({ error: "A user with this email already exists." });
      }

      console.error("Error during registration:", error);
      res.status(500).json({ error: "Registration failed." });
    } finally {
      // --- Step 7: Always release the client ---
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

      // --- Step 3: Create the JWT ---
      // This is the "payload" of the token. We include the user and tenant IDs
      // so our API knows who is making the request.
      const payload = {
        user: {
          id: user.user_id,
          tenant_id: user.tenant_id,
          email: user.email,
        },
      };

      // Sign the token. It will expire in 1 day ('1d').
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1d" });

      // --- Step 4: Send the token to the user ---
      res.json({
        message: "Login successful!",
        token: token,
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

  return router;
}

// Export the function that creates the router
module.exports = createAuthRouter;
