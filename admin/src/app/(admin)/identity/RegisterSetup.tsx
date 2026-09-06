"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createRegister, SUBJECT_CODE_PREFIX_PATTERN, type RegisterState } from "@/lib/identityApi";
import styles from "@/components/admin-page.module.css";

/**
 * The state of a register before it is usable, and the way out of each.
 *
 * Three distinct situations look identical on a roster page — an empty table —
 * and telling them apart is the whole job of this component:
 *
 * 1. **No register exists.** Nothing works until one is created, and until
 *    this component existed the only way to create one was a hand-rolled
 *    `curl` with a bearer token.
 * 2. **A register exists but the viewer is not assigned to it.** They hold the
 *    realm role and see nothing. The fix is somebody else's action, so saying
 *    "no subjects yet" would send them looking in the wrong place.
 * 3. **Ready.** Show the prefix, because a subject code is only traceable back
 *    to its register through it.
 */
export function RegisterSetup({
  token,
  studyId,
  state,
  canManage,
  onCreated,
}: {
  token: string;
  studyId: string;
  state: RegisterState;
  canManage: boolean;
  onCreated: () => void;
}) {
  const t = useTranslations("identity");
  const [prefix, setPrefix] = useState("");
  const [studyName, setStudyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.exists && state.assigned) {
    return (
      <p className={styles.muted}>
        {t("prefixHint", { example: `${state.subjectCodePrefix}-0001` })}
      </p>
    );
  }

  if (state.exists && !state.assigned) {
    return (
      <div role="status" className={styles.statusBanner}>
        <strong>{t("setup.notAssignedTitle")}</strong>
        <p className={styles.muted}>{t("setup.notAssignedBody")}</p>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div role="status" className={styles.statusBanner}>
        <strong>{t("setup.none")}</strong>
        <p className={styles.muted}>{t("setup.noneForNonManager")}</p>
      </div>
    );
  }

  const valid = SUBJECT_CODE_PREFIX_PATTERN.test(prefix);

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      await createRegister(token, studyId, prefix, studyName.trim() || undefined);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("setup.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.statusBanner}>
      <strong>{t("setup.none")}</strong>
      <p className={styles.muted}>{t("setup.frozenNote")}</p>

      <div className={styles.formRow}>
        <label className={styles.formLabel} htmlFor="reg-prefix">
          {t("setup.prefixLabel")}
        </label>
        <input
          id="reg-prefix"
          className={styles.input}
          value={prefix}
          onChange={(e) => setPrefix(e.target.value.toUpperCase())}
          placeholder={t("setup.prefixPlaceholder")}
        />
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel} htmlFor="reg-name">
          {t("setup.nameLabel")}
        </label>
        <input
          id="reg-name"
          className={styles.input}
          value={studyName}
          onChange={(e) => setStudyName(e.target.value)}
          placeholder={t("setup.namePlaceholder")}
        />
      </div>

      <button
        type="button"
        className={styles.saveButton}
        onClick={() => void onCreate()}
        disabled={!valid || busy}
      >
        {busy ? t("setup.creating") : t("setup.create")}
      </button>

      {prefix !== "" && !valid && <p className={styles.error}>{t("setup.prefixInvalid")}</p>}
      <p className={styles.muted}>{t("setup.autoAssigned")}</p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
