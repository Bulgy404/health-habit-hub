"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  listAssignments,
  createAssignment,
  deleteAssignment,
  type Assignment,
} from "@/lib/identityApi";
import styles from "@/components/admin-page.module.css";

const ROLES: Assignment["role"][] = ["identity-manager", "study-nurse", "monitor"];

/**
 * Who may work in this register.
 *
 * A realm role says **what** someone may do; a row here says **where**. A
 * `study-nurse` with no row sees no roster at all, which is why this panel is
 * the difference between a configured register and a usable one.
 *
 * Removing the last identity-manager is refused by the API — a register nobody
 * can administer needs database surgery to recover, and the person doing it is
 * usually removing themselves. That refusal arrives as a full sentence and is
 * shown as one, rather than being replaced with something vaguer here.
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
  const t = useTranslations("identity");
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
      setError(e instanceof Error ? e.message : t("assignments.loadFailed"));
    }
  }, [token, studyId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd() {
    setBusy(true);
    setError(null);
    try {
      await createAssignment(token, studyId, {
        actorSub: actorSub.trim(),
        role,
      });
      setActorSub("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("assignments.addFailed"));
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
        siteId: a.siteId,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("assignments.removeFailed"));
    }
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t("assignments.title")}</h2>
      <p className={styles.muted}>{t("assignments.intro")}</p>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("assignments.subject")}</th>
              <th>{t("assignments.role")}</th>
              {canManage && <th />}
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={`${a.actorSub}:${a.role}`}>
                <td className={styles.code}>{a.actorSub}</td>
                <td>{a.role}</td>
                {canManage && (
                  <td>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => void onRemove(a)}
                    >
                      {t("assignments.remove")}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr>
                <td colSpan={3} className={styles.muted}>
                  {t("assignments.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canManage && (
        <>
          <div className={styles.filters}>
            <input
              className={styles.input}
              value={actorSub}
              onChange={(e) => setActorSub(e.target.value)}
              placeholder={t("assignments.subjectPlaceholder")}
              aria-label={t("assignments.subject")}
            />
            <select
              className={styles.select}
              value={role}
              onChange={(e) => setRole(e.target.value as Assignment["role"])}
              aria-label={t("assignments.role")}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.addButton}
              onClick={() => void onAdd()}
              disabled={!actorSub.trim() || busy}
            >
              {busy ? t("assignments.assigning") : t("assignments.assign")}
            </button>
          </div>
          <p className={styles.muted}>{t("assignments.subHint")}</p>
        </>
      )}
    </section>
  );
}
