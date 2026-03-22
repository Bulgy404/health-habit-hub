# PRD: Ralph — Senior Developer Review, Improvement & Documentation Audit

## Introduction

Ralph reviews every component of the Health Habit Hub stack from the perspective
of a senior engineer: correctness, consistency, idiomatic style, security,
testability, and maintainability.  After individual component reviews Ralph does
a cross-cutting coherence pass, applies concrete improvements, refreshes all
documentation to reflect the current state of the codebase, and finishes with a
full system audit that serves as the canonical health report for the project.

Each story produces a written findings file **and** applies fixes — review
without action is not done.

---

## Goals

- Every component reviewed by a senior engineer lens with written findings.
- Concrete improvements applied: dead code removed, naming made consistent,
  error handling standardised, tests strengthened.
- All documentation (README, API spec, guides, runbook, architecture, data
  model, manuals, AUDIT.md) reflects the actual codebase state.
- A final AUDIT.md captures overall system health with severity-tagged findings
  and a remediation checklist.

---

## User Stories

---

### US-131: Ralph — senior review of the Flutter mobile app

**Description:** As a team lead, I want Ralph to review the Flutter codebase as a
senior mobile engineer would, so that structural issues, anti-patterns, and
inconsistencies are surfaced before further features land.

**Acceptance Criteria:**
- [ ] Ralph reads every file under `mobile/lib/` and `mobile/test/`.
- [ ] Findings written to `tasks/review-flutter.md` with sections:
  - **Architecture** — widget structure, state management patterns, navigation
  - **Code quality** — naming conventions, dead code, duplicated logic
  - **Error handling** — null safety, exception propagation, user-facing errors
  - **Testing** — coverage gaps, test quality, missing edge cases
  - **Security** — token storage, WebView sandboxing, input validation
  - **i18n readiness** — hardcoded strings, locale handling (pre-US-117)
  - **What is done well** — at least three genuine strengths
  - **Prioritised improvements** — severity tagged Critical / Major / Minor
- [ ] Every finding is tied to a specific file and line range.
- [ ] Report saved and committed.

---

### US-132: Ralph — senior review of the Node.js backend

**Description:** As a team lead, I want Ralph to review the backend as a senior
Node.js engineer would, covering API design, service layer structure, data
access patterns, auth middleware, and test coverage.

**Acceptance Criteria:**
- [ ] Ralph reads every file under `app/` (controllers, routes, services,
  middleware, utils, tests).
- [ ] Findings written to `tasks/review-backend.md` with sections:
  - **API design** — REST consistency, HTTP status codes, request validation,
    response shapes
  - **Service / controller split** — fat controllers, missing service layer
    abstractions
  - **Data access** — Neo4j query patterns, transaction handling, error paths
  - **Auth & security** — JWT verification, Keycloak integration, input
    sanitisation, injection risks
  - **Translation pipeline** — LibreTranslate usage, fallback behaviour,
    tone-refinement hook
  - **Testing** — unit vs integration split, mock quality, missing scenarios
  - **Dependencies** — unused packages, outdated packages, licence issues
  - **What is done well**
  - **Prioritised improvements** (Critical / Major / Minor)
- [ ] Every finding tied to file + line range.
- [ ] Report saved and committed.

---

### US-133: Ralph — senior review of the Neo4j ontology and database layer

**Description:** As a team lead, I want Ralph to review the ontology design,
Cypher queries, n10s configuration, and init scripts as a senior data engineer
would, so that schema inconsistencies and query anti-patterns are caught.

**Acceptance Criteria:**
- [ ] Ralph reads `neo4j/init/`, all Cypher embedded in `app/utils/Neo4jDatabase.js`,
  `app/utils/config.js`, and the OWL/Turtle ontology files if present.
- [ ] Findings written to `tasks/review-neo4j.md` with sections:
  - **Ontology design** — IRI naming conventions, class hierarchy, property
    coverage, missing inverse properties
  - **Cypher quality** — query patterns, missing indexes, Cartesian product
    risks, deprecated syntax (e.g. `EXISTS()`)
  - **n10s configuration** — RDF import settings, namespace mappings,
    correctness of `handleRDFTypes`
  - **Data integrity** — constraints coverage, orphan prevention, missing
    `IF NOT EXISTS` guards
  - **Translation storage** — how original and translated nodes are linked;
    gaps identified in US-127/US-128
  - **What is done well**
  - **Prioritised improvements** (Critical / Major / Minor)
- [ ] Report saved and committed.

---

### US-134: Ralph — senior review of CI/CD pipelines

**Description:** As a team lead, I want Ralph to review every GitHub Actions
workflow as a senior DevOps engineer would, checking for reliability, speed,
security, and correctness.

