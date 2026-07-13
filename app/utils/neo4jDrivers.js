import neo4j from 'neo4j-driver';
import { config } from './config.js';

// Tracks long-lived Neo4j driver instances created by the various router
// factories (each builds its own driver/connection pool rather than sharing
// one) so graceful shutdown can close all of them, instead of leaving bolt
// connections dangling when the process exits.
const drivers = [];

/** Registers a driver for cleanup. No-op if `driver` is null/undefined. */
export function registerNeo4jDriver(driver) {
  if (driver) drivers.push(driver);
}

/** Closes every registered driver. Safe to call with zero drivers registered. */
export async function closeAllNeo4jDrivers() {
  _sharedDriver = null;
  const toClose = drivers.splice(0, drivers.length);
  await Promise.all(toClose.map((d) => d.close()));
}

// A process-lifetime driver for callers outside the request/router path (e.g.
// the notification scheduler) that need to run Cypher but have no router-built
// `neo4jRun`. Lazily created and registered for graceful shutdown.
let _sharedDriver = null;

/**
 * Run a Cypher query against the shared process-lifetime driver and return the
 * records as plain objects — the same shape router-built `neo4jRun` helpers
 * return.
 * @param {string} cypher
 * @param {object} [params]
 * @returns {Promise<Array<object>>}
 */
export async function runNeo4j(cypher, params = {}) {
  if (!_sharedDriver) {
    _sharedDriver = neo4j.driver(
      config.neo4j.uri,
      neo4j.auth.basic(config.neo4j.user, config.neo4j.password)
    );
    registerNeo4jDriver(_sharedDriver);
  }
  const session = _sharedDriver.session();
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject());
  } finally {
    await session.close();
  }
}
