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
