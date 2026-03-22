/**
 * Shared lazy MongoDB connection helper.
 * Each router factory calls makeGetDb(db) once; the returned getDb()
 * function uses the injected db in tests or falls back to the real connection.
 */
export function makeGetDb(injectedDb) {
  let resolved = injectedDb || null;
  return async function getDb() {
    if (resolved) return resolved;
    const { connect } = await import('../models/survey.js');
    resolved = await connect();
    return resolved;
  };
}
