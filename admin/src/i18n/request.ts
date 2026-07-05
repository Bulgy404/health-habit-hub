import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, resolveLocale } from "@/lib/locale";

// No `next-intl` routing/middleware is used — the locale is resolved directly
// from the `NEXT_LOCALE` cookie (falling back to Accept-Language) since the
// admin panel doesn't prefix URLs by locale. See src/lib/locale.ts.
export default getRequestConfig(async () => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerList.get("accept-language")
  );

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
