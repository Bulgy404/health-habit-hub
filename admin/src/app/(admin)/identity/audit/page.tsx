"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useIdentityGuard } from "@/lib/useIdentityGuard";
import {
  listAudit,
  listMyRegisters,
  type AuditEntry,
  type RegisterSummary,
} from "@/lib/identityApi";
import styles from "@/components/admin-page.module.css";

/** Reveals are the events that matter; everything else is context. */
const SENSITIVITY_STYLE: Record<AuditEntry["sensitivity"], string> = {
  reveal: "#a00",
  pii_read: "#b26a00",
  write: "#333",
  export: "#7c3aed",
  list: "#888",
};

/**
 * The register's audit trail.
 *
 * `sensitivity` and `action` stay as their raw identifiers in every language:
 * they are what the database stores and what a CSV export carries, and an
 * auditor comparing this screen against an exported trail should be reading
 * the same token in both places.
 */
export default function IdentityAuditPage() {
  const { token, loading } = useIdentityGuard();
  const t = useTranslations("identity");
  const tc = useTranslations("common");
  const [registers, setRegisters] = useState<RegisterSummary[]>([]);
  const [studyId, setStudyId] = useState("");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [onlyReveals, setOnlyReveals] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void listMyRegisters(token)
      .then(({ registers }) => {
        setRegisters(registers);
        setStudyId((current) =>
          current || registers.length !== 1 ? current : registers[0].hhhStudyId
        );
      })
      .catch(() => {
        // Non-fatal — the table simply stays empty until a study is chosen.
      });
  }, [token]);

  const load = useCallback(async () => {
    if (!token || !studyId) return;
    setError(null);
    try {
      const { entries } = await listAudit(token, studyId, 500);
      setEntries(entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("audit.loadFailed"));
    }
  }, [token, studyId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = onlyReveals ? entries.filter((e) => e.sensitivity === "reveal") : entries;

  function onExport() {
    // Built client-side from what is already loaded, so exporting cannot
    // return more than the viewer could already see.
    const header = [
      "created_at",
      "actor_sub",
      "actor_roles",
      "action",
      "sensitivity",
      "subject_code",
      "fields",
      "status_code",
      "repeat_count",
    ];
    const rows = shown.map((e) =>
      [
        e.created_at,
        e.actor_sub,
        (e.actor_roles ?? []).join("|"),
        e.action,
        e.sensitivity,
        e.subject_code ?? "",
        (e.fields ?? []).join("|"),
        e.status_code ?? "",
        e.repeat_count,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `identity-audit-${studyId}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <p>{tc("loading")}</p>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("audit.title")}</h1>
          <p className={styles.subtitle}>{t("audit.auditIntro2")}</p>
          <p className={styles.subtitle}>{t("audit.intro")}</p>
        </div>
      </div>

      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t("study")}</span>
          <select
            className={styles.select}
            value={studyId}
            onChange={(e) => setStudyId(e.target.value)}
            aria-label={t("study")}
          >
            <option value="">{registers.length === 0 ? t("noRegisters") : t("chooseStudy")}</option>
            {registers.map((r) => (
              <option key={r.hhhStudyId} value={r.hhhStudyId}>
                {r.studyName ? `${r.studyName} (${r.subjectCodePrefix})` : r.subjectCodePrefix}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => void load()}
          disabled={!studyId}
        >
          {t("refresh")}
        </button>
        <label className={styles.filterGroup}>
          <input
            type="checkbox"
            checked={onlyReveals}
            onChange={(e) => setOnlyReveals(e.target.checked)}
          />{" "}
          {t("audit.revealsOnly")}
        </label>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={onExport}
          disabled={shown.length === 0}
        >
          {t("audit.export")}
        </button>
      </div>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("audit.when")}</th>
              <th>{t("audit.actor")}</th>
              <th>{t("audit.action")}</th>
              <th>{t("audit.sensitivity")}</th>
              <th>{t("audit.subject")}</th>
              <th>{t("audit.auditFields")}</th>
              <th>{t("audit.repeats")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.created_at).toLocaleString()}</td>
                <td className={styles.code}>
                  {e.actor_sub}
                  <br />
                  <span className={styles.muted}>{(e.actor_roles ?? []).join(", ")}</span>
                </td>
                <td>{e.action}</td>
                <td
                  style={{
                    color: SENSITIVITY_STYLE[e.sensitivity],
                    fontWeight: e.sensitivity === "reveal" ? 700 : 400,
                  }}
                >
                  {e.sensitivity}
                </td>
                <td className={styles.code}>{e.subject_code ?? "—"}</td>
                <td>{(e.fields ?? []).join(", ") || "—"}</td>
                <td>{e.repeat_count > 1 ? `×${e.repeat_count}` : ""}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className={styles.muted}>
                  {studyId ? t("audit.empty") : t("audit.chooseStudyFirst")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
