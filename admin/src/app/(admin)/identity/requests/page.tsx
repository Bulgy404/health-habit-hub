"use client";

import { useCallback, useEffect, useState } from "react";
import { useIdentityGuard } from "@/lib/useIdentityGuard";
import {
  listReidRequests,
  createReidRequest,
  decideReidRequest,
  revealRequest,
  revokeReidRequest,
  LEGAL_BASES,
  type ReidRequest,
  type LegalBasis,
} from "@/lib/identityApi";

const REVEALABLE = [
  "givenName",
  "familyName",
  "dateOfBirth",
  "email",
  "phone",
  "address",
  "externalId",
] as const;

/** Safety bases justify the reverse lookup and escalate; the rest do not. */
const SAFETY_BASES: LegalBasis[] = ["sae", "safety_report", "regulatory_inspection"];

/**
 * Re-identification queue.
 *
 * The UI exists so the controls are *visible*, not just enforced. A reviewer
 * asking "who identified whom, and why" should be able to answer it here
 * rather than from the database.
 */
export default function ReidentificationPage() {
  const { token, roles, canApprove, loading } = useIdentityGuard();
  const canRequest = roles.includes("identity-manager");

  const [studyId, setStudyId] = useState("");
  const [requests, setRequests] = useState<ReidRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{
    subjectCode: string;
    fields: Record<string, string | null>;
    expiresAt: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!token || !studyId) return;
    setError(null);
    try {
      const { requests } = await listReidRequests(token, studyId);
      setRequests(requests);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load requests");
    }
  }, [token, studyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(form: FormData) {
    setError(null);
    const fields = REVEALABLE.filter((f) => form.get(`field_${f}`) === "on");
    try {
      await createReidRequest(token, studyId, {
        subjectCode: String(form.get("subjectCode") ?? "").trim(),
        legalBasis: String(form.get("legalBasis")) as LegalBasis,
        reason: String(form.get("reason") ?? ""),
        fieldsRequested: fields,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not raise the request");
    }
  }

  async function onDecide(r: ReidRequest, decision: "approved" | "rejected") {
    setError(null);
    try {
      await decideReidRequest(token, r.id, decision);
      await load();
    } catch (e) {
      // The four-eyes refusal arrives here. Surface it as the rule it is,
      // rather than as a generic failure.
      setError(e instanceof Error ? e.message : "Decision failed");
    }
  }

  async function onRevoke(r: ReidRequest) {
    // Confirmed, but not typed-confirmed: revoking is the safe direction. The
    // cost of an unintended revoke is raising the request again; the cost of
    // hesitating over a grant that should not stand is a disclosure.
    if (
      !window.confirm(
        `Withdraw the approval for ${r.subject_code ?? "this request"}? ` +
          `The window closes immediately and no further reveal is possible ` +
          `without a new request and a new approval.`,
      )
    )
      return;
    setError(null);
    try {
      await revokeReidRequest(token, r.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke the approval");
    }
  }

  async function onReveal(r: ReidRequest) {
    setError(null);
    try {
      setRevealed(await revealRequest(token, r.id));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reveal failed");
    }
  }

  if (loading) return <p>Loading…</p>;

  return (
    <main style={{ padding: 24 }}>
      <h1>Re-identification</h1>
      <p style={{ color: "#666", maxWidth: 720 }}>
        Every approved reveal is recorded permanently and is never collapsed in
        the audit log. Whoever raises a request cannot approve it — that rule is
        enforced by the database, not by this page.
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
      </button>

      {error && (
        <p role="alert" style={{ color: "#a00", maxWidth: 720 }}>
          {error}
        </p>
      )}

      {revealed && (
        <div
          role="status"
          style={{ border: "2px solid #a00", padding: 12, margin: "12px 0", maxWidth: 720 }}
        >
          <strong>{revealed.subjectCode}</strong>
          <dl>
            {Object.entries(revealed.fields).map(([k, v]) => (
              <div key={k}>
                <dt style={{ fontWeight: 600 }}>{k}</dt>
                <dd style={{ margin: "0 0 6px 0" }}>{v ?? "—"}</dd>
              </div>
            ))}
          </dl>
          <p style={{ fontSize: 12, margin: 0 }}>
            Grant expires {new Date(revealed.expiresAt).toLocaleString()}. This
            view was recorded in the audit log.
          </p>
          <button onClick={() => setRevealed(null)}>Dismiss</button>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
        <thead>
          <tr>
            <th align="left">Subject</th>
            <th align="left">Basis</th>
            <th align="left">Fields</th>
            <th align="left">Status</th>
            <th align="left">Requested by</th>
            <th align="left">Reveals</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
              <td>{r.subject_code ?? "(account lookup)"}</td>
              <td>
                {r.legal_basis}
                {SAFETY_BASES.includes(r.legal_basis) && " ⚠"}
              </td>
              <td style={{ fontSize: 12 }}>{r.fields_requested.join(", ")}</td>
              <td>{r.status}</td>
              <td style={{ fontSize: 12 }}>{r.requested_by}</td>
              <td>{r.reveal_count}</td>
              <td>
                {canApprove && r.status === "pending" && (
                  <>
                    <button onClick={() => void onDecide(r, "approved")}>Approve</button>{" "}
                    <button onClick={() => void onDecide(r, "rejected")}>Reject</button>
                  </>
                )}
                {r.status === "approved" && (
                  <>
                    <button onClick={() => void onReveal(r)}>Reveal</button>{" "}
                    {canApprove && (
                      <button onClick={() => void onRevoke(r)}>Revoke</button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
          {requests.length === 0 && (
            <tr>
              <td colSpan={7} style={{ padding: 12, color: "#666" }}>
                {studyId ? "No requests." : "Enter a study ID."}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canRequest && studyId && (
        <section style={{ marginTop: 24, maxWidth: 720 }}>
          <h2>Raise a request</h2>
          <form action={onCreate}>
            <p>
              <input name="subjectCode" placeholder="TUD-DFG01-0042" required />{" "}
              <select name="legalBasis" defaultValue="sae">
                {LEGAL_BASES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </p>
            <fieldset>
              <legend>Fields (request only what you need)</legend>
              {REVEALABLE.map((f) => (
                <label key={f} style={{ marginRight: 12 }}>
                  <input type="checkbox" name={`field_${f}`} /> {f}
                </label>
              ))}
            </fieldset>
            <p>
              <textarea
                name="reason"
                required
                minLength={50}
                rows={3}
                style={{ width: "100%" }}
                placeholder="At least 50 characters. Read by the approver and by any later auditor."
              />
            </p>
            <button type="submit">Submit for approval</button>
          </form>
        </section>
      )}
    </main>
  );
}
