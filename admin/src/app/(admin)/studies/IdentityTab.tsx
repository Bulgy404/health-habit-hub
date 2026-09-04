"use client";

import { useState } from "react";
import Link from "next/link";

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
  const [confirmVerified, setConfirmVerified] = useState(false);
  const frozen = hasEnrolments;
  const verified = value.mode === "verified";

  return (
    <div style={{ maxWidth: 640 }}>
      <p style={{ color: "#666" }}>
        Off by default. Turn this on only for a study whose ethics approval
        requires participants to be identified — for example a clinical study
        that must contact someone after an adverse event.
      </p>

      {frozen && (
        <p
          role="note"
          style={{ border: "1px solid #b26a00", padding: 8, color: "#b26a00" }}
        >
          Participants have already enrolled, so the mode and subject-code
          prefix are locked. Switching to anonymous now would orphan the
          existing identity links; changing the prefix would break the link
          between stored subject codes and the register that issued them.
        </p>
      )}

      <label style={{ display: "block", margin: "12px 0" }}>
        <input
          type="checkbox"
          checked={verified}
          disabled={frozen || (!verified && !confirmVerified)}
          onChange={(e) =>
            onChange({ mode: e.target.checked ? "verified" : "anonymous" })
          }
        />{" "}
        Verified identity mode
      </label>

      {!verified && !frozen && (
        <label style={{ display: "block", marginBottom: 12, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={confirmVerified}
            onChange={(e) => setConfirmVerified(e.target.checked)}
          />{" "}
          I understand this study will collect participant identities into a
          separate register, and that ethics approval must already cover it.
        </label>
      )}

      {verified && (
        <>
          <label style={{ display: "block", margin: "8px 0" }}>
            Subject-code prefix{" "}
            <input
              value={value.subjectCodePrefix ?? ""}
              disabled={frozen}
              onChange={(e) =>
                onChange({ subjectCodePrefix: e.target.value.toUpperCase() })
              }
              placeholder="TUD-DFG01"
            />
            <span style={{ color: "#888", fontSize: 12 }}>
              {" "}
              → codes look like {value.subjectCodePrefix || "TUD-DFG01"}-0042
            </span>
          </label>

          <fieldset style={{ margin: "12px 0" }}>
            <legend>How identity is verified</legend>
            {(["in_person", "email", "sms"] as const).map((m) => (
              <label key={m} style={{ marginRight: 12 }}>
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
                />{" "}
                {m}
              </label>
            ))}
          </fieldset>

          <label style={{ display: "block", margin: "8px 0" }}>
            Study consent document slug{" "}
            <input
              value={value.consentDocumentSlug ?? ""}
              onChange={(e) =>
                onChange({ consentDocumentSlug: e.target.value || null })
              }
              placeholder="dfg-verified"
            />
          </label>
          <p style={{ fontSize: 12, color: "#b26a00", margin: "0 0 12px 0" }}>
            The document must be published in every language before it can be
            attached — saving is refused otherwise, because an incomplete one
            fails the participant <em>after</em> they have enrolled. Write and
            publish it under{" "}
            <Link href="/consent-documents">Consent Documents</Link>. Leave
            empty for no extra consent.
          </p>

          <label style={{ display: "block", margin: "8px 0" }}>
            Approvers required{" "}
            <select
              value={value.reidentificationApprovers}
              onChange={(e) =>
                onChange({
                  reidentificationApprovers: Number(e.target.value) as 1 | 2,
                })
              }
            >
              <option value={1}>1 — one other person approves</option>
              <option value={2}>2 — two other people approve</option>
            </select>
          </label>
          <p style={{ fontSize: 12, color: "#666", margin: "0 0 12px 0" }}>
            Whoever raises a request can never approve it, at either setting.
            Two approvers is stricter but needs two people awake — consider
            out-of-hours cover before choosing it.
          </p>

          <label style={{ display: "block", margin: "8px 0" }}>
            Reveal window (minutes){" "}
            <input
              type="number"
              min={5}
              max={1440}
              value={value.revealTtlMinutes}
              onChange={(e) =>
                onChange({ revealTtlMinutes: Number(e.target.value) })
              }
              style={{ width: 90 }}
            />
          </label>

          <p style={{ fontSize: 12, color: "#666" }}>
            Researcher access is scoped automatically for verified studies, so
            a researcher must be an explicit member to see this study&apos;s
            data. That is not configurable here.
          </p>
        </>
      )}
    </div>
  );
}

export default IdentityTab;
