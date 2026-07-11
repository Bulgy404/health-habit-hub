"use client";

import { useTranslations } from "next-intl";
import { ToggleSwitch } from "@/components/toggle-switch";
import styles from "./cue-config-form.module.css";
import type { ActivityTypeEntry } from "./cue-config-form";

export interface HabitEntryModeValue {
  habitEntryMode: "freeText" | "structured";
  structuredActivityKeys: string[];
}

/**
 * Study-wide habit-entry-mode toggle (Studies → Details tab). Off (the
 * default) means participants type their own habit in free text; on means
 * the new-habit screen shows a picker over exactly the selected activity
 * types instead. Applies to every group in the study — unlike cueConfig,
 * which is still configured per group in the Cue Config tab.
 */
export function HabitEntryModeForm({
  value,
  onChange,
  activityTypes,
}: {
  value: HabitEntryModeValue;
  onChange: (patch: Partial<HabitEntryModeValue>) => void;
  activityTypes: ActivityTypeEntry[];
}) {
  const t = useTranslations("cueConfigForm");
  const structured = value.habitEntryMode === "structured";
  // Keys the study still lists but that no longer exist in the catalog (e.g.
  // deleted after being assigned). Not rendered by the activityTypes.map
  // below, so surface them separately — otherwise an admin has no way to see
  // or uncheck them, even though resolveHabitConfig still resolves them
  // (falling back to the raw key as the label) at runtime.
  const orphanedKeys = value.structuredActivityKeys.filter(
    (key) => !activityTypes.some((a) => a.key === key)
  );

  function toggleKey(key: string) {
    const next = value.structuredActivityKeys.includes(key)
      ? value.structuredActivityKeys.filter((k) => k !== key)
      : [...value.structuredActivityKeys, key];
    onChange({ structuredActivityKeys: next });
  }

  return (
    <div className={`${styles.formGroup} ${styles.behaviorsGroup}`}>
      <ToggleSwitch
        className={styles.checkboxLabel}
        checked={structured}
        onChange={(e) =>
          onChange({ habitEntryMode: e.target.checked ? "structured" : "freeText" })
        }
        label={t("habitEntryMode")}
      />
      <span className={styles.hint}>{t("habitEntryModeHint")}</span>

      {structured && (
        <>
          <span className={styles.hint}>
            {t.rich("allowedBehaviorsHint", { strong: (chunks) => <strong>{chunks}</strong> })}
          </span>
          {value.structuredActivityKeys.length === 0 && (
            <span className={styles.warningMsg}>{t("emptySelectionWarning")}</span>
          )}
          <div className={styles.behaviorCheckboxes}>
            {activityTypes.map((a) => (
              <ToggleSwitch
                key={a.key}
                className={styles.checkboxLabel}
                checked={value.structuredActivityKeys.includes(a.key)}
                onChange={() => toggleKey(a.key)}
                label={
                  <>
                    {a.label_en}
                    {a.isDefault && <span className={styles.defaultTag}>{t("defaultTag")}</span>}
                  </>
                }
              />
            ))}
            {orphanedKeys.map((key) => (
              <ToggleSwitch
                key={key}
                className={styles.checkboxLabel}
                checked
                onChange={() => toggleKey(key)}
                label={
                  <>
                    {key}
                    <span className={styles.orphanedTag}>{t("orphanedTag")}</span>
                  </>
                }
              />
            ))}
            {activityTypes.length === 0 && orphanedKeys.length === 0 && (
              <span className={styles.hint}>{t("noActivityTypes")}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
