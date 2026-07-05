/**
 * Shared locale configuration for the admin panel's i18n.
 *
 * The admin panel uses a cookie-based locale (no URL prefixing, e.g. no
 * `/de/studies`) since this is an internal tool, not a public/SEO-facing
 * site — a language switch just needs to re-render the current page in the
 * other language, not change its URL.
 */

export const locales = ["en", "de"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

/** Resolves a locale from a cookie value, falling back to Accept-Language, then the default. */
export function resolveLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null | undefined
): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  if (acceptLanguage?.toLowerCase().includes("de")) return "de";
  return defaultLocale;
}
