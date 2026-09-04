"use client";

import { useCallback, useEffect, useState } from "react";
import { useIdentityGuard } from "@/lib/useIdentityGuard";
import {
  listSubjects,
  createSubject,
  issueCode,
  markVerified,
  downloadCodeSheet,
  type Subject,
} from "@/lib/identityApi";

/**
 * Identity register — roster view.
 *
 * Two things this page does deliberately:
 *
 * 1. It renders whatever the API returns and NOTHING it does not. A monitor's
 *    response carries no name fields at all, so the columns simply do not
 *    appear — the UI never has PII it is supposed to hide, rather than hiding
 *    PII it holds.
 * 2. A freshly issued enrolment code is shown ONCE and never re-fetched. It is
 *    a bearer credential; the only way to see it again is the printed sheet.
 */
export default function IdentityPage() {
  const { token, roles, canReadPii, loading } = useIdentityGuard();

  const [studyId, setStudyId] = useState("");
  const [query, setQuery] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [issuedCode, setIssuedCode] = useState<{ code: string; subjectCode: string } | null>(null);

  const load = useCallback(async () => {
    if (!token || !studyId) return;
    setBusy(true);
    setError(null);
    try {
      const { subjects } = await listSubjects(token, studyId, query);
      setSubjects(subjects);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the roster");
    } finally {
      setBusy(false);
    }
  }, [token, studyId, query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd(form: FormData) {
    setError(null);
    try {
      await createSubject(token, studyId, {
        givenName: String(form.get("givenName") ?? ""),
        familyName: String(form.get("familyName") ?? ""),
        dateOfBirth: String(form.get("dateOfBirth") ?? ""),
        email: String(form.get("email") ?? ""),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the subject");
    }
  }

  async function onIssue(subject: Subject) {
    setError(null);
    try {
      const out = await issueCode(token, subject.id);
      // Shown once. Not retrievable afterwards except via the printed sheet.
      setIssuedCode({ code: out.code, subjectCode: out.subjectCode });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not issue a code");
    }
  }

  async function onVerify(subject: Subject) {
    try {
      await markVerified(token, subject.id, "in_person");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record verification");
    }
  }

  async function onPrintSheet() {
    try {
      const blob = await downloadCodeSheet(token, studyId, "Study");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `code-sheet-${studyId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the sheet");
    }
  }

  if (loading) return <p>Loading…</p>;

  return (
    <main style={{ padding: 24 }}>
      <h1>Identity register</h1>
      <p style={{ color: "#666" }}>
        Roles: {roles.join(", ") || "none"}.{" "}
        {canReadPii
          ? "You can see participant names."
          : "You see subject codes and status only — names are not returned to your role."}
      </p>

      <section style={{ margin: "16px 0" }}>
        <label>
          Study ID{" "}
          <input
            value={studyId}
            onChange={(e) => setStudyId(e.target.value.trim())}
            placeholder="24-hex study id"
            style={{ width: 260 }}
          />
        </label>{" "}
        <label>
          Search{" "}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={canReadPii ? "name or subject code" : "subject code"}
          />
        </label>{" "}
        <button onClick={() => void load()} disabled={!studyId || busy}>
          {busy ? "Loading…" : "Refresh"}
        </button>{" "}
        {canReadPii && (
          <button onClick={() => void onPrintSheet()} disabled={!studyId}>
            Print code sheet
          </button>
        )}
      </section>

      {error && <p role="alert" style={{ color: "#a00" }}>{error}</p>}

      {issuedCode && (
        <div
          role="status"
          style={{ border: "2px solid #a00", padding: 12, margin: "12px 0" }}
        >
          <strong>Enrolment code for {issuedCode.subjectCode}</strong>
          <div style={{ fontSize: 24, fontFamily: "monospace" }}>{issuedCode.code}</div>
          <p style={{ margin: 0, fontSize: 12 }}>
            Shown once. Hand it to this participant only — it enrols them as
            this specific subject. To see it again, print the code sheet.
          </p>
          <button onClick={() => setIssuedCode(null)}>Dismiss</button>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Subject code</th>
            {canReadPii && <th align="left">Name</th>}
            {canReadPii && <th align="left">Date of birth</th>}
            <th align="left">Status</th>
            <th align="left">Verified</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {subjects.map((s) => (
            <tr key={s.id} style={{ borderTop: "1px solid #eee" }}>
              <td>{s.subjectCode}</td>
              {canReadPii && (
                <td>{[s.givenName, s.familyName].filter(Boolean).join(" ") || "—"}</td>
              )}
              {canReadPii && <td>{s.dateOfBirth ?? "—"}</td>}
              <td>{s.status}</td>
              <td>{s.verifiedAt ? "yes" : "no"}</td>
              <td>
                {canReadPii && (
                  <>
                    <button onClick={() => void onIssue(s)}>Issue code</button>{" "}
                    {!s.verifiedAt && (
                      <button onClick={() => void onVerify(s)}>Mark verified</button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
          {subjects.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: 12, color: "#666" }}>
                {studyId ? "No subjects yet." : "Enter a study ID to load its register."}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canReadPii && studyId && (
        <section style={{ marginTop: 24 }}>
          <h2>Add a subject</h2>
          <form
            action={onAdd}
            style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
          >
            <input name="givenName" placeholder="Vorname" />
            <input name="familyName" placeholder="Nachname" required />
            <input name="dateOfBirth" placeholder="YYYY-MM-DD" />
            <input name="email" placeholder="E-Mail" type="email" />
            <button type="submit">Add</button>
          </form>
        </section>
      )}
    </main>
  );
}
