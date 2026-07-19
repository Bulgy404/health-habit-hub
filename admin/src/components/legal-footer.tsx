"use client";

import { useLocale } from "next-intl";
import styles from "./legal-footer.module.css";

/**
 * Persistent footer with links to the public legal pages (privacy, imprint,
 * accessibility). These pages are served by the backend at the site root
 * (`/{locale}/privacy` …), NOT under the admin `/admin` base path — so they use
 * plain <a> tags (Next.js does not prepend basePath to raw anchors) and open in
 * a new tab to preserve the admin session. Labels follow the admin's active
 * locale; the pages themselves also offer an EN/DE switch. Only `en` and `de`
 * legal pages exist, so any other locale falls back to English.
 */
const LABELS: Record<string, { privacy: string; imprint: string; accessibility: string }> = {
  en: { privacy: "Privacy Policy", imprint: "Imprint", accessibility: "Accessibility" },
  de: { privacy: "Datenschutz", imprint: "Impressum", accessibility: "Barrierefreiheit" },
};

export function LegalFooter() {
  const locale = useLocale();
  const lng = locale === "de" ? "de" : "en";
  const labels = LABELS[lng];

  return (
    <footer className={styles.footer}>
      <span className={styles.copy}>
        © {new Date().getFullYear()} TU Dresden · Research Group Digital Health
      </span>
      <nav className={styles.links} aria-label="Legal">
        <a href={`/${lng}/privacy`} target="_blank" rel="noopener noreferrer">
          {labels.privacy}
        </a>
        <a href={`/${lng}/imprint`} target="_blank" rel="noopener noreferrer">
          {labels.imprint}
        </a>
        <a href={`/${lng}/accessibility`} target="_blank" rel="noopener noreferrer">
          {labels.accessibility}
        </a>
      </nav>
    </footer>
  );
}
