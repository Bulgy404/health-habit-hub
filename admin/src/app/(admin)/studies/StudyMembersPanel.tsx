"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  listStudyMembers,
  addStudyMember,
  removeStudyMember,
  type StudyMember,
  type MemberRole,
  type MemberScope,
} from "@/lib/studyMembersApi";
import styles from "@/components/admin-page.module.css";

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
export function StudyMembersPanel({ studyId, token }: { studyId: string; token: string }) {
  const t = useTranslations("identity");
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
      setError(e instanceof Error ? e.message : t("members.loadFailed"));
    }
  }, [token, studyId, t]);

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
      setError(e instanceof Error ? e.message : t("members.addFailed"));
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
      setError(e instanceof Error ? e.message : t("members.removeFailed"));
    }
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t("members.title")}</h3>
      <p className={styles.muted}>{enforced ? t("members.enforced") : t("members.open")}</p>

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
                  {m.username ?? "\u2014"}
                  <div className={styles.code}>{m.userId}</div>
                </td>
                <td>{m.role}</td>
                <td>{m.scope === "export" ? t("members.readExport") : t("members.readOnly")}</td>
                <td>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => void onRemove(m)}
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

      <div className={styles.filters}>
        <input
          className={styles.input}
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder={t("members.subjectPlaceholder")}
          aria-label={t("assignments.subject")}
        />
        <input
          className={styles.input}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={t("members.usernamePlaceholder")}
          aria-label={t("members.username")}
        />
        <select
          className={styles.select}
          value={role}
          onChange={(e) => setRole(e.target.value as MemberRole)}
          aria-label={t("members.role")}
        >
          <option value="researcher">researcher</option>
          <option value="lead">lead</option>
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
          disabled={!userId.trim() || busy}
        >
          {busy ? t("members.adding") : t("members.add")}
        </button>
      </div>
      <p className={styles.muted}>{t("members.hint")}</p>
    </section>
  );
}
