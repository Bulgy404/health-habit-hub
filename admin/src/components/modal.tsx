"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { defaultSpring } from "@/lib/motion";
import styles from "./modal.module.css";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number | string;
}

/**
 * Shared modal primitive: one backdrop, a focus trap, ESC-to-close, and a
 * body scroll-lock while open. Replaces the per-page overlay/backdrop combos
 * that previously varied in behaviour (some had no keyboard support at all).
 *
 * The overlay and dialog materialize together on mount (blur + scale + fade,
 * not a flat opacity fade) — see apple-design skill §12. Callers still
 * mount/unmount this conditionally, so only the entrance is animated; an
 * animated exit would require lifting an `AnimatePresence` into every call
 * site and is left as a follow-up.
 *
 * @returns The modal overlay and dialog.
 */
export function Modal({ onClose, children, maxWidth }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  useEffect(() => {
    const node = dialogRef.current;
    const focusable = node?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable ?? node)?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const node = dialogRef.current;
      if (!node) return;
      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <motion.div
      className={styles.overlay}
      data-scrim
      onClick={onClose}
      // backdrop-filter is static, not animated (paint-heavy, not
      // GPU-composited like transform/opacity) — the opacity fade alone
      // still reads as the blur materializing in, since the backdrop
      // effect is invisible until the element's own opacity rises.
      style={{ backdropFilter: "blur(6px)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <motion.div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={defaultSpring}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
