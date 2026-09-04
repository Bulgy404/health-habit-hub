"use client";

import { useCallback, useEffect, useState } from "react";
import { useIdentityGuard } from "@/lib/useIdentityGuard";
import { listAudit, type AuditEntry } from "@/lib/identityApi";

/** Reveals are the events that matter; everything else is context. */
const SENSITIVITY_STYLE: Record<AuditEntry["sensitivity"], string> = {
  reveal: "#a00",
  pii_read: "#b26a00",
  write: "#333",
  export: "#7c3aed",
  list: "#888",
};

export default function IdentityAuditPage() {
  const { token, loading } = useIdentityGuard();
  const [studyId, setStudyId] = useState("");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [onlyReveals, setOnlyReveals] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !studyId) return;
    setError(null);
    try {
      const { entries } = await listAudit(token, studyId, 500);
      setEntries(entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the audit log");
    }
  }, [token, studyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = onlyReveals
    ? entries.filter((e) => e.sensitivity === "reveal")
    : entries;

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
        .join(","),
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

  if (loading) return <p>Loading…</p>;

  return (
    <main style={{ padding: 24 }}>
      <h1>Identity audit log</h1>
      <p style={{ color: "#666", maxWidth: 720 }}>
        Held in the register&apos;s own database, so it cannot be altered from
        the research platform. Field <strong>names</strong> are recorded, never
        values — an audit log that quoted the data it audits would be a second
        copy of it. Repeated list views collapse into one row with a count;
        reveals never do.
      </p>

      <label>
        Study ID{" "}
        <input
          value={studyId}
          onChange={(e) => setStudyId(e.target.value.trim())}
          placeholder="24-hex study id"
          style={{ width: 260 }}
        />
      </label>{" "}
      <button onClick={() => void load()} disabled={!studyId}>
        Refresh
      </button>{" "}
      <label>
        <input
          type="checkbox"
          checked={onlyReveals}
          onChange={(e) => setOnlyReveals(e.target.checked)}
        />{" "}
        Reveals only
      </label>{" "}
      <button onClick={onExport} disabled={shown.length === 0}>
        Export CSV
      </button>

      {error && <p role="alert" style={{ color: "#a00" }}>{error}</p>}

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
        <thead>
          <tr>
            <th align="left">When</th>
            <th align="left">Actor</th>
            <th align="left">Action</th>
            <th align="left">Sensitivity</th>
            <th align="left">Subject</th>
            <th align="left">Fields</th>
            <th align="left">×</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((e) => (
            <tr key={e.id} style={{ borderTop: "1px solid #eee" }}>
              <td style={{ fontSize: 12 }}>
                {new Date(e.created_at).toLocaleString()}
              </td>
              <td style={{ fontSize: 12 }}>
                {e.actor_sub}
                <br />
                <span style={{ color: "#888" }}>
                  {(e.actor_roles ?? []).join(", ")}
                </span>
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
              <td>{e.subject_code ?? "—"}</td>
              <td style={{ fontSize: 12 }}>{(e.fields ?? []).join(", ") || "—"}</td>
              <td>{e.repeat_count > 1 ? `×${e.repeat_count}` : ""}</td>
            </tr>
          ))}
          {shown.length === 0 && (
            <tr>
              <td colSpan={7} style={{ padding: 12, color: "#666" }}>
                {studyId ? "No entries." : "Enter a study ID."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
