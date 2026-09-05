"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUrl } from "@/lib/api";
import { IdentityTab, type IdentityConfig } from "./IdentityTab";
import { StudyMembersPanel } from "./StudyMembersPanel";
import styles from "@/components/admin-page.module.css";

/**
 * The Identity tab, wired to the API.
 *
 * `IdentityTab` is a controlled presentational component and was written
 * before anything rendered it — this is the piece that fetches the study's
 * current identity config, saves changes, and surfaces the two refusals the
 * backend can answer with:
 *
 * - **409 frozen fields** — `mode` and `subjectCodePrefix` freeze once anyone
 *   has enrolled. Flipping to anonymous would orphan live subject links, and
 *   changing the prefix would break the correspondence between a stored
 *   subject code and the register that minted it.
 * - **409 `consent_document_not_ready`** — the named consent document is
 *   missing a language, still a draft, still carries placeholders, or its
 *   locales are at different versions.
 *
 * The list endpoint returns only `identityMode`, so the full config is fetched
 * here rather than taken from the row the modal was opened with.
 */
export function IdentityTabPanel({
  studyId,
  participantCount,
  token,
}: {
  studyId: string;
  participantCount: number;
  token: string;
}) {
  const t = useTranslations("identity");
  const tc = useTranslations("common");
  const [value, setValue] = useState<IdentityConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const study = await apiFetch(apiUrl(`/admin/studies/${studyId}`), token);
      setValue(study.identity as IdentityConfig);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("config.loadFailed"));
    }
  }, [studyId, token, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave() {
    if (!value) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await apiFetch(apiUrl(`/admin/studies/${studyId}`), token, {
        method: "PUT",
        body: JSON.stringify({ identity: value }),
      });
      setSaved(true);
      setDirty(false);
      await load();
    } catch (e) {
      setError(explain(e instanceof Error ? e.message : String(e), t("config.consentNotReady")));
    } finally {
      setSaving(false);
    }
  }

  if (error && !value) {
    return (
      <p role="alert" className={styles.error}>
        {error}
      </p>
    );
  }
  if (!value) return <p>{tc("loading")}</p>;

  return (
    <div>
      <IdentityTab
        value={value}
        hasEnrolments={participantCount > 0}
        onChange={(patch) => {
          setValue({ ...value, ...patch });
          setDirty(true);
          setSaved(false);
        }}
      />

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {saved && <p className={styles.subtitle}>{t("config.saved")}</p>}

      <button
        type="button"
        className={styles.saveButton}
        onClick={() => void onSave()}
        disabled={!dirty || saving}
      >
        {saving ? t("config.saving") : t("config.save")}
      </button>

      <StudyMembersPanel studyId={studyId} token={token} />
    </div>
  );
}

/**
 * Turn the one API refusal that arrives as a bare CODE into something an
 * operator can act on.
 *
 * Deliberately narrow. The frozen-fields refusal already arrives as a full
 * sentence naming the exact fields ("Cannot change mode, subjectCodePrefix on
 * a study that already has enrolments"), and an earlier version of this
 * function matched on the word "frozen" and replaced that with something
 * vaguer — losing the field list the operator actually needed. Anything not
 * matched here passes through untouched.
 */
function explain(message: string, consentNotReady: string): string {
  return message.includes("consent_document_not_ready") ? consentNotReady : message;
}
