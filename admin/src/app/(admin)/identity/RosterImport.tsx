"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { importRoster, type ImportReport } from "@/lib/identityApi";
import styles from "@/components/admin-page.module.css";

/** Error codes the service answers with; anything else passes through. */
const KNOWN_ERRORS = ["file_required", "csv_unparseable", "csv_empty", "csv_too_large"] as const;

/**
 * Bulk roster import.
 *
 * The report is rendered exactly as the API returns it — keyed by row number
 * and subject code, never echoing the submitted data. That is deliberate on
 * both sides: showing the operator "row 14: Müller, Anna — failed" would put
 * the names back on a screen the report format exists to keep them off, and
 * would defeat the service's own rule that a failed import never repeats what
 * it was given.
 *
 * Duplicates are warnings, never rejections. Two people can genuinely share a
 * name and a date of birth, and refusing the second one is wrong more often
 * than it is right.
 */
export function RosterImport({
  token,
  studyId,
  onImported,
}: {
  token: string;
  studyId: string;
  onImported: () => void;
}) {
  const t = useTranslations("identity");
  const inputRef = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const result = await importRoster(token, studyId, file);
      setReport(result);
      onImported();
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      // The service returns codes rather than prose here on purpose: its
      // parser's own message quotes the offending line, which would be a
      // patient record in an error toast.
      setError(
        (KNOWN_ERRORS as readonly string[]).includes(code)
          ? t(`import.errors.${code}`)
          : code || t("import.failed")
      );
    } finally {
      setBusy(false);
      // Clear the picker so re-selecting the same corrected file re-fires
      // onChange, which it otherwise would not.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t("import.title")}</h2>
      <p className={styles.muted}>{t("import.intro")}</p>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        aria-label={t("import.file")}
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
      {busy && <span className={styles.muted}> {t("import.importing")}</span>}

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {report && (
        <div role="status">
          <p>
            <strong>
              {t("import.result", {
                imported: report.imported,
                failed: report.failed,
              })}
            </strong>
          </p>
          {report.rows.length > 0 && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t("import.row")}</th>
                    <th>{t("import.subjectCode")}</th>
                    <th>{t("import.note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td className={styles.code}>{r.subjectCode ?? "—"}</td>
                      <td>
                        {r.error
                          ? t("import.rowFailed", { reason: r.error })
                          : r.duplicateOf
                            ? t("import.duplicate", { other: r.duplicateOf })
                            : t("import.imported")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className={styles.muted}>{t("import.privacyNote")}</p>
        </div>
      )}
    </section>
  );
}
