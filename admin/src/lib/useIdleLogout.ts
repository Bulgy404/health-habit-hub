"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { signOutOfKeycloak } from "./keycloakSignOut";

/** Signs the admin out after this long with no mouse/keyboard/touch activity. */
export const IDLE_LOGOUT_MS = 5 * 60 * 1000;

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"] as const;

/**
 * Signs the admin out after {@link IDLE_LOGOUT_MS} of inactivity, so an
 * unattended, still-authenticated session (e.g. a shared workstation) isn't
 * left open indefinitely.
 *
 * Only arms the timer while a session is authenticated — no-op while signed
 * out, and cleans up its own listeners/timer when the session ends or the
 * component unmounts.
 */
export function useIdleLogout(): void {
  const { status } = useSession();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        signOutOfKeycloak();
      }, IDLE_LOGOUT_MS);
    };

    resetTimer();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true });
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, [status]);
}