**Acceptance Criteria:**
- [ ] Ralph reads `.github/workflows/ci.yml` and `.github/workflows/deploy.yml`
  in full.
- [ ] Findings written to `tasks/review-cicd.md` with sections:
  - **Correctness** — jobs that will silently pass when they should fail
  - **Reliability** — flaky health-checks, missing waits, service ordering
    issues (e.g. remaining `cypher-shell` usages per US-125)
  - **Security** — secrets handling, third-party action pinning, least-privilege
    permissions
  - **Speed** — unnecessary sequential steps, missing caching, parallelisation
    opportunities
  - **Coverage** — jobs missing (e.g. no linting for the ontology test shell
    script, no Flutter integration test job)
  - **Action versions** — any actions on non-pinned versions or outdated major
    versions
  - **What is done well**
  - **Prioritised improvements** (Critical / Major / Minor)
- [ ] Report saved and committed.

---

### US-135: Ralph — senior review of Docker and infrastructure configuration

**Description:** As a team lead, I want Ralph to review the Docker Compose
files, Traefik config, env files, and volume/network design as a senior
infrastructure engineer would.

**Acceptance Criteria:**
- [ ] Ralph reads `docker-compose.yml`, `docker-compose.prod.yml`, `.env.example`,
  and any Traefik or Nginx configuration files.
- [ ] Findings written to `tasks/review-infrastructure.md` with sections:
  - **Service configuration** — image pinning, restart policies, resource
    limits, health-check quality
  - **Networking** — exposed ports, network isolation, Traefik routing rules
  - **Secrets management** — env var usage, what is committed vs injected,
    secrets that should not be in `.env.example`
  - **Volumes** — data persistence strategy, backup considerations, permission
    issues (e.g. LibreTranslate UID 1032 noted in prod compose)
  - **Production readiness** — differences between dev and prod compose, missing
    production hardening
  - **What is done well**
  - **Prioritised improvements** (Critical / Major / Minor)
- [ ] Report saved and committed.

---

### US-136: Ralph — cross-component coherence review

**Description:** As a team lead, I want Ralph to review the system as a whole
after the individual component reviews, identifying integration seams,
inconsistencies that only appear across boundaries, and architectural decisions
that should be revisited.

**Acceptance Criteria:**
- [ ] Ralph reads all five individual review reports (US-131 – US-135) and
  cross-references them with the actual code.
- [ ] Findings written to `tasks/review-system-coherence.md` with sections:
  - **API contract alignment** — does the Flutter app consume exactly what the
    backend exposes? Any field name mismatches, missing endpoints, or
    undocumented endpoints?
  - **Auth flow end-to-end** — Keycloak → backend JWT verification → Flutter
    token lifecycle: gaps and inconsistencies
  - **Language/locale consistency** — are locale codes used consistently
    (`'en'`, `'en-US'`, `'en_US'`) across Flutter, backend, LibreTranslate, and
    ontology?
  - **Error message consistency** — do backend error shapes match what the
    Flutter error-handling code expects?
  - **Test strategy coherence** — do unit + integration + ontology tests
    collectively give confidence in the full request lifecycle?
  - **Naming consistency** — entity names across Flutter models, backend
    controllers, Neo4j properties, and API response fields
  - **What is coherent and well-integrated**
  - **Prioritised cross-cutting improvements** (Critical / Major / Minor)
- [ ] Report saved and committed.

---

### US-137: Ralph — apply improvements to the Flutter app

**Description:** As a developer, I want Ralph to implement the Critical and
Major improvements identified in the Flutter review (US-131) and the coherence
review (US-136), so the mobile codebase is cleaner and more maintainable.

**Acceptance Criteria:**
- [ ] Every Critical finding from `tasks/review-flutter.md` resolved or
  explicitly deferred with a written reason.
- [ ] Every Major finding resolved or deferred.
- [ ] Specific improvements applied (drawn from actual review findings; typical
  examples include):
  - Dead code and unused imports removed.
  - Duplicate widget logic extracted into shared components.
  - Consistent error-handling pattern (a single `ErrorBanner` widget or similar)
    used everywhere instead of ad-hoc snackbars.
  - `const` constructors added where missing.
  - Widget files that mix business logic and UI refactored to separate concerns.
- [ ] `flutter analyze` passes with zero warnings.
- [ ] `flutter test --coverage` passes; no existing test broken.
- [ ] `tasks/review-flutter.md` updated with a **Resolution** note per finding.

---

### US-138: Ralph — apply improvements to the Node.js backend

**Description:** As a developer, I want Ralph to implement the Critical and
Major improvements identified in the backend review (US-132) and the coherence
review (US-136).

**Acceptance Criteria:**
- [ ] Every Critical and Major finding from `tasks/review-backend.md` resolved
  or explicitly deferred with a written reason.
