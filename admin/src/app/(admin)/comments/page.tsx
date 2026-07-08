"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUrl } from "@/lib/api";
import { useAdminGuard } from "@/lib/useAdminGuard";
import styles from "@/components/admin-page.module.css";

interface ModerationComment {
  id: string;
  text: string;
  createdAt: string;
  habitId: string;
  habitSentence: string;
  flagged: boolean;
  flagReason: string | null;
}

function normalise(raw: unknown): ModerationComment {
  const j = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(j.id ?? ""),
    text: String(j.text ?? ""),
    createdAt: String(j.createdAt ?? ""),
    habitId: String(j.habitId ?? ""),
    habitSentence: String(j.habitSentence ?? ""),
    flagged: Boolean(j.flagged),
    flagReason: j.flagReason == null ? null : String(j.flagReason),
  };
}

function fmt(ts: string): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/**
 * Community comment moderation. Lists anonymous participant comments (newest
 * first) with the habit they're attached to, and allows deleting a comment.
 *
 * Comments are automatically screened on submission (see
 * commentModerationService.js); anything the moderator flags is held out of
 * the public habit comment list and shown in the "Flagged for review"
 * section here until a researcher/admin approves or deletes it — so most
 * comments never need a human to look at them at all.
 */
const PAGE_SIZE = 100;

export default function CommentsPage() {
  const { token } = useAdminGuard();
  const t = useTranslations("comments");
  const tc = useTranslations("common");

  const [flagged, setFlagged] = useState<ModerationComment[]>([]);
  const [flaggedLoading, setFlaggedLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);

  const [comments, setComments] = useState<ModerationComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const loadFlagged = useCallback(async () => {
    if (!token) return;
    setFlaggedLoading(true);
    try {
      const data = await apiFetch(
        apiUrl(`/admin/comments?status=flagged&limit=${PAGE_SIZE}`),
        token
      );
      const list = (data?.comments ?? []) as unknown[];
      setFlagged(list.map(normalise));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("loadFailed"));
    } finally {
      setFlaggedLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, t]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch(
        apiUrl(`/admin/comments?page=${page}&limit=${PAGE_SIZE}`),
        token
      );
      const list = (data?.comments ?? []) as unknown[];
      setComments(list.map(normalise));
      setTotal(Number(data?.total ?? 0));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, t, page]);

  useEffect(() => {
    loadFlagged();
  }, [loadFlagged]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApprove(id: string) {
    if (!token) return;
    setApproving(id);
    try {
      await apiFetch(apiUrl(`/admin/comments/${id}/approve`), token, {
        method: "POST",
      });
      setFlagged((prev) => prev.filter((c) => c.id !== id));
      // The now-published comment belongs in the "all comments" list too.
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("approveFailed"));
    } finally {
      setApproving(null);
    }
  }

  async function handleDelete(id: string, fromFlagged: boolean) {
    if (!token || !confirm(t("confirmDelete"))) return;
    setDeleting(id);
    try {
      await apiFetch(apiUrl(`/admin/comments/${id}`), token, { method: "DELETE" });
      if (fromFlagged) {
        setFlagged((prev) => prev.filter((c) => c.id !== id));
      } else {
        setComments((prev) => prev.filter((c) => c.id !== id));
        setTotal((prev) => Math.max(0, prev - 1));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("deleteFailed"));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>{t("flaggedTitle")}</div>
        <p className={styles.subtitle}>{t("flaggedSubtitle")}</p>

        {flaggedLoading ? (
          <p>{tc("loading")}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: "35%" }}>{t("comment")}</th>
                  <th style={{ width: "25%" }}>{t("onHabit")}</th>
                  <th style={{ width: "20%" }}>{t("flagReason")}</th>
                  <th>{t("posted")}</th>
                  <th>{tc("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {flagged.map((c) => (
                  <tr key={c.id}>
                    <td>{c.text}</td>
                    <td className={styles.muted}>{c.habitSentence || "—"}</td>
                    <td className={styles.muted}>{c.flagReason || "—"}</td>
                    <td>{fmt(c.createdAt)}</td>
                    <td>
                      <button
                        className={`${styles.actionBtn} ${styles.primaryBtn}`}
                        onClick={() => handleApprove(c.id)}
                        disabled={approving === c.id || deleting === c.id}
                      >
                        {approving === c.id ? t("approving") : t("approve")}
                      </button>
                      <button
                        className={`${styles.actionBtn} ${styles.deleteBtn}`}
                        onClick={() => handleDelete(c.id, true)}
                        disabled={approving === c.id || deleting === c.id}
                      >
                        {deleting === c.id ? tc("deletingEllipsis") : tc("delete")}
                      </button>
                    </td>
                  </tr>
                ))}
                {flagged.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      style={{ textAlign: "center", padding: "1.5rem" }}
                      className={styles.muted}
                    >
                      {t("noFlaggedComments")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {loading ? (
        <p>{tc("loading")}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: "40%" }}>{t("comment")}</th>
                <th style={{ width: "35%" }}>{t("onHabit")}</th>
                <th>{t("posted")}</th>
                <th>{tc("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {comments.map((c) => (
                <tr key={c.id}>
                  <td>{c.text}</td>
                  <td className={styles.muted}>{c.habitSentence || "—"}</td>
                  <td>{fmt(c.createdAt)}</td>
                  <td>
                    <button
                      className={`${styles.actionBtn} ${styles.deleteBtn}`}
                      onClick={() => handleDelete(c.id, false)}
                      disabled={deleting === c.id}
                    >
                      {deleting === c.id ? tc("deletingEllipsis") : tc("delete")}
                    </button>
                  </td>
                </tr>
              ))}
              {comments.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    style={{ textAlign: "center", padding: "2rem" }}
                    className={styles.muted}
                  >
                    {t("noComments")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className={styles.pagination}>
            <span className={styles.muted}>
              {t("totalPageInfo", {
                total,
                page,
                totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
              })}
            </span>
            <button
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              {tc("previous")}
            </button>
            <button
              className={styles.pageBtn}
              onClick={() =>
                setPage((p) => Math.min(Math.max(1, Math.ceil(total / PAGE_SIZE)), p + 1))
              }
              disabled={page >= Math.max(1, Math.ceil(total / PAGE_SIZE))}
            >
              {tc("next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
