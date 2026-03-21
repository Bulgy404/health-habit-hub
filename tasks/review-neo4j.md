# Neo4j Ontology and Database Layer Review

**Reviewer:** Senior Data Engineer (automated review)
**Date:** 2026-03-21
**Branch:** `ralph/hhh-platform-unified`
**Scope:** `neo4j/init/`, `app/utils/Neo4jDatabase.js`, `app/utils/config.js`, `Ontology.ttl`, `fuseki/init/schema.ttl`, `fuseki/init/data.ttl`, `scripts/migrate-group-labels.cypher`, all Cypher embedded in `app/routes/habitsRouter.js` and `app/routes/adminRouter.js`

---

## 1. Ontology Design

### What is done well

- **Separation of BCIO from HHH terms.** `Ontology.ttl` cleanly separates the `hhh:` namespace (`http://example.com/hhh#`) from the `bcio:` namespace (`http://humanbehaviourchange.org/ontology/BCIO#`). The BCIO classes are reproduced inline with accurate attribution to BCT Taxonomy v1 (Michie et al. 2013) and the 16 groupings are present and correctly subclassed under `bcio:BehaviourChangeTechnique` (`Ontology.ttl:256-348`).
- **TODO comments for uncertain alignments.** The `rdfs:comment "TODO: domain-review..."` annotations on `hhh:Behavior`, `hhh:Context`, `hhh:InternalState`, and `hhh:PhysicalSetting` (`Ontology.ttl:102-174`) correctly flag potential semantic mismatches with BCIO — this is intellectually honest and avoids premature alignment.
- **Group hierarchy is clean.** `hhh:Group1`–`hhh:Group4` all subclass `hhh:ExperimentalSetting`, and the comments correctly capture the open/closed task × description axes.
- **`hasTranslation` is symmetric.** Bidirectional translation links on Habit and on Context/Behavior nodes are expressed in data (`Neo4jDatabase.js:406-407, 440-441`), which preserves language-parity for graph traversals.

### Issues

**[Critical] Two incompatible graph schemas co-exist in the same codebase without a migration boundary.**

The legacy path (`Neo4jDatabase.js`, `fuseki/init/data.ttl`) writes RDF-mapped n10s nodes with `hhh__`-prefixed labels and relationship types (e.g. `hhh__Habit`, `hhh__donates`, `hhh__hasBehavior`). The new path (`habitsRouter.js:601-646`) writes raw Cypher nodes with unprefixed labels (`Habit`, `Context`, `BCIOConcept`) and relationship types (`HAS_CONTEXT`, `MAPS_TO`). Queries targeting old nodes (`MATCH (h:hhh__Habit)` at `habitsRouter.js:266`) and queries targeting new nodes (`MATCH (h:Habit)` at `habitsRouter.js:192`) run against the same database. There is no migration script to unify the two schemas, no runtime guard to reject queries of the wrong type, and no documentation describing the coexistence. This means:

- `/api/v1/habits` (new schema) and `/api/v1/habits/public` (old schema) return disjoint datasets — different donations, different counts.
- `/api/v1/habits/stats` (`habitsRouter.js:448-454`) counts `hhh__Habit` nodes (old) while `donate` creates `Habit` nodes (new), so `stats.total` is always 0 for newly donated habits.
- The admin router at `adminRouter.js:427-431` sets labels on `hhh__Donor` (old schema) but new donations have no `hhh__Donor` node at all.

**[Critical] `hhh:language` data property has wrong range — declared `rdf:langString` but stored as plain string.**

In `Ontology.ttl:71-74` and `fuseki/init/schema.ttl:49-53`, `hhh:language` is declared with `rdfs:range rdf:langString`. A `rdf:langString` requires a language tag (e.g. `"en"@en`). But the Turtle triples generated in `Neo4jDatabase.js:344` write `hhh:language "${this._esc(donation.language)}"` — a plain string literal, not a tagged `rdf:langString`. Similarly `data.ttl:19` writes `hhh:language "en"^^rdf:langString` which is also syntactically invalid (the `^^` datatype IRI form cannot be used with `rdf:langString`; language tags use `@` syntax). n10s with `keepLangTag: true` will import this but the OWL reasoner would flag a range violation. The correct range is `xsd:string` and the serialisation should be `"en"^^xsd:string`.

