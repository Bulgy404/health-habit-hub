# Health Habit Hub — Website (`healthhabithub.de`)

Public front door and single source of truth for the project. Static
[Astro](https://astro.build) site, self-hosted on the same TU Dresden server
as the rest of the stack (via `website/Dockerfile` + the `website` service in
the repo-root `docker-compose.yml`, behind the same Traefik reverse proxy) —
see [`docs/architecture.md`](../docs/architecture.md#public-domains--tls) for
why. Content is decoupled from the app/admin code (own domain, own Docker
image), but the deploy target is the same server.

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

## Deploy — Docker + Traefik (self-hosted)

Built and served from the repo root, not from inside `website/` — see
`website/Dockerfile`'s multi-stage build (context is the monorepo root,
because `sync:legal` needs `../app/language/` alongside `website/`) and the
`website` service in `docker-compose.yml`.

```bash
docker compose up -d --build website
```

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
Cloudflare Registrar doesn't support `.de` domains at all. Self-hosting here
sidesteps that entirely: it only needs an ordinary `A`/`CNAME` record, which
that provider does allow editing.

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
