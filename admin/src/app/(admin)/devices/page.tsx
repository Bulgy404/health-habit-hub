"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch, apiUrl } from "@/lib/api";
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
export default function DevicesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const t = useTranslations("devices");
  const tc = useTranslations("common");
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const token = session?.accessToken;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch(apiUrl("/admin/sessions"), token);
      setSessions((Array.isArray(data) ? data : []).map(normalise));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.roles?.includes("admin")) {
      router.replace("/access-denied");
      return;
    }
    load();
  }, [session, status, router, load]);

  async function handleRevoke(id: string) {
    if (!token || !confirm(t("confirmRevoke"))) {
      return;
    }
    setRevoking(id);
    try {
      await apiFetch(apiUrl(`/admin/sessions/${id}`), token, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== id));
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
        </div>
      )}
    </div>
  );
}