**[Major] `fuseki/init/schema.ttl` is an outdated fork of the ontology.**

`schema.ttl` is a stripped copy of the old schema without `hhh:Habit`, `hhh:donates`, `hhh:hasTranslation`, or BCIO terms present in `Ontology.ttl`. It has stale property domain declarations: `hhh:hasBehavior rdfs:domain hhh:Donor` (`schema.ttl:14`) vs `Ontology.ttl:29` where the domain is `hhh:Habit`. Running both in separate Fuseki and Neo4j stores will produce different inferences. The Fuseki store should either import `Ontology.ttl` directly or `schema.ttl` should be deleted and replaced with a symlink/reference.

**[Major] `hhh:RelatedBehavior` appears in `fuseki/init/data.ttl` but not in `Ontology.ttl`.**

`data.ttl:62-65` uses `hhh:RelatedBehavior` as a type (e.g. `hhh:Context1-2`). `Ontology.ttl` declares only `hhh:PriorBehavior` as the prior-behavior context class. The old `schema.ttl` declares `hhh:RelatedBehavior` (`schema.ttl:142`). The rename (RelatedBehavior → PriorBehavior) was not applied to the seed data, leaving a class mismatch in the sample dataset and a broken schema assertion for any OWL validation run.

**[Minor] `Ontology.ttl` uses `@base <http://www.w3.org/2002/07/owl#>` which shadows owl: terms.**

Line 8 of `Ontology.ttl` and `fuseki/init/schema.ttl:7` both set `@base <http://www.w3.org/2002/07/owl#>`. This is carried over from Protégé-generated OWL/XML output and is semantically confusing — it sets the base URI to the OWL namespace, which means any relative IRI reference without a prefix resolves to an OWL term. It has no practical effect here (all IRIs use explicit prefixes) but should be removed or set to the HHH base IRI.

**[Minor] BCIO cross-links are not formalised as OWL axioms.**

The `rdfs:comment "TODO: domain-review — may align with..."` notes in `Ontology.ttl:102-174` identify four potential alignments (Behavior↔BehaviourChangeTechnique, Context↔Setting, InternalState↔MechanismOfAction, PhysicalSetting↔Setting) but none is expressed as an OWL axiom (`rdfs:subClassOf`, `owl:equivalentClass`, or `owl:sameAs`). Until aligned, the BCIO classes in the ontology serve only as documentation — they are not used in any SPARQL/Cypher query in the codebase.

---

## 2. Cypher Quality

### What is done well

- **`MERGE` is used correctly for deduplicated nodes.** `habitsRouter.js:621-625` uses `MERGE (c:Context {text: $text, dimension: $dimension})` and `habitsRouter.js:633-637` uses `MERGE (b:BCIOConcept {bcio_concept_id: $bcio_concept_id})`. This correctly deduplicates shared context phrases and BCIO concept nodes across users.
- **Migration script is idempotent.** `scripts/migrate-group-labels.cypher:34` notes `SET is idempotent` and can be safely re-run.
- **Parameterised queries used throughout.** All Cypher in `habitsRouter.js` uses `$param` syntax — no string interpolation in Cypher queries (contrast with `Neo4jDatabase.js` which uses inline Turtle string building but that is for n10s import, not direct Cypher).

### Issues

**[Critical] `Neo4jDatabase.js` creates and destroys a driver on every operation — no connection pooling.**

`habitsRouter.js:22-36` creates a `neo4j.driver(...)`, runs one query, then immediately closes both the session and the driver in the `finally` block. The Neo4j JavaScript driver is designed to be instantiated once (it maintains an internal connection pool). Creating and destroying it per query adds ~200-500ms of TCP handshake overhead per call and leaks ephemeral connections during high concurrency. The driver should be instantiated once at server startup and shared across all routes via dependency injection (as the `neo4jRun` factory parameter already supports — the anti-pattern only occurs in the `else` branch when `neo4jRun` is not injected, i.e. in production).

**[Critical] N+1 query pattern in the donate pipeline.**

`habitsRouter.js:618-646` runs one `MERGE` query per context phrase per dimension in a loop, then one `MERGE` per BCIO mapping in a loop. For a donation with 3 dimensions × 2 phrases = 6 context queries + 6 BCIO mapping queries = 12 sequential round-trips. These should be batched using `UNWIND $phrases AS p MERGE (c:Context {...}) ...` with a single parameter array.

