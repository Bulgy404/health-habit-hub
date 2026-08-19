"use client";

import { useTranslations } from "next-intl";
import { ToggleSwitch } from "@/components/toggle-switch";
import styles from "./cue-config-form.module.css";
import type { ActivityTypeEntry } from "./cue-config-form";

/**
 * Checkbox list over the activity_types catalog. Rendered wherever the
 * unified Entry Mode (Studies → Habit Creation tab) is set to "structured" —
 * the New Habit wizard and the community donation flow both offer exactly
 * this set of catalog entries, so this list is shared between both.
 */
export function StructuredActivityKeysForm({
  selectedKeys,
  onChange,
  activityTypes,
}: {
  selectedKeys: string[];
  onChange: (keys: string[]) => void;
  activityTypes: ActivityTypeEntry[];
}) {
  const t = useTranslations("cueConfigForm");
  // Keys the study still lists but that no longer exist in the catalog (e.g.
  // deleted after being assigned). Not rendered by the activityTypes.map
  // below, so surface them separately — otherwise an admin has no way to see
  // or uncheck them, even though resolveHabitConfig still resolves them
  // (falling back to the raw key as the label) at runtime.
  const orphanedKeys = selectedKeys.filter(
    (key) => !activityTypes.some((a) => a.key === key)
  );

  function toggleKey(key: string) {
    const next = selectedKeys.includes(key)
      ? selectedKeys.filter((k) => k !== key)
      : [...selectedKeys, key];
    onChange(next);
  }

  return (
    <div className={`${styles.formGroup} ${styles.behaviorsGroup}`}>
      <span className={styles.hint}>
        {t.rich("allowedBehaviorsHint", { strong: (chunks) => <strong>{chunks}</strong> })}
      </span>
      {selectedKeys.length === 0 && (
        <span className={styles.warningMsg}>{t("emptySelectionWarning")}</span>
      )}
      <div className={styles.behaviorCheckboxes}>
        {activityTypes.map((a) => (
          <ToggleSwitch
            key={a.key}
            className={styles.checkboxLabel}
            checked={selectedKeys.includes(a.key)}
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
    </div>
  );
}
