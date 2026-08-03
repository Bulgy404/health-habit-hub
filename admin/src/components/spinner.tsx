import styles from "./spinner.module.css";

/**
 * The one common "in progress" indicator for save/upload/create buttons
 * across the admin app — a small white ring, sized to sit inline inside a
 * button's label (button backgrounds are always a solid brand color, so a
 * white ring reads clearly in both light and dark mode without its own
 * theme handling).
 */
export function Spinner({ label }: { label?: string }) {
  return <span className={styles.spinner} role="status" aria-label={label ?? "Loading"} />;
}