**[Critical] Cypher label injection in `adminRouter.js:429`.**

```js
const cypher = [
  'MATCH (d:hhh__Donor {hhh__id: $userId})',
  'REMOVE d:hhh__Group1 REMOVE d:hhh__Group2 REMOVE d:hhh__Group3 REMOVE d:hhh__Group4',
  `SET d:\`${newLabel}\``,   // ← label interpolated into Cypher string
  'RETURN d',
].join(' ');
```

`newLabel` is derived from `labelMap[group]` where `group` comes from `req.body.group`. Although `labelMap` bounds the value to four known strings, this pattern is fragile — if the `group` input is validated elsewhere and the validation is later weakened, the backtick-escaped label becomes an injection vector. Neo4j does not support parameterised labels; the safe approach is to use a hardcoded `switch`/`if-else` with explicit Cypher strings per case.

**[Major] `habitsRouter.js:266` and `:448` target `hhh__Habit` (old schema) while `:192` targets `Habit` (new schema) — dual-schema query inconsistency.**

As noted in the Ontology Design section, the `/public` and `/stats` endpoints query old n10s nodes while the `GET /` (list) and `POST /donate` endpoints query and create new-schema nodes. This inconsistency makes the stats page always show 0 for the new donation pipeline. Every query should target the same schema.

**[Major] `MATCH (h:Habit)` has no `WHERE` clause or index hint — full graph scan on every `/habits` request.**

`habitsRouter.js:191-198` does a full `MATCH (h:Habit)` with no filtering. With a growing corpus this becomes O(n) at query time. A composite index on `:Habit(language)` or a covering index on `:Habit(uuid, sentence, language, translationEN, translationDE)` should be added to `neo4j/init/constraints.cypher`.

**[Major] `habitsRouter.js:621-625`: `MATCH (h:Habit {uuid: $habitUuid})` inside a loop is O(n×m) without an index.**

The context MERGE does a `MATCH (h:Habit {uuid: $habitUuid})` for every context phrase. Without a uniqueness constraint (or at least an index) on `:Habit(uuid)`, each inner MATCH is a full scan. A `CREATE CONSTRAINT habit_uuid_unique IF NOT EXISTS FOR (h:Habit) REQUIRE h.uuid IS UNIQUE` should be added to `neo4j/init/constraints.cypher`.

**[Major] `scripts/migrate-group-labels.cypher:47` uses deprecated `exists()` function.**

`exists((h)<-[:hhh__partOf]-(ctx))` uses the old pattern-predicate form of `exists()` which was deprecated in Neo4j 4.2 and removed in Neo4j 5.0. The equivalent in current Cypher is a `WHERE (h)<-[:hhh__partOf]-(ctx)` pattern predicate or a `COUNT { ... } > 0` subquery.

**[Minor] `migrate-group-labels.cypher:47`: Step 2 fallback has ambiguous cardinality.**

```cypher
MATCH (d:hhh__Donor)-[:hhh__donates]->(h:hhh__Habit)
WHERE d.hhh__group IS NULL
MATCH (ctx)-[:hhh__partOf]->(es)
WHERE (ctx)-[:hhh__partOf]->() AND any(lbl IN labels(es) WHERE lbl STARTS WITH 'hhh__Group')
  AND exists((h)<-[:hhh__partOf]-(ctx))
