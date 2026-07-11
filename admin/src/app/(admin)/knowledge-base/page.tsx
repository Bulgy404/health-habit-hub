"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { apiUrl } from "@/lib/api";
import styles from "./page.module.css";
import { useKnowledgeBaseData } from "./useKnowledgeBaseData";

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

const API_BASE = apiUrl("/kb");

// LightRAG's own WebUI (knowledge-graph visualizer) — internal-only in
// production (no Traefik route), so this only resolves to something useful
// when explicitly configured. Falls back to the local dev port mapping.
const LIGHTRAG_WEBUI_URL =
  process.env.NEXT_PUBLIC_LIGHTRAG_WEBUI_URL?.trim() || "http://localhost:9622";

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
  const t = useTranslations("knowledgeBase");
  const tc = useTranslations("common");
  const [category, setCategory] = useState("general");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(t("selectFileError"));
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["pdf", "txt", "md"].includes(ext)) {
      setError(t("fileTypeError"));
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
      setError(err instanceof Error ? err.message : t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{t("uploadModalTitle")}</span>
          <button className={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          {error && <div className={styles.errorMsg}>{error}</div>}

          <div className={styles.formGroup}>
            <label className={styles.label}>{t("pdfFileLabel")}</label>
            <input ref={fileRef} type="file" accept=".pdf,.txt,.md" className={styles.fileInput} />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>{t("categoryLabel")}</label>
            <input
              className={styles.input}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t("categoryPlaceholder")}
            />
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>
            {tc("cancel")}
          </button>
          <button className={styles.saveBtn} onClick={handleUpload} disabled={uploading}>
            {uploading ? t("uploading") : tc("upload")}
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
  const t = useTranslations("knowledgeBase");
  const tc = useTranslations("common");
  return (
    <div className={styles.confirmOverlay}>
      <div className={styles.confirmDialog}>
        <p className={styles.confirmTitle}>{t("deleteFileTitle")}</p>
        <p className={styles.confirmText}>
          {t.rich("confirmDeleteText", {
            filename,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
        <div className={styles.confirmActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            {tc("cancel")}
          </button>
          <button className={styles.confirmDeleteBtn} onClick={onConfirm}>
            {tc("delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

/**
 * Displays and manages PDF documents in the knowledge base used for habit
 * recommendations, grouped by category. Supports uploading and deleting files.
 *
 * @returns The knowledge base management page.
 */
export default function KnowledgeBasePage() {
  const { token } = useAdminGuard();
  const t = useTranslations("knowledgeBase");
  const tc = useTranslations("common");

  const { entries, loading, error: loadError, refetch } = useKnowledgeBaseData(token);
  const [actionError, setActionError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteFilename, setDeleteFilename] = useState<string | null>(null);

  async function handleDelete(filename: string) {
    setDeleteFilename(null);
    setActionError("");
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
      setSuccessMsg(t("deleteSuccess", { filename }));
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("deleteFailed"));
    }
  }

  async function handleUploaded() {
    setUploadOpen(false);
    setSuccessMsg(t("uploadSuccess"));
    await refetch();
  }

  const error = loadError || actionError;

  // Group entries by category
  const grouped = entries.reduce<Record<string, typeof entries>>((acc, entry) => {
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
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
        <div className={styles.headerActions}>
          <a
            className={styles.reindexButton}
            href={LIGHTRAG_WEBUI_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            ⬡ {t("viewGraph")}
          </a>
          <button className={styles.addButton} onClick={() => setUploadOpen(true)}>
            + {t("uploadDocument")}
          </button>
        </div>
      </div>

      {error && <div className={styles.errorMsg}>{error}</div>}
      {successMsg && <div className={styles.successMsg}>{successMsg}</div>}

      {loading ? (
        <div className={styles.loadingState}>{tc("loading")}</div>
      ) : entries.length === 0 ? (
        <div className={styles.emptyState}>{t("emptyState")}</div>
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
                    <th>{t("filenameColumn")}</th>
                    <th>{t("sizeColumn")}</th>
                    <th>{t("summaryColumn")}</th>
                    <th>{t("uploadDateColumn")}</th>
                    <th>{tc("actions")}</th>
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
                          {entry.has_summary ? t("statusReady") : t("statusPending")}
                        </span>
                      </td>
                      <td>{fmtDate(entry.upload_date)}</td>
                      <td>
                        <div className={styles.actions}>
                          <button
                            className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                            onClick={() => setDeleteFilename(entry.filename)}
                          >
                            {tc("delete")}
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
