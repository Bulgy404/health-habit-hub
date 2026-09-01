import { defineConfig } from 'astro/config';

// Static site for healthhabithub.de — deployed on Cloudflare Pages.
export default defineConfig({
  site: 'https://healthhabithub.de',
  i18n: {
    defaultLocale: 'de',
    locales: ['de', 'en'],
    routing: { prefixDefaultLocale: false },
  },
  build: { format: 'directory' },
});
