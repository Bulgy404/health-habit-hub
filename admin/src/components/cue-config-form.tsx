"use client";

import { useTranslations } from "next-intl";
import styles from "./cue-config-form.module.css";

/**
 * One entry in the platform-wide activity-type catalog
 * (GET /api/v1/admin/activity-types).
 */
export interface ActivityTypeEntry {
  key: string;
  label_en: string;
  label_de?: string;
  isDefault: boolean;
}

/**
 * The cue configuration fields shared between a study group's cueConfig and
 * the public default config. `behaviorOptions: null` means "use the platform
 * default activity types".
 */
export interface CueConfigValue {
  cueCount: "single" | "multi";
  cueSource: "low_quality" | "high_quality" | "self_selected";
  behaviorOptions: string[] | null;
  maxHabits: number | null;
}

/**
 * Cue-configuration form for a study group (Studies → Cue Config tab).
 * Public users are not configured here — they create habits with free-text
 * entry, so cue configuration exists only per study group.
 *
 * Controlled component: the parent owns the value and persists it.
 *
 * @param value - Current cue configuration.
 * @param onChange - Called with a partial patch when any field changes.
 * @param activityTypes - Platform activity-type catalog (for the behaviors list).
 * @param showMaxHabits - Show the max-habits selector.
 * @param showBehaviors - Show the allowed-behaviors checkboxes.
 */
export function CueConfigForm({
  value,
  onChange,
  activityTypes,
  showMaxHabits = false,
  showBehaviors = true,
}: {
  value: CueConfigValue;
  onChange: (patch: Partial<CueConfigValue>) => void;
  activityTypes: ActivityTypeEntry[];
  showMaxHabits?: boolean;
  showBehaviors?: boolean;
}) {
  const t = useTranslations("cueConfigForm");
  const defaultKeys = activityTypes.filter((a) => a.isDefault).map((a) => a.key);
  const enabledKeys = value.behaviorOptions ?? defaultKeys;

  function toggleBehavior(key: string) {
    const next = enabledKeys.includes(key)
      ? enabledKeys.filter((k) => k !== key)
      : [...enabledKeys, key];
    onChange({ behaviorOptions: next });
  }

  return (
    <>
      <div className={styles.formGrid}>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t("cueCount")}</label>
          <select
            className={styles.select}
            value={value.cueCount}
            onChange={(e) => onChange({ cueCount: e.target.value as CueConfigValue["cueCount"] })}
          >
            <option value="single">{t("singleCue")}</option>
            <option value="multi">{t("multiCue")}</option>
          </select>
          <span className={styles.hint}>{t("cueCountHint")}</span>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>{t("cueSource")}</label>
          <select
            className={styles.select}
            value={value.cueSource}
            onChange={(e) =>
              onChange({
                cueSource: e.target.value as CueConfigValue["cueSource"],
              })
            }
          >
            <option value="high_quality">{t("highQuality")}</option>
            <option value="low_quality">{t("lowQuality")}</option>
            <option value="self_selected">{t("selfSelected")}</option>
          </select>
          <span className={styles.hint}>{t("cueSourceHint")}</span>
        </div>

        {showMaxHabits && (
          <div className={styles.formGroup}>
            <label className={styles.label}>{t("maxHabits")}</label>
            <select
              className={styles.select}
              value={value.maxHabits ?? ""}
              onChange={(e) =>
                onChange({
                  maxHabits: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">{t("unlimitedPublic")}</option>
              <option value="1">{t("oneStudyParticipant")}</option>
            </select>
            <span className={styles.hint}>{t("maxHabitsHint")}</span>
          </div>
        )}
      </div>

      {showBehaviors && (
        <div className={`${styles.formGroup} ${styles.behaviorsGroup}`}>
          <label className={styles.label}>{t("allowedBehaviors")}</label>
          <span className={styles.hint}>
            {t.rich("allowedBehaviorsHint", { strong: (chunks) => <strong>{chunks}</strong> })}
          </span>
          <div className={styles.behaviorCheckboxes}>
            {activityTypes.map((a) => (
              <label key={a.key} className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={enabledKeys.includes(a.key)}
                  onChange={() => toggleBehavior(a.key)}
                />
                {a.label_en}
                {a.isDefault && <span className={styles.defaultTag}>{t("defaultTag")}</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
