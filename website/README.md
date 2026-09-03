# Health Habit Hub — Website (`healthhabithub.de`)

Public front door and single source of truth for the project.
[Astro](https://astro.build) site, self-hosted on the same TU Dresden server
as the rest of the stack (via `website/Dockerfile` + the `website` service in
the repo-root `docker-compose.yml`, behind the same Traefik reverse proxy) —
see [`docs/architecture.md`](../docs/architecture.md#public-domains--tls) for
why. Content is decoupled from the app/admin code (own domain, own Docker
image), but the deploy target is the same server.

Most pages are still prerendered like a static site, but the site runs as a
standalone **Node server** (Astro's `@astrojs/node` adapter, `output:
'server'`) rather than pure static output, because the contact form
(`/forschung/`) needs a real server-side endpoint — `src/pages/api/contact.ts`
— to send email. See "Deploy" below for what that changes.

## Structure

```
website/
├─ src/
│  ├─ layouts/Base.astro        # <head>, nav, footer, lang switch, design tokens
│  ├─ components/               # Home / Participants / Research + GrowthGraph, PhoneMock, AppStoreBadges
│  ├─ i18n/ui.ts                # UI string catalog (de/en) + route map + external links
│  ├─ assets/mockups/           # app mockups (copied from docs/assets/mockups)
│  ├─ content/legal/            # GENERATED at build from app/language/* (git-ignored)
│  └─ pages/                    # de at /, en under /en/
└─ scripts/sync-legal.mjs       # copies app/language/<lang>/{imprint,privacy,consent}.md → content/legal
```

## Develop

```bash
cd website
npm install
npm run dev        # runs sync:legal, then astro dev → http://localhost:4321
```

`npm run build` produces `dist/`. Both `dev` and `build` first run
`sync:legal`, which pulls the legal texts from `../app/language/` so the
Impressum / Datenschutz / Einwilligung pages always match the app. If those
source files are missing, a clearly-marked placeholder is written instead.

## Pages

| Route (DE) | Route (EN) | Content |
| --- | --- | --- |
| `/` | `/en/` | Home — intro + participant/researcher fork |
| `/teilnehmen/` | `/en/participate/` | Participants — app-store links, mockups, how-to |
| `/forschung/` | `/en/research/` | Researchers — admin portal, capabilities, architecture |
| `/impressum/` `/datenschutz/` `/einwilligung/` | `/en/legal/{imprint,privacy,consent}/` | Legal (from `app/language/`) |

## Deploy — Docker + Traefik (self-hosted Node server)

Built and served from the repo root, not from inside `website/` — see
`website/Dockerfile`'s multi-stage build (context is the monorepo root,
because `sync:legal` needs `../app/language/` alongside `website/`) and the
`website` service in `docker-compose.yml`.

```bash
docker compose up -d --build website
```

**Runtime, since the Cloudflare→Astro-native contact-form migration:** the
`runner` stage of `website/Dockerfile` is a `node:22-bookworm-slim` image,
not `nginx`. `astro build` (via the `node` adapter, `mode: 'standalone'`)
produces a `dist/server/entry.mjs` that IS the web server — it renders every
page itself (most of them still prerendered/static under the hood) and
additionally serves the live `/api/contact` endpoint. The container's `CMD`
is `node ./dist/server/entry.mjs`, listening on `0.0.0.0:4321` (`HOST`/`PORT`
env vars baked into the image). `docker-compose.yml`'s `website` service maps
its Traefik label and healthcheck to port `4321` accordingly (it used to be
nginx on port `80`).

**Required env vars**, passed into the `website` container by
`docker-compose.yml`'s `environment:` block — reusing the same `SMTP_*`
convention as the api-service and Grafana elsewhere in this compose file:

| Var | Purpose |
| --- | --- |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | defaults to `587` |
| `SMTP_USER` | SMTP auth username |
| `SMTP_PASS` | SMTP auth password |
| `SMTP_FROM` | the `From:` address contact-form mail is sent as |
| `SMTP_STARTTLS` | defaults to `true`; set `false` to disable STARTTLS |

Without these, `/api/contact` responds `500 server_not_configured` instead of
sending mail — the rest of the site is unaffected. Messages are sent to
`felix.reinsch@tu-dresden.de` (hardcoded in `src/pages/api/contact.ts`), with
the submitter's address set as `replyTo`, and a hidden honeypot field is
checked server-side to filter bots.

**Where these vars actually live depends on how you're running the stack:**

- **Local dev** (`npm run dev` inside `website/`): Astro/Vite auto-loads a
  `website/.env` file — since the repo's real secrets live in a single `.env`
  at the monorepo root (used by `docker compose` there), the simplest setup
  is a symlink: `cd website && ln -s ../.env .env`. Note that Vite injects
  `.env` values into `import.meta.env`, not `process.env` — that's why
  `src/pages/api/contact.ts` reads `{ ...import.meta.env, ...process.env }`
  rather than `process.env` alone; that also keeps it working unchanged
  under the production path below, since `import.meta.env.SMTP_*` is always
  `undefined` in a Docker-built bundle (no `.env` file exists in the build
  context there) and `process.env` wins.
- **Production (TU Dresden server, via Portainer):** this stack is deployed
  as a Portainer stack, not a bare `docker compose up` against a `.env` file
  on disk — Portainer keeps its own environment-variable store per stack
  (Stack → Editor → **Environment variables**), separate from any `.env`
  file that might exist in the repo checkout on the server. Running
  `docker compose` directly from an SSH session on that server (e.g. to
  check logs) will show every variable as unset, even though the live
  containers have them — that's expected, not a bug. To add or change an
  env var for production (SMTP creds, `WEBSITE_DOMAIN`, anything else),
  edit it in Portainer's stack environment variables and **redeploy the
  stack** — a plain container restart does not re-read them. After a
  redeploy, `docker exec hhh-website printenv | grep SMTP` (or `docker
  logs hhh-website`) from the server confirms what the running container
  actually has.

Traefik routes `WEBSITE_DOMAIN` (and `www.$WEBSITE_DOMAIN`) to it and requests
its own Let's Encrypt certificate automatically (TLS-ALPN-01 — needs port 443
reachable, no DNS-provider API access). See
[`DEPLOYMENT.md`](../DEPLOYMENT.md#2-dns-configuration) for the full
checklist and [`docs/runbook.md`](../docs/runbook.md) for the
empty-`WEBSITE_DOMAIN` gotcha if the cert doesn't come up.

An earlier plan hosted this on Cloudflare Pages/Workers under
`healthhabithub.de` — abandoned because that domain's DNS provider won't
allow its nameservers to be delegated to Cloudflare while they remain zone
administrator (a provider policy, not a `.de`-wide restriction), and
Cloudflare Registrar doesn't support `.de` domains at all. A later, brief
iteration used a Cloudflare Pages *Function* for the contact form while the
rest of the site stayed self-hosted; that was superseded by the Astro-native
endpoint described above, and the leftover `website/functions/` directory has
since been **removed**. Nothing in this repo targets Cloudflare any more.
Self-hosting the whole site, contact form included, sidesteps the DNS problem
entirely: it only needs an ordinary `A`/`CNAME` record, which that provider
does allow editing.

## DNS for `healthhabithub.de`

1. Ordinary `A` record: apex → the TU Dresden server's IP (see
   `DEPLOYMENT.md` for the current value).
2. `CNAME www → healthhabithub.de` (or a second `A` record to the same IP) —
   Traefik matches both hostnames to the same service, no separate redirect
   needed.
3. Nameservers stay with the existing DNS provider — do **not** change them;
   only these two web-facing records point at the new server. Email
   (MX/SPF/DKIM) records for this domain are unrelated and untouched.

## Before go-live

- Fill in the real responsible-party details in `app/language/*/imprint.md`.
- Confirm the App Store link and add the Google Play URL in `src/i18n/ui.ts`
  (`links.playStore`) once Android ships; the badge flips from "coming soon"
  automatically when a URL is present (wire-up is a one-line change).
- Decide on analytics (Plausible / none).

## Adding a language

Add the locale to `astro.config.mjs`, add its dictionary + route entries in
`src/i18n/ui.ts`, add it to `LANGS` in `scripts/sync-legal.mjs`, and create the
thin page wrappers under `src/pages/<lang>/`.
