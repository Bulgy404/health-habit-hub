/**
 * Shared API helpers for the admin portal.
 *
 * All admin pages talk to the backend REST API with a bearer token from the
 * NextAuth session. This module centralises the base-URL resolution and the
 * authenticated JSON fetch that every page previously re-declared.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

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
 * Authenticated JSON fetch helper.
 *
 * @param url - The full URL to fetch (use {@link apiUrl} to build it).
 * @param token - The NextAuth session access token.
 * @param opts - Additional fetch options.
 * @returns The parsed JSON response body.
 * @throws {Error} If the response status is not 2xx.
 */
export async function apiFetch(
  url: string,
  token: string,
  opts: RequestInit = {}
) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}
