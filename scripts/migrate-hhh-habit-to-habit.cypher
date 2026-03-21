// Migration: hhh__Habit → Habit (new ontology schema)
// =======================================================
// Context
// -------
// The codebase has two incompatible Neo4j schemas:
//   - Old (n10s/RDF): hhh__Habit, hhh__Donor, hhh__donates, hhh__value
//   - New (direct Cypher): Habit, Context, BCIOConcept, HAS_CONTEXT, MAPS_TO
//
// This migration copies all hhh__Habit nodes into the new Habit schema so that
// historical donations are preserved and all endpoints can query a single schema.
// Old hhh__Habit nodes are left in place (not deleted).
//
// Field mapping:
//   hhh__id / uri      → uuid          (unique string identifier)
//   hhh__value         → sentence      (habit text — matches new Habit.sentence)
//   hhh__language      → language      (ISO 639-1; defaults to 'de' if null)
//   hhh__habitStrength → habitStrength (preserved if present; null otherwise)
//   translationEN      → null          (no translation at migration time)
//   translationDE      → null          (no translation at migration time)
//   bcioClass          → null          (no BCIO enrichment at migration time)
//   dimension          → null
//   confidence         → null
//   created_at         → toString(datetime())   (migration timestamp)
//   migrated_from_hhh  → true          (migration provenance flag)
//
// Idempotency
// -----------
// MERGE on uuid — running the script multiple times produces no duplicates.
// ON CREATE SET only fires for newly created nodes; existing Habit nodes are
// left untouched on subsequent runs.
//
// Donor relationships
// -------------------
// Existing hhh__Donor-[:hhh__donates]->hhh__Habit relationships are
// preserved as hhh__Donor-[:DONATED]->:Habit.  hhh__Donor nodes are not
// removed or modified.
//
// How to run
// ----------
//   node scripts/run-migration.js
// or via cypher-shell:
//   cypher-shell -u neo4j -p <password> --file scripts/migrate-hhh-habit-to-habit.cypher

// ---------------------------------------------------------------------------
// Step 1: Migrate Habit nodes
// Each hhh__Habit is MERGE'd into a new :Habit node using the hhh__id (or uri)
// as the uuid.  ON CREATE only fires when the node does not yet exist —
// subsequent runs skip already-migrated nodes.
// ---------------------------------------------------------------------------
MATCH (h:hhh__Habit)
WITH h, coalesce(h.hhh__id, h.uri) AS habitId
WHERE habitId IS NOT NULL
MERGE (new:Habit {uuid: habitId})
ON CREATE SET
  new.sentence       = h.hhh__value,
  new.language       = coalesce(h.hhh__language, 'de'),
  new.habitStrength  = h.hhh__habitStrength,
  new.translationEN  = null,
  new.translationDE  = null,
  new.bcioClass      = null,
  new.dimension      = null,
  new.confidence     = null,
  new.created_at     = toString(datetime()),
  new.migrated_from_hhh = true;

// ---------------------------------------------------------------------------
// Step 2: Migrate donor relationships
// For each hhh__Donor-[:hhh__donates]->hhh__Habit triple, create an equivalent
// hhh__Donor-[:DONATED]->:Habit relationship pointing to the new Habit node.
// MERGE ensures idempotency — no duplicate DONATED edges on re-runs.
// ---------------------------------------------------------------------------
MATCH (d:hhh__Donor)-[:hhh__donates]->(h:hhh__Habit)
WITH d, h, coalesce(h.hhh__id, h.uri) AS habitId
WHERE habitId IS NOT NULL
MATCH (new:Habit {uuid: habitId})
MERGE (d)-[:DONATED]->(new);
