"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listStudyMembers,
  addStudyMember,
  removeStudyMember,
  type StudyMember,
  type MemberRole,
  type MemberScope,
} from "@/lib/studyMembersApi";

/**
 * Who may read and export this study.
 *
 * The guard behind this shipped with verified identity mode and had no UI for
 * it: memberships had to be inserted into Mongo by hand, so the first
 * researcher added to a verified study needed a database operation.
 *
 * `lead` is a label for the person running the study, not a capability — it
 * does not let them manage this list. Deciding who may read research data
 * adjacent to identifiable participants is an operator decision.
 */
export function StudyMembersPanel({
  studyId,
  token,
}: {
  studyId: string;
  token: string;
}) {
  const [members, setMembers] = useState<StudyMember[]>([]);
  const [enforced, setEnforced] = useState(false);
  const [userId, setUserId] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<MemberRole>("researcher");
  const [scope, setScope] = useState<MemberScope>("read");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listStudyMembers(token, studyId);
      setMembers(data.members);
      setEnforced(data.enforced);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load members");
    }
  }, [token, studyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd() {
    setBusy(true);
    setError(null);
    try {
      await addStudyMember(token, studyId, {
        userId: userId.trim(),
        username: username.trim() || undefined,
        role,
        scope,
      });
      setUserId("");
      setUsername("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the member");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(m: StudyMember) {
    setError(null);
    try {
      await removeStudyMember(token, studyId, m.userId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the member");
    }
  }

  return (
    <section style={{ marginTop: 24, maxWidth: 640 }}>
      <h3 style={{ margin: "0 0 4px" }}>Researcher access</h3>
      <p style={{ color: "#666", fontSize: 13, margin: "0 0 8px" }}>
        {enforced ? (
          <>
            This study is <strong>scoped</strong>: the researcher role alone
            grants nothing here. Only the people below can open it, and only
            those with <em>export</em> can download the study bundle. Admins
            always have access.
          </>
        ) : (
          <>
            This study is <strong>open</strong> — every researcher can already
            read it, so entries here have no effect yet. They take effect if the
            study is switched to verified identity mode.
          </>
        )}
      </p>

      {error && (
        <p role="alert" style={{ color: "#a00" }}>
          {error}
        </p>
      )}

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th align="left">User</th>
            <th align="left">Role</th>
            <th align="left">Access</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.userId} style={{ borderTop: "1px solid #eee" }}>
              <td>
                {m.username ?? "—"}
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "#666" }}>
                  {m.userId}
                </div>
              </td>
              <td>{m.role}</td>
              <td>{m.scope === "export" ? "read + export" : "read only"}</td>
              <td>
                <button onClick={() => void onRemove(m)}>Remove</button>
              </td>
            </tr>
          ))}
          {members.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: 8, color: "#666" }}>
                No researchers have been given access.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="Keycloak subject (sub)"
          aria-label="Keycloak subject"
          style={{ width: 300, fontFamily: "monospace" }}
        />
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username (for display)"
          aria-label="Username"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as MemberRole)}
          aria-label="Role"
        >
          <option value="researcher">researcher</option>
          <option value="lead">lead</option>
        </select>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as MemberScope)}
          aria-label="Access"
        >
          <option value="read">read only</option>
          <option value="export">read + export</option>
        </select>
        <button onClick={() => void onAdd()} disabled={!userId.trim() || busy}>
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
      <p style={{ color: "#666", fontSize: 12, marginTop: 6 }}>
        The subject is the account&rsquo;s Keycloak <code>sub</code>, shown on the
        Team &amp; Roles page. Adding an existing member updates their role and
        access rather than creating a second entry.
      </p>
    </section>
  );
}
