"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import styles from "./page.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface KbEntry {
  filename: string;
  category: string;
  file_size: number;
  has_summary: boolean;
  upload_date: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") + "/kb";

// ── Upload modal ──────────────────────────────────────────────────────────────

function UploadModal({
  token,
  onClose,
  onUploaded,
}: {
  token: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [category, setCategory] = useState("general");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Please select a PDF file.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are accepted.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("category", category.trim() || "general");

      const res = await fetch(API_BASE, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Upload PDF</span>
          <button className={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          {error && <div className={styles.errorMsg}>{error}</div>}

          <div className={styles.formGroup}>
            <label className={styles.label}>PDF file *</label>
            <input ref={fileRef} type="file" accept=".pdf" className={styles.fileInput} />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Category</label>
            <input
              className={styles.input}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. habit-formation"
            />
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.saveBtn} onClick={handleUpload} disabled={uploading}>
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm delete dialog ─────────────────────────────────────────────────────

function ConfirmDeleteDialog({
  filename,
  onCancel,
  onConfirm,
}: {
  filename: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className={styles.confirmOverlay}>
      <div className={styles.confirmDialog}>
        <p className={styles.confirmTitle}>Delete file?</p>
        <p className={styles.confirmText}>
          You are about to permanently delete <strong>{filename}</strong> from the knowledge base.
          This action cannot be undone.
        </p>
        <div className={styles.confirmActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button className={styles.confirmDeleteBtn} onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const { data: session } = useSession();
  const token = (session as { accessToken?: string } | null)?.accessToken ?? "";

  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteFilename, setDeleteFilename] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);

  const fetchList = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(API_BASE, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as KbEntry[];
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load knowledge base");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  async function handleDelete(filename: string) {
    setDeleteFilename(null);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(filename)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setSuccessMsg(`"${filename}" deleted successfully.`);
      await fetchList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleReindex() {
    setReindexing(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`${API_BASE}/reindex`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSuccessMsg("Knowledge base re-indexed successfully.");
      await fetchList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-index failed");
    } finally {
      setReindexing(false);
    }
  }

  async function handleUploaded() {
    setUploadOpen(false);
    setSuccessMsg("PDF uploaded successfully.");
    await fetchList();
  }

  // Group entries by category
  const grouped = entries.reduce<Record<string, KbEntry[]>>((acc, entry) => {
    const cat = entry.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(entry);
    return acc;
  }, {});
  const categories = Object.keys(grouped).sort();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Knowledge Base</h1>
          <p className={styles.subtitle}>
            Manage PDF papers used for habit recommendations. Grouped by category.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.reindexButton}
            onClick={handleReindex}
            disabled={reindexing}
          >
            {reindexing ? "Re-indexing…" : "↻ Re-index"}
          </button>
          <button className={styles.addButton} onClick={() => setUploadOpen(true)}>
            + Upload PDF
          </button>
        </div>
      </div>

      {error && <div className={styles.errorMsg}>{error}</div>}
      {successMsg && <div className={styles.successMsg}>{successMsg}</div>}

      {loading ? (
        <div className={styles.loadingState}>Loading…</div>
      ) : entries.length === 0 ? (
        <div className={styles.emptyState}>
          No PDFs in the knowledge base yet. Click &quot;Upload PDF&quot; to add one.
        </div>
      ) : (
        categories.map((cat) => (
          <div key={cat} style={{ marginBottom: "2rem" }}>
            <h2
              style={{
                fontSize: "0.9rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--color-text-muted)",
                marginBottom: "0.75rem",
              }}
            >
              {cat}
            </h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th>Size</th>
                    <th>Summary</th>
                    <th>Upload date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[cat].map((entry) => (
                    <tr key={entry.filename}>
                      <td>
                        <span className={styles.filenameCell}>{entry.filename}</span>
                      </td>
                      <td>{fmtBytes(entry.file_size)}</td>
                      <td>
                        <span
                          className={`${styles.badge} ${entry.has_summary ? styles.badgeReady : styles.badgePending}`}
                        >
                          {entry.has_summary ? "Ready" : "Pending"}
                        </span>
                      </td>
                      <td>{fmtDate(entry.upload_date)}</td>
                      <td>
                        <div className={styles.actions}>
                          <button
                            className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                            onClick={() => setDeleteFilename(entry.filename)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {uploadOpen && (
        <UploadModal
          token={token}
          onClose={() => setUploadOpen(false)}
          onUploaded={handleUploaded}
        />
      )}

      {deleteFilename && (
        <ConfirmDeleteDialog
          filename={deleteFilename}
          onCancel={() => setDeleteFilename(null)}
          onConfirm={() => handleDelete(deleteFilename)}
        />
      )}
    </div>
  );
}
