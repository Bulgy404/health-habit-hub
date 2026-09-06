"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useIdentityGuard } from "@/lib/useIdentityGuard";
import {
  listReidRequests,
  createReidRequest,
  decideReidRequest,
  revealRequest,
  revokeReidRequest,
  listMyRegisters,
  LEGAL_BASES,
  type ReidRequest,
  type LegalBasis,
  type RegisterSummary,
} from "@/lib/identityApi";
import styles from "@/components/admin-page.module.css";

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
 *
 * The legal bases and the requestable field names stay as their raw
 * identifiers in every language, on purpose: they are what the API and the
 * audit log record, and an auditor comparing this screen against an exported
 * trail should be reading the same token in both places.
 */
export default function ReidentificationPage() {
  const { token, roles, canApprove, loading } = useIdentityGuard();
  const t = useTranslations("identity");
  const tc = useTranslations("common");
  const canRequest = roles.includes("identity-manager");

  const [registers, setRegisters] = useState<RegisterSummary[]>([]);
  const [studyId, setStudyId] = useState("");
  const [requests, setRequests] = useState<ReidRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{
    subjectCode: string;
    fields: Record<string, string | null>;
    expiresAt: string;
  } | null>(null);

  useEffect(() => {
    if (!token) return;
    void listMyRegisters(token)
      .then(({ registers }) => {
        setRegisters(registers);
        setStudyId((current) =>
          current || registers.length !== 1 ? current : registers[0].hhhStudyId
        );
      })
      .catch(() => {
        // Non-fatal — the queue simply stays empty until a study is chosen,
        // and an unrelated failure here must not blank the page.
      });
  }, [token]);

  const load = useCallback(async () => {
    if (!token || !studyId) return;
    setError(null);
    try {
      const { requests } = await listReidRequests(token, studyId);
      setRequests(requests);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("requests.loadFailed"));
    }
  }, [token, studyId, t]);

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
      setError(e instanceof Error ? e.message : t("requests.createFailed"));
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
      setError(e instanceof Error ? e.message : t("requests.decideFailed"));
    }
  }

  async function onRevoke(r: ReidRequest) {
    // Confirmed, but not typed-confirmed: revoking is the safe direction. The
    // cost of an unintended revoke is raising the request again; the cost of
    // hesitating over a grant that should not stand is a disclosure.
    if (
      !window.confirm(
        t("requests.revokeConfirm", {
          subjectCode: r.subject_code ?? t("requests.accountLookup"),
        })
      )
    )
      return;
    setError(null);
    try {
      await revokeReidRequest(token, r.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("requests.revokeFailed"));
    }
  }

  async function onReveal(r: ReidRequest) {
    setError(null);
    try {
      setRevealed(await revealRequest(token, r.id));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("requests.revealFailed"));
    }
  }

  if (loading) return <p>{tc("loading")}</p>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("requests.title")}</h1>
          <p className={styles.subtitle}>{t("requests.intro")}</p>
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
        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => void load()}
          disabled={!studyId}
        >
          {t("requests.refresh")}
        </button>
      </div>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {revealed && (
        <div role="status" className={styles.credBox}>
          <strong>{revealed.subjectCode}</strong>
          <dl>
            {Object.entries(revealed.fields).map(([k, v]) => (
              <div key={k}>
                <dt className={styles.detailLabel}>{k}</dt>
                <dd className={styles.detailText}>{v ?? "—"}</dd>
              </div>
            ))}
          </dl>
          <p className={styles.muted}>
            {t("requests.grantExpires", {
              when: new Date(revealed.expiresAt).toLocaleString(),
            })}
          </p>
          <button type="button" className={styles.actionBtn} onClick={() => setRevealed(null)}>
            {t("requests.dismiss")}
          </button>
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("requests.subject")}</th>
              <th>{t("requests.basis")}</th>
              <th>{t("requests.fields")}</th>
              <th>{t("requests.status")}</th>
              <th>{t("requests.requestedBy")}</th>
              <th>{t("requests.reveals")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td className={styles.code}>{r.subject_code ?? t("requests.accountLookup")}</td>
                <td>
                  {r.legal_basis}
                  {SAFETY_BASES.includes(r.legal_basis) && " ⚠"}
                </td>
                <td>{r.fields_requested.join(", ")}</td>
                <td>{r.status}</td>
                <td className={styles.code}>{r.requested_by}</td>
                <td>{r.reveal_count}</td>
                <td>
                  {canApprove && r.status === "pending" && (
                    <>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => void onDecide(r, "approved")}
                      >
                        {t("requests.approve")}
                      </button>{" "}
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => void onDecide(r, "rejected")}
                      >
                        {t("requests.reject")}
                      </button>
                    </>
                  )}
                  {r.status === "approved" && (
                    <>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => void onReveal(r)}
                      >
                        {t("requests.reveal")}
                      </button>{" "}
                      {canApprove && (
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => void onRevoke(r)}
                        >
                          {t("requests.revoke")}
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={7} className={styles.muted}>
                  {studyId ? t("requests.empty") : t("requests.chooseStudyFirst")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canRequest && studyId && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("requests.raiseTitle")}</h2>
          <form action={onCreate}>
            <div className={styles.filters}>
              <input
                className={styles.input}
                name="subjectCode"
                placeholder={t("requests.subjectCodePlaceholder")}
                aria-label={t("requests.subject")}
                required
              />
              <select
                className={styles.select}
                name="legalBasis"
                defaultValue="sae"
                aria-label={t("requests.basis")}
              >
                {LEGAL_BASES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <fieldset>
              <legend>{t("requests.fieldsLegend")}</legend>
              {REVEALABLE.map((f) => (
                <label key={f} style={{ marginRight: 12 }}>
                  <input type="checkbox" name={`field_${f}`} /> {f}
                </label>
              ))}
            </fieldset>
            <p>
              <textarea
                className={styles.input}
                name="reason"
                required
                minLength={50}
                rows={3}
                style={{ width: "100%" }}
                placeholder={t("requests.reasonPlaceholder")}
                aria-label={t("requests.reasonPlaceholder")}
              />
            </p>
            <button type="submit" className={styles.saveButton}>
              {t("requests.submit")}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
