// app/page.jsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Sidebar from "@/components/shell/sidebar";
import EmailList from "@/components/ui/list";
import ReadingPane from "@/components/ui/reader";
import ComposeModal from "@/components/shell/compose";
import LoginModal from "@/components/auth/login-modal";
import { toast, ToastContainer } from "@/components/ui/toast";
import ShortcutsHelp from "@/components/shell/shortcuts-help";
import SearchModal from "@/components/shell/command";
import AskAIModal from "@/components/shell/ask-ai-modal";
import SettingsModal from "@/components/shell/settings-modal";
import { AuthService, EmailService, ActionService } from "@/lib/endpoints";

export default function MailWiseMailPage() {
  // --- AUTH STATE ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // --- APP STATE ---
  const [activeTab, setActiveTab] = useState("inbox");
  const [emails, setEmails] = useState([]); // Real data
  const [isSyncing, setIsSyncing] = useState(false); // Controls the loader
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Selection
  const [selectedEmailId, setSelectedEmailId] = useState(null);
  const [askAIOpen, setAskAIOpen] = useState(false);

  // UI Toggles
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [composeData, setComposeData] = useState({});
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const selectedEmailIdRef = useRef(selectedEmailId);

  const handleSearchSelect = (searchResult) => {
    const exists = emails.find((e) => e.id === searchResult.id);

    if (!exists) {
      const MY_EMAIL = "karmakarprithwis566@gmail.com";
      const isSentByMe = (searchResult.sender || "").includes(MY_EMAIL);

      const formatted = {
        id: searchResult.id,
        sender: searchResult.sender,
        email: searchResult.sender,
        subject: searchResult.subject,
        preview: (searchResult.body_text || "").substring(0, 120),
        time: new Date(searchResult.sent_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        read: true,
        tag: "Search",
        tagColor: "zinc",
        folder: "search_result",
        isStarred: false,
        body: searchResult.body_html || `<p>${searchResult.body_text}</p>`,
        rawText: searchResult.body_text,
        attachments: [],
      };

      setEmails((prev) => [formatted, ...prev]);
    }

    // 3. Select it
    setSelectedEmailId(searchResult.id);
  };

  // Your Email
  const MY_EMAIL = "karmakarprithwis566@gmail.com";

  // --- 1. Check Authentication on Mount ---
  useEffect(() => {
    const checkAuth = () => {
      const isAuth = AuthService.isAuthenticated();
      setIsAuthenticated(isAuth);
      setIsLoadingAuth(false);
    };
    checkAuth();
  }, []);

  // --- 2. Data Loading (Fast SQL Poll) ---
  const loadEmailsFromBackend = async () => {
    try {
      const rawData = await EmailService.list();
      const MY_EMAIL = "karmakarprithwis566@gmail.com";
      const seenIds = new Set();

      const formatted = rawData.reduce((acc, email) => {
        if (seenIds.has(email.email_id || email.id)) return acc;
        seenIds.add(email.email_id || email.id);

        let aiData = {};
        try {
          if (typeof email.ai_metadata === "string") {
            // It's a string (likely TEXT column), so we must parse it
            aiData = JSON.parse(email.ai_metadata);
          } else if (
            typeof email.ai_metadata === "object" &&
            email.ai_metadata !== null
          ) {
            aiData = email.ai_metadata;
          }
        } catch (e) {
          console.warn("Metadata Parse Error for:", email.id, e);
        }

        const isSentByMe = (email.sender || "").includes(MY_EMAIL);
        let folder = "inbox";

        if (email.status === "snoozed") {
          folder = "snoozed"; // <--- ADD THIS (Hides it from Inbox view)
        } else if (email.status === "archive") {
          folder = "archive";
        } else if (email.status === "trash") {
          folder = "trash";
        } else if (email.status === "draft") folder = "drafts";
        else if (email.status === "sent" || isSentByMe) folder = "sent";

        // --- DISPLAY LOGIC ---
        let displaySender = email.sender || "Unknown";

        if (folder === "sent") {
          if (aiData.to && Array.isArray(aiData.to) && aiData.to.length > 0) {
            displaySender = `MailWise AI App ${
              aiData.to.length > 1 ? ` +${aiData.to.length - 1}` : ""
            }`;
          } else {
            displaySender = "MailWise AI App"; // Fallback
          }
        } else if (folder === "drafts") {
          displaySender = "Draft";
        }

        // Tag Logic
        let tagName = email.label || "General";
        let tagColor = "white";

        switch (tagName) {
          case "Meeting":
            tagColor = "purple";
            break;
          case "Task":
            tagColor = "blue";
            break;
          case "Info":
            tagColor = "emerald";
            break;
          case "Sent":
            tagColor = "white";
            break;
          case "Draft":
            tagColor = "zinc";
            break;
          default:
            tagColor = "white";
            tagName = "General";
        }

        if (folder === "sent") tagName = "Sent";
        else if (folder === "drafts") {
          tagName = "Draft";
          tagColor = "zinc";
        }

        acc.push({
          id: email.email_id || email.id,
          sender: displaySender,
          to: email.recipients || aiData.to || aiData.recipients_snapshot,
          email: email.sender,
          subject: email.subject || "(No Subject)",
          preview: (email.body_text || "").substring(0, 120) + "...",
          time: new Date(email.sent_at)
            .toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
            .replace(",", " ·"),
          read: true,
          tag: tagName,
          tagColor: tagColor,
          is_read: email.is_read,
          folder: folder,
          isStarred: email.is_starred || false,
          body: email.body_html || `<p>${email.body_text}</p>`,
          attachments: aiData.attachments || [],
          draftData: folder === "drafts" ? aiData : null,
        });
        return acc;
      }, []);

      setEmails((prevEmails) => {
        const currentSelectedId = selectedEmailIdRef.current;
        if (
          currentSelectedId &&
          !formatted.find((e) => e.id === currentSelectedId)
        ) {
          const preservedEmail = prevEmails.find(
            (e) => e.id === currentSelectedId
          );
          if (preservedEmail) {
            return [preservedEmail, ...formatted];
          }
        }
        return formatted;
      });

      return formatted;
    } catch (e) {
      console.error("Load Error:", e);
      return [];
    }
  };

  // --- 3. Sync Handler ---
  // This triggers the heavy lifting (Gmail -> RabbitMQ -> Postgres)
  const triggerSync = async () => {
    if (isSyncing) return; // Prevent double clicks

    setIsSyncing(true);
    console.log("🔄 Sync started...");

    try {
      await EmailService.sync();
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      // We keep the loader for a moment just to show activity,
      // or turn it off immediately if you prefer.
      setTimeout(() => setIsSyncing(false), 2000);
    }
  };

  useEffect(() => {
    selectedEmailIdRef.current = selectedEmailId;
  }, [selectedEmailId]);

  // --- 4. Lifecycle Effects ---
  useEffect(() => {
    if (isAuthenticated) {
      // A. Initial Load
      loadEmailsFromBackend().then((data) => {
        if (data.length > 0 && !selectedEmailId) {
          setSelectedEmailId(data[0].id);
        }
      });

      // B. Trigger Background Sync on login
      triggerSync();

      // C. Start Silent Polling (Every 3 seconds)
      // This makes new emails appear automatically
      const intervalId = setInterval(() => {
        loadEmailsFromBackend();
      }, 3000);

      return () => clearInterval(intervalId);
    }
  }, [isAuthenticated]);

  // --- Handlers ---
  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const filteredEmails = emails.filter((email) => {
    if (showUnreadOnly && email.is_read) return false;
    if (activeTab === "starred") return email.isStarred;
    const isLabel = ["Meeting", "Task", "Info", "General"].includes(activeTab);
    if (isLabel) return email.tag === activeTab;
    return email.folder === activeTab;
  });

  const selectedEmail = emails.find((e) => e.id === selectedEmailId);
  const currentIndex = filteredEmails.findIndex(
    (e) => e.id === selectedEmailId
  );

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    const nextList = emails.filter((email) => {
      if (newTab === "starred") return email.isStarred;
      const isLabel = ["Meeting", "Task", "Info", "General"].includes(newTab);
      if (isLabel) return email.tag === newTab;
      return email.folder === newTab;
    });
    if (nextList.length > 0) setSelectedEmailId(nextList[0].id);
    else setSelectedEmailId(null);
  };

  const handleToggleStar = async (id) => {
    // 1. Optimistic Update
    const email = emails.find((e) => e.id === id);
    const newStatus = !email.isStarred;

    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, isStarred: newStatus } : e))
    );

    // 2. API Call
    try {
      await ActionService.toggleStar(id, newStatus);
    } catch (error) {
      console.error("Failed to star", error);
      // Revert on failure
      setEmails((prev) =>
        prev.map((e) => (e.id === id ? { ...e, isStarred: !newStatus } : e))
      );
    }
  };

  const handleArchive = useCallback(
    async (id) => {
      // 1. Optimistic Update (Remove from current view immediately)
      // Note: If we are in "Archive" tab, this might look weird, but usually you don't archive from archive.
      setEmails((prev) =>
        prev.map((e) => (e.id === id ? { ...e, folder: "archive" } : e))
      );
      if (selectedEmailId === id) setSelectedEmailId(null);

      // 2. API Call
      try {
        await ActionService.updateStatus(id, "archive");
        toast.success("Archived");
      } catch (error) {
        console.error("Failed to archive", error);
        toast.error("Failed to archive");
      }
    },
    [selectedEmailId]
  );

  const handleLabelChange = async (id, newLabel) => {
    // Optimistic Update
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, tag: newLabel } : e))
    );
    try {
      await ActionService.updateLabel(id, newLabel);
    } catch (e) {
      console.error(e);
    }
  };

  // NEW: Unarchive (Move to Inbox)
  const handleUnarchive = async (id) => {
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, folder: "inbox" } : e))
    );
    if (selectedEmailId === id) setSelectedEmailId(null);

    try {
      await ActionService.updateStatus(id, "inbox");
      toast.success("Moved to Inbox");
    } catch (error) {
      console.error("Failed to unarchive", error);
      toast.error("Failed to unarchive");
    }
  };

  const handleDelete = useCallback(
    async (id) => {
      const email = emails.find((e) => e.id === id);
      if (!email) return;

      const isTrash = email.folder === "trash";

      setEmails((prev) => prev.filter((e) => e.id !== id));
      if (selectedEmailId === id) setSelectedEmailId(null);

      try {
        if (isTrash) {
          await ActionService.deleteForever(id);
          toast.success("Deleted forever");
        } else {
          await ActionService.updateStatus(id, "trash");
          toast.success("Moved to trash");
        }
      } catch (error) {
        console.error("Delete failed", error);
        toast.error("Failed to delete");
      }
    },
    [emails, selectedEmailId]
  );

  const handleRestore = async (id) => {
    setEmails((prev) => prev.filter((e) => e.id !== id));
    if (selectedEmailId === id) setSelectedEmailId(null);

    try {
      await ActionService.updateStatus(id, "inbox");
      toast.success("Restored to Inbox");
    } catch (error) {
      console.error("Restore failed", error);
    }
  };

  const handleSend = async (data) => {
    try {
      await ActionService.send({
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject,
        html: data.html,
        attachments: data.attachments,
      });

      if (composeData.id) {
        console.log("Cleaning up draft:", composeData.id);
        try {
          await ActionService.deleteDraft(composeData.id);
        } catch (e) {
          console.warn("Could not delete draft from server", e);
        }
        setEmails((prev) => prev.filter((e) => e.id !== composeData.id));
        if (selectedEmailId === composeData.id) {
          setSelectedEmailId(null);
        }
      }

      toast.success("Email sent successfully!");
      console.log("Email queued successfully");
      setIsComposing(false);
    } catch (error) {
      console.error("Failed to send:", error);
      alert("Failed to send email. Check console.");
    }
  };

  const handleReply = (emailToReply) => {
    if (!emailToReply) return;
    setComposeData({
      to: emailToReply.email,
      subject: `Re: ${emailToReply.subject}`,
    });
    setIsComposing(true);
  };

  const handleNavigate = (direction) => {
    if (direction === "next" && currentIndex < filteredEmails.length - 1)
      setSelectedEmailId(filteredEmails[currentIndex + 1].id);
    else if (direction === "prev" && currentIndex > 0)
      setSelectedEmailId(filteredEmails[currentIndex - 1].id);
  };

  // --- NEW: Handle Forward ---
  const handleForward = (emailToForward) => {
    if (!emailToForward) return;

    // 1. Format the Forward Header
    const originalDate = emailToForward.time; // Or format new Date(emailToForward.sent_at)
    const forwardHeader = `
      <br><br>
      <div class="gmail_quote">
          ---------- Forwarded message ---------<br>
          From: <strong>${emailToForward.email}</strong><br>
          Date: ${originalDate}<br>
          Subject: ${emailToForward.subject}<br>
          To: ${emailToForward.to || "Me"}<br>
          <br>
      </div>
    `;

    // 2. Prepare Attachments
    // The DB stores them as { filename, content }, but UI expects { name } for display
    const forwardedAttachments = (emailToForward.attachments || []).map(
      (att) => ({
        ...att,
        name: att.filename, // Normalize 'filename' to 'name' for the UI
      })
    );

    // 3. Set Compose Data
    setComposeData({
      subject: `Fwd: ${emailToForward.subject}`,
      html: forwardHeader + emailToForward.body, // Prepend header
      attachments: forwardedAttachments, // Carry over attachments
      to: [], // Clear recipients
      cc: [],
      bcc: [],
    });

    setIsComposing(true);
  };

  // 1. Add handleDraftSelect
  const openDraft = (draftEmail) => {
    setComposeData({
      id: draftEmail.id,
      to: draftEmail.draftData?.to || [],
      cc: draftEmail.draftData?.cc || [],
      bcc: draftEmail.draftData?.bcc || [],
      subject: draftEmail.subject,
      html: draftEmail.body,
      attachments: draftEmail.draftData?.attachments || [],
    });
    setIsComposing(true);
  };

  const handleSnooze = async (id, date) => {
    // 1. Optimistic Update: Hide email immediately by setting status to 'snoozed'
    setEmails((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, status: "snoozed", folder: "snoozed" } : e
      )
    );
    if (selectedEmailId === id) setSelectedEmailId(null);

    // 2. API Call
    try {
      await ActionService.snooze(id, date.toISOString());
      toast.success("Email snoozed");
    } catch (error) {
      console.error(error);
      toast.error("Failed to snooze");
    }
  };

  const handleReadToggle = async (id, newStatus) => {
    // 1. Optimistic Update (Update UI immediately)
    setEmails((prev) =>
      prev.map((email) =>
        email.id === id ? { ...email, is_read: newStatus } : email
      )
    );

    // 2. Call API
    try {
      await ActionService.markRead(id, newStatus);
    } catch (error) {
      console.error("Failed to update read status", error);
    }
  };

  // --- Keyboard ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      // 1. Check if user is typing in an input field
      const isInput =
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.isContentEditable;

      // --- ALWAYS ALLOWED SHORTCUTS ---

      // Global Search (Cmd+K / Ctrl+K)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
        return;
      }

      // Escape to close modals
      if (e.key === "Escape") {
        if (askAIOpen) setAskAIOpen(false);
        // (Other modals handle their own Escape via their own useEffects,
        // but you can add centralized closing here if you want)
      }

      // --- BLOCKED WHEN TYPING OR MODALS OPEN ---

      // If typing, composing, searching, or asking AI -> STOP HERE
      if (isInput || isComposing || searchOpen || askAIOpen) return;

      // 2. Compose (C)
      if (e.key === "c" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setComposeData({});
        setIsComposing(true);
        return;
      }

      // 3. Navigation & Actions (Only when list is visible)
      if (emails.length > 0) {
        // Navigation: Next (J)
        if (e.key === "j" && !e.metaKey && !e.ctrlKey) {
          if (currentIndex < filteredEmails.length - 1) {
            setSelectedEmailId(filteredEmails[currentIndex + 1].id);
          }
        }

        // Navigation: Previous (K)
        if (e.key === "k" && !e.metaKey && !e.ctrlKey) {
          if (currentIndex > 0) {
            setSelectedEmailId(filteredEmails[currentIndex - 1].id);
          }
        }

        // Action: Archive (E)
        if (e.key === "e" && !e.metaKey && !e.ctrlKey && selectedEmailId) {
          handleArchive(selectedEmailId);
        }

        // Action: Delete (#)
        if (e.key === "#" && !e.metaKey && !e.ctrlKey && selectedEmailId) {
          handleDelete(selectedEmailId);
        }

        // Action: Reply (R)
        if (e.key === "r" && !e.metaKey && !e.ctrlKey && selectedEmailId) {
          e.preventDefault();
          handleReply(selectedEmail);
        }

        // Action: Forward (F) - Optional, if you want to map 'f' to forward
        if (e.key === "f" && !e.metaKey && !e.ctrlKey && selectedEmailId) {
          e.preventDefault();
          handleForward(selectedEmail);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isComposing,
    searchOpen,
    askAIOpen,
    selectedEmailId,
    selectedEmail,
    currentIndex,
    filteredEmails,
    emails.length,
    handleArchive,
    handleDelete,
  ]);

  if (isLoadingAuth) return null;

  return (
    <div className="flex h-screen w-full bg-[#09090b] text-zinc-400 font-sans selection:bg-indigo-500/30 overflow-hidden">
      <ToastContainer />
      {!isAuthenticated && <LoginModal onLoginSuccess={handleLoginSuccess} />}

      {askAIOpen && <AskAIModal onClose={() => setAskAIOpen(false)} />}

      {shortcutsOpen && (
        <ShortcutsHelp onClose={() => setShortcutsOpen(false)} />
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      <Sidebar
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        isSyncing={isSyncing} // <--- PASSING THE SYNC STATE
        onSync={triggerSync} // <--- ALLOW MANUAL SYNC CLICK
        counts={{
          inbox: emails.filter((e) => e.folder === "inbox").length,
          starred: emails.filter((e) => e.isStarred).length,
          sent: emails.filter((e) => e.folder === "sent").length,
          drafts: emails.filter((e) => e.folder === "drafts").length,
          archive: emails.filter((e) => e.folder === "archive").length,
          trash: emails.filter((e) => e.folder === "trash").length,
        }}
        onCompose={() => {
          setComposeData({});
          setIsComposing(true);
        }}
        onAskAI={() => setAskAIOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      <EmailList
        emails={filteredEmails}
        activeTab={activeTab}
        selectedEmailId={selectedEmailId}
        onSelect={(id) => {
          const email = emails.find((e) => e.id === id);
          if (email && email.folder === "drafts") {
            openDraft(email); // Open Compose for drafts
          } else {
            setSelectedEmailId(id); // Open Reader for others
          }
        }}
        onToggleStar={handleToggleStar}
        onUnarchive={handleUnarchive}
        onArchive={handleArchive}
        onDelete={handleDelete}
        onRestore={handleRestore}
        onSearchClick={() => setSearchOpen(true)}
        showUnreadOnly={showUnreadOnly}
        onToggleUnread={() => setShowUnreadOnly(!showUnreadOnly)}
        onRefresh={triggerSync}
      />

      <ReadingPane
        email={selectedEmail}
        totalCount={filteredEmails.length}
        currentIndex={currentIndex}
        onNavigate={handleNavigate}
        onReply={handleReply}
        onAction={(type, id, data) => {
          if (type === "archive") handleArchive(id);
          if (type === "unarchive") handleUnarchive(id);
          if (type === "delete") handleDelete(id);
          if (type === "restore") handleRestore(id);
          if (type === "reply") handleReply(selectedEmail);
          if (type === "forward") handleForward(selectedEmail);
          if (type === "snooze") handleSnooze(id, data);
          if (type === "toggle_read") handleReadToggle(id, data);
        }}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onLabelChange={handleLabelChange}
      />

      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onSelect={handleSearchSelect}
        />
      )}

      {isComposing && (
        <ComposeModal
          initialData={composeData}
          onSend={handleSend}
          onClose={() => setIsComposing(false)}
        />
      )}
    </div>
  );
}
