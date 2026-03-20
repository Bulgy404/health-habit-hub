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

## migrate-group-labels.cypher

**Purpose:** Denormalises study group membership onto `hhh__Donor` nodes by writing a `hhh__group` string property, enabling simpler analytic queries.

### Usage

```bash
# Via cypher-shell
cypher-shell -u neo4j -p <password> --file scripts/migrate-group-labels.cypher

# Or paste directly into the Neo4j Browser
```

See comments inside the file for full details.
