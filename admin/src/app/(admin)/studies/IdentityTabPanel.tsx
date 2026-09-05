"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";
import { IdentityTab, type IdentityConfig } from "./IdentityTab";
import { StudyMembersPanel } from "./StudyMembersPanel";

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
      setError(e instanceof Error ? e.message : "Could not load the study");
    }
  }, [studyId, token]);

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
      setError(explain(e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  if (error && !value) {
    return (
      <p role="alert" style={{ color: "#a00" }}>
        {error}
      </p>
    );
  }
  if (!value) return <p>Loading…</p>;

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
        <p role="alert" style={{ color: "#a00", maxWidth: 640 }}>
          {error}
        </p>
      )}
      {saved && <p style={{ color: "#0a0" }}>Saved.</p>}

      <button onClick={() => void onSave()} disabled={!dirty || saving}>
        {saving ? "Saving…" : "Save identity settings"}
      </button>

      <StudyMembersPanel studyId={studyId} token={token} />
    </div>
  );
}

/**
 * Turn the API's error codes into something an operator can act on.
 *
 * `apiFetch` flattens the response into one message, so this matches on the
 * code it contains. Unknown messages pass through unchanged — a refusal this
 * page has not been taught about must still reach the person configuring the
 * study.
 */
function explain(message: string): string {
  if (message.includes("consent_document_not_ready")) {
    return (
      "The consent document named here is not ready to be attached. It must " +
      "be published in every language, at one version, with no ⟦…⟧ " +
      "placeholders left in it. Fix it under Consent Documents, then save " +
      "again. (Saving was refused rather than allowed, because an incomplete " +
      "document fails the participant after they have already enrolled.)"
    );
  }
  if (message.includes("identity_fields_frozen") || message.includes("frozen")) {
    return (
      "Mode and subject-code prefix are frozen once a participant has " +
      "enrolled. Switching to anonymous would orphan live subject links, and " +
      "a new prefix would break the link between an issued subject code and " +
      "the register that minted it."
    );
  }
  return message;
}
