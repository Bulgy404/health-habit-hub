// Neo4j constraints for Health Habit Hub
// Run once on a fresh database before importing data.

// n10s requires a uniqueness constraint on Resource.uri
CREATE CONSTRAINT n10s_unique_uri IF NOT EXISTS
  FOR (r:Resource) REQUIRE r.uri IS UNIQUE;

// Uniqueness constraint on hhh__Donor.hhh__userId
CREATE CONSTRAINT donor_userid_unique IF NOT EXISTS
  FOR (d:hhh__Donor) REQUIRE d.hhh__userId IS UNIQUE;

// Index on ExperimentalSetting group labels for fast lookup
// Groups 1-4 are stored as distinct Neo4j labels after n10s import:
//   hhh__Group1 – Closed Task, Open Description
//   hhh__Group2 – Closed Task, Closed Description
//   hhh__Group3 – Full+Free-text (Open Task, Closed Description)
//   hhh__Group4 – Minimal+Free-text (Open Task, Open Description)
CREATE INDEX group3_idx IF NOT EXISTS FOR (n:hhh__Group3) ON (n.uri);
CREATE INDEX group4_idx IF NOT EXISTS FOR (n:hhh__Group4) ON (n.uri);

// Group label constraint: every ExperimentalSetting must carry exactly one of the
// four valid group labels.  The constraint is enforced at application layer via a
// trigger-style check query run after each data import (Neo4j CE does not support
// multi-label existence constraints natively).  The query below is the canonical
// integrity check — 0 rows means all ExperimentalSetting nodes are in a valid group:
//
//   MATCH (s:hhh__ExperimentalSetting)
//   WHERE NOT (s:hhh__Group1 OR s:hhh__Group2 OR s:hhh__Group3 OR s:hhh__Group4)
//   RETURN s.uri AS ungrouped_setting
//
// Additional indexes for Group1 and Group2 (Group3/Group4 already indexed above):
CREATE INDEX group1_idx IF NOT EXISTS FOR (n:hhh__Group1) ON (n.uri);
CREATE INDEX group2_idx IF NOT EXISTS FOR (n:hhh__Group2) ON (n.uri);

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
