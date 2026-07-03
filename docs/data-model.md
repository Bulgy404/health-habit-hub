# Health Habit Hub — Data Model Reference

This document is the canonical reference for all data stores in the Health Habit Hub platform. It covers the Neo4j graph database and MongoDB, plus the now-retired Apache Jena Fuseki triple store (kept for interpreting historical exports — see the note in [§2](#2-fuseki--sparql-triple-store-retired)). Use it when writing queries, building reports, or interpreting study data without needing to read source code.

> **Related:** a UML class diagram of this domain model (MongoDB collections, Neo4j nodes, and backend domain classes with relationships and multiplicities) is maintained at [`diagrams/classes/class-diagram.mmd`](diagrams/classes/class-diagram.mmd).

---

## Table of Contents

1. [Neo4j Graph Database](#1-neo4j-graph-database)
   - [Node Labels & Properties](#11-node-labels--properties)
   - [Relationship Types](#12-relationship-types)
   - [Annotated Cypher Queries](#13-annotated-cypher-queries)
2. [Fuseki / SPARQL Triple Store](#2-fuseki--sparql-triple-store)
   - [Namespace Prefixes](#21-namespace-prefixes)
   - [Annotated SPARQL Queries](#22-annotated-sparql-queries)
3. [MongoDB](#3-mongodb)
   - [Collections Overview](#31-collections-overview)
   - [Collection Schemas & Example Documents](#32-collection-schemas--example-documents)
   - [DFG Study Collections](#33-dfg-study-collections)
4. [G1–G4 Study Group Encoding](#4-g1g4-study-group-encoding)
5. [Anonymisation Model](#5-anonymisation-model)

---

## 1. Neo4j Graph Database

Neo4j stores the habit knowledge graph using a single active schema (`Habit`, `Context`, `BCIOConcept`), created by the donate pipeline (`POST /api/v1/habits/donate`). All endpoints (feed, stats, public list) read this schema.

> **Note (2026-06):** the former n10s/RDF schema (`hhh__Habit`, `hhh__Donor`, …) was retired without data migration — no legacy data existed. The n10s plugin is no longer loaded. Sections 1.2–1.4 below are kept as a historical reference only.

### 1.1 Current Schema (Donate Pipeline)

> Community signals: `Habit` nodes carry `annotations_helpful`,
> `annotations_iDoThis`, and `annotations_like` counters; anonymous comments
> are `(:Comment {id, text, createdAt})-[:COMMENT_ON]->(:Habit)` nodes whose
> authorship exists only in MongoDB `habit_comments`.


#### `Habit`

Created by `POST /api/v1/habits/donate`. Each donated habit that is classified as valid becomes one `Habit` node.

| Property | Type | Required | Description |
|---|---|---|---|
| `uuid` | String | Yes | UUID — uniqueness constraint `habit_uuid_unique` (needed, not yet created) |
| `sentence` | String | Yes | Free-text habit description as submitted by the participant |
| `language` | String | Yes | ISO 639-1 source language code (e.g. `en`, `de`) |
| `is_habit` | Boolean | Yes | Always `true` for nodes in Neo4j (non-habits go to MongoDB only) |
| `confidence` | Float | No | Classifier confidence score from the habit-classification step |
| `userID` | String | Yes | Keycloak `sub` of the donating participant |
| `created_at` | String | Yes | ISO-8601 timestamp of donation |
| `translationEN` | String | No | LLM-refined English translation; `null` for English-language habits |
| `translationDE` | String | No | LLM-refined German translation; `null` until produced by translate pipeline |

---

#### `Context`

Extracted contextual phrases linked to a `Habit`. Created/merged by `classify-context` step.

| Property | Type | Required | Description |
|---|---|---|---|
| `text` | String | Yes | Free-text context phrase (e.g. "before breakfast") |
| `dimension` | String | Yes | Context dimension: `TIME`, `PHYSICAL_SETTING`, `PRIOR_BEHAVIOR`, `OTHER_PEOPLE`, `INTERNAL_STATE`, `BEHAVIOR`, or `REASONING` |

Uniqueness is enforced on `(text, dimension)` — an index on this pair is needed.

---

#### `BCIOConcept`

BCIO ontology concepts mapped from context phrases. Created/merged by `map-bcio` step.

| Property | Type | Required | Description |
|---|---|---|---|
| `bcio_concept_id` | String | Yes | BCIO concept identifier (e.g. `BCIO:0000042`) |
| `bcio_concept_label` | String | No | Human-readable BCIO concept label |

---

#### New Relationship Types

| Relationship | From | To | Properties | Description |
|---|---|---|---|---|
| `HAS_CONTEXT` | `Habit` | `Context` | `dimension` (String) | Links a habit to its extracted context phrases |
| `MAPS_TO` | `Context` | `BCIOConcept` | `confidence` (Float), `phrase` (String), `dimension` (String) | Links a context phrase to its BCIO concept mapping |
| `DONATED` | `User` | `Habit` | `at` (ISO String) | Links a participant to a habit they donated (in addition to the scalar `Habit.userID`) |
| `DONATED_IN` | `Habit` | `Study` | — | Links a donated habit to the study its donor was enrolled in (only for study-enrolled donors). Enables traversals like "all habits donated in study X" |

> `User` nodes are keyed by `userID` (the Keycloak subject) with a uniqueness constraint (`user_userID`). Donations are also queryable from the scalar `Habit.userID` / `Habit.studyId` properties, but the `DONATED` / `DONATED_IN` edges make donor→habit→study traversals first-class.

---

### 1.2 Old Schema (n10s / Ontology Import) — *retired, historical reference*

All labels and property names use the `hhh__` prefix (neosemantics convention for namespace `http://example.com/hhh#`).

#### `hhh__Donor`

Represents a study participant who donates habits (old schema, used by `/habits/public` and `/habits/stats`).

| Property | Type | Required | Description |
|---|---|---|---|
| `hhh__id` | String | Yes | UUID — matches `userId` in Keycloak and MongoDB `participants` collection |
| `hhh__userId` | String | Yes | Same as `hhh__id`; subject of the uniqueness constraint `donor_userid_unique` |
| `hhh__group` | String | No | Study group label: `G1`, `G2`, `G3`, or `G4` (also expressed as a node label) |
| `uri` | String | Yes | RDF URI, e.g. `http://example.com/hhh#donor-<uuid>` |

Additional group label (exactly one): `:hhh__Group1`, `:hhh__Group2`, `:hhh__Group3`, `:hhh__Group4`

---

#### `hhh__Habit`

A single donated habit description.

| Property | Type | Required | Description |
|---|---|---|---|
| `hhh__id` | String | Yes | UUID for this habit node |
| `hhh__value` | String | Yes | Free-text habit description as entered by the participant |
| `hhh__source` | String | Yes | `userId` of the donating participant (matches `hhh__Donor.hhh__id`) |
| `hhh__timestamp` | DateTime | Yes | ISO-8601 timestamp of donation |
| `uri` | String | Yes | RDF URI |

---

#### `hhh__Behavior`

A classified behaviour node linked to a habit. Corresponds to the BCIO `BehaviourChangeTechnique` hierarchy.

| Property | Type | Required | Description |
|---|---|---|---|
| `hhh__id` | String | Yes | UUID |
| `hhh__value` | String | Yes | Behaviour label (e.g. "morning run", "drink water") |
| `hhh__language` | String | No | Language code, e.g. `de`, `en` |
| `uri` | String | Yes | RDF URI |

---

#### `hhh__Context`

Situational context associated with a behaviour. Subclasses model different context types.

| Property | Type | Required | Description |
|---|---|---|---|
| `hhh__id` | String | Yes | UUID |
| `hhh__value` | String | No | Free-text context description |
| `uri` | String | Yes | RDF URI |

**Subclass labels** (each node carries the subclass label _in addition to_ `hhh__Context`):

| Label | Description |
|---|---|
| `hhh__InternalState` | Psychological state (mood, motivation) |
| `hhh__Reasoning` | Stated reason / motivation for the habit |
| `hhh__People` | Social context (e.g. "with family") |
| `hhh__PhysicalSetting` | Environment (e.g. "at gym", "at home") |
| `hhh__PriorBehavior` | Preceding behaviour that triggers this habit |
| `hhh__TimeReference` | Time of day, day of week, etc. |

---

#### `hhh__ExperimentalSetting` / Group nodes

Study group nodes created during ontology import.

| Label | Study Condition | Description |
|---|---|---|
| `hhh__Group1` | G1 | Closed-Ended (structured task + structured general) |
| `hhh__Group2` | G2 | Closed-Ended Task, Open-Ended General |
| `hhh__Group3` | G3 | Full+Free-text (Open Task, Closed General) |
| `hhh__Group4` | G4 | Minimal+Free-text (Open Task, Open General) |

---

#### `Resource`

Generic RDF resource nodes created by n10s for any ontology class not mapped to a more specific label.

| Property | Type | Description |
|---|---|---|
| `uri` | String | Subject of the `n10s_unique_uri` uniqueness constraint |
| `rdfs__label` | String | Human-readable label |
| `rdfs__comment` | String | Annotation / TODO comments |

---

### 1.3 Relationship Types (Old Schema)

All relationship types use the `hhh__` prefix.

| Relationship | From | To | Description |
|---|---|---|---|
| `hhh__donates` | `hhh__Donor` | `hhh__Habit` | Links a participant to each donated habit |
| `hhh__hasBehavior` | `hhh__Habit` | `hhh__Behavior` | Links a habit to its classified behaviour |
| `hhh__hasContext` | `hhh__Behavior` | `hhh__Context` | Links a behaviour to its situational context node |
| `hhh__hasTranslation` | `hhh__Behavior` | `hhh__Behavior` | Links a behaviour to its translation in another language |
| `hhh__partOf` | `hhh__Behavior` or `hhh__Context` | `hhh__ExperimentalSetting` | Links nodes to the experimental group they belong to |

---

### 1.4 Annotated Cypher Queries

#### Q1 — Count habits donated by each study group

```cypher
// Returns total habit count per study group (G1–G4).
// Uses the group label on the Donor node for unambiguous group identification.
MATCH (d:hhh__Donor)-[:hhh__donates]->(h:hhh__Habit)
WITH
  CASE
    WHEN d:hhh__Group1 THEN 'G1'
    WHEN d:hhh__Group2 THEN 'G2'
    WHEN d:hhh__Group3 THEN 'G3'
    WHEN d:hhh__Group4 THEN 'G4'
    ELSE 'Unassigned'
  END AS studyGroup,
  count(h) AS habitCount
RETURN studyGroup, habitCount
ORDER BY studyGroup
```

#### Q2 — Habits by BCIO behaviour category

```cypher
// Lists habits with their BCIO-aligned behaviour class label.
// bcio__label is the rdfs:label from the BCIO namespace.
MATCH (h:hhh__Habit)-[:hhh__hasBehavior]->(b:hhh__Behavior)
OPTIONAL MATCH (b)-[:rdf__type]->(cls:Resource)
RETURN h.hhh__value AS habit,
       b.hhh__value AS behaviour,
       cls.rdfs__label AS bcioClass
ORDER BY bcioClass, habit
LIMIT 50
```

#### Q3 — Donation timeline (habits per day)

```cypher
// Count habits donated per calendar day (UTC).
// Useful for activity timeline charts in the admin panel.
MATCH (h:hhh__Habit)
WHERE h.hhh__timestamp IS NOT NULL
WITH date(datetime(h.hhh__timestamp)) AS day, count(h) AS cnt
RETURN day, cnt
ORDER BY day
```

#### Q4 — Top annotated habits (most "helpful" annotations)

```cypher
// Returns habits ranked by helpful annotation count.
// Annotation counts are stored in MongoDB habit_annotations collection;
// this query fetches habit metadata — join by hhh__id in application layer.
MATCH (h:hhh__Habit)
RETURN h.hhh__id AS habitId,
       h.hhh__value AS name,
       h.hhh__source AS donorId
ORDER BY habitId
```

#### Q5 — G3 vs G4 habit count comparison

```cypher
// Direct comparison of habits donated by G3 and G4 participants.
// G3 = Full+Free-text, G4 = Minimal+Free-text.
MATCH (d:hhh__Donor)-[:hhh__donates]->(h:hhh__Habit)
WHERE d:hhh__Group3 OR d:hhh__Group4
RETURN
  CASE WHEN d:hhh__Group3 THEN 'G3 (Full+Free-text)'
       ELSE 'G4 (Minimal+Free-text)' END AS groupLabel,
  count(h) AS habitCount
```

#### Q6 — Habits with their context nodes

```cypher
// Returns each habit with all its context nodes and context types.
MATCH (h:hhh__Habit)-[:hhh__hasBehavior]->(b:hhh__Behavior)-[:hhh__hasContext]->(c:hhh__Context)
RETURN h.hhh__value AS habit,
       b.hhh__value AS behaviour,
       labels(c) AS contextTypes,
       c.hhh__value AS contextValue
ORDER BY habit
LIMIT 100
```

#### Q7 — Physical setting distribution across groups

```cypher
// Frequency of PhysicalSetting context values per study group.
MATCH (d:hhh__Donor)-[:hhh__donates]->(h:hhh__Habit)
      -[:hhh__hasBehavior]->(b:hhh__Behavior)
      -[:hhh__hasContext]->(ps:hhh__PhysicalSetting)
WITH
  CASE
    WHEN d:hhh__Group1 THEN 'G1'
    WHEN d:hhh__Group2 THEN 'G2'
    WHEN d:hhh__Group3 THEN 'G3'
    WHEN d:hhh__Group4 THEN 'G4'
    ELSE 'Unassigned'
  END AS studyGroup,
  ps.hhh__value AS setting,
  count(*) AS freq
RETURN studyGroup, setting, freq
ORDER BY studyGroup, freq DESC
```

#### Q8 — Donor participation summary

```cypher
// Per-donor habit count — useful for progress tracking.
MATCH (d:hhh__Donor)
OPTIONAL MATCH (d)-[:hhh__donates]->(h:hhh__Habit)
RETURN d.hhh__id AS userId,
       count(h) AS habitsCount
ORDER BY habitsCount DESC
```

#### Q9 — Habits with multi-language translations

```cypher
// Returns habits whose behaviour nodes have translations.
MATCH (h:hhh__Habit)-[:hhh__hasBehavior]->(b:hhh__Behavior)
      -[:hhh__hasTranslation]->(t:hhh__Behavior)
RETURN h.hhh__value AS originalHabit,
       b.hhh__value AS originalBehaviour,
       b.hhh__language AS sourceLang,
       t.hhh__value AS translation,
       t.hhh__language AS targetLang
```

#### Q10 — Validate group assignment integrity

```cypher
// Integrity check: returns Donors with no valid group label.
// Should return 0 rows in a clean database.
MATCH (d:hhh__Donor)
WHERE NOT (d:hhh__Group1 OR d:hhh__Group2 OR d:hhh__Group3 OR d:hhh__Group4)
RETURN d.hhh__id AS userId, d.hhh__group AS groupField
```

---

## 2. Fuseki / SPARQL Triple Store *(retired)*

> **Note (2026-06):** the Fuseki service has been removed from `docker-compose.yml`. This section is kept as a reference for the RDF ontology model (HHH + BCIO) and for interpreting historical exports. See `migration.md`.

Apache Jena Fuseki serves the HHH + BCIO OWL ontology (and optionally the habit data as RDF). The dataset is named `/hhh`.

SPARQL endpoint: `http://fuseki:3030/hhh/sparql` (internal Docker network)
Dev UI: `http://localhost:3030`

### 2.1 Namespace Prefixes

| Prefix | Namespace URI | Description |
|---|---|---|
| `hhh:` | `http://example.com/hhh#` | Health Habit Hub domain ontology |
| `bcio:` | `http://humanbehaviourchange.org/ontology/BCIO#` | Behaviour Change Intervention Ontology (BCT Taxonomy v1, Michie et al. 2013) |
| `owl:` | `http://www.w3.org/2002/07/owl#` | OWL 2 ontology language |
| `rdf:` | `http://www.w3.org/1999/02/22-rdf-syntax-ns#` | RDF core vocabulary |
| `rdfs:` | `http://www.w3.org/2000/01/rdf-schema#` | RDF Schema |
| `xsd:` | `http://www.w3.org/2001/XMLSchema#` | XML Schema datatypes |
| `xml:` | `http://www.w3.org/XML/1998/namespace` | XML namespace |

Include these prefixes at the top of every SPARQL query:

```sparql
PREFIX hhh:  <http://example.com/hhh#>
PREFIX bcio: <http://humanbehaviourchange.org/ontology/BCIO#>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>
PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>
```

### 2.2 Annotated SPARQL Queries

#### SQ1 — List all HHH classes

```sparql
PREFIX hhh:  <http://example.com/hhh#>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

# Returns all classes defined in the HHH namespace with their labels.
SELECT ?class ?label
WHERE {
  ?class a owl:Class .
  FILTER(STRSTARTS(STR(?class), "http://example.com/hhh#"))
  OPTIONAL { ?class rdfs:label ?label }
}
ORDER BY ?class
```

#### SQ2 — List all BCIO classes

```sparql
PREFIX bcio: <http://humanbehaviourchange.org/ontology/BCIO#>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

# Returns all BCIO classes loaded into the ontology.
# Should return 119 classes from BCT Taxonomy v1.
SELECT ?class ?label
WHERE {
  ?class a owl:Class .
  FILTER(STRSTARTS(STR(?class), "http://humanbehaviourchange.org/ontology/BCIO#"))
  OPTIONAL { ?class rdfs:label ?label }
}
ORDER BY ?class
```

#### SQ3 — Total class count (HHH + BCIO)

```sparql
PREFIX owl: <http://www.w3.org/2002/07/owl#>

# Should return > 100 (15 HHH + 119 BCIO = 134 expected).
SELECT (COUNT(?class) AS ?total)
WHERE { ?class a owl:Class }
```

#### SQ4 — HHH object properties and their domains/ranges

```sparql
PREFIX hhh:  <http://example.com/hhh#>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

# Returns all object properties defined in the HHH namespace.
SELECT ?property ?domain ?range
WHERE {
  ?property a owl:ObjectProperty .
  FILTER(STRSTARTS(STR(?property), "http://example.com/hhh#"))
  OPTIONAL { ?property rdfs:domain ?domain }
  OPTIONAL { ?property rdfs:range  ?range  }
}
```

#### SQ5 — HHH data properties with ranges

```sparql
PREFIX hhh:  <http://example.com/hhh#>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

# Returns typed data properties (id, language, source, timestamp, value).
SELECT ?property ?range
WHERE {
  ?property a owl:DatatypeProperty .
  FILTER(STRSTARTS(STR(?property), "http://example.com/hhh#"))
  OPTIONAL { ?property rdfs:range ?range }
}
```

#### SQ6 — Experimental group subclass hierarchy

```sparql
PREFIX hhh:  <http://example.com/hhh#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

# Returns G1–G4 group definitions as subclasses of ExperimentalSetting.
SELECT ?group ?label ?comment
WHERE {
  ?group rdfs:subClassOf hhh:ExperimentalSetting .
  OPTIONAL { ?group rdfs:label   ?label   }
  OPTIONAL { ?group rdfs:comment ?comment }
}
ORDER BY ?group
```

#### SQ7 — Classes flagged for domain review

```sparql
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>

# Returns all classes with a 'TODO: domain-review' comment.
# These are HHH<->BCIO alignment mappings pending expert review.
SELECT ?class ?comment
WHERE {
  ?class a owl:Class ;
         rdfs:comment ?comment .
  FILTER(CONTAINS(STR(?comment), "TODO: domain-review"))
}
```

#### SQ8 — Check for duplicate class URIs

```sparql
PREFIX owl: <http://www.w3.org/2002/07/owl#>

# Integrity check: should return 0 rows (no duplicates).
SELECT ?class (COUNT(?class) AS ?occurrences)
WHERE { ?class a owl:Class }
GROUP BY ?class
HAVING (?occurrences > 1)
```

#### SQ9 — BCIO class hierarchy (top-level BCTs)

```sparql
PREFIX bcio: <http://humanbehaviourchange.org/ontology/BCIO#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>

# Returns top-level BCIO classes (no superclass within BCIO namespace).
SELECT ?class ?label
WHERE {
  ?class a owl:Class .
  FILTER(STRSTARTS(STR(?class), "http://humanbehaviourchange.org/ontology/BCIO#"))
  OPTIONAL { ?class rdfs:label ?label }
  FILTER NOT EXISTS {
    ?class rdfs:subClassOf ?parent .
    FILTER(STRSTARTS(STR(?parent), "http://humanbehaviourchange.org/ontology/BCIO#"))
  }
}
ORDER BY ?class
```

#### SQ10 — Full HHH class hierarchy

```sparql
PREFIX hhh:  <http://example.com/hhh#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>

# Returns the complete HHH class hierarchy with parent relationships.
SELECT ?child ?childLabel ?parent ?parentLabel
WHERE {
  ?child a owl:Class .
  FILTER(STRSTARTS(STR(?child), "http://example.com/hhh#"))
  OPTIONAL { ?child  rdfs:label ?childLabel  }
  OPTIONAL {
    ?child rdfs:subClassOf ?parent .
    FILTER(STRSTARTS(STR(?parent), "http://example.com/hhh#"))
    OPTIONAL { ?parent rdfs:label ?parentLabel }
  }
}
ORDER BY ?parent, ?child
```

---

## 3. MongoDB

MongoDB stores operational data: survey definitions, participant records, profile questionnaire answers, habit annotations, and recommendation logs. Database name is set via `MONGO_DB` environment variable (default `hhh`).

### 3.1 Collections Overview

| Collection | Primary Purpose | Soft-Delete? |
|---|---|---|
| `participants` | Admin-created participant accounts | Yes (`deletedAt`) |
| `profiles` | Participant profile questionnaire answers | No |
| `surveys` | Survey definitions (created by admin) | No |
| `survey_responses` | Completed survey answers | No |
| `habit_donations` | Habit donation log (denormalized from Neo4j) | No |
| `habit_annotations` | Anonymous crowd annotations (helpful / iDoThis) | No |
| `admin_settings` | Key-value platform configuration | No |
| `recommendations_log` | Accepted/dismissed recommendation events (legacy) | No |
| `users` | Per-user preferences (preferredLanguage) | No |
| `questionnaires` | Questionnaire definitions (slug, title, questions) | No |
| `form_responses` | Questionnaire form submissions (answers) from participants | No |
| `questionnaire_assignments` | Questionnaire assigned to a study (all groups) or a specific group, with a cadence | No |
| `questionnaire_windows` | Per-participant scheduled questionnaire occurrences + completion state | No |
| `enrollments` | Study/group membership per participant (drives study participant counts) | No |
| `recommendations` | Recommendation records from the Python recommender | No |
| `recommendation_feedback` | Free-text feedback on individual recommendations | No |
| `habits` | Non-habit submissions saved for manual review | No |
| `implementation_intentions` | Habit plans created by DFG study participants | No |
| `daily_behavior_logs` | Per-intention daily enactment logs | No |
| `srhi_responses` | Weekly SRHI habit-strength measurements | No |
| `cue_pools` | Pre-rated contextual cues for study conditions | No |
| `notification_campaigns` | Researcher-composed push notification campaigns | No |
| `consents` | Informed-consent acceptances (append-only audit trail, versioned) | No |
| `habit_comments` | Comment-ownership mapping (author of anonymous Neo4j Comment nodes) | No |

---

### 3.2 Collection Schemas & Example Documents

#### `participants`

Stores admin-created participant accounts. Soft-delete sets `deletedAt` and anonymises `username`.

| Field | BSON Type | Required | Description |
|---|---|---|---|
| `_id` | ObjectId | Auto | MongoDB document ID |
| `userId` | String | Yes | UUID (matches Keycloak user ID) |
| `username` | String | Yes | Login username (e.g. `p-<uuid>`); anonymised to `deleted-<hash>` on soft-delete |
| `password` | String | Yes | Initial password (plaintext, for token card PDF generation only) |
| `group` | String | No | Study group: `G1`, `G2`, `G3`, or `G4` — `null` until assigned |
| `enrolledAt` | Date | Yes | Timestamp of account creation |
| `lastActive` | Date | No | Last API activity timestamp |
| `surveyCompletionPct` | Number | No | 0–100, updated by background job |
| `deletedAt` | Date | No | Present only on soft-deleted documents |

**Example document:**
```json
{
  "_id": { "$oid": "65a1b2c3d4e5f6a7b8c9d0e1" },
  "userId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "username": "p-3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "password": "Xk9mN3pQ7rLw",
  "group": "G2",
  "enrolledAt": { "$date": "2025-09-01T08:00:00Z" },
  "lastActive": { "$date": "2025-09-15T14:23:11Z" },
  "surveyCompletionPct": 75
}
```

---

#### `profiles`

Stores the completed profile questionnaire answers for each participant. Upserted on every profile save.

| Field | BSON Type | Required | Description |
|---|---|---|---|
| `_id` | ObjectId | Auto | MongoDB document ID |
| `userId` | String | Yes | Keycloak `sub` — matches `participants.userId` |
| `answers` | Object | Yes | Free-form key-value map of question ID → answer |
| `completedAt` | Date | Yes | Timestamp of first completed profile submission |
| `updatedAt` | Date | Yes | Timestamp of most recent upsert |

**Example document:**
```json
{
  "_id": { "$oid": "65a1b2c3d4e5f6a7b8c9d0e2" },
  "userId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "answers": {
    "age": "34",
    "gender": "female",
    "exerciseFrequency": "3-5x/week"
  },
  "completedAt": { "$date": "2025-09-02T09:10:00Z" },
  "updatedAt": { "$date": "2025-09-10T11:30:00Z" }
}
```

---

#### `surveys`

Survey definitions created by admin. Status lifecycle: `draft` → `published` → `archived`.

| Field | BSON Type | Required | Description |
|---|---|---|---|
| `_id` | ObjectId | Auto | MongoDB document ID |
| `id` | String | Yes | UUID — used as public identifier in API |
| `title` | String | Yes | Human-readable survey title |
| `type` | String | Yes | Survey category (e.g. `baseline`, `weekly`, `exit`) |
| `jsonSchema` | Object | No | JSON Schema definition of questions |
| `status` | String | Yes | `draft`, `published`, or `archived` |
| `targetMode` | String | No | `all_participants`, `unassigned_only`, or `group_assigned` |
| `assignedGroups` | Array[String] | No | Subset of `["G1","G2","G3","G4"]`; only used when `targetMode = "group_assigned"` |
| `createdAt` | Date | Yes | Document creation timestamp |
| `updatedAt` | Date | No | Last update timestamp |

**Example document:**
```json
{
  "_id": { "$oid": "65a1b2c3d4e5f6a7b8c9d0e3" },
  "id": "7c9d8e2f-1a2b-3c4d-5e6f-7a8b9c0d1e2f",
  "title": "Baseline Questionnaire",
  "type": "baseline",
  "jsonSchema": {
    "type": "object",
    "properties": {
      "age": { "type": "string" },
      "exerciseFrequency": { "type": "string" }
    }
  },
  "status": "published",
  "targetMode": "group_assigned",
  "assignedGroups": ["G1", "G2"],
  "createdAt": { "$date": "2025-08-20T10:00:00Z" },
  "updatedAt": { "$date": "2025-08-25T12:00:00Z" }
}
```

**Targeting rules:**

- `habit-donation` is always available to every participant.
- `group_assigned` surveys are visible only to matching study groups.
- `unassigned_only` surveys are the standard/default path for participants without a group.
- `all_participants` surveys are visible regardless of group membership.

---

#### `survey_responses`

Stores completed survey submissions from participants.

| Field | BSON Type | Required | Description |
|---|---|---|---|
| `_id` | ObjectId | Auto | MongoDB document ID |
| `surveyId` | String | Yes | References `surveys.id` |
| `surveyTitle` | String | No | Denormalized title at submission time |
| `participantId` | String | Yes | Keycloak `sub` of the submitting participant |
| `answers` | Object | Yes | Key-value map of question ID → answer |
| `completedAt` | Date | Yes | Timestamp of submission |

**Example document:**
```json
{
  "_id": { "$oid": "65a1b2c3d4e5f6a7b8c9d0e4" },
  "surveyId": "7c9d8e2f-1a2b-3c4d-5e6f-7a8b9c0d1e2f",
  "surveyTitle": "Baseline Questionnaire",
  "participantId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "answers": {
    "age": "34",
    "exerciseFrequency": "3-5x/week"
  },
  "completedAt": { "$date": "2025-09-02T09:05:00Z" }
}
```

---

#### `habit_donations`

Denormalized habit donation log. The canonical habit graph is in Neo4j; this collection is used for fast admin feed queries and CSV export.

| Field | BSON Type | Required | Description |
|---|---|---|---|
| `_id` | ObjectId | Auto | MongoDB document ID |
| `participantId` | String | Yes | Keycloak `sub` of the donating participant |
| `habitName` | String | Yes | Free-text habit description |
| `category` | String | No | Study group label (denormalized from donor group) |
| `donatedAt` | Date | Yes | Timestamp of donation |

**Example document:**
```json
{
  "_id": { "$oid": "65a1b2c3d4e5f6a7b8c9d0e5" },
  "participantId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "habitName": "30-minute morning jog before breakfast",
  "category": "G2",
  "donatedAt": { "$date": "2025-09-10T07:15:00Z" }
}
```

---

#### `habit_annotations`

Anonymous crowd annotations on habits. No `userId` is stored — annotations are counted only.

| Field | BSON Type | Required | Description |
|---|---|---|---|
| `_id` | ObjectId | Auto | MongoDB document ID |
| `habitId` | String | Yes | References `hhh__Habit.hhh__id` in Neo4j |
| `type` | String | Yes | `"helpful"` or `"iDoThis"` |
| `createdAt` | Date | Yes | Timestamp of annotation |

**Example document:**
```json
{
  "_id": { "$oid": "65a1b2c3d4e5f6a7b8c9d0e6" },
  "habitId": "ab12cd34-ef56-7890-abcd-ef1234567890",
  "type": "helpful",
  "createdAt": { "$date": "2025-09-12T16:44:00Z" }
}
```

---

#### `admin_settings`

Key-value store for platform configuration. Seeded with defaults on first startup.

| Field | BSON Type | Required | Description |
|---|---|---|---|
| `_id` | ObjectId | Auto | MongoDB document ID |
| `key` | String | Yes | Setting identifier (unique) |
| `value` | String | Yes | Setting value |
| `updatedAt` | Date | Yes | Last update timestamp |

**Default settings:**

| Key | Default Value | Description |
|---|---|---|
| `token_card_format` | `"both"` | Token card PDF format: `"qr"`, `"print"`, or `"both"` |

**Example document:**
```json
{
  "_id": { "$oid": "65a1b2c3d4e5f6a7b8c9d0e7" },
  "key": "token_card_format",
  "value": "both",
  "updatedAt": { "$date": "2025-09-01T08:00:00Z" }
}
```

---

#### `recommendations_log`

Tracks whether participants accepted or dismissed recommendations from the Python recommender service.

| Field | BSON Type | Required | Description |
|---|---|---|---|
| `_id` | ObjectId | Auto | MongoDB document ID |
| `participantId` | String | Yes | Keycloak `sub` |
| `recommendationId` | String | No | Identifier from the recommender service |
| `type` | String | Yes | `"accepted"` or `"dismissed"` |
| `timestamp` | Date | Yes | Event timestamp |

**Example document:**
```json
{
  "_id": { "$oid": "65a1b2c3d4e5f6a7b8c9d0e8" },
  "participantId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "recommendationId": "rec-morning-walk-001",
  "type": "accepted",
  "timestamp": { "$date": "2025-09-14T08:30:00Z" }
}
```

---

#### `users`

Per-user preferences. Created/upserted by `PUT /api/v1/users/me`. If no record exists, `GET /api/v1/users/me` returns a default `{userId, preferredLanguage: "en"}` without persisting it.

| Field | BSON Type | Required | Description |
|---|---|---|---|
| `_id` | ObjectId | Auto | MongoDB document ID |
| `userId` | String | Yes | Keycloak `sub` (unique) |
| `preferredLanguage` | String | Yes | `"en"` or `"de"` |

**Example document:**
```json
{
  "_id": { "$oid": "65a1b2c3d4e5f6a7b8c9d0f1" },
  "userId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "preferredLanguage": "de"
}
```

---

#### `questionnaires`

Questionnaire definitions. Loaded from seed data or admin tooling. Only documents with `active: true` are returned to clients.

| Field | BSON Type | Required | Description |
|---|---|---|---|
| `_id` | ObjectId | Auto | MongoDB document ID |
| `slug` | String | Yes | URL-safe identifier (e.g. `sliq`, `rand-36`) |
| `title` | String | Yes | Human-readable questionnaire title |
| `description` | String | No | Short description shown to participants |
| `version` | String | Yes | Schema version string (e.g. `"1.0"`) |
| `questions` | Array | Yes | Array of question objects (type, id, text, options) |
| `active` | Boolean | Yes | `true` means visible to participants |

---

#### `form_responses`

Questionnaire responses submitted by participants via `POST /api/v1/questionnaire-responses`.

| Field | BSON Type | Required | Description |
|---|---|---|---|
| `_id` | ObjectId | Auto | MongoDB document ID |
| `userId` | String | Yes | Keycloak `sub` of the submitting participant |
| `questionnaireSlug` | String | Yes | Slug of the completed questionnaire |
| `answers` | Object | Yes | Map of `questionId → answer value` |
| `submitted_at` | Date | Yes | Timestamp of submission |

Compound index on `(userId, questionnaireSlug, submitted_at DESC)` is created at router startup.

**Example document:**
```json
{
  "_id": { "$oid": "65a1b2c3d4e5f6a7b8c9d0f2" },
  "userId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "questionnaireSlug": "sliq",
  "answers": {
    "sliq_diet": "2",
    "sliq_activity": "3"
  },
  "submitted_at": { "$date": "2026-03-20T10:00:00Z" }
}
```

On submission the response is also linked to the participant's next open
`questionnaire_windows` entry for that questionnaire (marking that scheduled
timepoint complete). Ad-hoc submissions with no matching window simply store the
response without linking.

---

#### `questionnaire_assignments`

A questionnaire assigned to a study on a cadence. `groupId: null` = study-wide
(all groups); a group id restricts / overrides it for that group. Managed via
`.../admin/studies/:id/questionnaire-assignments`.

| Field | BSON Type | Required | Description |
|---|---|---|---|
| `_id` | ObjectId | Auto | Assignment ID |
| `studyId` | ObjectId | Yes | Ref to `studies._id` |
| `groupId` | ObjectId \| null | Yes | Ref to `studies.groups[].id`; `null` = all groups (study-wide) |
| `questionnaireId` | ObjectId | Yes | Ref to `questionnaires._id` |
| `questionnaireSlug` | String | Yes | Denormalised slug (matches `form_responses.questionnaireSlug`) |
| `questionnaireTitle` | String | Yes | Denormalised title (for admin display) |
| `cadence` | Object | Yes | Schedule — see below |
| `active` | Boolean | Yes | Whether the assignment currently generates windows |
| `createdAt` / `updatedAt` | Date | Yes | Timestamps |

**Cadence** is one of two shapes:

- **Interval** — `{ mode: "interval", startOffsetDays, intervalDays, occurrences }`. Due dates = `enrolledAt + startOffsetDays + k·intervalDays` for `k` in `0 … occurrences-1`.
- **Fixed** — `{ mode: "fixed", weeks?: number[], days?: number[] }`. Due dates = the union of `week·7` and exact `day` offsets after enrollment (week 0 / day 0 = baseline at enrollment).

A group-scoped assignment for a questionnaire overrides the study-wide
assignment for that same questionnaire. Unique index on
`(studyId, groupId, questionnaireId)`.

**Example (SLIQ at baseline, week 4, week 8, plus day 3):**
```json
{
  "_id": { "$oid": "66b0000000000000000000a1" },
  "studyId": { "$oid": "66a0000000000000000000ff" },
  "groupId": null,
  "questionnaireId": { "$oid": "65a0000000000000000000aa" },
  "questionnaireSlug": "sliq",
  "questionnaireTitle": "Simple Lifestyle Indicator Questionnaire",
  "cadence": { "mode": "fixed", "weeks": [0, 4, 8], "days": [3] },
  "active": true,
  "createdAt": { "$date": "2026-03-01T09:00:00Z" },
  "updatedAt": { "$date": "2026-03-01T09:00:00Z" }
}
```

---

#### `questionnaire_windows`

One scheduled occurrence of an assignment for one participant, plus its
completion state. Generated on enrollment and whenever an assignment is
created/changed (back-filled for already-enrolled participants).

| Field | BSON Type | Required | Description |
|---|---|---|---|
| `_id` | ObjectId | Auto | Window ID |
| `userId` | String | Yes | Keycloak `sub` |
| `studyId` | ObjectId | Yes | Ref to `studies._id` |
| `groupId` | ObjectId \| null | Yes | Participant's group at generation time |
| `assignmentId` | ObjectId | Yes | Ref to `questionnaire_assignments._id` |
| `questionnaireId` | ObjectId | Yes | Ref to `questionnaires._id` |
| `questionnaireSlug` | String | Yes | Denormalised slug |
| `occurrence` | Int | Yes | 1-based index within the assignment's schedule |
| `scheduledFor` | Date | Yes | Due date (`enrolledAt + offset`) |
| `submittedAt` | Date \| null | Yes | When completed (null = open) |
| `responseId` | ObjectId \| null | Yes | Ref to the `form_responses` entry it was answered with |

Unique index on `(userId, assignmentId, occurrence)`. Study-level completion
(`completed / total`) is aggregated over this collection; per-participant
completion + answers power the admin participant view.

---

#### `recommendations`

Recommendation records generated by the Python recommender service. Written by the API-service; read by `GET /api/v1/recommendations/me`.

| Field | BSON Type | Required | Description |
|---|---|---|---|
| `_id` | ObjectId | Auto | MongoDB document ID |
| `recommendation_id` | String | Yes | Stable identifier for the recommendation |
| `userId` | String | Yes | Keycloak `sub` of the participant |
| `goal` | String | Yes | The habit goal text used to generate recommendations |
| `generated_at` | Date | Yes | Timestamp of generation |

---

#### `recommendation_feedback`

Free-text feedback comments on individual recommendations, written by `POST /api/v1/recommendations/:id/feedback`.

| Field | BSON Type | Required | Description |
|---|---|---|---|
| `_id` | ObjectId | Auto | MongoDB document ID |
| `recommendation_id` | String | Yes | References `recommendations.recommendation_id` |
| `userId` | String | Yes | Keycloak `sub` of the submitting participant |
| `goal` | String | Yes | Denormalised goal (copied from the recommendation) |
| `comment` | String | Yes | Free-text feedback comment |
| `created_at` | Date | Yes | Timestamp of submission |

---

### 3.3 DFG Study Collections

These five collections are created and managed by the DFG study module. They share the same MongoDB database as the core collections.

---

#### `implementation_intentions`

One document per implementation intention (habit plan) created by a user.

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | |
| `userId` | String | Keycloak `sub` |
| `enrollmentId` | ObjectId\|null | Links to enrollment if study participant |
| `studyId` | ObjectId\|null | |
| `groupId` | ObjectId\|null | |
| `behaviorKey` | String | e.g. `"walking"` |
| `behaviorLabel` | String | e.g. `"Walking"` |
| `durationMinutes` | Int | Target session duration |
| `cues` | Array | `[{text, source, cueId?}]` — 1 or 2 cues; source: `"pre_rated"` or `"self_selected"` |
| `intentionStatement` | String | Full if-then statement e.g. `"After dinner, I will walk for 20 minutes."` |
| `reminderTime` | String\|null | Daily reminder time `HH:mm` chosen at creation; frequency fades via the adaptive reminder plan (see architecture.md) |
| `status` | String | `"active"`, `"paused"`, `"completed"`, `"abandoned"` |
| `createdAt` | Date | |
| `updatedAt` | Date | |

Indexes: `{userId, status}`, `{enrollmentId}` (sparse)

---

#### `daily_behavior_logs`

One document per (intention, date) pair — idempotent upsert.

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | |
| `intentionId` | ObjectId | |
| `userId` | String | |
| `date` | String | `"YYYY-MM-DD"` |
| `enacted` | Boolean | `true` = enacted, `false` = explicit miss |
| `loggedAt` | Date | |

Indexes: `{intentionId, date}` unique, `{userId, date}`

---

#### `srhi_responses`

One document per (intention, weekNumber) — SRHI measurement window.

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | |
| `intentionId` | ObjectId | |
| `userId` | String | |
| `studyId` | ObjectId\|null | |
| `groupId` | ObjectId\|null | |
| `weekNumber` | Int | 1-based week number from intention creation |
| `scheduledFor` | Date | When this window opens |
| `submittedAt` | Date\|null | `null` = pending |
| `items` | Object\|null | `{srhi_1: 1-7, ..., srhi_12: 1-7}` |
| `score` | Double\|null | Mean of 12 items (1–7 scale) |
| `createdAt` | Date | |

Indexes: `{intentionId, weekNumber}` unique, `{userId, submittedAt}`

The 12 SRHI items are the validated Self-Report Habit Index (Verplanken & Orbell, 2003) — item text is returned by `GET /api/v1/me/habit-config` as `srhiItems`.

---

#### `cue_pools`

Pre-rated contextual cues for study conditions.

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | |
| `text` | String | Cue text e.g. `"After dinner each evening"` |
| `quality` | String | `"low"` or `"high"` |
| `dimensions` | Object | `{stability: 1-5, salience: 1-5, specificity: 1-5}` |
| `domain` | String | e.g. `"physical_activity"` |
| `language` | String | `"en"` or `"de"` |
| `createdAt` | Date | |

Indexes: `{quality, domain, language}`

---

#### `notification_campaigns`

Researcher-composed push notification campaigns.

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | |
| `studyId` | ObjectId\|null | Scoped to a study, or `null` for platform-wide |
| `createdBy` | String | Keycloak `sub` of researcher |
| `title` | String | Max 65 chars |
| `body` | String | Max 240 chars |
| `targetType` | String | `"individual"`, `"group"`, or `"all_enrolled"` |
| `targetIds` | String[] | userIds or groupIds |
| `scheduledFor` | Date\|null | `null` = send immediately on creation |
| `sentAt` | Date\|null | |
| `recipientCount` | Int\|null | |
| `status` | String | `"draft"`, `"scheduled"`, `"sent"`, `"failed"` |
| `createdAt` | Date | |

Indexes: `{status, scheduledFor}`, `{studyId}` (sparse)

---

## 4. G1–G4 Study Group Encoding

Participants are assigned to one of four experimental conditions at enrolment. The group is stored in three places and must remain consistent:

| Store | Location | Value Format |
|---|---|---|
| Keycloak | User attribute `group` | `"G1"` / `"G2"` / `"G3"` / `"G4"` |
| MongoDB | `participants.group` | `"G1"` / `"G2"` / `"G3"` / `"G4"` |
| Neo4j | Node labels on `hhh__Donor` | `:hhh__Group1` / `:hhh__Group2` / `:hhh__Group3` / `:hhh__Group4` |

The `PATCH /api/v1/admin/participants/:id/group` endpoint updates all three stores atomically.

### Group Definitions

| Code | Neo4j Label | Study Condition | Ontology URI |
|---|---|---|---|
| G1 | `hhh__Group1` | Closed-Ended (structured task + structured general description) | `http://example.com/hhh#Group1` |
| G2 | `hhh__Group2` | Closed Task, Open-Ended General description | `http://example.com/hhh#Group2` |
| G3 | `hhh__Group3` | Full+Free-text — Open Task, Closed General | `http://example.com/hhh#Group3` |
| G4 | `hhh__Group4` | Minimal+Free-text — Open Task, Open General | `http://example.com/hhh#Group4` |

### Querying Each Group Unambiguously After Migration

Before the G3/G4 fix (US-011), nodes carried only the string property `hhh__group`. After migration, use the **node label** as the authoritative source:

```cypher
-- All G3 donors and their habit count (use label, not property)
MATCH (d:hhh__Group3:hhh__Donor)
OPTIONAL MATCH (d)-[:hhh__donates]->(h:hhh__Habit)
RETURN d.hhh__id AS userId, count(h) AS habits
ORDER BY habits DESC
```

Validation query (should return 4 rows after migration):
```cypher
MATCH (u:hhh__Donor)
RETURN u.hhh__group AS group, count(*) AS count
ORDER BY group
```

---

## 5. Anonymisation Model

The platform applies soft-deletion for participants. The table below documents which data is retained versus removed/anonymised when a participant is deleted via `DELETE /api/v1/admin/participants/:id`.

| Data | Store | On Soft-Delete | Rationale |
|---|---|---|---|
| `participants.userId` | MongoDB | **Retained** (unmodified) | Required to trace linked records |
| `participants.username` | MongoDB | **Anonymised** → `deleted-<sha256[:8]>` | Removes PII identifier |
| `participants.password` | MongoDB | **Retained** (token card already issued) | Password is random; no real PII |
| `participants.group` | MongoDB | **Retained** | Needed for study group analysis |
| `participants.enrolledAt` | MongoDB | **Retained** | Needed for timeline analysis |
| `participants.deletedAt` | MongoDB | **Set** (current timestamp) | Marks document as deleted |
| Profile questionnaire (`profiles`) | MongoDB | **Not modified** | Profile answers retained for research; no name/contact data stored |
| Survey responses (`survey_responses`) | MongoDB | **Not modified** | Research data; pseudonymised by `participantId` only |
| Habit donations (`habit_donations`) | MongoDB | **Not modified** | Research data; pseudonymised by `participantId` |
| Habit graph nodes (`hhh__Donor`, `hhh__Habit`) | Neo4j | **Not modified** | Graph retained for research; no PII in node properties |
| Habit annotations (`habit_annotations`) | MongoDB | **Not applicable** | Anonymous — no `userId` field |
| Recommendations log (`recommendations_log`) | MongoDB | **Not modified** | Research data; pseudonymised |
| Keycloak user account | Keycloak | **Not automatically deleted** | Manual Keycloak admin action required to revoke login access |

**Note:** To fully remove a participant from the system (GDPR right to erasure), an operator must additionally:
1. Delete the Keycloak user via the admin console or API.
2. Delete or nullify `hhh__Donor` and linked `hhh__Habit` nodes in Neo4j if full graph erasure is required.
3. Remove documents from `profiles`, `survey_responses`, `habit_donations`, `recommendations_log` where `userId`/`participantId` matches.

The platform's built-in soft-delete covers pseudonymisation only.
