"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUrl } from "@/lib/api";
import { useAdminGuard } from "@/lib/useAdminGuard";
import styles from "@/components/admin-page.module.css";

interface RestoreAttempt {
  id: string;
  ip: string;
  usernameAttempted: string | null;
  outcome:
    | "success"
    | "invalid_phrase"
    | "invalid_credentials"
    | "rate_limited"
    | "keycloak_unreachable";
  createdAt: string;
}

interface FlaggedIp {
  ip: string;
  failCount: number;
  lastAttemptAt: string;
}

const PAGE_SIZE = 50;
const OUTCOMES = [
  "success",
  "invalid_phrase",
  "invalid_credentials",
  "rate_limited",
  "keycloak_unreachable",
] as const;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

const OUTCOME_STYLE: Record<string, { bg: string; fg: string }> = {
  success: { bg: "#f0fdf4", fg: "#16a34a" },
  invalid_phrase: { bg: "#f1f5f9", fg: "#64748b" },
  invalid_credentials: { bg: "#fef2f2", fg: "#dc2626" },
  rate_limited: { bg: "#fef2f2", fg: "#dc2626" },
  keycloak_unreachable: { bg: "#fffbeb", fg: "#b45309" },
};

/**
 * Security-monitoring view over POST /restore (passphrase-based account
 * restore) attempts. Recovery phrases have no server-side secret or KDF
 * slowing down a guess, so the per-IP rate limiter on that route is the
 * only defense against enumerating the account-UUID space — this page
 * surfaces the signal that limiter alone doesn't: IPs with several
 * non-success attempts in the last hour, even if each individually stayed
 * under the 429 threshold.
 */
export default function RestoreAttemptsPage() {
  const { token } = useAdminGuard();
  const t = useTranslations("restoreAttempts");
  const tc = useTranslations("common");

  const [flaggedIps, setFlaggedIps] = useState<FlaggedIp[]>([]);
  const [entries, setEntries] = useState<RestoreAttempt[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [outcome, setOutcome] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guards against a slower, superseded page load resolving after a newer
  // one and overwriting fresher state (same pattern as the Comments page).
  const loadRequestRef = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (outcome) params.set("outcome", outcome);
      const data = await apiFetch(
        apiUrl(`/admin/restore-attempts?${params.toString()}`),
        token
      );
      if (requestId !== loadRequestRef.current) return;
      setEntries((data?.entries ?? []) as RestoreAttempt[]);
      setTotal(Number(data?.total ?? 0));
      setFlaggedIps((data?.flaggedIps ?? []) as FlaggedIp[]);
      setError(null);
    } catch (e) {
      if (requestId !== loadRequestRef.current) return;
      setError(e instanceof Error ? e.message : t("loadFailed"));
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [token, page, outcome, t]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
      </div>

      {flaggedIps.length > 0 && (
        <div
          style={{
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 8,
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            fontSize: "0.85rem",
          }}
        >
          <strong>{t("flaggedTitle")}</strong>
          <p className={styles.muted} style={{ margin: "0.25rem 0 0.5rem" }}>
            {t("flaggedSubtitle")}
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("ip")}</th>
                  <th>{t("failCount")}</th>
                  <th>{t("lastAttempt")}</th>
                </tr>
              </thead>
              <tbody>
                {flaggedIps.map((f) => (
                  <tr key={f.ip}>
                    <td>
                      <span className={styles.code}>{f.ip}</span>
                    </td>
                    <td>
                      <span
                        className={styles.badge}
                        style={{ background: "#fef2f2", color: "#dc2626" }}
                      >
                        {f.failCount}
                      </span>
                    </td>
                    <td>{formatDate(f.lastAttemptAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t("outcomeLabel")}</span>
          <select
            className={styles.select}
            value={outcome}
            onChange={(e) => {
              setPage(1);
              setOutcome(e.target.value);
            }}
          >
            <option value="">{t("filterAll")}</option>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {t(`outcomes.${o}`)}
              </option>
            ))}
          </select>
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
                <th>{t("when")}</th>
                <th>{t("ip")}</th>
                <th>{t("usernameAttempted")}</th>
                <th>{t("outcome")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.createdAt)}</td>
                  <td>
                    <span className={styles.code}>{e.ip}</span>
                  </td>
                  <td>
                    {e.usernameAttempted ? (
                      <span className={styles.code}>
                        {e.usernameAttempted}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span
                      className={styles.badge}
                      style={{
                        background: OUTCOME_STYLE[e.outcome]?.bg,
                        color: OUTCOME_STYLE[e.outcome]?.fg,
                      }}
                    >
                      {t(`outcomes.${e.outcome}`)}
                    </span>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    style={{ textAlign: "center", padding: "2rem" }}
                    className={styles.muted}
                  >
                    {tc("noResults")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className={styles.pagination}>
            <span className={styles.muted}>
              {t("totalPageInfo", { total, page, totalPages })}
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
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              {tc("next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
