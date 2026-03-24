#!/usr/bin/env bash
# Sourced by the Neo4j Docker entrypoint just before Neo4j starts.
# Removes n10s legacy config keys that are not declared as valid settings in Neo4j 5.
sed -i '/^URI=/d; /^PASSWORD=/d; /^USER=/d' "${NEO4J_HOME}/conf/neo4j.conf" 2>/dev/null || true
