# PRD: Clean Code Audit — Spaghetti Removal & Principles Enforcement

## Introduction

A focused second audit cycle targeting clean code quality specifically.  Where
the first audit (US-131–US-144) covered correctness, security, and
documentation, this cycle applies the following principles throughout the entire
codebase:

- **Single Responsibility Principle (SRP)** — every file, class, and function
  does exactly one thing.
- **DRY (Don't Repeat Yourself)** — no duplicated logic; shared behaviour is
  extracted.
- **KISS (Keep It Simple)** — no unnecessary abstraction, no clever code.
- **Separation of concerns** — UI knows nothing about data fetching; routes
  know nothing about business logic; business logic knows nothing about
  persistence details.
- **Shallow nesting** — no function deeper than 3 levels of indentation.
- **Small units** — no function longer than 40 lines, no file longer than 300
  lines (with documented exceptions).

The cycle produces written review reports, applies concrete fixes, and closes
with an updated `AUDIT.md`.

---

## Goals

- Every spaghetti code location identified, documented, and refactored.
- No function exceeds 40 lines; no file exceeds 300 lines without explicit
  justification in a comment.
- Duplicated logic eliminated across Flutter services, backend routes, and
  Cypher queries.
- `AUDIT.md` updated with clean-code-specific scorecard.

---

## User Stories

---

### US-162: Ralph — clean code review of the Flutter app

**Description:** As a team lead, I want Ralph to review the Flutter codebase
specifically for clean code violations so that spaghetti code, god widgets, and
DRY violations are identified before they compound.

**Acceptance Criteria:**
- [ ] Ralph reads every file under `mobile/lib/` with clean code focus.
- [ ] Findings written to `tasks/review-flutter-clean.md` with sections:
  - **God widgets** — widgets that manage state, business logic, and UI
    simultaneously (list file + line count + responsibilities mixed in)
  - **Long methods** — any method/function exceeding 40 lines (list file,
    method name, line count)
  - **Deep nesting** — any code block nested more than 3 levels deep
    (list file + line range + nesting depth)
  - **DRY violations** — duplicated logic across files (e.g., `_authHeaders()`
    repeated in multiple service files — already identified in US-131)
  - **Mixed concerns** — UI files containing business logic, service files
    containing formatting logic, etc.
  - **Dead code** — unused imports, unreachable methods, commented-out code
    blocks
  - **What follows clean code well** — genuine strengths
  - **Prioritised findings** (Critical / Major / Minor) with refactoring
    recommendation per finding
- [ ] Every finding includes: file path, line range, violation type, suggested
  fix.
- [ ] Report saved and committed.

---

### US-163: Ralph — clean code review of the Node.js backend

**Description:** As a team lead, I want Ralph to review the backend specifically
for clean code violations — fat routes, inline SQL/Cypher, mixed concerns, and
copy-pasted error handling.

**Acceptance Criteria:**
- [ ] Ralph reads every file under `app/` with clean code focus.
- [ ] Findings written to `tasks/review-backend-clean.md` with sections:
  - **Fat routes** — route handlers doing more than: validate → call service →
    respond. List every route handler with inline business logic.
  - **Long functions** — any function exceeding 40 lines (file, function name,
    line count)
  - **Inline Cypher/SPARQL/Mongo queries** — query strings embedded in
    route/controller files instead of a dedicated data-access layer
  - **Copy-pasted error handling** — repeated `try/catch` patterns that should
    be a shared middleware or utility
  - **Naming violations** — misleading names, abbreviations, inconsistent
    casing between files
  - **Dead code** — unused functions, require()s, env vars read but never used
  - **What follows clean code well**
  - **Prioritised findings** (Critical / Major / Minor)
- [ ] Every finding includes file, line range, violation type, suggested fix.
- [ ] Report saved and committed.

---

### US-164: Ralph — clean code review of the Neo4j/data layer

**Description:** As a team lead, I want Ralph to review the Neo4j query layer
and ontology scripts for clean code violations — repeated query patterns, magic
strings, and functions that mix graph traversal with business logic.

**Acceptance Criteria:**
- [ ] Ralph reads `app/utils/Neo4jDatabase.js`, `app/utils/SparqlDatabase.js`,
  all files in `app/utils/` that contain Cypher, and all `.cypher` files.
- [ ] Findings written to `tasks/review-neo4j-clean.md` with sections:
  - **Magic strings** — hard-coded RDF prefixes, property names, label names
    not extracted to named constants
  - **Repeated query patterns** — similar Cypher fragments that should be
    extracted to a shared query builder
  - **Long functions in the data layer** — any function > 40 lines
  - **Mixed concerns** — functions that build Turtle/RDF, call the HTTP API,
    and parse the response all in one body
  - **What follows clean code well**
  - **Prioritised findings** (Critical / Major / Minor)
- [ ] Every finding includes file, line range, violation type, suggested fix.
- [ ] Report saved and committed.

---

### US-165: Ralph — clean code review of CI/CD and infrastructure scripts

**Description:** As a team lead, I want Ralph to review the shell scripts,
Makefile, and CI YAML for clean code violations — unreadable one-liners, copy-
pasted job steps, and scripts without error handling.

**Acceptance Criteria:**
- [ ] Ralph reads `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`,
  `Makefile`, and all files under `scripts/`.
- [ ] Findings written to `tasks/review-infra-clean.md` with sections:
  - **Copy-pasted CI job steps** — identical step sequences in multiple jobs
    that should be a composite action or reusable workflow
  - **Shell scripts without `set -euo pipefail`** — scripts that can silently
    continue on error
  - **Long shell functions** — functions exceeding 40 lines
  - **Magic values** — hard-coded port numbers, image names, timeout values
    not extracted to variables
  - **What follows clean code well**
  - **Prioritised findings** (Critical / Major / Minor)
- [ ] Every finding includes file, line range, violation type, suggested fix.
- [ ] Report saved and committed.

---

### US-166: Ralph — cross-component clean code coherence review

**Description:** As a team lead, I want Ralph to synthesise all four clean code
reviews and identify patterns that appear across multiple components — the same
smell in Flutter services, backend routes, and shell scripts simultaneously.

**Acceptance Criteria:**
- [ ] Ralph reads all four review files (`review-flutter-clean.md`,
  `review-backend-clean.md`, `review-neo4j-clean.md`,
  `review-infra-clean.md`).
- [ ] Findings written to `tasks/review-clean-coherence.md` with sections:
  - **Cross-cutting smell patterns** — smells that appear in 3+ components
    (e.g., "long functions" found in Flutter, backend, and scripts)
  - **Naming inconsistencies** — the same concept named differently across
    layers (identified by cross-referencing the four reports)
  - **Most impactful single refactoring** — the one change that, if applied,
    would clean up the most code across the most files
  - **Recommended fix order** — prioritised list: what to fix first for maximum
    improvement with minimum risk
- [ ] Report saved and committed.

---

### US-167: Ralph — apply clean code improvements to the Flutter app

**Description:** As a developer, I want Ralph to refactor all Critical and Major
clean code findings in the Flutter codebase so every file respects SRP, DRY,
and size limits.

**Acceptance Criteria:**
- [ ] Every Critical and Major finding from `tasks/review-flutter-clean.md`
  resolved or deferred with written reason.
- [ ] Specific refactors applied (drawn from actual review findings; typical):
  - `_authHeaders()` or equivalent duplication extracted to a single Dio
    interceptor used by all service files.
  - God widgets split: UI code in the widget, state in a Riverpod
    StateNotifier/Notifier, API calls in the service layer.
  - Any function > 40 lines broken into named sub-functions.
  - Deep nesting (> 3 levels) flattened using early returns or extracted
    functions.
  - Dead imports and unreachable code removed.
- [ ] `flutter analyze` passes with zero warnings after refactoring.
- [ ] `flutter test --coverage` passes — no existing test broken.
- [ ] `tasks/review-flutter-clean.md` updated with Resolution note per finding.

---

### US-168: Ralph — apply clean code improvements to the backend

**Description:** As a developer, I want Ralph to refactor all Critical and Major
clean code findings in the backend so routes are thin, business logic is in
services, and there is no copy-pasted code.

**Acceptance Criteria:**
- [ ] Every Critical and Major finding from `tasks/review-backend-clean.md`
  resolved or deferred with written reason.
- [ ] Specific refactors applied (typical):
  - Any remaining inline Cypher in route files moved to the data-access layer.
  - Copy-pasted `try/catch` replaced with a shared `asyncHandler` Express
    wrapper or equivalent.
  - Any function > 40 lines in service files broken into named sub-functions.
  - Unused `require()` statements removed.
  - Magic string literals extracted to named constants at the top of the file.
- [ ] `npm run lint` passes.
- [ ] All unit and integration tests pass.
- [ ] `tasks/review-backend-clean.md` updated with Resolution notes.

---

### US-169: Ralph — apply clean code improvements to the Neo4j/data layer

**Description:** As a developer, I want Ralph to refactor the Neo4j and SPARQL
query layer so query strings are separated from business logic, magic strings
are named constants, and no function mixes multiple concerns.

**Acceptance Criteria:**
- [ ] Every Critical and Major finding from `tasks/review-neo4j-clean.md`
  resolved or deferred with written reason.
- [ ] Specific refactors applied (typical):
  - RDF namespace prefixes extracted to a `PREFIXES` constant at the top of
    `Neo4jDatabase.js`.
  - Functions that build Turtle, call the import API, and parse results split
    into three separate named functions.
  - Repeated Cypher fragments (e.g., `MATCH (d:hhh__Donor {hhh__userId: $uid})`)
    extracted to a shared query builder or constant.
  - Any function > 40 lines broken into named sub-functions.
- [ ] All existing Neo4j-related tests pass.
- [ ] `npm run lint` passes.
- [ ] `tasks/review-neo4j-clean.md` updated with Resolution notes.

---

### US-170: Ralph — consistency and dead code pass across all layers

**Description:** As a developer, I want Ralph to make a final sweep removing
all dead code, fixing naming inconsistencies identified in the coherence review,
and enforcing the agreed coding conventions across every layer.

**Acceptance Criteria:**
- [ ] All dead code removed: unused imports, unreachable functions, commented-
  out code blocks, unused env vars read but never consumed.
- [ ] Naming inconsistencies from `tasks/review-clean-coherence.md` resolved:
  the same concept uses the same name in Flutter models, backend response
  shapes, and Neo4j property names (or a mapping is explicitly documented).
- [ ] Copy-pasted CI steps extracted to a reusable GitHub Actions composite
  action or step template where identified in `review-infra-clean.md`.
- [ ] All scripts under `scripts/` begin with `#!/usr/bin/env bash` and
  `set -euo pipefail` (or `#!/usr/bin/env node` for JS scripts with explicit
  `process.exit(1)` on error).
- [ ] `flutter analyze`, `npm run lint`, and all tests pass after this story.
- [ ] `tasks/review-clean-coherence.md` updated with Resolution notes.

---

### US-171: Ralph — update all documentation to reflect clean code changes

**Description:** As a developer, I want all documentation updated after the
refactoring cycle so guides and architecture docs describe the post-refactor
structure, not the pre-refactor one.

**Acceptance Criteria:**
- [ ] `docs/guides/flutter-architecture.md` updated to reflect any new file
  structure created by refactoring (new interceptors, notifiers, utilities).
- [ ] `docs/guides/developer-onboarding.md` updated with any new `make` targets
  or script commands added during this cycle.
- [ ] `docs/api/openapi.yaml` updated if any response shapes changed during
  refactoring.
- [ ] `docs/architecture.md` updated if any service boundaries changed.
- [ ] `CHANGELOG.md` gains a new version entry documenting the clean code
  refactor cycle.
- [ ] `DOCUMENTATION.md` (the doc index) updated if any new files were added
  to `docs/`.

---

### US-172: Ralph — final clean code system audit

**Description:** As a project owner, I want a clean-code-focused audit report
after all refactoring and documentation work is complete so I have an objective
measure of code quality improvement.

**Acceptance Criteria:**
- [ ] Ralph re-reads all four clean code review files and the current state of
  the codebase after all improvements.
- [ ] `AUDIT.md` updated (new section appended, dated) with:
  - **Clean Code Scorecard** — Flutter / Backend / Neo4j / CI-Scripts each
    scored 1–5 on: SRP adherence, DRY adherence, function size, naming clarity,
    dead code absence (with written justification per score).
  - **Before/After metrics** — max function length before vs after, number of
    files over 300 lines before vs after, number of DRY violations before vs
    after.
  - **Remaining open findings** — any clean code findings deferred from this
    cycle, with reason and suggested follow-up story.
  - **Resolved findings** — list of all clean code issues fixed this cycle.
- [ ] `AUDIT.md` committed with date stamp.
- [ ] All CI jobs pass on the branch after the audit commit.

---

## Functional Requirements

- FR-1: No function in any layer (Flutter, backend, scripts) exceeds 40 lines
  after US-167–US-169 complete. Exceptions must be documented in an inline
  comment explaining why.
- FR-2: No file in `app/` or `mobile/lib/` exceeds 300 lines after US-167–
  US-169 complete. Exceptions documented.
- FR-3: No logic is duplicated across more than one file without being extracted
  to a shared utility.
- FR-4: All shell scripts under `scripts/` use `set -euo pipefail`.
- FR-5: `flutter analyze` and `npm run lint` produce zero warnings after all
  improvement stories are applied.

---

## Non-Goals

- Performance optimisation (separate concern).
- Feature changes — this cycle only refactors existing behaviour, never adds
  new behaviour.
- Test coverage improvements (covered by US-154 and potential follow-up stories).
- Rewriting in a different language or framework.

---

## Execution Order

```
US-162 ─┐
US-163 ─┤  (parallel)
US-164 ─┤
US-165 ─┘
    ↓ all four complete
US-166  (coherence review)
    ↓
US-167 ─┐
US-168 ─┤  (parallel)
US-169 ─┘
    ↓ all three complete
US-170  (consistency + dead code pass)
    ↓
US-171  (documentation update)
    ↓
US-172  (final audit)
```

---

## Success Metrics

- Zero functions > 40 lines in Flutter and backend after improvement cycle.
- Zero files > 300 lines in `mobile/lib/` and `app/` (with documented
  exceptions only).
- Clean Code Scorecard shows no component below 4/5 on any dimension.
- `AUDIT.md` before/after metrics show measurable improvement in all categories.
