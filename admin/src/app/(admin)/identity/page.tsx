"use client";

import { useCallback, useEffect, useState } from "react";
import { useIdentityGuard } from "@/lib/useIdentityGuard";
import {
  listSubjects,
  createSubject,
  issueCode,
  markVerified,
  downloadCodeSheet,
  getRegister,
  sendCodeByEmail,
  eraseSubject,
  type Subject,
  type RegisterState,
} from "@/lib/identityApi";
import { RegisterSetup } from "./RegisterSetup";
import { AssignmentsPanel } from "./AssignmentsPanel";
import { RosterImport } from "./RosterImport";

/**
 * Identity register — roster view.
 *
 * Three things this page does deliberately:
 *
 * 1. It renders whatever the API returns and NOTHING it does not. A monitor's
 *    response carries no name fields at all, so the columns simply do not
 *    appear — the UI never has PII it is supposed to hide, rather than hiding
 *    PII it holds.
 * 2. A freshly issued enrolment code is shown ONCE and never re-fetched. It is
 *    a bearer credential; the only ways to see it again are the printed sheet
 *    and the email invite, both of which are audited.
 * 3. It distinguishes "no register", "not assigned" and "empty roster", which
 *    all look like an empty table. See {@link RegisterSetup}.
 */
export default function IdentityPage() {
  const { token, roles, canReadPii, canManage, loading } = useIdentityGuard();

  const [studyId, setStudyId] = useState("");
  const [query, setQuery] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [register, setRegister] = useState<RegisterState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [issuedCode, setIssuedCode] = useState<{
    code: string;
    codeId: string;
    subjectId: string;
    subjectCode: string;
  } | null>(null);

  const loadRegister = useCallback(async () => {
    if (!token || !studyId) return;
    try {
      setRegister(await getRegister(token, studyId));
    } catch {
      // Unknown → let the roster load decide what to report. A failure here
      // must not blank a page that would otherwise work.
      setRegister(null);
    }
  }, [token, studyId]);

  const load = useCallback(async () => {
    if (!token || !studyId) return;
    setBusy(true);
    setError(null);
    try {
      const { subjects } = await listSubjects(token, studyId, query);
      setSubjects(subjects);
    } catch (e) {
      setSubjects([]);
      // "No register" and "not assigned" are explained by RegisterSetup, which
      // has the room to say what to do about them. Repeating them here as a
      // red error would be noise on top of an explanation.
      const msg = e instanceof Error ? e.message : "Failed to load the roster";
      if (!/register_not_found|not_assigned_to_register/.test(msg)) {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [token, studyId, query]);

  useEffect(() => {
    void loadRegister();
  }, [loadRegister]);

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
      // Shown once. Not retrievable afterwards except via the printed sheet or
      // an email invite.
      setIssuedCode({
        code: out.code,
        codeId: out.codeId,
        subjectId: subject.id,
        subjectCode: out.subjectCode,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not issue a code");
    }
  }

  async function onSendCode() {
    if (!issuedCode) return;
    setError(null);
    setNotice(null);
    try {
      const out = await sendCodeByEmail(
        token,
        issuedCode.subjectId,
        issuedCode.codeId,
        "the study",
      );
      // The service reports whether it went, deliberately never to where.
      setNotice(
        out.sent
          ? `Invite sent to the address held for ${issuedCode.subjectCode}.`
          : `Not sent: ${out.reason ?? "unknown reason"}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the invite");
    }
  }

  async function onVerify(subject: Subject) {
    setError(null);
    try {
      await markVerified(token, subject.id, "in_person");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record verification");
    }
  }

  async function onErase(subject: Subject) {
    // A typed confirmation, not an "are you sure": this is irreversible and
    // the subject code is the one thing the operator can check against the
    // request in front of them.
    const typed = window.prompt(
      `Erasing ${subject.subjectCode} removes their identity permanently. ` +
        `Their study data is kept, pseudonymously, and can never be linked ` +
        `back to them again — including by us. This cannot be undone.\n\n` +
        `Type the subject code to confirm:`,
    );
    if (typed?.trim() !== subject.subjectCode) return;

    setError(null);
    try {
      const out = await eraseSubject(token, subject.id);
      setNotice(`${out.subjectCode} erased. Re-identification is now severed.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not erase the subject");
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

  const usable = register?.exists === true && register.assigned === true;

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
        {canReadPii && usable && (
          <button onClick={() => void onPrintSheet()} disabled={!studyId}>
            Print code sheet
          </button>
        )}
      </section>

      {studyId && register && (
        <RegisterSetup
          token={token}
          studyId={studyId}
          state={register}
          canManage={canManage}
          onCreated={() => {
            void loadRegister();
            void load();
          }}
        />
      )}

      {error && (
        <p role="alert" style={{ color: "#a00" }}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" style={{ color: "#0a0" }}>
          {notice}
        </p>
      )}

      {issuedCode && (
        <div
          role="status"
          style={{ border: "2px solid #a00", padding: 12, margin: "12px 0" }}
        >
          <strong>Enrolment code for {issuedCode.subjectCode}</strong>
          <div style={{ fontSize: 24, fontFamily: "monospace" }}>
            {issuedCode.code}
          </div>
          <p style={{ margin: 0, fontSize: 12 }}>
            Shown once. Hand it to this participant only — it enrols them as
            this specific subject. To see it again, print the code sheet.
          </p>
          <button onClick={() => void onSendCode()}>Send by email</button>{" "}
          <button onClick={() => setIssuedCode(null)}>Dismiss</button>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#666" }}>
            Email goes to the address held in the register for this subject —
            you cannot type a different one. Sending is recorded in the audit
            log and requires SMTP to be configured.
          </p>
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
                <td>
                  {[s.givenName, s.familyName].filter(Boolean).join(" ") || "—"}
                </td>
              )}
              {canReadPii && <td>{s.dateOfBirth ?? "—"}</td>}
              <td>{s.status}</td>
              <td>{s.verifiedAt ? "yes" : "no"}</td>
              <td>
                {canReadPii && (
                  <>
                    <button onClick={() => void onIssue(s)}>Issue code</button>{" "}
                    {!s.verifiedAt && (
                      <button onClick={() => void onVerify(s)}>
                        Mark verified
                      </button>
                    )}{" "}
                  </>
                )}
                {canManage && (
                  <button onClick={() => void onErase(s)}>Erase</button>
                )}
              </td>
            </tr>
          ))}
          {subjects.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: 12, color: "#666" }}>
                {!studyId
                  ? "Enter a study ID to load its register."
                  : usable
                    ? "No subjects yet."
                    : ""}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canReadPii && studyId && usable && (
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

      {canManage && studyId && usable && (
        <RosterImport
          token={token}
          studyId={studyId}
          onImported={() => void load()}
        />
      )}

      {studyId && usable && (
        <AssignmentsPanel
          token={token}
          studyId={studyId}
          canManage={canManage}
        />
      )}
    </main>
  );
}