```

The unbounded `MATCH (ctx)-[:hhh__partOf]->(es)` without anchoring on `d` or `h` could match any context in the graph, not just those belonging to `h`. If multiple ExperimentalSettings match, `WITH d, [lbl ...][0]` takes the first arbitrarily. Step 2 should anchor: `MATCH (ctx)-[:hhh__partOf]->(es) WHERE (h)-[:hhh__hasBehavior]->(ctx)`.

**[Minor] `habitsRouter.js:192-198` — `RETURN h.sentence AS original` but property stored as `sentence` is not guaranteed to exist on all Habit nodes.**

There is no `NOT NULL` constraint on `sentence`. Nodes where the property is absent will return `null` as `original`, silently degrading the API response. An existence constraint should be added: `CREATE CONSTRAINT habit_sentence_exists IF NOT EXISTS FOR (h:Habit) REQUIRE h.sentence IS NOT NULL`.

---

## 3. n10s Configuration

### What is done well

- **`handleVocabUris: 'SHORTEN'`** is set correctly (`Neo4jDatabase.js:217`), enabling the `hhh__` prefix stripping that the query code relies on.
- **`keepLangTag: true`** preserves language tags on multilingual string literals.
- **`handleMultival: 'ARRAY'`** correctly handles multi-valued RDF properties as Neo4j arrays rather than discarding duplicates.
- **`ensureN10sConfigured()` is guarded by a `this.n10sConfigured` flag** (`Neo4jDatabase.js:200-243`) to prevent repeated configuration calls, though this is per-instance rather than per-database.

### Issues

**[Critical] n10s configuration errors are completely silenced.**

`Neo4jDatabase.js:219-221` catches n10s configuration errors with an empty `catch {}` block and continues execution. If `n10s.graphconfig.init` fails for a genuine reason (e.g. conflicting existing configuration with different parameters), the import proceeds with the wrong configuration, potentially corrupting the graph. The catch should at minimum log the error with `console.error` to surface production misconfigurations.

**[Major] The `n10s.rdf.import.fetch` call at `Neo4jDatabase.js:235-241` silently fails if `Ontology.ttl` is not mounted at `/import/Ontology.ttl`.**

The file path is hardcoded to `file:///import/Ontology.ttl`. If the Docker volume mapping is missing or the file path differs between environments, n10s silently skips the ontology import and the graph has no schema. This is caught in a `finally` but not logged. The code should check the n10s import result and warn on failure.

**[Major] n10s namespace registration (`n10s.nsprefixes.add`) fails silently if the prefix already exists with a different IRI.**

`Neo4jDatabase.js:224-229` catches prefix registration errors silently. If the `hhh` prefix was previously registered with a different namespace IRI (e.g. `http://example.com/hhh/` vs `http://example.com/hhh#`), subsequent imports will use the old mapping and all `hhh__`-prefixed properties will be mapped to the wrong IRI. The fix is to check the existing registration first with `CALL n10s.nsprefixes.list()` and only register if absent.

**[Minor] `this.n10sConfigured` flag is per-instance, not per-database.**

If multiple `Neo4jDbClient` instances are created (e.g. in test setup), each will attempt its own n10s configuration. In production there is only one client, so this is low-risk, but the flag should ideally query Neo4j to confirm the configuration exists rather than trusting instance state.

---

## 4. Data Integrity

### What is done well

- **Uniqueness constraint on `hhh__Donor.hhh__userId`** (`neo4j/init/constraints.cypher:9-10`) prevents duplicate donor nodes per user.
- **`n10s_unique_uri` constraint** (`constraints.cypher:5-6`) satisfies n10s requirements.
- **Group index coverage.** Indexes for all four group labels (`group1_idx`–`group4_idx`) are defined (`constraints.cypher:18-33`).

### Issues

**[Critical] No uniqueness constraint or index on `Habit.uuid` (new schema).**

`neo4j/init/constraints.cypher` defines constraints only for the old `hhh__`-prefixed schema. The new `Habit` label used by `habitsRouter.js:601-614` has no constraint. A concurrent double-submit could create two `Habit` nodes with the same `uuid`, then the inner-loop `MATCH (h:Habit {uuid: $habitUuid})` would match both and create duplicate `HAS_CONTEXT` relationships.

**[Critical] No index on `Context(text, dimension)` — MERGE is a full scan.**

`habitsRouter.js:621` uses `MERGE (c:Context {text: $text, dimension: $dimension})`. Without an index on these properties, each MERGE is O(n) over all Context nodes. As the context corpus grows, donate latency grows linearly. A composite index `CREATE INDEX context_text_dim IF NOT EXISTS FOR (n:Context) ON (n.text, n.dimension)` is required.

**[Major] No foreign-key-style constraint between `Habit.uuid` and `Context` relationships.**

