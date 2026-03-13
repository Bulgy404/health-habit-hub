// Migration: Add hhh__group property to hhh__Donor nodes
// ==========================================================
// Context
// -------
// Before this migration, study group membership was only encoded as an RDF
// class label on the ExperimentalSetting node (hhh__Group1 … hhh__Group4).
// Querying a donor's group required traversing Donor → Habit → Behavior →
// ExperimentalSetting and inspecting Neo4j node labels.
//
// This migration denormalises group membership by writing a `hhh__group`
// string property directly on each hhh__Donor node, enabling the simpler
// analytic query:
//   MATCH (u:hhh__Donor) RETURN u.hhh__group, count(*) AS n
// which should return exactly 4 rows (one per group) on a fully-seeded DB.
//
// Group definitions (after Ontology.ttl US-011 update):
//   hhh__Group1 – Closed Task, Open Description
//   hhh__Group2 – Closed Task, Closed Description  (= Closed-Ended)
//   hhh__Group3 – Open Task, Closed Description     (= Full+Free-text)
//   hhh__Group4 – Open Task, Open Description       (= Minimal+Free-text)
//
// The n10s SHORTEN mapping converts the hhh namespace prefix so that:
//   hhh:Group3     → Neo4j label  hhh__Group3
//   hhh:donates    → relationship hhh__donates
//   hhh:hasBehavior→ relationship hhh__hasBehavior
//   hhh:partOf     → relationship hhh__partOf
//
// How to run
// ----------
//   cypher-shell -u neo4j -p <password> --file scripts/migrate-group-labels.cypher
// or paste into the Neo4j Browser.
//
// Idempotency: safe to re-run; SET is idempotent.

// Step 1 – Resolve group via Donor → Habit → Behavior → ExperimentalSetting
MATCH (d:hhh__Donor)-[:hhh__donates]->(h:hhh__Habit)
      -[:hhh__hasBehavior]->(beh)-[:hhh__partOf]->(es)
WHERE any(lbl IN labels(es) WHERE lbl STARTS WITH 'hhh__Group')
WITH d, [lbl IN labels(es) WHERE lbl STARTS WITH 'hhh__Group'][0] AS grp
SET d.hhh__group = grp;

// Step 2 – Fallback: resolve via Donor → Habit → Context → ExperimentalSetting
//          for donations that have context labels but no explicit behavior node.
MATCH (d:hhh__Donor)-[:hhh__donates]->(h:hhh__Habit)
WHERE d.hhh__group IS NULL
MATCH (ctx)-[:hhh__partOf]->(es)
WHERE (ctx)-[:hhh__partOf]->() AND any(lbl IN labels(es) WHERE lbl STARTS WITH 'hhh__Group')
  AND exists((h)<-[:hhh__partOf]-(ctx))   // ctx belongs to same experimental setting tree
WITH d, [lbl IN labels(es) WHERE lbl STARTS WITH 'hhh__Group'][0] AS grp
SET d.hhh__group = grp;

// Verification query (run separately to confirm migration success):
// MATCH (u:hhh__Donor) RETURN u.hhh__group, count(*) AS n ORDER BY u.hhh__group;
// Expected: 4 rows – hhh__Group1, hhh__Group2, hhh__Group3, hhh__Group4
