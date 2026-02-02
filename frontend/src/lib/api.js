import axios from "axios";

// Ensure this matches your backend port
const API_URL = "http://localhost:3001";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Automatically injects the JWT token into every request
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
  (error) => Promise.reject(error),
);

// Handles 401/403 errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response &&
      (error.response.status === 401 || error.response.status === 403)
    ) {
      console.warn("[API] Session expired. Logging out...");

      if (typeof window !== "undefined") {
        localStorage.removeItem("mailWise_token");
        localStorage.removeItem("mailWise_user_name");

        window.location.href = "/";
      }
    }
    return Promise.reject(error);
  },
);

export default api;