The `HAS_CONTEXT` MERGE in `habitsRouter.js:624-625` first creates/finds the Context node, then does a separate `MATCH (h:Habit {uuid: $habitUuid})` to find the Habit and create the relationship. If the Habit node is not found (e.g. because the CREATE in the preceding step failed), the MERGE silently succeeds for the Context but the relationship is never created. The Habit and its contexts become orphaned separately. Using a single query with `MATCH (h:Habit {uuid: $uuid}) MERGE (c:Context {...}) MERGE (h)-[:HAS_CONTEXT {dimension: $dimension}]->(c)` would atomically require the Habit to exist.

**[Major] Donor node is not created in the new donation pipeline.**

`habitsRouter.js:599-655` creates a `Habit` node, `Context` nodes, and `BCIOConcept` nodes, but no `Donor` node. This means there is no way to query "all habits donated by user X" through the graph. The `userID` property is stored on `Habit` directly, which works for a single lookup but breaks graph traversal patterns (e.g. `MATCH (d:Donor)-[:DONATED]->(h:Habit)`) used in analytics.

**[Minor] `Habit.created_at` is an ISO string stored as a property (`habitsRouter.js:600`), not a Neo4j `DateTime`.**

Neo4j supports native `datetime()` values which can be compared, sorted, and range-queried efficiently. Storing ISO strings requires string comparison for date queries and will cause incorrect sort order for non-UTC donors. The Cypher should use `datetime($created_at)` and the property type should be documented.

---

## 5. Translation Storage

### What is done well

- **`translationEN` and `translationDE` are stored inline on `Habit` nodes** (`habitsRouter.js:603-604`), avoiding a graph traversal to retrieve display text. This is an intentional denormalisation for read performance and is correctly documented in the `GET /habits` response.
- **Fallback chain is well implemented.** `translateAndRefine` (`habitsRouter.js:117-183`) and `translateToGerman` (`habitsRouter.js:48-113`) both fall back from LLM refinement to raw LibreTranslate output and then return `null` on hard failure, avoiding blocking the donation pipeline.
- **Language skip logic is correct.** English habits skip `translateAndRefine` (returns null), non-English habits skip `translateToGerman` (returns null).

### Issues

**[Major] `Neo4jDatabase.js` (old pipeline) stores translations as a separate `Habit` node linked by `hhh:hasTranslation`; `habitsRouter.js` (new pipeline) stores translations as `translationEN`/`translationDE` properties on the same node. These are structurally incompatible.**

If both pipelines are ever run against the same database, queries expecting `h.translationEN` will fail on old nodes (they have no such property), and queries traversing `hhh:hasTranslation` relationships will find nothing on new nodes. A migration or a unified data model is needed before both pipelines can coexist.

**[Major] `hasTranslation` is declared in `Ontology.ttl:42-44` with `rdfs:domain hhh:Behavior` and `rdfs:range hhh:Behavior`, but is used in `Neo4jDatabase.js:406-407` on `Habit` nodes (`hhh:Habit hhh:hasTranslation hhh:Habit`).**

This is a domain violation. The ontology says `hasTranslation` connects two Behaviors; the data uses it to connect two Habits. OWL reasoners will infer that `hhh:Habit-{id}` is a `hhh:Behavior`, corrupting the class hierarchy. The property domain/range in `Ontology.ttl` should be updated: `rdfs:domain hhh:Habit ; rdfs:range hhh:Habit`.

**[Minor] `translationDE` is only generated for English-language habits; there is no German-to-English-to-German path for third-language habits.**

A German user donating a French habit will get `translationEN` (French→English) but no `translationDE`. The `translateToGerman` function only accepts `language.startsWith('en')` (`habitsRouter.js:49`). This is a product decision gap that should be explicitly documented.

**[Minor] Translation results are not cached.**

Every call to `translateAndRefine` or `translateToGerman` makes live HTTP calls to LibreTranslate and the API service. Identical sentences donated by multiple users (e.g. "I go for a walk every morning") will be translated repeatedly. A Redis cache keyed by `sha256(sentence + language)` (consistent with the pattern used by the Python classify routers) would reduce cost and latency.

---

## 6. What is Done Well