- [ ] Specific improvements applied (drawn from actual review findings; typical
  examples include):
  - Fat controller logic moved into service layer.
  - All HTTP responses use a consistent shape
    (`{ data, error, meta }` or similar).
  - Input validation added at every route that currently lacks it.
  - Unused `deeplx` dependency removed (US-126 executed here if not already done).
  - All Cypher strings audited for deprecated syntax and corrected.
  - Missing `try/catch` blocks added around Neo4j calls.
- [ ] `npm run lint` passes.
- [ ] All existing unit and integration tests pass.
- [ ] `tasks/review-backend.md` updated with Resolution notes.

---

### US-139: Ralph — consistency pass across the full codebase

**Description:** As a developer, I want Ralph to make a single focused pass
ensuring naming, patterns, and conventions are consistent across Flutter,
backend, and Neo4j so that the codebase reads as if written by one person.

**Acceptance Criteria:**
- [ ] Entity names are aligned across all layers:
  - Flutter model field names match backend API response field names.
  - Backend field names match Neo4j property names (or explicit mapping is
    documented).
  - Locale codes (`'en'`, `'de'`) are used identically in Flutter, backend,
    LibreTranslate calls, and ontology IRIs.
- [ ] Error response shape is identical across all backend routes
  (`{ error: { code, message } }` or team-agreed alternative).
- [ ] Logging style consistent across backend: same log levels, same structured
  fields.
- [ ] Flutter `pubspec.yaml` dependency versions pinned to exact versions (no
  loose `^` on critical packages).
- [ ] All files pass their respective linters with zero warnings.
- [ ] `tasks/review-system-coherence.md` updated with Resolution notes for all
  naming/consistency findings.

---

### US-140: Ralph — update Flutter and mobile documentation

**Description:** As a new mobile developer, I want the Flutter documentation to
accurately describe the current architecture, setup steps, and test commands, so
I can be productive without asking team members.

**Acceptance Criteria:**
- [ ] `docs/guides/developer-onboarding.md` updated with:
  - Current Flutter version and Dart SDK required.
  - `flutter gen-l10n` step added to setup (after US-117 lands).
  - Correct test commands (`flutter test --coverage`, `flutter analyze`).
  - Description of the WebView-based survey donation flow.
- [ ] `docs/MANUAL-en.md` and `docs/MANUAL-de.md` updated to reflect:
  - The new language toggle in settings (US-121).
  - Any changed screen names or navigation flows.
- [ ] A new `docs/guides/flutter-architecture.md` created describing:
  - Folder structure (`screens/`, `services/`, `models/`, `l10n/`).
  - State management approach.
  - How localisation (ARB / `flutter gen-l10n`) works.
  - How authentication tokens are managed.
- [ ] No documentation references a screen, widget, or command that no longer
  exists.

---

### US-141: Ralph — update backend and API documentation

**Description:** As a backend developer or API consumer, I want the backend docs
and OpenAPI spec to exactly match the current API so I can integrate without
reading source code.

**Acceptance Criteria:**
- [ ] `docs/api/openapi.yaml` updated to include:
  - All routes added in the current branch (habit donations, surveys, admin
    endpoints, users/me language preference per US-120).
  - Correct request/response schemas including `translationEN`, `translationDE`,
    `displayText`, `preferredLanguage` fields.
  - Error response schema consistent with the standard shape adopted in US-138.
- [ ] `docs/api/hhh-postman-collection.json` regenerated or updated to match
  the OpenAPI spec.
- [ ] `README.md` backend section updated with correct `npm` scripts and env var
  list.
- [ ] `docs/data-model.md` updated to reflect the current Neo4j schema including
  `hhh:translationEN`, `hhh:translationDE`, and `hhh:preferredLanguage` on
  Donor nodes.
- [ ] No endpoint documented in OpenAPI that does not exist in the router files.
- [ ] No endpoint present in the router files that is missing from OpenAPI.

---

### US-142: Ralph — update infrastructure and deployment documentation

**Description:** As a DevOps engineer or new team member, I want the deployment
and infrastructure docs to describe exactly how to bring up the system in
development and production.

**Acceptance Criteria:**
- [ ] `DEPLOYMENT.md` updated with:
  - Current Docker Compose service list (including LibreTranslate / h3-translate
    and any services added in this branch).
  - `LT_LOAD_ONLY`, `TRANSLATE_HOST`, `TRANSLATE_PORT` env vars documented.
  - LibreTranslate volume permission note (UID 1032) explained.
  - Step-by-step production bring-up including the backfill migration script
    from US-115.
- [ ] `docs/guides/admin-guide.md` and `docs/guides/admin-guide-de.md` updated
  with the new language setting in the admin/user settings screen.
