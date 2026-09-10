"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import styles from "./page.module.css";

/**
 * Verified-identity configuration for a study.
 *
 * Extracted into its own file rather than inlined: studies/page.tsx is already
 * ~5000 lines, and the idiomatic move (another tab) would make that worse.
 *
 * Study-level only — there is deliberately no per-group counterpart. Identity
 * mode follows the study's ethics approval, not an experimental condition, and
 * letting one arm be identified while another is not is a configuration nobody
 * wants.
 */
export interface IdentityConfig {
  mode: "anonymous" | "verified";
  subjectCodePrefix: string | null;
  verificationMethods: ("in_person" | "email" | "sms")[];
  consentDocumentSlug: string | null;
  reidentificationApprovers: 1 | 2;
  revealTtlMinutes: number;
  auditReads: boolean;
  researcherScoping: "open" | "scoped";
}

export interface IdentityTabProps {
  value: IdentityConfig;
  /** True once anyone has enrolled — freezes mode and prefix. */
  hasEnrolments: boolean;
  onChange: (next: Partial<IdentityConfig>) => void;
}

export function IdentityTab({ value, hasEnrolments, onChange }: IdentityTabProps) {
  const t = useTranslations("identity.tab");
  const [confirmVerified, setConfirmVerified] = useState(false);
  const frozen = hasEnrolments;
  const verified = value.mode === "verified";
  const methodLabels: Record<IdentityConfig["verificationMethods"][number], string> = {
    in_person: t("methodInPerson"),
    email: t("methodEmail"),
    sms: t("methodSms"),
  };

  return (
    <div className={styles.identityTab}>
      <p className={styles.identityIntro}>{t("intro")}</p>

      {frozen && (
        <p role="note" className={styles.identityNote}>
          {t("frozenNote")}
        </p>
      )}

      <label className={`${styles.checkboxLabel} ${styles.identityCheckboxRow}`}>
        <input
          type="checkbox"
          checked={verified}
          disabled={frozen || (!verified && !confirmVerified)}
          onChange={(e) =>
            onChange({ mode: e.target.checked ? "verified" : "anonymous" })
          }
        />
        {t("checkboxLabel")}
      </label>

      {!verified && !frozen && (
        <label className={styles.identityConfirm}>
          <input
            type="checkbox"
            checked={confirmVerified}
            onChange={(e) => setConfirmVerified(e.target.checked)}
          />
          {t("confirmLabel")}
        </label>
      )}

      {verified && (
        <>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="identity-prefix">
              {t("prefixLabel")}
            </label>
            <input
              id="identity-prefix"
              className={styles.input}
              value={value.subjectCodePrefix ?? ""}
              disabled={frozen}
              onChange={(e) =>
                onChange({ subjectCodePrefix: e.target.value.toUpperCase() })
              }
              placeholder="TUD-DFG01"
            />
            <span className={styles.identitySuffix}>
              {t("prefixSuffix", {
                example: `${value.subjectCodePrefix || "TUD-DFG01"}-0042`,
              })}
            </span>
          </div>

          <fieldset className={styles.identityFieldset}>
            <legend className={styles.identityLegend}>{t("methodsLegend")}</legend>
            <div className={styles.identityMethods}>
              {(["in_person", "email", "sms"] as const).map((m) => (
                <label key={m} className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={value.verificationMethods.includes(m)}
                    onChange={(e) =>
                      onChange({
                        verificationMethods: e.target.checked
                          ? [...value.verificationMethods, m]
                          : value.verificationMethods.filter((x) => x !== m),
                      })
                    }
                  />
                  {methodLabels[m]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="identity-consent-slug">
              {t("consentSlugLabel")}
            </label>
            <input
              id="identity-consent-slug"
              className={styles.input}
              value={value.consentDocumentSlug ?? ""}
              onChange={(e) =>
                onChange({ consentDocumentSlug: e.target.value || null })
              }
              placeholder="dfg-verified"
            />
          </div>
          <p className={styles.hint}>
            {t.rich("consentHint", {
              em: (chunks) => <em>{chunks}</em>,
              link: (chunks) => <Link href="/consent-documents">{chunks}</Link>,
            })}
          </p>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="identity-approvers">
              {t("approversLabel")}
            </label>
            <select
              id="identity-approvers"
              className={styles.select}
              value={value.reidentificationApprovers}
              onChange={(e) =>
                onChange({
                  reidentificationApprovers: Number(e.target.value) as 1 | 2,
                })
              }
            >
              <option value={1}>{t("approversOption1")}</option>
              <option value={2}>{t("approversOption2")}</option>
            </select>
          </div>
          <p className={styles.hint}>{t("approversHint")}</p>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="identity-reveal-ttl">
              {t("revealLabel")}
            </label>
            <input
              id="identity-reveal-ttl"
              type="number"
              min={5}
              max={1440}
              className={`${styles.input} ${styles.identityRevealInput}`}
              value={value.revealTtlMinutes}
              onChange={(e) =>
                onChange({ revealTtlMinutes: Number(e.target.value) })
              }
            />
          </div>

          <p className={styles.hint}>{t("scopingNote")}</p>
        </>
      )}
    </div>
  );
}

export default IdentityTab;
