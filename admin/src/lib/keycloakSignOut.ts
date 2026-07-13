/**
 * Shared full sign-out flow, used by both the sidebar's Sign out button and
 * the idle-timeout auto-logout (see useIdleLogout.ts).
 */
import { signOut } from "next-auth/react";
import { env } from "./api";

/**
 * Builds the Keycloak end-session URL used to fully sign out.
 *
 * NextAuth's own signOut only clears the local session — it leaves the
 * Keycloak SSO session alive, so a subsequent login would silently
 * re-authenticate the user without this (next-auth's default redirect
 * callback only allows callbackUrls on the same origin as NEXTAUTH_URL, so
 * passing the Keycloak logout URL as callbackUrl gets silently discarded).
 *
 * Fallbacks guard against NEXT_PUBLIC_* being unset at build time (see
 * env()'s doc comment) — without them a missing var silently produces a
 * broken "/undefined/realms/..." URL instead of a working (if imperfect)
 * redirect.
 *
 * @param currentOrigin - `window.location.origin`, used as the
 *   post-logout-redirect fallback when NEXT_PUBLIC_NEXTAUTH_URL is unset.
 * @returns The absolute Keycloak logout URL.
 */
export function buildKeycloakLogoutUrl(currentOrigin: string): string {
  const keycloakBrowserUrl = env(
    process.env.NEXT_PUBLIC_KEYCLOAK_BROWSER_URL,
    "http://localhost:8080"
  );
  const postLogoutRedirectUri = env(process.env.NEXT_PUBLIC_NEXTAUTH_URL, currentOrigin);
  return `${keycloakBrowserUrl}/realms/hhh/protocol/openid-connect/logout?post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirectUri)}&client_id=hhh-admin`;
}

/**
 * Clears the local NextAuth session, then navigates to Keycloak's
 * end-session endpoint to end the SSO session too. Navigates away from the
 * app, so nothing after this call runs.
 */
export async function signOutOfKeycloak(): Promise<void> {
  await signOut({ redirect: false });
  window.location.href = buildKeycloakLogoutUrl(window.location.origin);
}
