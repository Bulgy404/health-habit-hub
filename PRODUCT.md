# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two primary audiences, served by different surfaces:

- **Participants** (public, mobile app): people building health habits day to day. Motivated by a simple, low-friction self-tracking tool; anonymous, passphrase-only accounts; minimal onboarding (README: "no dense onboarding, no lengthy signup, just a quick promise and a way in").
- **Researchers and admins** (admin/researcher portal): the TU Dresden Digital Health Research Group and collaborators running the "HabConnect – from Habit to Health" study. They configure studies and questionnaires, curate the shared knowledge base, monitor participant progress, and export data, without touching a database directly.

## Product Purpose

Health Habit Hub is, by its own description, "a research data collection and analysis tool disguised as a personal health app." Participants donate everyday habits and profile data through the mobile app; the system classifies and organises those habits into a knowledge graph (BCIO-ontology mapped); an LLM/RAG layer turns that structured data into evidence-grounded, personalised recommendations back to participants. The intended flywheel: better participation → richer graph → better recommendations → more participation, in service of real behavioural-science research (SRHI/automaticity tracking, implementation intentions, a DFG longitudinal study module).

## Positioning

Combines mobile habit donation, questionnaire-based profiling, ontology-based semantic enrichment, graph-based research infrastructure (Neo4j), and RAG-supported recommendation generation into one integrated platform. Most consumer habit-tracking apps collect data nobody learns from; most behavioural research never reaches a real app that people actually use daily. This platform is built specifically to be both at once, which is its core differentiator.

## Operating Context

- Institutional home: TU Dresden, Digital Health Research Group. The "HabConnect – from Habit to Health" study protocol was submitted to the TU Dresden ethics committee (13 May 2025, no objections) and its data-protection concept was assessed by the TU Dresden Data Protection Officer (28 March 2025, ref. 0543-025/001, no objections).
- Three live design surfaces: the mobile app (Flutter, iOS/Android/Web) for participants; the admin/researcher portal (Next.js) for study and knowledge-base management; the public marketing site (Astro, healthhabithub.de) as the front door, which forks into a participant path and a researcher path.
- Self-hosted infrastructure behind Traefik on TU Dresden servers (MongoDB, Neo4j, Keycloak, LightRAG, Redis, PostgreSQL for Keycloak). No third-party analytics or ad SDKs.
- Bilingual (DE/EN) throughout the public site; the app and portal are DE/EN-facing too.
- The operational app/portal lives at habit.wiwi.tu-dresden.de; the public marketing/info site is the separate healthhabithub.de.

## Capabilities and Constraints

- Anonymous, passphrase-based accounts only, no name, email, or phone number collected. First-party Keycloak OIDC; no social login.
- Participants can permanently delete their account and all server-side data at any time.
- AI-generated habit recommendations always carry a visible "not medical advice" disclaimer.
- Community comments on shared habits are anonymous, auto-moderated, individually reportable, and can be turned off entirely by the participant.
- Push notifications are optional; all functionality works with them denied.
- GDPR/DSGVO-first by construction: data stays on European (TU Dresden) infrastructure; no tracking or advertising SDKs.
- Three roles: `user` (participant), `researcher` (studies, questionnaires, cue pools, analytics, exports, notification campaigns), `admin` (all of the above plus participant management, knowledge base, platform settings).

## Brand Commitments

- Name: Health Habit Hub. Public domain healthhabithub.de is deliberately distinct from the operational app/portal at habit.wiwi.tu-dresden.de.
- Logo mark: a simple heart glyph inside a rounded gradient tile.
- The marketing site (`website/`) has an established, already-approved visual identity as of 2026-08-31: Figtree (body) + Fraunces (headings), green as the participant accent and orange as the researcher accent (swapped per-subtree via a `.rtheme` scope), soft editorial cards, generous whitespace, no em dashes in copy. Treat this as incumbent, not greenfield, for any future work on that surface.

## Evidence on Hand

- Real product screenshots exist at `docs/assets/mockups/` (admin dashboard, mobile homepage, habit tracking, shared habit graph, recommendations, SRHI/automaticity charts) and are already reused on the marketing site.
- Real legal content (Impressum, Datenschutz, Einwilligung, Barrierefreiheit) is generated at build time from `app/language/*`, already authored in DE/EN.
- No customer testimonials, press mentions, or case studies exist. Do not fabricate any.
- A live Apple App Store listing exists; Google Play does not yet, the site's badge shows "coming soon" until a URL is set in `website/src/i18n/ui.ts`.

## Product Principles

- Evidence over invention: never fabricate testimonials, benchmarks, or false precision (habit examples, stats); mark illustrative content as illustrative rather than presenting it as real data.
- Two audiences, one respectful platform: participant-facing work stays calm and low-friction; researcher-facing work stays precise and can tolerate more information density, without either side fully adopting the other's visual language (hence the deliberate green/orange split rather than a full re-skin).
- Privacy and consent are product features, not fine print: surface GDPR/DSGVO compliance, anonymous accounts, deletion rights, and AI disclaimers plainly rather than burying them.
- Bilingual by default: new participant- or researcher-facing surfaces ship DE and EN together, not DE now and EN later.

## Accessibility & Inclusion

A dedicated Barrierefreiheit (accessibility) legal page exists on the public site, indicating accessibility is a stated, ongoing commitment rather than an afterthought, plausibly tied to German/EU accessibility expectations (BITV/EAA) given the TU Dresden institutional context. No specific WCAG conformance level or audit result is recorded yet; treat this as a real, open commitment rather than a claimed conformance level.
