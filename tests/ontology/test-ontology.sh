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

echo "=== HHH Ontology + Graph Integrity Tests ==="
echo ""

# Test 1: All 4 experimental groups retrievable
echo "--- Neo4j: group retrievability ---"
assert_cypher_count \
  "Group1 nodes exist" \
  "MATCH (n:hhh__Group1) RETURN count(n) AS c" \
  "1"

assert_cypher_count \
  "Group2 nodes exist" \
  "MATCH (n:hhh__Group2) RETURN count(n) AS c" \
  "1"

assert_cypher_count \
  "Group3 nodes exist" \
  "MATCH (n:hhh__Group3) RETURN count(n) AS c" \
  "1"

assert_cypher_count \
  "Group4 nodes exist" \
  "MATCH (n:hhh__Group4) RETURN count(n) AS c" \
  "1"

# Test 2: No donor nodes without a group assignment
echo ""
echo "--- Neo4j: donor group integrity ---"
assert_cypher_zero \
  "No donors missing group assignment" \
  "MATCH (d:hhh__Donor) WHERE d.hhh__group IS NULL RETURN d.hhh__userId AS ungrouped_donor"

# Test 3: No orphaned habit nodes
echo ""
echo "--- Neo4j: orphaned habit nodes ---"
assert_cypher_zero \
  "No orphaned hhh__Habit nodes" \
  "MATCH (h:hhh__Habit) WHERE NOT (h)<-[:hhh__donates]-(:hhh__Donor) AND NOT (h)-[:hhh__partOf]->(:hhh__ExperimentalSetting) RETURN h.uri AS orphaned_habit"

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
