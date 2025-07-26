/**
 * OfflineDraftEditor.tsx
 *
 * A React component for robust offline draft storage using IndexedDB.
 * - Saves user drafts (posts/comments) locally when offline.
 * - Recovers drafts on reload or reconnect.
 * - Uploads drafts automatically when back online.
 * - Shows user feedback for recovery and upload events.
 *
 * Usage:
 * 1. Copy this file into your project (e.g., src/components/OfflineDraftEditor.tsx).
 * 2. Import and use: <OfflineDraftEditor onUpload={yourUploadFunction} />
 *    - `onUpload` should be an async function that takes a string (the draft) and uploads it.
 *
 * Requirements:
 * - React 18+, TypeScript
 */

import React, { useState, useEffect, useCallback } from "react";

// --- IndexedDB Helper (no external dependency) ---
type DraftRecord = { id: string; content: string; timestamp: number };

function openDraftDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("OfflineDraftDB", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("drafts")) {
        db.createObjectStore("drafts", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveDraftToDB(draft: DraftRecord) {
  const db = await openDraftDB();
  const tx = db.transaction("drafts", "readwrite");
  tx.objectStore("drafts").put(draft);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getDraftFromDB(id: string): Promise<DraftRecord | undefined> {
  const db = await openDraftDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("drafts").objectStore("drafts").get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteDraftFromDB(id: string) {
  const db = await openDraftDB();
  const tx = db.transaction("drafts", "readwrite");
  tx.objectStore("drafts").delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Main Component ---
type OfflineDraftEditorProps = {
  id?: string; // Unique ID for the draft (default: "default")
  onUpload: (content: string) => Promise<void>; // Upload handler
  placeholder?: string;
};

export const OfflineDraftEditor: React.FC<OfflineDraftEditorProps> = ({
  id = "default",
  onUpload,
  placeholder = "Write your post or comment here...",
}) => {
  const [content, setContent] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "saving" | "recovered" | "uploading" | "uploaded" | "error" | "saved-offline">("idle");
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [localDraft, setLocalDraft] = useState<string>(""); // For testing localStorage
  const [showPostPrompt, setShowPostPrompt] = useState<boolean>(false);
  const [pendingDraft, setPendingDraft] = useState<string>("");

  // Save draft to IndexedDB and localStorage on change
  useEffect(() => {
    if (content) {
      setStatus("saving");
      saveDraftToDB({ id, content, timestamp: Date.now() }).then(() => setStatus("idle"));
      localStorage.setItem("offline-draft-test-" + id, content);
      setLocalDraft(content);
    }
  }, [content, id]);

  // Recover draft on mount
  useEffect(() => {
    getDraftFromDB(id).then((draft) => {
      if (draft?.content) {
        setContent(draft.content);
        setStatus("recovered");
        setTimeout(() => setStatus("idle"), 2000);
      }
    });
    // Also load from localStorage for testing
    const local = localStorage.getItem("offline-draft-test-" + id) || "";
    setLocalDraft(local);
  }, [id]);

  // When deleting draft (after upload), clear localStorage
  const clearLocalDraft = useCallback(() => {
    localStorage.removeItem("offline-draft-test-" + id);
    setLocalDraft("");
  }, [id]);

  // When coming back online, if a draft exists, show prompt only if it's not already in the textarea and not empty
  useEffect(() => {
    if (
      isOnline &&
      localDraft &&
      localDraft.trim() !== "" &&
      localDraft !== content
    ) {
      setPendingDraft(localDraft);
      setShowPostPrompt(true);
    } else {
      setShowPostPrompt(false);
    }
  }, [isOnline, localDraft, content]);

  // Online/offline event listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    // Polling fallback for browsers that don't fire the event
    let lastOnline = navigator.onLine;
    const poll = setInterval(() => {
      if (navigator.onLine !== lastOnline) {
        setIsOnline(navigator.onLine);
        lastOnline = navigator.onLine;
      }
    }, 1000);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(poll);
    };
  }, []);

  // Manual upload (for testing or UI)
  const handleManualUpload = useCallback(async () => {
    if (isOnline) {
      setStatus("uploading");
      try {
        await onUpload(content);
        await deleteDraftFromDB(id);
        setStatus("uploaded");
        setTimeout(() => setStatus("idle"), 2000);
        setContent("");
        clearLocalDraft();
      } catch {
        setStatus("error");
      }
    } else {
      // Save draft locally and clear textarea
      await saveDraftToDB({ id, content, timestamp: Date.now() });
      localStorage.setItem("offline-draft-test-" + id, content);
      setLocalDraft(content);
      setStatus("saved-offline");
      setTimeout(() => setStatus("idle"), 2000);
      setContent("");
    }
  }, [content, id, onUpload, clearLocalDraft, isOnline]);

  // Handler for posting the pending offline draft
  const handlePostPendingDraft = useCallback(async () => {
    if (pendingDraft) {
      setContent(pendingDraft);
      localStorage.setItem("offline-draft-test-" + id, pendingDraft);
      setLocalDraft(pendingDraft);
      setShowPostPrompt(false);
      setPendingDraft("");
    }
  }, [pendingDraft, id]);

  // Handler for dismissing the prompt
  const handleDismissPrompt = useCallback(() => {
    setShowPostPrompt(false);
  }, []);

  // UI Styles
  const cardStyle: React.CSSProperties = {
    background: "rgba(255, 255, 255, 0.18)",
    boxShadow: "0 8px 32px 0 rgba(80, 80, 180, 0.18)",
    borderRadius: 28,
    padding: 36,
    maxWidth: 420,
    width: "100%",
    margin: "0 auto",
    fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 20,
    animation: "fadeInCard 0.7s cubic-bezier(.39,.575,.56,1)",
    border: "1.5px solid rgba(255,255,255,0.35)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
  };
  const headerStyle: React.CSSProperties = {
    fontSize: 30,
    fontWeight: 800,
    marginBottom: 10,
    letterSpacing: 0.5,
    color: "#3b3663",
    textAlign: "center",
    fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
    textShadow: "0 2px 8px #e0e7ff"
  };
  const statusHeaderStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 18,
    marginTop: -10,
    letterSpacing: 0.2,
    color: "#6d6a7c"
  };
  const labelStyle: React.CSSProperties = {
    fontWeight: 600,
    marginBottom: 8,
    color: "#3b3663",
    fontSize: 17,
    letterSpacing: 0.1,
  };
  const textareaStyle: React.CSSProperties = {
    width: "100%",
    fontSize: 18,
    padding: 18,
    borderRadius: 18,
    border: "1.5px solid #e0e7ff",
    outline: "none",
    minHeight: 120,
    resize: "vertical",
    fontFamily: 'inherit',
    marginBottom: 4,
    background: "#f6f7fb",
    transition: "border 0.2s, box-shadow 0.2s",
    boxShadow: "0 2px 8px 0 rgba(80, 80, 180, 0.04)",
  };
  const buttonStyle: React.CSSProperties = {
    padding: "12px 36px",
    borderRadius: 24,
    border: "none",
    background: !content || status === "uploading" ? "#d1d5db" : "#7c5cff",
    color: "#fff",
    fontWeight: 700,
    fontSize: 18,
    cursor: !content || status === "uploading" ? "not-allowed" : "pointer",
    boxShadow: !content || status === "uploading" ? undefined : "0 4px 16px 0 #c7d2fe55",
    transition: "background 0.2s, box-shadow 0.2s, transform 0.15s",
    marginRight: 12,
    outline: "none",
    willChange: "transform",
  };
  const statusStyle: React.CSSProperties = {
    minHeight: 24,
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 15,
    fontWeight: 500,
    marginTop: 8,
    height: 28,
    transition: "opacity 0.3s",
    opacity: status === "idle" ? 0 : 1,
  };
  const indicatorStyle: React.CSSProperties = {
    display: "inline-block",
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: isOnline ? "#22c55e" : "#ef4444",
    marginRight: 0,
    border: "2px solid #fff",
    boxShadow: isOnline ? "0 0 8px #22c55e55" : "0 0 8px #ef444455",
    verticalAlign: "middle",
    transition: "background 0.2s, box-shadow 0.2s",
  };

  return (
    <div style={{ minHeight: "100vh", minWidth: "100vw", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #e0e7ff 0%, #f8fafc 40%, #c7d2fe 100%)" }}>
      <div style={cardStyle}>
        <div style={headerStyle}>Offline Draft Storage</div>
        {/* Prominent online/offline status header */}
        <div style={statusHeaderStyle}>
          <span style={indicatorStyle} title={isOnline ? "Online" : "Offline"}></span>
          <span style={{ color: isOnline ? "#22c55e" : "#ef4444", fontWeight: 700, fontSize: 22 }}>
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>
        {/* Show prompt to post offline draft if coming back online */}
        {showPostPrompt && (
          <div style={{ background: "#fef9c3", border: "1.5px solid #fde047", borderRadius: 16, padding: 18, marginBottom: 18, textAlign: "center", boxShadow: "0 2px 8px #fde68a33", animation: "fadeInCard 0.7s cubic-bezier(.39,.575,.56,1)" }}>
            <div style={{ fontWeight: 700, color: "#b45309", fontSize: 17, marginBottom: 10 }}>
              You have an offline draft. Do you want to post it now?
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
              <button onClick={handlePostPendingDraft} style={{ background: "#7c5cff", color: "#fff", border: "none", borderRadius: 16, padding: "10px 28px", fontWeight: 700, fontSize: 16, cursor: "pointer", boxShadow: "0 2px 8px #a5b4fc55", transition: "background 0.2s, box-shadow 0.2s, transform 0.15s", outline: "none", willChange: "transform" }}>Post Now</button>
              <button onClick={handleDismissPrompt} style={{ background: "#f6f7fb", color: "#3b3663", border: "1.5px solid #e0e7ff", borderRadius: 16, padding: "10px 28px", fontWeight: 700, fontSize: 16, cursor: "pointer", transition: "background 0.2s, box-shadow 0.2s, transform 0.15s", outline: "none", willChange: "transform" }}>Dismiss</button>
            </div>
          </div>
        )}
        {/* Centered post/comment section */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          <label htmlFor="draft-editor" style={{ ...labelStyle, alignSelf: 'flex-start' }}>Your Post or Comment</label>
          <textarea
            id="draft-editor"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
            rows={6}
            style={{ ...textareaStyle, width: '100%', maxWidth: 420 }}
            aria-label="Draft editor"
          />
          {/* Live word and character count */}
          <div style={{ color: '#64748b', fontSize: 14, margin: '2px 0 0 2px', textAlign: 'right', width: '100%', maxWidth: 420 }}>
            Words: {content.trim() ? content.trim().split(/\s+/).length : 0} | Characters: {content.length}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
          <button
            onClick={handleManualUpload}
            disabled={!content || status === "uploading"}
            style={buttonStyle}
          >
            {status === "uploading"
              ? "Uploading..."
              : isOnline
                ? "Post"
                : "Save Draft"}
        </button>
        </div>
        <div style={statusStyle}>
          {status === "recovered" && <span style={{ color: "#f59e42", animation: "fadeIn 0.5s" }}>Draft recovered!</span>}
          {status === "uploaded" && <span style={{ color: "#7c5cff", animation: "fadeIn 0.5s" }}>Draft uploaded!</span>}
          {status === "error" && <span style={{ color: "#ef4444", animation: "fadeIn 0.5s" }}>Upload failed. Try again.</span>}
          {status === "saving" && <span style={{ color: "#64748b", animation: "fadeIn 0.5s" }}>Saving draft...</span>}
          {status === "saved-offline" && <span style={{ color: "#7c5cff", animation: "fadeIn 0.5s" }}>Draft saved offline! Will upload when online.</span>}
        </div>
        {/* LocalStorage test display */}
        <div style={{ marginTop: 18, background: "#f6f7fb", borderRadius: 12, padding: 12, fontSize: 14, color: "#334155", boxShadow: "0 1px 4px #e0e7ff55" }}>
          <strong>LocalStorage draft value (for testing):</strong>
          <div style={{ wordBreak: "break-all", marginTop: 4 }}>{localDraft || <span style={{ color: '#aaa' }}>[empty]</span>}</div>
        </div>
      </div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap');
        body, html { font-family: 'Inter', system-ui, Avenir, Helvetica, Arial, sans-serif; }
        /* Custom thin vertical scrollbar */
        body, html {
          scrollbar-width: thin;
          scrollbar-color: #a5b4fc #f1f5f9;
          overflow-x: hidden;
        }
        body::-webkit-scrollbar, html::-webkit-scrollbar {
          width: 6px;
          background: #f1f5f9;
        }
        body::-webkit-scrollbar:horizontal, html::-webkit-scrollbar:horizontal {
          display: none;
        }
        body::-webkit-scrollbar-thumb, html::-webkit-scrollbar-thumb {
          background: #a5b4fc;
          border-radius: 6px;
        }
        body::-webkit-scrollbar-thumb:hover, html::-webkit-scrollbar-thumb:hover {
          background: #6366f1;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInCard {
          from { opacity: 0; transform: translateY(40px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        /* Button hover/active effects */
        button:not(:disabled):hover {
          filter: brightness(1.08);
          transform: translateY(-2px) scale(1.03);
          box-shadow: 0 6px 24px 0 #a5b4fc33;
          transition: filter 0.18s, transform 0.18s, box-shadow 0.18s;
        }
        button:not(:disabled):active {
          filter: brightness(0.97);
          transform: translateY(1px) scale(0.98);
          box-shadow: 0 2px 8px 0 #a5b4fc33;
        }
        /* Textarea focus/hover effect */
        textarea:focus, textarea:hover {
          border-color: #a5b4fc;
          box-shadow: 0 0 0 2px #a5b4fc33;
          transition: border-color 0.18s, box-shadow 0.18s;
        }
      `}</style>
    </div>
  );
};

// Add this at the end of the file to render the editor in the app
const mockUpload = async (content: string) => {
  // Simulate network upload
  return new Promise<void>((resolve) => setTimeout(resolve, 1000));
};

const App: React.FC = () => (
  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 40 }}>
    <OfflineDraftEditor onUpload={mockUpload} />
  </div>
);

export default App;
