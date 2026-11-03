"use client";
import { useTranslations } from "next-intl";
import styles from "./admin-page.module.css";
export function ResourceStudySelect({
  scope,
}: {
  scope: {
    studyId: string;
    setStudyId: (id: string) => void;
    studies: { id: string; name: string }[];
    error: string;
  };
}) {
  const t = useTranslations("researchWorkspace");
  return (
    <div className={styles.section}>
      <label className={styles.filterGroup}>
        <span className={styles.filterLabel}>{t("study")}</span>
        <select
          className={styles.select}
          value={scope.studyId}
          onChange={(e) => scope.setStudyId(e.target.value)}
        >
          <option value="">{t("allStudies")}</option>
          {scope.studies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.muted}>{t("resourceHelp")}</p>
      {scope.error && (
        <p role="alert" className={styles.error}>
          {scope.error}
        </p>
      )}
    </div>
  );
}
