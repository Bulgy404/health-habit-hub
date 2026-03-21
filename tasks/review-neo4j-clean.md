# Clean Code Review — Neo4j / Data Layer

**Scope:** `app/utils/Neo4jDatabase.js`, `app/utils/SparqlDatabase.js`,
utils files containing Cypher (inline in `app/routes/habitsRouter.js`,
`app/services/adminParticipantService.js`, `app/services/adminStatsService.js`),
and all `.cypher` files (`neo4j/init/constraints.cypher`,
`scripts/migrate-hhh-habit-to-habit.cypher`, `scripts/migrate-group-labels.cypher`).

**Date:** 2026-03-21

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3     |
| Major    | 7     |
| Minor    | 5     |

---

## Critical Findings

### C1 — `translate()` function duplicated verbatim across two files
**Files:** `app/utils/Neo4jDatabase.js:8–56`, `app/utils/SparqlDatabase.js:7–57`
**Violation:** DRY — identical 48-line async retry-with-backoff `translate()` function is copy-pasted between the two database utility files. The only difference is that the Neo4j version takes `config` as a parameter while the Fuseki version reads it from a module-level import — an inconsistency that masks the duplication.
**Suggested fix:** Extract to `app/utils/translate.js` that exports `translateText(text, from, to, translateEndpoint)`. Both `Neo4jDbClient` and `DbClient` import it. Pass the endpoint URL rather than the full config object to keep the helper decoupled.

---

### C2 — RDF namespace URI `http://example.com/hhh#` hard-coded as a magic string
**Files:** `app/utils/Neo4jDatabase.js:329–414` (20+ occurrences)
**Violation:** Magic string — the HHH namespace URI appears in the Turtle `@prefix` block and in the `iri()` closure which is itself re-created on every call to `_buildDonationTurtle` (see M2). If the namespace ever changes, every occurrence must be updated by hand.
**Suggested fix:** Declare `const HHH_NS = 'http://example.com/hhh#';` at module level. Define `const iri = (local) => \`<${HHH_NS}${local}>\`` once at module level (not inside the method). Use `HHH_NS` in the Turtle `@prefix` line.

---

### C3 — `ExperimentalSetting` group assignment bug in `SparqlDatabase.js`
**File:** `app/utils/SparqlDatabase.js:69–73`
**Violation:** Logic bug / missing parentheses — three of the four `isX()` methods are referenced as function values (no `()`) making them always truthy:
```js
// SparqlDatabase.js — BROKEN
if (this.isClosedTaskOpenDescription()) this.group = 'Group1';   // ← correct
else if (this.isClosedTaskClosedDescription) this.group = 'Group2'; // ← truthy reference
else if (this.isOpenTaskClosedDescription) this.group = 'Group3';   // ← truthy reference
else if (this.isOpenTaskOpenDescription) this.group = 'Group4';     // ← truthy reference
```
In practice the `else if (isClosedTaskClosedDescription)` branch is always taken for non-Group1 habits, assigning every donation to Group2. Compare with `Neo4jDatabase.js:68–72` where all four are called correctly with `()`.
**Suggested fix:** Add `()` to all three broken references. Add a unit test for each group permutation.

---

## Major Findings

### M1 — `_buildDonationTurtle` is a 149-line god method with mixed concerns
**File:** `app/utils/Neo4jDatabase.js:327–476`
**Violation:** SRP + long function — the method builds six distinct sections of a Turtle document (prefix block, habit triples, experimental setting triples, donor triples, context triples, behavior triples, translation triples) in a single 149-line method. It is difficult to test any section in isolation and the method scrolls well past any reasonable function-length limit (40 lines).
**Suggested fix:** Split into named private methods: `_habitTriples(donation)`, `_experimentalSettingTriples(setting)`, `_donorTriples(donorId, donation, userId, timestamp)`, `_contextTriples(donation, setting)`, `_behaviorTriples(donation, setting)`, `_translationTriples(donation, setting)`. `_buildDonationTurtle` becomes a short orchestrator that calls each and concatenates.

---

### M2 — `iri()` closure re-created on every `_buildDonationTurtle` call
**File:** `app/utils/Neo4jDatabase.js:337`
**Violation:** Unnecessary re-creation — `const iri = (local) => \`<http://example.com/hhh#${local}>\`` is defined as a local const inside the method body on every invocation, even though it is pure and stateless.
**Suggested fix:** Move `iri` to module level. Pair with the C2 fix: `const iri = (local) => \`<${HHH_NS}${local}>\``.

