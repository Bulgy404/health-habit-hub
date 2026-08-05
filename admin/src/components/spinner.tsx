import { motion } from "motion/react";
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

/**
 * Fades in a button's label/spinner when `loading` flips, instead of the
 * hard content swap every save/create/upload button in the app previously
 * did. `label` is whatever the button would show in its non-loading state
 * (a string, or a further ternary for buttons with more than two states —
 * see call sites).
 *
 * Deliberately not `AnimatePresence`-based. Tried it (`mode="wait"`) and it
 * has a real cost, not just a testing artifact: with `wait`, the incoming
 * side only mounts after the outgoing side's exit animation finishes, so
 * the label is genuinely delayed ~150ms after `loading` flips back to
 * false — confirmed by insights.test.tsx, which found the button still
 * showing the spinner (not "Refresh") after the load had completed. The
 * alternative, a true overlapping crossfade (`mode="sync"`/`"popLayout"`),
 * needs the outgoing/incoming spans absolutely positioned inside a
 * fixed-width wrapper to avoid the button visibly resizing and the two
 * texts rendering side-by-side mid-transition — real complexity to add
 * across this component's ~24 call sites for a small, low-stakes state
 * indicator. The outgoing side is instead removed the instant `loading`
 * flips (ordinary React unmount, correct accessible name immediately);
 * only the incoming side animates in.
 */
export function SpinnerLabel({ loading, label }: { loading: boolean; label: React.ReactNode }) {
  return (
    <motion.span
      key={loading ? "spinner" : "label"}
      style={{ display: "inline-flex", alignItems: "center" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
    >
      {loading ? <Spinner /> : label}
    </motion.span>
  );
}
