import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // The admin panel is served under /admin by Traefik (no strip-prefix), so the
  // app must own that base path — otherwise its routes (including NextAuth's
  // /api/auth/*) resolve at root and escape the /admin routing. Overridable for
  // local/dev where it's hosted at root.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "/admin",
};

export default withNextIntl(nextConfig);
