"use client";

import type { ReactNode } from "react";
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
 * Shared cue-configuration form used by the Public App settings page and the
 * per-group Cue Config tab in the Studies modal, so both audiences are edited
 * with identical fields, labels, and hints.
 *
 * Controlled component: the parent owns the value and persists it.
 *
 * @param value - Current cue configuration.
 * @param onChange - Called with a partial patch when any field changes.
 * @param activityTypes - Platform activity-type catalog (for the behaviors list).
 * @param showMaxHabits - Show the max-habits selector (study groups only).
 * @param showBehaviors - Show the allowed-behaviors checkboxes.
 * @param extraFields - Optional extra form fields rendered inside the grid
 *   (e.g. the public default reminder time).
 */
export function CueConfigForm({
  value,
  onChange,
  activityTypes,
  showMaxHabits = false,
  showBehaviors = true,
  extraFields,
}: {
  value: CueConfigValue;
  onChange: (patch: Partial<CueConfigValue>) => void;
  activityTypes: ActivityTypeEntry[];
  showMaxHabits?: boolean;
  showBehaviors?: boolean;
  extraFields?: ReactNode;
}) {
  const defaultKeys = activityTypes
    .filter((a) => a.isDefault)
    .map((a) => a.key);
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
          <label className={styles.label}>Cue count</label>
          <select
            className={styles.select}
            value={value.cueCount}
            onChange={(e) =>
              onChange({ cueCount: e.target.value as CueConfigValue["cueCount"] })
            }
          >
            <option value="single">Single cue</option>
            <option value="multi">Multi-cue (recommended)</option>
          </select>
          <span className={styles.hint}>
            Single: one cue per habit-formation session. Multi: several cues
            presented together.
          </span>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Cue source</label>
          <select
            className={styles.select}
            value={value.cueSource}
            onChange={(e) =>
              onChange({
                cueSource: e.target.value as CueConfigValue["cueSource"],
              })
            }
          >
            <option value="high_quality">High quality (pre-rated)</option>
            <option value="low_quality">Low quality (pre-rated)</option>
            <option value="self_selected">Self-selected</option>
          </select>
          <span className={styles.hint}>
            How cues are sourced — pre-rated from the cue pool library, or
            chosen by the participant themselves.
          </span>
        </div>

        {showMaxHabits && (
          <div className={styles.formGroup}>
            <label className={styles.label}>Max habits</label>
            <select
              className={styles.select}
              value={value.maxHabits ?? ""}
              onChange={(e) =>
                onChange({
                  maxHabits: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">Unlimited (public)</option>
              <option value="1">1 (study participant)</option>
            </select>
            <span className={styles.hint}>
              Caps how many habits a participant can create. Use &quot;1&quot;
              for single-habit study designs.
            </span>
          </div>
        )}

        {extraFields}
      </div>

      {showBehaviors && (
        <div className={`${styles.formGroup} ${styles.behaviorsGroup}`}>
          <label className={styles.label}>Allowed behaviors</label>
          <span className={styles.hint}>
            Which activity types participants can choose from. Manage the
            catalog under <strong>Configuration → Activity Types</strong>.
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
                {a.isDefault && <span className={styles.defaultTag}>(default)</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
