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
  label_fr?: string;
  label_nl?: string;
  isDefault: boolean;
}

/**
 * The cue configuration fields shared between a study group's cueConfig and
 * the public default config. `behaviorOptions` is always an explicit array:
 * empty means participants type their own habit in free text; non-empty
 * means they pick from exactly those catalog entries. There is no implicit
 * "null means platform defaults" state any more — that used to mean a group
 * whose admin never touched this tab could silently flip into structured
 * mode (with every isDefault-flagged catalog entry enabled) the moment they
 * saved the tab for an unrelated reason (e.g. the onboarding toggle below).
 */
export interface CueConfigValue {
  cueCount: "single" | "multi";
  cueSource: "low_quality" | "high_quality" | "self_selected";
  behaviorOptions: string[];
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
 * @param showBehaviors - Show the habit-entry-mode toggle and, when structured, the allowed-behaviors checkboxes.
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
  const enabledKeys = value.behaviorOptions;
  const mode: "freeText" | "structured" = enabledKeys.length > 0 ? "structured" : "freeText";

  function toggleBehavior(key: string) {
    const next = enabledKeys.includes(key)
      ? enabledKeys.filter((k) => k !== key)
      : [...enabledKeys, key];
    onChange({ behaviorOptions: next });
  }

  function setMode(next: "freeText" | "structured") {
    if (next === "freeText") {
      onChange({ behaviorOptions: [] });
    } else if (enabledKeys.length === 0) {
      // Prefill with the platform defaults as a starting point the admin
      // can then adjust, rather than switching to an empty (and therefore
      // still-free-text-behaving) structured list.
      onChange({ behaviorOptions: defaultKeys });
    }
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
          <label className={styles.label}>{t("habitEntryMode")}</label>
          <span className={styles.hint}>{t("habitEntryModeHint")}</span>
          <div className={styles.behaviorCheckboxes}>
            <label className={styles.checkboxLabel}>
              <input
                type="radio"
                name="habit-entry-mode"
                checked={mode === "freeText"}
                onChange={() => setMode("freeText")}
              />
              {t("freeTextMode")}
            </label>
            <label className={styles.checkboxLabel}>
              <input
                type="radio"
                name="habit-entry-mode"
                checked={mode === "structured"}
                onChange={() => setMode("structured")}
              />
              {t("structuredMode")}
            </label>
          </div>

          {mode === "structured" && (
            <>
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
                {activityTypes.length === 0 && (
                  <span className={styles.hint}>{t("noActivityTypes")}</span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
