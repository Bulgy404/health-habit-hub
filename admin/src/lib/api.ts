/**
 * Shared API helpers for the admin portal.
 *
 * All admin pages talk to the backend REST API with a bearer token from the
 * NextAuth session. This module centralises the base-URL resolution and the
 * authenticated JSON fetch that every page previously re-declared.
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

/**
 * Build a full API URL from a path relative to the API base.
 *
 * @param path - Path starting with a slash, e.g. `/admin/settings`.
 * @returns The absolute URL.
 */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

/**
 * Force NextAuth to refresh the session and return the current access token.
 *
 * Calling `getSession()` hits `/api/auth/session`, which runs the NextAuth
 * `jwt` callback server-side — that callback re-issues the Keycloak access
 * token when the old one has expired (see `lib/auth.ts`). We use this to
 * recover from a 401 caused by an access token that lapsed while the tab
 * stayed open, without forcing the user to reload the page.
 *
 * @returns The refreshed access token, or `null` if refresh is impossible
 *   (no browser, no session, or the refresh token itself has expired — in
 *   which case `SessionGuard` redirects the user to sign in).
 */
async function refreshSessionToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  // Imported lazily so this module stays free of a static next-auth/react
  // dependency (it also exports the SSR-safe apiUrl/API_BASE_URL helpers).
  const { getSession } = await import("next-auth/react");
  const session = await getSession();
  if (!session || (session as { error?: string }).error) return null;
  return (session as { accessToken?: string }).accessToken ?? null;
}

/**
 * Perform an authenticated fetch, transparently recovering from an expired
 * access token: on a 401 it refreshes the session once and retries with the
 * fresh token. The `Authorization` header is applied here (not by callers) so
 * the retry can swap in the new bearer.
 */
async function fetchWithRefresh(
  url: string,
  token: string,
  opts: RequestInit,
): Promise<Response> {
  const send = (bearer: string) =>
    fetch(url, {
      ...opts,
      headers: { ...(opts.headers ?? {}), Authorization: `Bearer ${bearer}` },
    });

  const res = await send(token);
  if (res.status !== 401) return res;

  const fresh = await refreshSessionToken();
  // Only retry if we actually got a *different* token — otherwise the 401 is a
  // genuine authorization failure (revoked role, forbidden resource), not an
  // expiry we can recover from, and retrying would just loop.
  if (!fresh || fresh === token) return res;
  return send(fresh);
}

/**
 * Authenticated JSON fetch helper.
 *
 * @param url - The full URL to fetch (use {@link apiUrl} to build it).
 * @param token - The NextAuth session access token.
 * @param opts - Additional fetch options.
 * @returns The parsed JSON response body.
 * @throws {Error} If the response status is not 2xx.
 */
export async function apiFetch(url: string, token: string, opts: RequestInit = {}) {
  const res = await fetchWithRefresh(url, token, {
    // Always hit the network so admin metrics refresh on reload rather than
    // serving a stale cached response.
    cache: "no-store",
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Authenticated multipart file upload. Separate from {@link apiFetch} because
 * that helper always forces `Content-Type: application/json`, which breaks a
 * `FormData` body — the browser needs to set its own multipart boundary.
 *
 * @param url - The full URL to upload to (use {@link apiUrl} to build it).
 * @param token - The NextAuth session access token.
 * @param file - The file to upload.
 * @returns The parsed JSON response body.
 * @throws {Error} If the response status is not 2xx.
 */
export async function apiUpload(url: string, token: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  // No Content-Type header: the browser sets multipart boundary itself.
  // fetchWithRefresh adds Authorization (and retries once on a 401).
  const res = await fetchWithRefresh(url, token, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}
