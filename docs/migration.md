# Database Migrations

This document describes all database migration scripts available in the `scripts/` directory.

---

## migrate-habits-bcio.js

**Purpose:** Enriches existing Neo4j `Habit` nodes with BCIO context and concept links by running them through the API-service M1.2 (classify-context) and M1.3 (map-bcio) pipeline.

After US-100 was implemented, newly donated habits are automatically enriched with `Context` nodes (via `HAS_CONTEXT` relationships) and `BCIOConcept` nodes (via `MAPS_TO` relationships). This script back-fills that enrichment for habits that were donated before the pipeline existed.

### When to run

Run this script:
- After deploying US-100/US-099 for the first time on an environment with existing data.
- Whenever the BCIO ontology (`API-service/data/bcio.owl`) is updated and you want to re-map existing habits (the script skips already-migrated nodes; set `migrated_to_bcio` to `false` or remove the property to force re-migration).

### Prerequisites

- Neo4j is running and reachable.
- The API-service (recommender) is running and reachable.
- Node.js ≥ 18 (uses native `fetch`).
- The `neo4j-driver` npm package is installed (`npm install` in `app/`).

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `NEO4J_URI` | `bolt://neo4j:7687` | Neo4j bolt connection URI |
| `NEO4J_USER` | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | `password` | Neo4j password |
| `API_SERVICE_URL` | `http://recommender:8000` | API-service base URL |

### Usage

```bash
# Standard run (writes to Neo4j)
node scripts/migrate-habits-bcio.js

# Dry run — prints what would be done without writing anything
node scripts/migrate-habits-bcio.js --dry-run

# With custom environment variables
NEO4J_URI=bolt://localhost:7687 \
NEO4J_PASSWORD=secret \
API_SERVICE_URL=http://localhost:8000 \
node scripts/migrate-habits-bcio.js
```

### What the script does

1. Queries Neo4j for all `Habit` nodes where `migrated_to_bcio` is absent or `false`.
2. For each habit:
   - Calls `POST /api/v1/llm/classify-context` to extract context dimension phrases.
   - Calls `POST /api/v1/llm/map-bcio` to map each phrase to a BCIO concept.
   - MERGEs `Context` nodes and `HAS_CONTEXT` relationships into Neo4j.
   - MERGEs `BCIOConcept` nodes and `MAPS_TO` relationships into Neo4j.
   - Sets `migrated_to_bcio: true` and `migrated_at: <ISO timestamp>` on the `Habit` node.
3. Logs `Processed N habits — M succeeded, K failed.`
4. Exits with code 1 if any habits failed (individual failures do not abort the run).

### Idempotency

The script is safe to re-run. Habits that already have `migrated_to_bcio: true` are skipped. `MERGE` statements ensure no duplicate nodes or relationships are created.

### Expected output

```
Found 42 habit(s) to migrate.
[1/42] Processing habit 550e8400-e29b-41d4-a716-446655440000…
  ✓ Succeeded
[2/42] Processing habit 6ba7b810-9dad-11d1-80b4-00c04fd430c8…
  ✗ Failed: classify-context returned HTTP 502
…
Processed 42 habits — 41 succeeded, 1 failed.
```

---

## Schema Changes in `ralph/hhh-platform-unified`

This section documents all database schema changes introduced in the `ralph/hhh-platform-unified` branch. These changes are applied automatically by the application code — no manual migration script is required for new environments. For existing environments with data, follow the steps below.

### Neo4j — `translationEN` and `translationDE` fields on `Habit` nodes

**Introduced in:** US-114, US-116

**What changed:**
- `POST /api/v1/habits/donate` now calls LibreTranslate + the LLM refinement pipeline before persisting a `Habit` node.
- The `Habit` node CREATE statement now includes `translationEN` (refined English translation) and `translationDE` (reserved for future German translation pipeline).
- `GET /api/v1/habits?lang=en|de` returns a `displayText` convenience field derived from these properties.

**New `Habit` node shape:**

```cypher
CREATE (h:Habit {
  uuid: $uuid,
  original: $sentence,
  language: $language,
  translationEN: $translationEN,   -- null for English habits
  translationDE: $translationDE    -- null until German pipeline is complete
})
```

**Migration for existing data:**
Run `scripts/migrate-habits-bcio.js` (with `--dry-run` first) to back-fill `translationEN` on existing `Habit` nodes. The script calls `POST /api/v1/llm/refine-translation` for each English draft produced by LibreTranslate.

```bash
NEO4J_URI=bolt://localhost:7687 \
NEO4J_PASSWORD=<password> \
API_SERVICE_URL=http://localhost:8000 \
node scripts/migrate-habits-bcio.js --dry-run
```

Remove `--dry-run` to apply. The script is idempotent — already-migrated nodes are skipped.

**Impact on existing queries:**
- `GET /api/v1/habits` previously returned `{ ok: true }`. It now returns an array of `DonatedHabit` objects. Any client code relying on the old response shape must be updated.
- The `displayText` field is only present when `?lang=en` or `?lang=de` is supplied.

---

### MongoDB — `preferredLanguage` in the `users` collection

**Introduced in:** US-078 (users router), US-137 (Flutter integration)

**What changed:**
- `PUT /api/v1/users/me` upserts a document in the `users` collection keyed by Keycloak `sub`.
- `GET /api/v1/users/me` returns `{ preferredLanguage: "en" }` as a synthetic default when no document exists (no write on GET).

**Document shape:**

```json
{
  "userId": "<keycloak-sub>",
  "preferredLanguage": "en",
  "createdAt": "2026-03-21T00:00:00.000Z",
  "updatedAt": "2026-03-21T00:00:00.000Z"
}
```

**Migration for existing data:** None required. Existing users without a `users` document receive the default `{ preferredLanguage: "en" }` response until they change their language preference.

**Supported values:** `"en"` (English), `"de"` (German). The Flutter `LocaleProvider` maps these ISO 639-1 codes to `Locale('en')` / `Locale('de')`.

---

### Neo4j — Constraints and indexes for new schema

**Introduced in:** Review finding (US-133) — not yet applied automatically

The new `Habit`, `Context`, and `BCIOConcept` labels are missing uniqueness constraints and indexes. The following Cypher should be run once on any environment to add them:

```cypher
-- Unique uuid on Habit (prevents duplicate donations)
CREATE CONSTRAINT habit_uuid_unique IF NOT EXISTS
  FOR (h:Habit) REQUIRE h.uuid IS UNIQUE;

-- Composite index on Context for deduplication
CREATE INDEX context_text_dimension IF NOT EXISTS
  FOR (c:Context) ON (c.text, c.dimension);

-- Unique URI on BCIOConcept
CREATE CONSTRAINT bcio_uri_unique IF NOT EXISTS
  FOR (b:BCIOConcept) REQUIRE b.uri IS UNIQUE;
```

These can be run via `cypher-shell` or pasted into the Neo4j Browser.

---

## migrate-group-labels.cypher

**Purpose:** Denormalises study group membership onto `hhh__Donor` nodes by writing a `hhh__group` string property, enabling simpler analytic queries.

### Usage

```bash
# Via cypher-shell
cypher-shell -u neo4j -p <password> --file scripts/migrate-group-labels.cypher

# Or paste directly into the Neo4j Browser
```

See comments inside the file for full details.
