import neo4j from 'neo4j-driver';
import { MongoClient } from 'mongodb';
import { config } from './config.js';
import { buildMongoUri } from '../models/survey.js';

const TIMEOUT_MS = 1500;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ]);
}

async function checkNeo4j() {
  const start = Date.now();
  const driver = neo4j.driver(
    config.neo4j.uri,
    neo4j.auth.basic(config.neo4j.user, config.neo4j.password),
    { connectionTimeout: TIMEOUT_MS }
  );
  try {
    await withTimeout(driver.verifyConnectivity(), TIMEOUT_MS);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch {
    return { status: 'error', latencyMs: Date.now() - start };
  } finally {
    await driver.close();
  }
}

async function checkMongo() {
  const start = Date.now();
  // Reuse the same URI-building logic as the real app connection
  // (models/survey.js) instead of reassembling it independently from env
  // vars — keeps a single source of truth so the health check can't drift
  // out of sync with (and give a false "ok"/"error" reading against) the
  // connection string the app actually uses.
  const uri = buildMongoUri();
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: TIMEOUT_MS,
  });
  try {
    await withTimeout(client.connect(), TIMEOUT_MS);
    await withTimeout(client.db('admin').command({ ping: 1 }), TIMEOUT_MS);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch {
    return { status: 'error', latencyMs: Date.now() - start };
  } finally {
    await client.close().catch(() => {});
  }
}

async function checkHttp(url) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const ok = res.status < 500;
    return { status: ok ? 'ok' : 'error', latencyMs: Date.now() - start };
  } catch {
    clearTimeout(timer);
    return { status: 'error', latencyMs: Date.now() - start };
  }
}

export async function checkAllServices({
  neo4jCheck = checkNeo4j,
  mongoCheck = checkMongo,
  keycloakUrl = process.env.KEYCLOAK_URL || 'http://keycloak:8080',
  recommenderUrl = process.env.RECOMMENDER_URL || 'http://recommender:8000',
} = {}) {
  const [neo4jResult, mongoResult, keycloak, recommender] = await Promise.all([
    neo4jCheck(),
    mongoCheck(),
    checkHttp(`${keycloakUrl}/health`),
    checkHttp(`${recommenderUrl}/health`),
  ]);

  const services = {
    neo4j: neo4jResult,
    mongo: mongoResult,
    keycloak,
    recommender,
  };

  const criticalDown = [neo4jResult, mongoResult].some(
    (s) => s.status === 'error'
  );
  const status = criticalDown ? 'error' : 'ok';

  return { status, services };
}
