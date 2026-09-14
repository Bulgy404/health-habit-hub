"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  listStudyMembers,
  addStudyMembers,
  removeStudyMember,
  listMembershipsForUser,
  searchTeamUsers,
  MEMBERS_PAGE_SIZE,
  type StudyMember,
  type MemberRole,
  type MemberScope,
  type TeamUser,
  type UserMembership,
} from "@/lib/studyMembersApi";
import styles from "@/components/admin-page.module.css";

/**
 * Who may read and export this study.
 *
 * `lead` is a label for the person running the study, not a capability — it
 * does not let them manage this list. Deciding who may read research data
 * adjacent to identifiable participants is an operator decision.
 *
 * People are chosen from the realm rather than typed in: a mistyped `sub` used
 * to be stored happily and then render like any other grant while gating
 * access for nobody, which is the hardest kind of access-control error to
 * notice.
 */
export function StudyMembersPanel({
  studyId,
  token,
}: {
  studyId: string;
  token: string;
}) {
  const t = useTranslations("identity");
  const [members, setMembers] = useState<StudyMember[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [enforced, setEnforced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TeamUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [staged, setStaged] = useState<TeamUser[]>([]);
  const [role, setRole] = useState<MemberRole>("researcher");
  const [scope, setScope] = useState<MemberScope>("read");
  const [busy, setBusy] = useState(false);

  const [confirming, setConfirming] = useState<StudyMember | null>(null);
  const [removing, setRemoving] = useState(false);
  const [reach, setReach] = useState<{
    userId: string;
    rows: UserMembership[];
  } | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / MEMBERS_PAGE_SIZE));

  const load = useCallback(async () => {
    try {
      const data = await listStudyMembers(token, studyId, {
        limit: MEMBERS_PAGE_SIZE,
        skip: page * MEMBERS_PAGE_SIZE,
      });
      setMembers(data.members);
      setTotal(data.total);
      setEnforced(data.enforced);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("members.loadFailed"));
    }
  }, [token, studyId, page, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Debounced, and last-response-wins: without the guard a slow early query can
  // land after a later one and repopulate the list with stale people.
  const searchSeq = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await searchTeamUsers(token, q);
        if (seq === searchSeq.current) setResults(data.users);
      } catch {
        if (seq === searchSeq.current) setResults([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, token]);

  function stage(user: TeamUser) {
    setStaged((prev) =>
      prev.some((u) => u.id === user.id) ? prev : [...prev, user],
    );
    setQuery("");
    setResults([]);
  }

  async function onAdd() {
    if (staged.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await addStudyMembers(
        token,
        studyId,
        staged.map((u) => ({
          userId: u.id,
          username: u.username,
          role,
          scope,
        })),
      );
      setStaged([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("members.addFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmRemove() {
    if (!confirming) return;
    setRemoving(true);
    setError(null);
    try {
      await removeStudyMember(token, studyId, confirming.userId);
      setConfirming(null);
      // Stepping back off a page that just lost its only row avoids landing on
      // an empty view that looks like the list failed to load.
      if (members.length === 1 && page > 0) setPage((p) => p - 1);
      else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("members.removeFailed"));
    } finally {
      setRemoving(false);
    }
  }

  async function onShowReach(m: StudyMember) {
    if (reach?.userId === m.userId) {
      setReach(null);
      return;
    }
    try {
      const data = await listMembershipsForUser(token, m.userId);
      setReach({ userId: m.userId, rows: data.memberships });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("members.loadFailed"));
    }
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t("members.title")}</h3>
      <p className={styles.muted}>
        {enforced ? t("members.enforced") : t("members.open")}
      </p>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("members.user")}</th>
              <th>{t("members.role")}</th>
              <th>{t("members.access")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId}>
                <td>
                  {m.username ?? "—"}
                  <div className={styles.code}>{m.userId}</div>
                  {reach?.userId === m.userId && (
                    <div className={styles.detailSection}>
                      <span className={styles.detailLabel}>
                        {t("members.reachTitle")}
                      </span>
                      <ul className={styles.detailText}>
                        {reach.rows.map((r) => (
                          <li key={r.studyId}>
                            {r.studyName ?? r.studyId}
                            {" — "}
                            {r.role}
                            {"/"}
                            {r.scope}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </td>
                <td>{t(`members.roleName.${m.role}`)}</td>
                <td>
                  {m.scope === "export"
                    ? t("members.readExport")
                    : t("members.readOnly")}
                </td>
                <td>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => void onShowReach(m)}
                    aria-expanded={reach?.userId === m.userId}
                  >
                    {t("members.reach")}
                  </button>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => setConfirming(m)}
                  >
                    {t("members.remove")}
                  </button>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className={styles.muted}>
                  {t("members.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > MEMBERS_PAGE_SIZE && (
        <div className={styles.pagination}>
          <span className={styles.muted}>
            {t("members.pageInfo", { total, page: page + 1, totalPages })}
          </span>
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            {t("members.previous")}
          </button>
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            {t("members.next")}
          </button>
        </div>
      )}

      <div className={styles.filters}>
        <input
          className={styles.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("members.searchPlaceholder")}
          aria-label={t("members.searchLabel")}
        />
        <select
          className={styles.select}
          value={role}
          onChange={(e) => setRole(e.target.value as MemberRole)}
          aria-label={t("members.role")}
        >
          <option value="researcher">{t("members.roleName.researcher")}</option>
          <option value="lead">{t("members.roleName.lead")}</option>
        </select>
        <select
          className={styles.select}
          value={scope}
          onChange={(e) => setScope(e.target.value as MemberScope)}
          aria-label={t("members.access")}
        >
          <option value="read">{t("members.readOnly")}</option>
          <option value="export">{t("members.readExport")}</option>
        </select>
        <button
          type="button"
          className={styles.addButton}
          onClick={() => void onAdd()}
          disabled={staged.length === 0 || busy}
        >
          {busy
            ? t("members.adding")
            : t("members.addCount", { count: staged.length })}
        </button>
      </div>

      {searching && <p className={styles.muted}>{t("members.searching")}</p>}

      {results.length > 0 && (
        <ul className={styles.detailText}>
          {results.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => stage(u)}
              >
                {u.username}
                {u.email ? ` — ${u.email}` : ""}
              </button>
            </li>
          ))}
        </ul>
      )}

      {staged.length > 0 && (
        <p className={styles.detailText}>
          <span className={styles.detailLabel}>{t("members.selected")}</span>{" "}
          {staged.map((u) => (
            <button
              key={u.id}
              type="button"
              className={styles.badge}
              onClick={() =>
                setStaged((prev) => prev.filter((s) => s.id !== u.id))
              }
              aria-label={t("members.unselect", { user: u.username })}
            >
              {u.username} ×
            </button>
          ))}
        </p>
      )}

      <p className={styles.muted}>{t("members.hint")}</p>

      {confirming && (
        <div className={styles.modalOverlay} onClick={() => setConfirming(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{t("members.confirmTitle")}</h2>
            <p className={styles.detailText}>
              {t("members.confirmBody", {
                user: confirming.username ?? confirming.userId,
              })}
            </p>
            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setConfirming(null)}
                disabled={removing}
              >
                {t("members.cancel")}
              </button>
              <button
                type="button"
                className={styles.deleteBtn}
                onClick={() => void onConfirmRemove()}
                disabled={removing}
              >
                {removing ? t("members.removing") : t("members.remove")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
