/**
 * Shared spring presets for the admin app, matching the values Apple ships
 * in "Designing Fluid Interfaces" (damping ratio + response, not raw
 * duration/easing). Import these into any `motion` component instead of
 * hand-picking bounce/duration per call site.
 */
import type { Transition } from "motion/react";

/** Critically damped — no overshoot. Modals, tab switches, list mutations. */
export const defaultSpring: Transition = {
  type: "spring",
  bounce: 0,
  duration: 0.35,
};

/** Slightly under-damped — the sidebar/mobile drawer, the one existing
 * gesture-adjacent transition in the app. */
export const drawerSpring: Transition = {
  type: "spring",
  bounce: 0,
  duration: 0.3,
};

/** Under-damped, visible overshoot — reserved for motion that continues a
 * gesture that already carried momentum (e.g. the questionnaire drag-reorder
 * drop). Do not use for anything that just appears without a preceding
 * drag/flick. */
export const momentumSpring: Transition = {
  type: "spring",
  bounce: 0.2,
  duration: 0.35,
};
