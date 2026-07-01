// Neo4j constraints for Health Habit Hub (current schema only —
// legacy n10s/hhh__ constraints removed 2026-06, no legacy data existed).
// Core constraints are also applied automatically at backend startup
// via app/utils/neo4jSchema.js — this file is for fresh-database seeding.

// Uniqueness constraint on Habit.uuid (new donate-pipeline schema)
CREATE CONSTRAINT habit_uuid IF NOT EXISTS
  FOR (h:Habit) REQUIRE h.uuid IS UNIQUE;

// Composite index on Context(text, dimension) for fast MERGE lookups
CREATE INDEX context_text_dim IF NOT EXISTS
  FOR (c:Context) ON (c.text, c.dimension);

// User node — one node per Keycloak subject
CREATE CONSTRAINT user_userId IF NOT EXISTS
  FOR (u:User) REQUIRE u.userId IS UNIQUE;

// QuestionItem — composite index on (id, questionnaireId) for fast MERGE lookups.
// NODE KEY (composite uniqueness) requires Enterprise Edition — MERGE already
// prevents duplicates at the application layer on Community Edition.
CREATE INDEX question_item_idx IF NOT EXISTS
  FOR (qi:QuestionItem) ON (qi.id, qi.questionnaireId);

// Index for trajectory queries: find all submissions for a given questionnaire, ordered by time
CREATE INDEX submission_timeline IF NOT EXISTS
  FOR (s:Submission) ON (s.questionnaireId, s.submittedAt);

// Study node — one per MongoDB study document
CREATE CONSTRAINT study_uuid IF NOT EXISTS
  FOR (s:Study) REQUIRE s.uuid IS UNIQUE;

// Questionnaire slug — for HAS_QUESTIONNAIRE traversal
CREATE CONSTRAINT questionnaire_slug IF NOT EXISTS
  FOR (q:Questionnaire) REQUIRE q.slug IS UNIQUE;

// Vector indexes for cross-user semantic habit search (M3 recommendation pipeline).
// Each node type is indexed independently so the goal embedding can match via
// the habit sentence, a context phrase, or a BCIO behavior-change concept —
// whichever angle is most semantically relevant.
// Dimensions must match EMBEDDING_DIMENSIONS env var (default: 2560 = Qwen3-Embedding-4B).
CREATE VECTOR INDEX habit_embedding_idx IF NOT EXISTS
  FOR (h:Habit) ON (h.embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 2560, `vector.similarity_function`: 'cosine'}};

CREATE VECTOR INDEX context_embedding_idx IF NOT EXISTS
  FOR (c:Context) ON (c.embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 2560, `vector.similarity_function`: 'cosine'}};

CREATE VECTOR INDEX bcio_embedding_idx IF NOT EXISTS
  FOR (b:BCIOConcept) ON (b.embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 2560, `vector.similarity_function`: 'cosine'}};

// One node per BCIO concept
CREATE CONSTRAINT bcio_uri_unique IF NOT EXISTS
  FOR (b:BCIOConcept) REQUIRE b.uri IS UNIQUE;

// Community comments on habits
CREATE CONSTRAINT comment_id_unique IF NOT EXISTS
  FOR (c:Comment) REQUIRE c.id IS UNIQUE;
