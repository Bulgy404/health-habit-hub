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
  const toClose = drivers.splice(0, drivers.length);
  await Promise.all(toClose.map((d) => d.close()));
}
