/**
 * Shared full sign-out flow, used by both the sidebar's Sign out button and
 * the idle-timeout auto-logout (see useIdleLogout.ts).
 */
import { getSession, signOut } from "next-auth/react";
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
 * @param idTokenHint - the session's Keycloak ID token, if available. Per
 *   the OIDC RP-Initiated Logout spec, omitting this makes Keycloak show its
 *   own "do you want to logout?" confirmation page instead of logging out
 *   silently — and submitting that confirmation page has been observed to
 *   500 (logout/logout-confirm) when the idle-triggered logout races the
 *   Keycloak session's own expiry. Passing the hint skips that page (and
 *   the bug) entirely.
 * @returns The absolute Keycloak logout URL.
 */
export function buildKeycloakLogoutUrl(currentOrigin: string, idTokenHint?: string): string {
  const keycloakBrowserUrl = env(
    process.env.NEXT_PUBLIC_KEYCLOAK_BROWSER_URL,
    "http://localhost:8080"
  );
  const postLogoutRedirectUri = env(process.env.NEXT_PUBLIC_NEXTAUTH_URL, currentOrigin);
  const params = new URLSearchParams({
    post_logout_redirect_uri: postLogoutRedirectUri,
    client_id: "hhh-admin",
  });
  if (idTokenHint) params.set("id_token_hint", idTokenHint);
  return `${keycloakBrowserUrl}/realms/hhh/protocol/openid-connect/logout?${params.toString()}`;
}

/**
 * Clears the local NextAuth session, then navigates to Keycloak's
 * end-session endpoint to end the SSO session too. Navigates away from the
 * app, so nothing after this call runs.
 */
export async function signOutOfKeycloak(): Promise<void> {
  // Must read the session before signOut() clears it — that's the only
  // place the ID token needed for id_token_hint is available.
  const session = await getSession();
  await signOut({ redirect: false });
  window.location.href = buildKeycloakLogoutUrl(window.location.origin, session?.idToken);
}