- The `_esc()` method in `Neo4jDatabase.js:187-194` defensively escapes backslash, double-quote, newline, and carriage-return characters before embedding values in Turtle literals. This prevents Turtle parse errors for user input containing special characters.
- `MERGE` is used throughout for graph entities that should be deduplicated (Context nodes, BCIOConcept nodes), not `CREATE`. This is the correct idiomatic pattern.
- The `constraints.cypher` init script uses `IF NOT EXISTS` on all constraints and indexes, making it safely idempotent for fresh and restarted databases.
- The migration script (`migrate-group-labels.cypher`) is well-documented: it explains the rationale, the group definitions, the n10s label mapping, and includes a verification query. The step 2 fallback path shows careful consideration of edge cases.
- `habitsRouter.js:39-44`: The `toNumber()` helper correctly handles Neo4j `Integer` objects (which have a `.toNumber()` method) as well as plain JS numbers, preventing `[object Object]` bugs in stats aggregation.

---

## 7. Prioritised Improvements

### Critical

| # | Finding | File / Line | Impact |
|---|---------|-------------|--------|
| C1 | Dual schema coexistence — old `hhh__Habit` and new `Habit` nodes in same DB; stats, public list, and donate are inconsistent | `habitsRouter.js:192, 266, 448, 601` | Stats always 0 for new donations; disjoint public/private views |
| C2 | No connection pooling — Neo4j driver created and destroyed per query in production | `habitsRouter.js:22-36` | 200-500ms overhead per query; connection leak under load |
| C3 | No uniqueness constraint on `Habit.uuid` or index on `Context(text, dimension)` | `neo4j/init/constraints.cypher` | Duplicate Habit nodes on concurrent submit; O(n) MERGE scans |
| C4 | Cypher label injection via backtick interpolation in admin group-change route | `adminRouter.js:429` | Injection risk if input validation is weakened |
| C5 | n10s configuration errors silenced — wrong config can corrupt graph silently | `Neo4jDatabase.js:219-221` | Silent misconfiguration in production |

### Major

| # | Finding | File / Line | Impact |
|---|---------|-------------|--------|
| M1 | N+1 query in donate pipeline — 6-12 sequential round-trips per donation | `habitsRouter.js:618-646` | Donate latency scales with context/BCIO count |
| M2 | `exists()` deprecated in Neo4j 5.x — migration script will fail on current Neo4j | `migrate-group-labels.cypher:48` | Migration broken on Neo4j 5 |
| M3 | `hhh:language` declared as `rdf:langString` but stored as plain string | `Ontology.ttl:72`, `Neo4jDatabase.js:344` | OWL range violation; invalid Turtle syntax in data.ttl |
| M4 | `schema.ttl` is a stale fork of the ontology with different domain declarations | `fuseki/init/schema.ttl:14` | Divergent inferences between Fuseki and Neo4j |
| M5 | `hasTranslation` domain violation — ontology says Behavior→Behavior, data uses Habit→Habit | `Ontology.ttl:43`, `Neo4jDatabase.js:406` | OWL class hierarchy corruption under reasoning |
| M6 | No `Donor` node created in new donation pipeline — user-to-habit graph traversal broken | `habitsRouter.js:599-655` | Analytics queries fail; no auditability of who donated what |
| M7 | `hhh:RelatedBehavior` in seed data not in `Ontology.ttl` — class mismatch | `fuseki/init/data.ttl:62` | OWL validation failure on sample data |
| M8 | Orphaned Context nodes if Habit MATCH fails in inner loop | `habitsRouter.js:621-625` | Disconnected graph; silent data loss |

### Minor

| # | Finding | File / Line | Impact |
|---|---------|-------------|--------|
| m1 | `@base <http://www.w3.org/2002/07/owl#>` — confusing base URI | `Ontology.ttl:8`, `schema.ttl:7` | Cosmetic; no runtime effect |
| m2 | BCIO alignments documented as TODO comments but not expressed as OWL axioms | `Ontology.ttl:102-174` | BCIO classes are unused dead weight in ontology |
| m3 | Migration Step 2 MATCH is unanchored — could pick wrong ExperimentalSetting | `migrate-group-labels.cypher:45-50` | Wrong group assigned to some donors |
| m4 | `Habit.created_at` stored as ISO string, not Neo4j `DateTime` | `habitsRouter.js:600` | Inefficient date range queries; wrong sort order for non-UTC |
| m5 | Translations not cached in Redis | `habitsRouter.js:584-597` | Redundant LibreTranslate calls for repeated sentences |
| m6 | No NOT NULL constraint on `Habit.sentence` | `neo4j/init/constraints.cypher` | Silently null `original` field in API response |
