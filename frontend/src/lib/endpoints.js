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

  getSettings: async () => {
    const res = await api.get("/auth/settings");
    return res.data;
  },

  updateSettings: async (settings) => {
    return api.patch("/auth/settings", settings);
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

  deleteForever: async (id) => {
    // Calls DELETE /emails/:id (Permanent Delete)
    return api.delete(`/emails/${id}`);
  },

  markRead: async (id, isRead) => {
    return api.patch(`/emails/${id}/read`, { is_read: isRead });
  },

  extractEmailsFromFile: async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await api.post("/ai/extract-emails", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.emails;
  },

  sendMassMail: async (payload) => {
    const res = await api.post("/send/mass", payload);
    return res.data;
  },

  autocomplete: async (context) => {
    const res = await api.post("/ai/autocomplete", { context });
    return res.data.completion;
  },

  fixGrammar: async (text) => {
    const res = await api.post("/ai/polish", { text });
    return res.data.corrected;
  },
};

export const ContactService = {
  getSuggestions: async () => {
    const res = await api.get("/contacts/suggestions");
    return res.data;
  },
};
