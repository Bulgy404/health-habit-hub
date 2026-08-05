"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import styles from "./sidebar.module.css";

const STORAGE_KEY = "hhh-admin-theme";

/** Inline, render-blocking bootstrap that runs before paint so the saved
 * theme (or system preference) applies immediately — avoids a flash of the
 * wrong theme on load. Injected via <script> in the root layout. */
export const themeBootstrapScript = `
(function () {
  try {
    var saved = localStorage.getItem('${STORAGE_KEY}');
    var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

/**
 * Light/dark theme toggle button for the sidebar footer. Persists the
 * explicit choice so it overrides the OS preference on future visits.
 *
 * @returns The theme toggle button.
 */
export function ThemeToggle({ label }: { label: string }) {
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  function toggle() {
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(STORAGE_KEY, next);
    setIsDark(next === "dark");
  }

  // Avoid rendering an icon that mismatches the pre-hydration bootstrap
  // script's choice for a frame.
  if (isDark === null) return <button className={styles.themeToggle} aria-hidden />;

  return (
    <button onClick={toggle} className={styles.themeToggle} aria-label={label} type="button">
      {/* Fade-in only, not AnimatePresence — see spinner.tsx's SpinnerLabel
          doc comment for why: `mode="wait"` would leave the icon slot blank
          for ~150ms between the old icon's exit and the new one mounting,
          and a true overlapping crossfade needs absolute positioning this
          single icon swap doesn't warrant. */}
      <motion.span
        key={isDark ? "sun" : "moon"}
        style={{ display: "inline-flex" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
      >
        {isDark ? <Sun size={14} strokeWidth={1.75} /> : <Moon size={14} strokeWidth={1.75} />}
      </motion.span>
      {label}
    </button>
  );
}
