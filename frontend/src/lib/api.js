// lib/api.js
import axios from "axios";

// Ensure this matches your backend port (3001 based on your index.js)
const API_URL = "http://localhost:3001";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// --- Request Interceptor ---
// Automatically injects the JWT token from localStorage into every request
api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("mailWise_token");
      if (token) {
        config.headers["Authorization"] = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// --- Response Interceptor ---
// Handles 401 (Unauthorized) errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      console.warn("[API] Unauthorized. Token invalid or expired.");
      // Optional: Clear token if you want auto-logout behavior
      // localStorage.removeItem('mailWise_token');
      // window.location.reload();
    }
    return Promise.reject(error);
  }
);

export default api;
