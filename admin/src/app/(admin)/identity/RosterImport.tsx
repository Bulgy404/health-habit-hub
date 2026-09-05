"use client";

import { useRef, useState } from "react";
import { importRoster, type ImportReport } from "@/lib/identityApi";

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
      setError(
        e instanceof Error
          ? // The service returns codes rather than prose here on purpose: its
            // parser's own message quotes the offending line, which would be a
            // patient record in an error toast.
            ERROR_TEXT[e.message] ?? e.message
          : "Import failed",
      );
    } finally {
      setBusy(false);
      // Clear the picker so re-selecting the same corrected file re-fires
      // onChange, which it otherwise would not.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section style={{ marginTop: 24 }}>
      <h2>Import a roster</h2>
      <p style={{ color: "#666", fontSize: 13, margin: "0 0 8px" }}>
        CSV with a header row. German headings are recognised (
        <code>Vorname</code>, <code>Nachname</code>, <code>Geburtsdatum</code>,{" "}
        <code>Telefon</code>), as is the byte-order mark Excel writes. Rows are
        imported independently — one bad row does not fail the batch.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        aria-label="Roster CSV"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
      {busy && <span> Importing…</span>}

      {error && (
        <p role="alert" style={{ color: "#a00" }}>
          {error}
        </p>
      )}

      {report && (
        <div role="status" style={{ marginTop: 12 }}>
          <strong>
            Imported {report.imported}, failed {report.failed}.
          </strong>
          {report.rows.length > 0 && (
            <table
              style={{
                borderCollapse: "collapse",
                marginTop: 8,
                minWidth: 420,
              }}
            >
              <thead>
                <tr>
                  <th align="left">Row</th>
                  <th align="left">Subject code</th>
                  <th align="left">Note</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.row} style={{ borderTop: "1px solid #eee" }}>
                    <td>{r.row}</td>
                    <td style={{ fontFamily: "monospace" }}>
                      {r.subjectCode ?? "—"}
                    </td>
                    <td>
                      {r.error
                        ? `failed: ${r.error}`
                        : r.duplicateOf
                          ? `possible duplicate of ${r.duplicateOf} — imported anyway`
                          : "imported"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ color: "#666", fontSize: 12, marginTop: 6 }}>
            Rows are identified by number and subject code only. Look them up in
            your own source file — this page deliberately never repeats the data
            you uploaded.
          </p>
        </div>
      )}
    </section>
  );
}

/** The service's error codes, which are deliberately terse. */
const ERROR_TEXT: Record<string, string> = {
  file_required: "Choose a CSV file first.",
  csv_unparseable:
    "That file could not be read as CSV. Check the delimiter and that it has a header row. (The reason is not shown in full because the parser quotes the offending line, which would put a participant's data on screen.)",
  csv_empty: "The file has a header but no rows.",
  csv_too_large: "That file has more than 5000 rows. Split it and import in parts.",
};
