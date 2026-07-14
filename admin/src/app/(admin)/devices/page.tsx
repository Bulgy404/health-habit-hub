"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUrl } from "@/lib/api";
import { useAdminGuard } from "@/lib/useAdminGuard";
import styles from "@/components/admin-page.module.css";

interface DeviceSession {
  id: string;
  participantId: string;
  deviceType: string;
  appVersion: string;
  lastSeen: string | null;
}

function normalise(raw: unknown): DeviceSession {
  const j = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(j.id ?? j.sessionId ?? ""),
    participantId: String(j.participantId ?? j.userId ?? ""),
    deviceType: String(j.deviceType ?? "unknown"),
    appVersion: String(j.appVersion ?? ""),
    lastSeen: j.lastSeen ? String(j.lastSeen) : null,
  };
}

function fmt(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/**
 * Active device sessions across participants, with the ability to revoke a
 * session (force sign-out). Moved here from the mobile admin section.
 */
const PAGE_SIZE = 100;

export default function DevicesPage() {
  const { token } = useAdminGuard();
  const t = useTranslations("devices");
  const tc = useTranslations("common");
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch(apiUrl(`/admin/sessions?page=${page}&limit=${PAGE_SIZE}`), token);
      const list = (data?.sessions ?? []) as unknown[];
      setSessions(list.map(normalise));
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
    load();
  }, [load]);

  async function handleRevoke(id: string) {
    if (!token || !confirm(t("confirmRevoke"))) {
      return;
    }
    setRevoking(id);
    try {
      await apiFetch(apiUrl(`/admin/sessions/${id}`), token, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("revokeFailed"));
    } finally {
      setRevoking(null);
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

      {loading ? (
        <p>{tc("loading")}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("participant")}</th>
                <th>{t("device")}</th>
                <th>{t("appVersion")}</th>
                <th>{t("lastSeen")}</th>
                <th>{tc("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className={styles.code}>{s.participantId || "—"}</span>
                  </td>
                  <td>{s.deviceType}</td>
                  <td>{s.appVersion || "—"}</td>
                  <td>{fmt(s.lastSeen)}</td>
                  <td>
                    <button
                      className={`${styles.actionBtn} ${styles.deleteBtn}`}
                      onClick={() => handleRevoke(s.id)}
                      disabled={revoking === s.id}
                    >
                      {revoking === s.id ? t("revokingEllipsis") : t("revoke")}
                    </button>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: "center", padding: "2rem" }}
                    className={styles.muted}
                  >
                    {t("noSessions")}
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
