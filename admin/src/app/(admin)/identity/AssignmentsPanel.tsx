"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listAssignments,
  createAssignment,
  deleteAssignment,
  type Assignment,
} from "@/lib/identityApi";

const ROLES: Assignment["role"][] = [
  "identity-manager",
  "study-nurse",
  "monitor",
];

/**
 * Who may work in this register.
 *
 * A realm role says **what** someone may do; a row here says **where**. A
 * `study-nurse` with no row sees no roster at all, which is why this panel is
 * the difference between a configured register and a usable one.
 *
 * Removing the last identity-manager is refused by the API — a register nobody
 * can administer needs database surgery to recover, and the person doing it is
 * usually removing themselves. That refusal is surfaced here as a sentence,
 * not a raw 409.
 */
export function AssignmentsPanel({
  token,
  studyId,
  canManage,
}: {
  token: string;
  studyId: string;
  canManage: boolean;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [actorSub, setActorSub] = useState("");
  const [role, setRole] = useState<Assignment["role"]>("study-nurse");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!studyId) return;
    try {
      const { assignments } = await listAssignments(token, studyId);
      setAssignments(assignments);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load assignments");
    }
  }, [token, studyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd() {
    setBusy(true);
    setError(null);
    try {
      await createAssignment(token, studyId, { actorSub: actorSub.trim(), role });
      setActorSub("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the assignment");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(a: Assignment) {
    setError(null);
    try {
      await deleteAssignment(token, studyId, {
        actorSub: a.actorSub,
        role: a.role,
      });
      await load();
    } catch (e) {
      // The API's `last_manager` refusal already carries a full explanation;
      // show it rather than replacing it with something vaguer.
      setError(
        e instanceof Error ? e.message : "Could not remove the assignment",
      );
    }
  }

  return (
    <section style={{ marginTop: 24 }}>
      <h2>Who may work in this register</h2>
      <p style={{ color: "#666", fontSize: 13, margin: "0 0 8px" }}>
        A realm role says what someone may do; an assignment says where. Without
        a row here they see nothing, whatever role they hold.
      </p>

      {error && (
        <p role="alert" style={{ color: "#a00" }}>
          {error}
        </p>
      )}

      <table style={{ borderCollapse: "collapse", minWidth: 480 }}>
        <thead>
          <tr>
            <th align="left">Keycloak subject</th>
            <th align="left">Role</th>
            {canManage && <th />}
          </tr>
        </thead>
        <tbody>
          {assignments.map((a) => (
            <tr
              key={`${a.actorSub}:${a.role}`}
              style={{ borderTop: "1px solid #eee" }}
            >
              <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                {a.actorSub}
              </td>
              <td>{a.role}</td>
              {canManage && (
                <td>
                  <button onClick={() => void onRemove(a)}>Remove</button>
                </td>
              )}
            </tr>
          ))}
          {assignments.length === 0 && (
            <tr>
              <td colSpan={3} style={{ padding: 8, color: "#666" }}>
                Nobody is assigned yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canManage && (
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <input
            value={actorSub}
            onChange={(e) => setActorSub(e.target.value)}
            placeholder="Keycloak subject (sub)"
            aria-label="Keycloak subject"
            style={{ width: 320, fontFamily: "monospace" }}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Assignment["role"])}
            aria-label="Role"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button onClick={() => void onAdd()} disabled={!actorSub.trim() || busy}>
            {busy ? "Adding…" : "Assign"}
          </button>
        </div>
      )}

      {canManage && (
        <p style={{ color: "#666", fontSize: 12, marginTop: 6 }}>
          The subject is the account&rsquo;s Keycloak <code>sub</code>, found on the
          Team &amp; Roles page. Assigning someone who does not hold the matching
          realm role grants them nothing — both are required.
        </p>
      )}
    </section>
  );
}
