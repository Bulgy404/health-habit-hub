"use client";

import { useTranslations } from "next-intl";
import styles from "@/components/admin-page.module.css";

const SUPPORT_EMAIL = "felix.reinsch@tu-dresden.de";
const GITHUB_URL = "https://github.com/Bulgy404/health-habit-hub";

const SECTIONS = ["studies", "participants", "questionnaires", "cuePools", "analytics", "backups"];

/**
 * Curated quick-tips per admin module — not a full manual, just enough to
 * orient a new team member without requiring tribal knowledge.
 */
export default function HelpPage() {
  const t = useTranslations("help");

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("contact.title")}</h2>
        <p>
          {t("contact.body")}{" "}
          <a className={styles.contactLink} href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
        <p>
          {t("contact.repoBody")}{" "}
          <a
            className={styles.contactLink}
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {GITHUB_URL}
          </a>
        </p>
      </div>

      {SECTIONS.map((key) => (
        <div key={key} className={styles.section}>
          <h2 className={styles.sectionTitle}>{t(`${key}.title`)}</h2>
          <p>{t(`${key}.body`)}</p>
        </div>
      ))}
    </div>
  );
}
