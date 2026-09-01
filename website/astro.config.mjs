import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// healthhabithub.de — self-hosted on the TU Dresden server via Docker +
// Traefik (see website/Dockerfile, docker-compose.yml "website" service, and
// this repo's README.md "Deploy" section for the full picture). Runs as a
// standalone Node server (Astro's node adapter) rather than pure static
// output, so /api/contact can send real email server-side.
export default defineConfig({
  site: 'https://healthhabithub.de',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  i18n: {
    defaultLocale: 'de',
    locales: ['de', 'en'],
    routing: { prefixDefaultLocale: false },
  },
  build: { format: 'directory' },
});