---

### M3 — Domain model classes duplicated across both database files
**Files:** `app/utils/Neo4jDatabase.js:58–175`, `app/utils/SparqlDatabase.js:59–184`
**Violation:** DRY — `ExperimentalSetting`, `Donor`, `Label`, and `Donation` are defined in full in both files. Any change to the domain model (e.g., adding a new group or label type) must be made twice.
**Suggested fix:** Extract to `app/models/donation.js` and import in both utilities. This also naturally resolves C3 (one source of truth for the group assignment logic).

---

### M4 — `_esc()` method duplicated in both database client classes
**Files:** `app/utils/Neo4jDatabase.js:187–194`, `app/utils/SparqlDatabase.js:198–205`
**Violation:** DRY — identical 7-line string escaping method exists in `Neo4jDbClient` and `DbClient`. The escaping logic covers the same four character substitutions in the same order.
**Suggested fix:** Export `escapeStringLiteral(str)` from a shared utility (could live in `app/utils/translate.js` or a new `app/utils/stringUtils.js`). Both classes import and use it.

---

### M5 — `new Donor(donation)` result discarded — dead code
**File:** `app/utils/Neo4jDatabase.js:261`
**Violation:** Dead code — `new Donor(donation)` is called but never assigned. The constructor only generates a UUID for `this.id`. Separately, `_buildDonationTurtle` generates its own fresh donor UUID at line 338 (`const donorId = uuid()`), so the object created at line 261 is never used.
**Suggested fix:** Remove the `new Donor(donation)` call at line 261. Pass the donor UUID to `_buildDonationTurtle` as a parameter (generated once in `insertDonateData`), eliminating the duplicate UUID generation.

---

### M6 — Inline Cypher strings in route/service layer (data logic in wrong layer)
**Files:**
- `app/routes/habitsRouter.js:166–173` (GET /habits)
- `app/routes/habitsRouter.js:241–247` (GET /habits/public)
- `app/routes/habitsRouter.js:425–431` (GET /habits/stats — 2 queries)
- `app/routes/habitsRouter.js:605–649` (POST /donate — 3 queries)
- `app/services/adminParticipantService.js:98–103` (REMOVE/SET group labels)
- `app/services/adminStatsService.js:24–27` (MATCH habit count)

**Violation:** Mixed concerns — Cypher query strings are scattered across route handlers and service functions. There is no central query file or abstraction. Finding all Neo4j queries requires grepping the entire codebase.
**Suggested fix:** Create `app/db/habitQueries.js` (and `app/db/adminQueries.js`) that export named async functions wrapping each Cypher statement. Route handlers import and call these functions. This mirrors the pattern established by `adminParticipantService` and `adminHabitService` for business logic.

---

### M7 — `SUPPORTED_LANGUAGES` and `DIMENSIONS` defined as inline magic arrays in route handler
**File:** `app/routes/habitsRouter.js:476–519`
**Violation:** Magic values / wrong layer — both arrays are defined inside the route handler function body, making them invisible to other handlers and impossible to reuse. The `DIMENSIONS` list mirrors the BCIO dimension taxonomy used by the API-service (`classify-context` endpoint) but is duplicated here without reference to the source.
**Suggested fix:** Move to `app/utils/constants.js` (create if not present). Import in any file that needs them.

---

## Minor Findings

### m1 — Deprecated `exists()` predicate in `migrate-group-labels.cypher`
**File:** `scripts/migrate-group-labels.cypher:48`
**Violation:** Deprecated API — `exists((h)<-[:hhh__partOf]-(ctx))` uses the `exists()` function which was deprecated in Neo4j 5.x (replaced by a Boolean pattern expression).
**Suggested fix:** Replace with `(h)<-[:hhh__partOf]-(ctx)` used directly as a WHERE predicate (already in the same WHERE clause, so the exists() call is redundant anyway).

---

