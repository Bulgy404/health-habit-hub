"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { apiFetch, apiUrl } from "@/lib/api";
import styles from "@/components/admin-page.module.css";

interface ModerationComment {
  id: string;
  text: string;
  createdAt: string;
  habitId: string;
  habitSentence: string;
}

function normalise(raw: unknown): ModerationComment {
  const j = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(j.id ?? ""),
    text: String(j.text ?? ""),
    createdAt: String(j.createdAt ?? ""),
    habitId: String(j.habitId ?? ""),
    habitSentence: String(j.habitSentence ?? ""),
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
 * Moved here from the mobile admin section.
 */
export default function CommentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [comments, setComments] = useState<ModerationComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const token = session?.accessToken;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch(apiUrl("/admin/comments"), token);
      const list = (data?.comments ?? []) as unknown[];
      setComments(list.map(normalise));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load comments");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.roles?.includes("admin")) {
      router.replace("/access-denied");
      return;
    }
    load();
  }, [session, status, router, load]);

  async function handleDelete(id: string) {
    if (!token || !confirm("Delete this comment? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await apiFetch(apiUrl(`/admin/comments/${id}`), token, { method: "DELETE" });
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete comment");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Comments</h1>
          <p className={styles.subtitle}>
            Moderate anonymous community comments. Deleting removes the comment
            for everyone.
          </p>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: "40%" }}>Comment</th>
                <th style={{ width: "35%" }}>On habit</th>
                <th>Posted</th>
                <th>Actions</th>
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
                      onClick={() => handleDelete(c.id)}
                      disabled={deleting === c.id}
                    >
                      {deleting === c.id ? "Deleting…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
              {comments.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "2rem" }} className={styles.muted}>
                    No comments to moderate.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
