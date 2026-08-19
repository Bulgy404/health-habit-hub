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
 * The cue configuration fields for a study group's cueConfig. Entry mode
 * (free text / structured / voice) is configured separately — see the
 * "Entry Mode" card in the Habit Creation tab (donationInputMode +
 * structuredActivityKeys, study- or group-scoped).
 */
export interface CueConfigValue {
  cueCount: "single" | "multi";
  cueSource: "low_quality" | "high_quality" | "self_selected";
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
 * @param showMaxHabits - Show the max-habits selector.
 */
export function CueConfigForm({
  value,
  onChange,
  showMaxHabits = false,
}: {
  value: CueConfigValue;
  onChange: (patch: Partial<CueConfigValue>) => void;
  showMaxHabits?: boolean;
}) {
  const t = useTranslations("cueConfigForm");

  return (
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
          <input
            type="number"
            min={1}
            step={1}
            className={styles.input}
            placeholder={t("unlimitedPublic")}
            value={value.maxHabits ?? ""}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              onChange({
                maxHabits:
                  e.target.value && Number.isFinite(parsed) && parsed >= 1
                    ? Math.floor(parsed)
                    : null,
              });
            }}
          />
          <span className={styles.hint}>{t("maxHabitsHint")}</span>
        </div>
      )}
    </div>
  );
}