- [ ] `docs/runbook.md` updated with:
  - Runbook entry for LibreTranslate service down (symptoms, recovery steps,
    fallback behaviour).
  - Runbook entry for Neo4j failed to start (health-check change from US-125).
- [ ] `.env.example` updated to include every env var currently used by the
  application, with a one-line comment explaining each.
- [ ] `CHANGELOG.md` entry added for all changes in this PRD branch.

---

### US-143: Ralph — update architecture documentation

**Description:** As any team member, I want the architecture documentation to
give an accurate high-level picture of how the system components interact, so
that design decisions are clear and onboarding is faster.

**Acceptance Criteria:**
- [ ] `docs/architecture.md` updated or rewritten to include:
  - Current component diagram (can be Mermaid): Flutter ↔ Backend API ↔
    Neo4j / MongoDB ↔ LibreTranslate ↔ Keycloak.
  - Description of the habit donation pipeline end-to-end (Flutter WebView →
    survey submit → backend → LibreTranslate → LLM tone-refinement → Neo4j).
  - Language/localisation flow: how `preferredLanguage` propagates from user
    settings through the API to the Flutter locale.
  - Auth flow: Keycloak token → Flutter → backend JWT middleware.
  - Data storage decision rationale (why Neo4j + RDF, why MongoDB for user
    profiles if applicable).
- [ ] `docs/migration.md` updated with any schema migrations introduced in this
  branch (translationEN/DE fields, preferredLanguage).
- [ ] `AUDIT.md` cleared of stale findings and reserved for the output of
  US-144.
- [ ] `DOCUMENTATION.md` (the doc index) updated to list every file in `docs/`
  with a one-line description.

---

### US-144: Ralph — final system audit

**Description:** As a project owner, I want a comprehensive, authoritative audit
report of the full Health Habit Hub system after all review, improvement, and
documentation work is complete, so I know the true health of the platform and
what remains to be addressed.

**Acceptance Criteria:**
- [ ] Ralph re-reads all five component reviews, the coherence review, and the
  current state of the codebase after all improvements have been applied.
- [ ] `AUDIT.md` written (overwriting the stale version) with:
  - **Executive Summary** — one paragraph on overall system health.
  - **Component scorecards** — Flutter / Backend / Neo4j / CI-CD /
    Infrastructure each scored on: Code Quality, Test Coverage, Security,
    Documentation, Consistency (1–5 scale with written justification).
  - **Open findings** — every unresolved Critical and Major finding from all
    review reports, tagged with component, severity, and the US that will fix it
    (or a recommendation if no US exists yet).
  - **Resolved findings** — summary of what was fixed during this PRD cycle.
  - **Recommended next actions** — ordered list of the highest-value things the
    team should do next, with rationale.
  - **System strengths** — genuine strengths worth preserving.
- [ ] `AUDIT.md` committed with date stamp in the document header.
- [ ] All CI jobs pass on the branch after the audit commit.

---

## Functional Requirements

- FR-1: Each component review (US-131–US-135) produces a standalone markdown
  findings file in `tasks/` before any improvement work begins.
- FR-2: The cross-component review (US-136) is written after all five component
  reviews exist.
- FR-3: Improvement stories (US-137–US-139) resolve findings in order of
  severity (Critical first).
- FR-4: Documentation stories (US-140–US-143) reflect the post-improvement
  state of the code, not the pre-improvement state.
- FR-5: The final audit (US-144) is written last, after all other stories in
  this PRD are complete.
- FR-6: Every findings file records a Resolution status per finding once the
  improvement work is done.

---

## Non-Goals

- Architectural redesign (this PRD improves what exists; it does not propose
  replacing Neo4j, switching auth providers, etc.).
- Performance benchmarking or load testing.
- New feature development (covered by other PRDs).
- Automated generation of review reports via LLM without Ralph actually reading
  the files.

---

## Story Execution Order

```
US-131 ─┐
US-132 ─┤
US-133 ─┼─► US-136 ─► US-137 ─┐
US-134 ─┤              US-138 ─┤
US-135 ─┘              US-139 ─┴─► US-140 ─┐
                                   US-141 ─┤
                                   US-142 ─┤
                                   US-143 ─┴─► US-144
```

US-131 through US-135 can be executed in parallel.
US-136 requires all five to be complete.
US-137, US-138, US-139 can run in parallel after US-136.
US-140 through US-143 can run in parallel after US-137–US-139.
US-144 runs last.

---

## Success Metrics

- Zero unresolved Critical findings after US-137–US-139 are complete.
- `flutter analyze`, `npm run lint`, and all CI jobs pass with zero warnings
  after the consistency pass (US-139).
- Every route in `docs/api/openapi.yaml` has a matching implementation and vice
  versa (verified by Ralph in US-141).
- `AUDIT.md` component scorecards show no component below 3/5 on any dimension.
