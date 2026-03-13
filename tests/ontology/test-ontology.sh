#!/usr/bin/env bash
# test-ontology.sh — Health Habit Hub ontology/graph integrity test suite
#
# Usage: ./tests/ontology/test-ontology.sh
#
# Requires:
#   NEO4J_URL  (default: bolt://localhost:7687)
#   NEO4J_USER (default: neo4j)
#   NEO4J_PASS (default: password)
#   FUSEKI_URL (default: http://localhost:3030)
#
# Exit codes: 0 = all tests passed, 1 = one or more tests failed

set -euo pipefail

NEO4J_URL="${NEO4J_URL:-bolt://localhost:7687}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASS="${NEO4J_PASS:-password}"
FUSEKI_URL="${FUSEKI_URL:-http://localhost:3030}"
FUSEKI_DATASET="${FUSEKI_DATASET:-hhh}"

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

run_sparql() {
  # Execute a SPARQL SELECT query against Fuseki and return the response body.
  local query="$1"
  curl -sf \
    --data-urlencode "query=${query}" \
    -H "Accept: application/sparql-results+json" \
    "${FUSEKI_URL}/${FUSEKI_DATASET}/query"
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

assert_sparql_count() {
  # assert_sparql_count <description> <sparql_query> <min_expected>
  local desc="$1"
  local query="$2"
  local min_expected="$3"

  local response
  response=$(run_sparql "$query" 2>&1) || {
    FAIL=$((FAIL + 1))
    ERRORS+=("FAIL [$desc]: SPARQL/Fuseki error: $response")
    return
  }

  # Parse the "value" field from the SPARQL results JSON for the count binding.
  local count
  count=$(echo "$response" | grep -oP '"value"\s*:\s*"\K[0-9]+' | head -1) || count=0

  if [[ "${count:-0}" -ge "$min_expected" ]]; then
    PASS=$((PASS + 1))
    echo "PASS [$desc]: count=$count (expected >= $min_expected)"
  else
    FAIL=$((FAIL + 1))
    ERRORS+=("FAIL [$desc]: count=${count:-0} (expected >= $min_expected)")
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

# Test 4: All hhh__Habit nodes have rdfs:label in Fuseki
echo ""
echo "--- Fuseki: Habit rdfs:label coverage ---"
assert_sparql_count \
  "All hhh:Habit instances have rdfs:label in Fuseki" \
  "PREFIX hhh: <http://example.com/hhh#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> SELECT (COUNT(?h) AS ?count) WHERE { ?h a hhh:Habit . ?h rdfs:label ?lbl . }" \
  "0"

# Test 5: All BCIO owl:Class entries present in Fuseki (>= 100 classes total)
echo ""
echo "--- Fuseki: BCIO ontology classes loaded ---"
assert_sparql_count \
  "Fuseki has >= 100 owl:Class entries (HHH + BCIO)" \
  "PREFIX owl: <http://www.w3.org/2002/07/owl#> SELECT (COUNT(DISTINCT ?c) AS ?count) WHERE { ?c a owl:Class . }" \
  "100"

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
