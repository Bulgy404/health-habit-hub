#!/usr/bin/env bash
# test-ontology.sh — Health Habit Hub ontology/graph integrity test suite
#
# Usage: ./tests/ontology/test-ontology.sh
#
# Requires:
#   NEO4J_URL  (default: bolt://localhost:7687)
#   NEO4J_USER (default: neo4j)
#   NEO4J_PASS (default: password)
#
# Exit codes: 0 = all tests passed, 1 = one or more tests failed

set -euo pipefail

NEO4J_URL="${NEO4J_URL:-bolt://localhost:7687}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASS="${NEO4J_PASS:-password}"

PASS=0
FAIL=0
ERRORS=()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

run_cypher() {
  # Execute a Cypher query via cypher-shell and return stdout.
  # cypher-shell must be on PATH (available in the neo4j Docker image at
  # /var/lib/neo4j/bin/cypher-shell, symlinked into PATH).
  cypher-shell \
    --address "$NEO4J_URL" \
    --username "$NEO4J_USER" \
    --password "$NEO4J_PASS" \
    --format plain \
    "$1"
}

assert_cypher_count() {
  # assert_cypher_count <description> <query> <expected_count>
  local desc="$1"
  local query="$2"
  local expected="$3"

  local result
  result=$(run_cypher "$query" 2>&1) || {
    FAIL=$((FAIL + 1))
    ERRORS+=("FAIL [$desc]: cypher-shell error: $result")
    return
  }
  # cypher-shell --format plain prints header line then data lines.
  # Count numeric lines (skip header and empty lines).
  local count
  count=$(echo "$result" | grep -cE '^[0-9]') || count=0

  if [[ "$count" -ge "$expected" ]]; then
    PASS=$((PASS + 1))
    echo "PASS [$desc]: got $count rows (expected >= $expected)"
  else
    FAIL=$((FAIL + 1))
    ERRORS+=("FAIL [$desc]: got $count rows (expected >= $expected)")
  fi
}

assert_cypher_zero() {
  # assert_cypher_zero <description> <query>
  # Asserts that the query returns 0 data rows (no violations).
  local desc="$1"
  local query="$2"

  local result
  result=$(run_cypher "$query" 2>&1) || {
    FAIL=$((FAIL + 1))
    ERRORS+=("FAIL [$desc]: cypher-shell error: $result")
    return
  }
  local count
  count=$(echo "$result" | grep -cE '^[0-9"]') || count=0

  # cypher-shell prints header row followed by data rows; a header-only result
  # means no data rows, which we treat as 0 violations.
  # We strip the header line and count remaining non-empty lines.
  local data_lines
  data_lines=$(echo "$result" | tail -n +2 | grep -cv '^$') || data_lines=0

  if [[ "$data_lines" -eq 0 ]]; then
    PASS=$((PASS + 1))
    echo "PASS [$desc]: 0 violations"
  else
    FAIL=$((FAIL + 1))
    ERRORS+=("FAIL [$desc]: $data_lines violation(s) found")
  fi
}

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

echo "=== HHH Ontology + Graph Integrity Tests ==="
echo ""

# Test 1: All 4 experimental groups retrievable via Cypher
echo "--- Neo4j: group retrievability ---"
assert_cypher_count \
  "Group1 nodes exist" \
  "MATCH (n:hhh__Group1) RETURN count(n) AS c;" \
  "1"

assert_cypher_count \
  "Group2 nodes exist" \
  "MATCH (n:hhh__Group2) RETURN count(n) AS c;" \
  "1"

assert_cypher_count \
  "Group3 nodes exist" \
  "MATCH (n:hhh__Group3) RETURN count(n) AS c;" \
  "1"

assert_cypher_count \
  "Group4 nodes exist" \
  "MATCH (n:hhh__Group4) RETURN count(n) AS c;" \
  "1"

# Test 2: No donor nodes without a group assignment
echo ""
echo "--- Neo4j: donor group integrity ---"
assert_cypher_zero \
  "No donors missing group assignment" \
  "MATCH (d:hhh__Donor) WHERE NOT EXISTS(d.hhh__group) RETURN d.hhh__userId AS ungrouped_donor;"

# Test 3: No orphaned habit nodes (every Habit must relate to a Donor or ExperimentalSetting)
echo ""
echo "--- Neo4j: orphaned habit nodes ---"
assert_cypher_zero \
  "No orphaned hhh__Habit nodes" \
  "MATCH (h:hhh__Habit) WHERE NOT (h)<-[:hhh__donates]-(:hhh__Donor) AND NOT (h)-[:hhh__partOf]->(:hhh__ExperimentalSetting) RETURN h.uri AS orphaned_habit;"

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
