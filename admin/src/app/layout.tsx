import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Providers } from "@/components/providers";
import { themeBootstrapScript } from "@/components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "HHH Portal",
  description: "Health Habit Hub — Research Portal",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    // suppressHydrationWarning: themeBootstrapScript stamps data-theme on
    // <html> before hydration, so the client attribute set never matches the
    // server-rendered markup — that's expected, not a bug.
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line react/no-danger -- static script, no user input */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
