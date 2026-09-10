"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useIdentityGuard } from "@/lib/useIdentityGuard";
import {
  listSubjects,
  createSubject,
  issueCode,
  markVerified,
  downloadCodeSheet,
  getRegister,
  listMyRegisters,
  sendCodeByEmail,
  eraseSubject,
  type Subject,
  type RegisterState,
  type RegisterSummary,
} from "@/lib/identityApi";
import { RegisterSetup } from "./RegisterSetup";
import { AssignmentsPanel } from "./AssignmentsPanel";
import { RosterImport } from "./RosterImport";
import styles from "@/components/admin-page.module.css";

/**
 * Identity register — roster view.
 *
 * Four things this page does deliberately:
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
 * 4. It offers the registers the caller is assigned to rather than asking for
 *    a 24-hex study id. The study list needs `admin` or `researcher`, and a
 *    study nurse is neither — so the role that lives on this screen was the
 *    one that could not discover what to type.
 */
export default function IdentityPage() {
  const { token, roles, canReadPii, canManage, loading } = useIdentityGuard();
  const t = useTranslations("identity");
  const tc = useTranslations("common");

  const [registers, setRegisters] = useState<RegisterSummary[]>([]);
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

  const loadRegisters = useCallback(async () => {
    if (!token) return;
    try {
      const { registers } = await listMyRegisters(token);
      setRegisters(registers);
      // Select the only one automatically — a nurse assigned to exactly one
      // register should not have to choose it every time.
      setStudyId((current) =>
        current || registers.length !== 1 ? current : registers[0].hhhStudyId
      );
    } catch {
      // Non-fatal: the roster below still works if a study id is known.
    }
  }, [token]);

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
      const msg = e instanceof Error ? e.message : t("roster.loadFailed");
      if (!/register_not_found|not_assigned_to_register/.test(msg)) {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [token, studyId, query, t]);

  useEffect(() => {
    void loadRegisters();
  }, [loadRegisters]);

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
      setError(e instanceof Error ? e.message : t("roster.addFailed"));
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
      setError(e instanceof Error ? e.message : t("roster.issueFailed"));
    }
  }

  async function onSendCode() {
    if (!issuedCode) return;
    setError(null);
    setNotice(null);
    try {
      const out = await sendCodeByEmail(token, issuedCode.subjectId, issuedCode.codeId);
      // The service reports whether it went, deliberately never to where.
      setNotice(
        out.sent
          ? t("code.sent", { subjectCode: issuedCode.subjectCode })
          : t("code.notSent", {
              reason: out.reason ?? t("code.unknownReason"),
            })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("code.sendFailed"));
    }
  }

  async function onVerify(subject: Subject) {
    setError(null);
    try {
      await markVerified(token, subject.id, "in_person");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("roster.verifyFailed"));
    }
  }

  async function onErase(subject: Subject) {
    // A typed confirmation, not an "are you sure": this is irreversible and
    // the subject code is the one thing the operator can check against the
    // request in front of them.
    const typed = window.prompt(t("erase.confirm", { subjectCode: subject.subjectCode }));
    if (typed?.trim() !== subject.subjectCode) return;

    setError(null);
    try {
      const out = await eraseSubject(token, subject.id);
      setNotice(t("erase.done", { subjectCode: out.subjectCode }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("erase.failed"));
    }
  }

  async function onPrintSheet() {
    try {
      const blob = await downloadCodeSheet(token, studyId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `code-sheet-${studyId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("roster.sheetFailed"));
    }
  }

  if (loading) return <p>{tc("loading")}</p>;

  const usable = register?.exists === true && register.assigned === true;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>
            {t("rolesLine", { roles: roles.join(", ") || t("noRoles") })}{" "}
            {canReadPii ? t("canSeeNames") : t("cannotSeeNames")}
          </p>
        </div>
      </div>

      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t("study")}</span>
          <select
            className={styles.select}
            value={studyId}
            onChange={(e) => setStudyId(e.target.value)}
            aria-label={t("study")}
          >
            <option value="">{registers.length === 0 ? t("noRegisters") : t("chooseStudy")}</option>
            {registers.map((r) => (
              <option key={r.hhhStudyId} value={r.hhhStudyId}>
                {r.studyName ? `${r.studyName} (${r.subjectCodePrefix})` : r.subjectCodePrefix}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t("search")}</span>
          <input
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={canReadPii ? t("searchWithNames") : t("searchCodesOnly")}
            aria-label={t("search")}
          />
        </div>

        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => void load()}
          disabled={!studyId || busy}
        >
          {busy ? tc("loading") : t("refresh")}
        </button>
        {canReadPii && usable && (
          <button type="button" className={styles.actionBtn} onClick={() => void onPrintSheet()}>
            {t("printSheet")}
          </button>
        )}
      </div>

      {studyId && register && (
        <RegisterSetup
          token={token}
          studyId={studyId}
          state={register}
          canManage={canManage}
          onCreated={() => {
            void loadRegisters();
            void loadRegister();
            void load();
          }}
        />
      )}

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={styles.subtitle}>
          {notice}
        </p>
      )}

      {issuedCode && (
        <div role="status" className={styles.credBox}>
          <strong>{t("code.issuedFor", { subjectCode: issuedCode.subjectCode })}</strong>
          <div className={styles.code}>{issuedCode.code}</div>
          <p className={styles.muted}>{t("code.shownOnce")}</p>
          <button type="button" className={styles.actionBtn} onClick={() => void onSendCode()}>
            {t("code.sendEmail")}
          </button>{" "}
          <button type="button" className={styles.actionBtn} onClick={() => setIssuedCode(null)}>
            {t("code.dismiss")}
          </button>
          <p className={styles.muted}>{t("code.emailNote")}</p>
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("roster.subjectCode")}</th>
              {canReadPii && <th>{t("roster.name")}</th>}
              {canReadPii && <th>{t("roster.dateOfBirth")}</th>}
              <th>{t("roster.status")}</th>
              <th>{t("roster.verified")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.id}>
                <td className={styles.code}>{s.subjectCode}</td>
                {canReadPii && (
                  <td>{[s.givenName, s.familyName].filter(Boolean).join(" ") || "—"}</td>
                )}
                {canReadPii && <td>{s.dateOfBirth ?? "—"}</td>}
                <td>{s.status}</td>
                <td>{s.verifiedAt ? t("roster.yes") : t("roster.no")}</td>
                <td>
                  {canReadPii && (
                    <>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => void onIssue(s)}
                      >
                        {t("roster.issueCode")}
                      </button>{" "}
                      {!s.verifiedAt && (
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => void onVerify(s)}
                        >
                          {t("roster.markVerified")}
                        </button>
                      )}{" "}
                    </>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => void onErase(s)}
                    >
                      {t("roster.erase")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {subjects.length === 0 && (
              <tr>
                <td colSpan={6} className={styles.muted}>
                  {!studyId ? t("roster.chooseStudyFirst") : usable ? t("roster.empty") : ""}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canReadPii && studyId && usable && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("roster.addTitle")}</h2>
          <form action={onAdd} className={styles.filters}>
            <input
              className={styles.input}
              name="givenName"
              placeholder={t("roster.givenName")}
              aria-label={t("roster.givenName")}
            />
            <input
              className={styles.input}
              name="familyName"
              placeholder={t("roster.familyName")}
              aria-label={t("roster.familyName")}
              required
            />
            <input
              className={styles.input}
              name="dateOfBirth"
              placeholder={t("roster.dob")}
              aria-label={t("roster.dateOfBirth")}
            />
            <input
              className={styles.input}
              name="email"
              type="email"
              placeholder={t("roster.email")}
              aria-label={t("roster.email")}
            />
            <button type="submit" className={styles.addButton}>
              {t("roster.add")}
            </button>
          </form>
        </section>
      )}

      {canManage && studyId && usable && (
        <RosterImport token={token} studyId={studyId} onImported={() => void load()} />
      )}

      {studyId && usable && (
        <AssignmentsPanel token={token} studyId={studyId} canManage={canManage} />
      )}
    </div>
  );
}