### m2 — `console.debug(insertQuery)` logs full user-submitted SPARQL in production
**File:** `app/utils/SparqlDatabase.js:264`
**Violation:** Information leakage / noise — the full SPARQL INSERT query (including user-submitted habit text) is always logged at debug level. In a production container, if debug logging is enabled this leaks personal data.
**Suggested fix:** Remove the `console.debug(insertQuery)` call. The `insertData()` method already logs success/error with `console.log` / `console.error`. If query debugging is needed, add an explicit `DEBUG_SPARQL=true` env gate.

---

### m3 — `_importTurtle` silently ignores non-OK termination status
**File:** `app/utils/Neo4jDatabase.js:311–325`
**Violation:** Silent failure — when `terminationStatus !== 'OK'`, the method calls `n10s.rdf.preview.inline` but does nothing with the result (no logging, no exception). The caller only sees `false` returned and cannot distinguish between partial import and connection failure.
**Suggested fix:** Add `console.error('[n10s] Import failed — status:', status, '— payload:', payload.slice(0, 200))` before returning `false`, or throw an error and let the caller handle it.

---

### m4 — Namespace coupling between old RDF schema and new Cypher schema not documented
**Files:** `app/utils/Neo4jDatabase.js`, `app/utils/SparqlDatabase.js`, `app/routes/habitsRouter.js`
**Violation:** Undocumented dual-schema — the codebase has two active Neo4j schemas: the old n10s/RDF schema using `hhh__` prefixed labels (e.g., `hhh__Habit`, `hhh__Group1`) and the new direct-Cypher schema (e.g., `Habit`, `Context`, `BCIOConcept`). Routes query both schemas without a comment explaining the coexistence. `Neo4jDatabase.js` still writes into the old schema; `habitsRouter.js` reads from and writes into the new schema.
**Suggested fix:** Add a comment block at the top of both database files and the constraints file explaining the two schemas, their relationship, and the migration plan (point to `scripts/migrate-hhh-habit-to-habit.cypher`).

---

### m5 — `translate()` configuration approach inconsistent between the two database files
**Files:** `app/utils/Neo4jDatabase.js:8`, `app/utils/SparqlDatabase.js:7`
**Violation:** Inconsistent API — `translate()` in Neo4jDatabase.js accepts `config` as the fourth parameter (injected by `Donation.translate(targetLanguage, this.config)`), while SparqlDatabase.js reads the global `config` singleton at call time. The Neo4j version is more testable; the Fuseki version is harder to stub in tests.
**Suggested fix:** Resolved naturally when C1 is fixed (shared `translateText(text, from, to, endpoint)` helper takes an explicit URL, not a config object).

---

## Positive Findings

- **Parameterized queries in habitsRouter.js** — All five Cypher queries in `habitsRouter.js` use `$param` placeholders with a separate params object, correctly preventing Cypher injection.
- **`_esc()` is correct and consistent** — Both implementations handle `\`, `"`, `\n`, and `\r` in the right order (backslash first), preventing double-escaping.
- **`constraints.cypher` uses `IF NOT EXISTS`** — All `CREATE CONSTRAINT` and `CREATE INDEX` statements are idempotent.
- **Migration scripts are well-documented** — Both `.cypher` migration files have thorough header comments explaining the old/new schema mapping, idempotency guarantees, and how to run them.
- **`VALID_GROUPS` whitelist prevents label injection** — `adminParticipantService.js` guards the dynamic `SET d:\`${newLabel}\`` with `VALID_GROUPS.has(newLabel)` before execution.

---

## Prioritised Fix Order

| Priority | ID  | Impact | Risk | Effort |
|----------|-----|--------|------|--------|
| 1        | C3  | Fixes silent data corruption (wrong group assigned) | Low (test + `()`) | XS |
| 2        | C1  | Eliminates largest duplication, unblocks M3/M5 | Medium (shared module) | S |
| 3        | M3  | Removes domain model duplication (depends on C1) | Medium | S |
| 4        | C2 + M2 | Removes magic namespace string + fixes iri() lifetime | Low | XS |
| 5        | M1  | Breaks up god method (depends on C2/M2 for clean sub-methods) | Low | M |
| 6        | M5  | Removes dead code | Low | XS |
| 7        | M6  | Moves Cypher to query layer | Medium | M |
| 8        | M4  | Removes escape duplication | Low | XS |
| 9        | M7  | Moves constants to shared file | Low | XS |
| 10       | m1–m5 | Minor cleanups | Low | XS–S |
