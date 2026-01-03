require("dotenv").config({ path: "../../.env" });
const jwt = require("jsonwebtoken");

// Load the JWT secret from .env, or use a default
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * This middleware function will be run before our secure routes.
 * It checks for a valid JWT token in the 'Authorization' header.
 */
function authenticateToken(req, res, next) {
  // Get the token from the header (format: "Bearer TOKEN")
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Get just the token part

  if (token == null) {
    // No token provided
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    // --- Step 1: Verify the token ---
    // This checks the signature and expiration
    const payload = jwt.verify(token, JWT_SECRET);

    // --- Step 2: Attach user data to the request ---
    // The payload is the object we created during login
    // { user: { id: ..., tenant_id: ..., email: ... } }
    req.user = payload.user;

    // --- Step 3: Call 'next()' ---
    // This tells Express, "The user is valid, proceed to the
    // actual route they were trying to access (e.g., /search)."
    next();
  } catch (error) {
    // Token is invalid (expired, wrong signature, etc.)
    return res.status(403).json({ error: "Invalid token." });
  }
}

module.exports = authenticateToken;
