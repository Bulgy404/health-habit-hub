#!/usr/bin/env bash
# test-ontology.sh — Health Habit Hub ontology/graph integrity test suite
#
# Usage: ./tests/ontology/test-ontology.sh
#
# Requires:
#   NEO4J_HTTP  (default: http://localhost:7474)
#   NEO4J_USER  (default: neo4j)
#   NEO4J_PASS  (default: password)
#
# Exit codes: 0 = all tests passed, 1 = one or more tests failed

set -euo pipefail

NEO4J_HTTP="${NEO4J_HTTP:-http://localhost:7474}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASS="${NEO4J_PASS:-password}"

PASS=0
FAIL=0
ERRORS=()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

run_cypher() {
  # Execute a Cypher query via the Neo4j HTTP transactional API.
  # Returns the raw JSON response. Exits non-zero on HTTP or curl error.
  # Uses python3 to escape the query string safely into JSON.
  local query="$1"
  local payload
  payload=$(python3 -c "
import json, sys
q = sys.argv[1]
print(json.dumps({'statements': [{'statement': q}]}))
" "$query")

  curl -sf \
    --user "${NEO4J_USER}:${NEO4J_PASS}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "$payload" \
    "${NEO4J_HTTP}/db/neo4j/tx/commit"
}

assert_cypher_count() {
  # assert_cypher_count <description> <query> <expected_min_count>
  local desc="$1"
  local query="$2"
  local expected="$3"

  local response
  if ! response=$(run_cypher "$query" 2>/dev/null); then
    FAIL=$((FAIL + 1))
    ERRORS+=("FAIL [$desc]: HTTP request to Neo4j failed")
    return
  fi

  # Check for Cypher errors in the response body
  local err_count
  err_count=$(python3 -c "
import json, sys
d = json.loads(sys.argv[1])
print(len(d.get('errors', [])))
" "$response" 2>/dev/null) || err_count=1

  if [[ "${err_count:-1}" -gt 0 ]]; then
    FAIL=$((FAIL + 1))
    ERRORS+=("FAIL [$desc]: Cypher error — $response")
    return
  fi

  # Extract the first column of the first row
  local count
  count=$(python3 -c "
import json, sys
d = json.loads(sys.argv[1])
data = d['results'][0]['data']
print(data[0]['row'][0] if data else 0)
" "$response" 2>/dev/null) || count=0

  if [[ "${count:-0}" -ge "$expected" ]]; then
    PASS=$((PASS + 1))
    echo "PASS [$desc]: count=$count (expected >= $expected)"
  else
    FAIL=$((FAIL + 1))
    ERRORS+=("FAIL [$desc]: got ${count:-0} rows (expected >= $expected)")
  fi
}

assert_cypher_zero() {
  # assert_cypher_zero <description> <query>
  # Asserts that the query returns 0 data rows (no violations).
  local desc="$1"
  local query="$2"

  local response
  if ! response=$(run_cypher "$query" 2>/dev/null); then
    FAIL=$((FAIL + 1))
    ERRORS+=("FAIL [$desc]: HTTP request to Neo4j failed")
    return
  fi

  local err_count
  err_count=$(python3 -c "
import json, sys
d = json.loads(sys.argv[1])
print(len(d.get('errors', [])))
" "$response" 2>/dev/null) || err_count=1

  if [[ "${err_count:-1}" -gt 0 ]]; then
    FAIL=$((FAIL + 1))
    ERRORS+=("FAIL [$desc]: Cypher error — $response")
    return
  fi

  local data_rows
  data_rows=$(python3 -c "
import json, sys
d = json.loads(sys.argv[1])
print(len(d['results'][0]['data']))
" "$response" 2>/dev/null) || data_rows=0

  if [[ "${data_rows:-0}" -eq 0 ]]; then
    PASS=$((PASS + 1))
    echo "PASS [$desc]: 0 violations"
  else
    FAIL=$((FAIL + 1))
    ERRORS+=("FAIL [$desc]: ${data_rows} violation(s) found")
  fi
}

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

echo "=== HHH Graph Integrity Tests (current schema) ==="
echo ""

# Test 1: schema constraints are present (applied from neo4j/init/constraints.cypher)
echo "--- Neo4j: constraints ---"
assert_cypher_count \
  "Habit uuid uniqueness constraint exists" \
  "SHOW CONSTRAINTS YIELD name WHERE name = 'habit_uuid' RETURN count(*) AS c" \
  "1"

assert_cypher_count \
  "BCIOConcept uri uniqueness constraint exists" \
  "SHOW CONSTRAINTS YIELD name WHERE name = 'bcio_uri_unique' RETURN count(*) AS c" \
  "1"

assert_cypher_count \
  "Comment id uniqueness constraint exists" \
  "SHOW CONSTRAINTS YIELD name WHERE name = 'comment_id_unique' RETURN count(*) AS c" \
  "1"

# Test 2: seeded donation pipeline shape is retrievable
echo ""
echo "--- Neo4j: donation pipeline shape ---"
assert_cypher_count \
  "Habit nodes exist" \
  "MATCH (h:Habit) RETURN count(h) AS c" \
  "1"

assert_cypher_count \
  "Habit -> Context -> BCIOConcept path exists" \
  "MATCH (:Habit)-[:HAS_CONTEXT]->(:Context)-[:MAPS_TO]->(:BCIOConcept) RETURN count(*) AS c" \
  "1"

assert_cypher_count \
  "Comment attached to a Habit" \
  "MATCH (:Comment)-[:COMMENT_ON]->(:Habit) RETURN count(*) AS c" \
  "1"

# Test 3: integrity — no duplicates or orphans
echo ""
echo "--- Neo4j: integrity violations ---"
assert_cypher_zero \
  "No duplicate Habit uuids" \
  "MATCH (h:Habit) WITH h.uuid AS uuid, count(*) AS n WHERE n > 1 RETURN uuid"

assert_cypher_zero \
  "No orphaned Context nodes (must belong to a Habit)" \
  "MATCH (c:Context) WHERE NOT (:Habit)-[:HAS_CONTEXT]->(c) RETURN c.text AS orphaned_context"

assert_cypher_zero \
  "No orphaned Comment nodes (must reference a Habit)" \
  "MATCH (c:Comment) WHERE NOT (c)-[:COMMENT_ON]->(:Habit) RETURN c.id AS orphaned_comment"

assert_cypher_zero \
  "No orphaned BCIOConcept nodes (must be reached via a Context's MAPS_TO)" \
  "MATCH (b:BCIOConcept) WHERE NOT (:Context)-[:MAPS_TO]->(b) RETURN b.bcio_concept_id AS orphaned_bcio_concept"

assert_cypher_zero \
  "No Habit without a uuid" \
  "MATCH (h:Habit) WHERE h.uuid IS NULL RETURN id(h) AS habit_without_uuid"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="

if [[ "${#ERRORS[@]}" -gt 0 ]]; then
  echo ""
  echo "Failed tests:"
  for err in "${ERRORS[@]}"; do
    echo "  $err"
  done
fi

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi

exit 0
