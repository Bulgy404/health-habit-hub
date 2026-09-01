# Health Habit Hub — Website (`healthhabithub.de`)

Public front door and single source of truth for the project. Static
[Astro](https://astro.build) site, deployed on **Cloudflare Pages**, fully
decoupled from the research stack on the TU Dresden server.

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

## Deploy — Cloudflare Pages

1. **Connect the repo** in Cloudflare Pages.
2. **Build settings:** Root directory `website`, Build command `npm run build`,
   Output directory `dist`.
3. Every push to `main` deploys; pull requests get preview URLs.

## DNS for `healthhabithub.de`

1. Add the site to Cloudflare and move the domain's nameservers to Cloudflare
   (or add the CNAME Pages provides). TLS is issued automatically.
2. Redirect `www.healthhabithub.de` → apex.
3. (Optional) 301 `felixreinsch.de/healthhabithub` → `https://healthhabithub.de`.

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
