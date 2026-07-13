"use client";

import { signOutOfKeycloak } from "@/lib/keycloakSignOut";
import styles from "./page.module.css";

/**
 * Sign-out button for the access-denied page.
 *
 * Must use the full Keycloak sign-out flow, not a plain link to
 * `/api/auth/signout`: that only clears the local NextAuth session and
 * leaves the Keycloak SSO session alive, so a subsequent "Sign in with
 * Keycloak" silently re-authenticates the same no-permission user via SSO —
 * landing them straight back on this page in an infinite loop.
 */
export function AccessDeniedSignOutButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={signOutOfKeycloak} className={styles.button}>
      {label}
    </button>
  );
}
