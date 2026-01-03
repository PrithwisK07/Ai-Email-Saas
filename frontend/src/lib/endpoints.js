// lib/endpoints.js
import api from "./api";

export const AuthService = {
  login: async (email, password) => {
    // Matches [POST] /auth/login from your auth.routes.js
    const res = await api.post("/auth/login", { email, password });
    if (res.data.token) {
      localStorage.setItem("mailWise_token", res.data.token);
    }
    return res.data;
  },
  register: async (name, email, password) => {
    // Matches [POST] /auth/register
    const res = await api.post("/auth/register", { name, email, password });
    return res.data;
  },
  logout: () => {
    localStorage.removeItem("mailWise_token");
  },
  isAuthenticated: () => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem("mailWise_token");
  },
};

export const EmailService = {
  sync: async () => {
    const res = await api.post("/ingestion/sync");
    return res.data;
  },

  // NEW: Use the fast endpoint for the main view
  list: async () => {
    const res = await api.get(`/ingestion/list?_t=${Date.now()}`);
    return res.data;
  },

  // Keep search for the Command Palette / Actual searching
  search: async (query) => {
    const res = await api.get(`/ai/search?search=${encodeURIComponent(query)}`);
    return res.data;
  },
};

export const ActionService = {
  send: async (payload) => {
    // Matches [POST] /send
    const res = await api.post("/send", payload);
    return res.data;
  },

  draft: async (payload) => {
    // Matches [POST] /ai/draft
    const res = await api.post("/ai/draft", payload);
    return res.data;
  },

  saveDraft: async (data) => {
    return api.post("/drafts", data);
  },

  deleteDraft: async (id) => {
    return api.delete(`/drafts/${id}`);
  },

  summarize: async (emailId) => {
    const res = await api.get(`/ai/summarize/${emailId}`);
    return res.data; // Returns the HTML string
  },

  toggleStar: async (id, isStarred) => {
    return api.patch(`/emails/${id}/star`, { is_starred: isStarred });
  },

  updateStatus: async (id, status) => {
    return api.patch(`/emails/${id}/status`, { status });
  },

  updateLabel: async (id, label) => {
    return api.patch(`/emails/${id}/label`, { label });
  },

  ask: async (query) => {
    const res = await api.post("/ai/ask", { query });
    return res.data;
  },

  snooze: async (id, date) => {
    return api.patch(`/emails/${id}/snooze`, { snooze_until: date });
  },
};
