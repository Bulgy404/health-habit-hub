"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUrl } from "@/lib/api";
import { useAdminGuard } from "@/lib/useAdminGuard";
import styles from "@/components/admin-page.module.css";

interface AuditEntry {
  id: string;
  byUsername: string;
  method: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  statusCode: number;
  result: "succeeded" | "failed";
  detail: string | null;
  createdAt: string;
}

const RESOURCE_TYPES = ["study", "participant", "questionnaire", "team_member"];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/**
 * General admin action audit log — covers every mutating admin request
 * except /backups/*, which has its own dedicated log (see the Backups page).
 */
export default function AuditLogPage() {
  const { token } = useAdminGuard();
  const t = useTranslations("auditLog");
  const tc = useTranslations("common");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resourceType, setResourceType] = useState("");
  const [limit, setLimit] = useState(50);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (resourceType) params.set("resourceType", resourceType);
      const data = await apiFetch(apiUrl(`/admin/audit-log?${params.toString()}`), token);
      setEntries((data?.entries ?? []) as AuditEntry[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [token, limit, resourceType, t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
      </div>

      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t("resourceTypeLabel")}</span>
          <select
            className={styles.select}
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value)}
          >
            <option value="">{t("filterAll")}</option>
            {RESOURCE_TYPES.map((rt) => (
              <option key={rt} value={rt}>
                {t(`resourceTypes.${rt}`)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t("limitLabel")}</span>
          <select
            className={styles.select}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n}
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
                <th>{t("who")}</th>
                <th>{t("action")}</th>
                <th>{t("resource")}</th>
                <th>{t("result")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.createdAt)}</td>
                  <td>{e.byUsername}</td>
                  <td>
                    <span className={styles.code}>{e.action}</span>
                  </td>
                  <td>
                    {e.resourceType ? (
                      <>
                        <span className={styles.badge}>{e.resourceType}</span> {e.resourceId ?? ""}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span
                      className={styles.badge}
                      style={
                        e.result === "failed"
                          ? { background: "#fef2f2", color: "#dc2626" }
                          : { background: "#f0fdf4", color: "#16a34a" }
                      }
                    >
                      {e.statusCode}
                    </span>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: "center", padding: "2rem" }}
                    className={styles.muted}
                  >
                    {tc("noResults")}
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
