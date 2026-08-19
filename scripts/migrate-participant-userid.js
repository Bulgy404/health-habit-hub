#!/usr/bin/env node
/**
 * migrate-participant-userid.js
 *
 * Fixes `participants.userId` for records created before a bug fix in
 * onboardRouter.js / adminParticipantService.js: both generated a random
 * `userId` locally and asked Keycloak's user-create API to use it as the
 * user's `id`, but Keycloak never actually honours a client-supplied `id`
 * (it always assigns its own) — the affected code went on to persist the
 * locally-generated placeholder anyway, instead of looking up and using the
 * real Keycloak-assigned id. Because every JWT a participant authenticates
 * with carries Keycloak's *real* id as `sub`, this silently broke every
 * lookup keyed by the authenticated user's real identity for affected
 * participants: admin session/device matching (GET /admin/sessions),
 * credential rotation and account deletion's Mongo record updates
 * (POST /me/rotate-credentials, DELETE /me), and group-targeted survey
 * resolution (getParticipantGroup, used across surveyRouter.js).
 *
 * Nothing else needs migrating: enrollments, habit_donations, deviceTokens,
 * and every other collection are already written from `req.user.sub` live
 * at request time, not copied from `participants.userId` — confirmed by
 * reading every write site before writing this script. This migration only
 * ever touches the `userId` field on `participants` documents.
 *
 * For each participant, looks up their real Keycloak id by exact username
 * match and updates `participants.userId` to match if it differs. Idempotent
 * — a participant whose stored userId already matches is left alone, so
 * this is safe to re-run. A participant whose username isn't found in
 * Keycloak at all (deleted there, or never a real account) is skipped and
 * reported, not touched.
 *
 * Usage:
 *   node scripts/migrate-participant-userid.js --dry-run
 *   node scripts/migrate-participant-userid.js
 *
 * Needs (from .env / environment): MONGO_HOST, MONGO_PORT, MONGO_USER,
 * MONGO_PASSWORD, MONGO_DB, KEYCLOAK_URL, KEYCLOAK_REALM,
 * KEYCLOAK_ADMIN_CLIENT_SECRET (same as scripts/seed-test-user.js). The
 * `scripts/` directory isn't baked into the app container image, so this
 * runs from the repo root on a host with network access to both Mongo and
 * Keycloak (locally: the ports docker-compose.local.yml publishes; against a
 * remote environment: an SSH tunnel or a host already on that network) —
 * NOT via `docker exec hhh-app ...`. E.g., against local dev:
 *   MONGO_HOST=localhost KEYCLOAK_URL=http://localhost:8080 \
 *     node scripts/migrate-participant-userid.js --dry-run
 */
// Imported indirectly through app/models/survey.js (not `mongodb` directly)
// so this script — living in scripts/, a sibling of app/, not a descendant —
// resolves the dependency via app/node_modules the same way every other
// scripts/*.js migration already does (see migrate-habits-bcio.js importing
// app/utils/neo4jDrivers.js rather than `neo4j-driver` directly). A direct
// `import ... from 'mongodb'` here fails to resolve at all when run as
// documented (`node scripts/<this file>.js` from the repo root).
import { connect, disconnect } from '../app/models/survey.js';
import { createKeycloakAdminClient } from '../app/services/keycloakAdminClient.js';

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'hhh';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

/** Exact-match username lookup — same call createUser() itself makes post-creation. */
async function findRealKeycloakId(kcAdmin, username) {
  const token = await kcAdmin.getAdminToken();
  const res = await fetch(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users?username=${encodeURIComponent(username)}&exact=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Keycloak user lookup failed: ${res.status}`);
  const users = await res.json();
  return users[0]?.id ?? null;
}

async function main() {
  const kcAdmin = createKeycloakAdminClient({ base: KEYCLOAK_URL });
  const db = await connect();
  try {
    const collection = db.collection('participants');
    const cursor = collection.find(
      {},
      { projection: { userId: 1, username: 1 } }
    );

    let checked = 0;
    let fixed = 0;
    let alreadyCorrect = 0;
    let notFoundInKeycloak = 0;

    for await (const doc of cursor) {
      checked += 1;
      const realId = await findRealKeycloakId(kcAdmin, doc.username);
      if (!realId) {
        notFoundInKeycloak += 1;
        console.warn(
          `[skip] username=${doc.username} — no Keycloak user found (stored userId=${doc.userId})`
        );
        continue;
      }
      if (realId === doc.userId) {
        alreadyCorrect += 1;
        continue;
      }
      console.log(
        `${DRY_RUN ? '[dry-run] Would fix' : 'Fixing'} username=${doc.username}: ${doc.userId} -> ${realId}`
      );
      fixed += 1;
      if (!DRY_RUN) {
        await collection.updateOne(
          { _id: doc._id },
          { $set: { userId: realId } }
        );
      }
    }

    console.log(
      `\n${DRY_RUN ? '[dry-run] ' : ''}Checked ${checked} participant(s): ` +
        `${alreadyCorrect} already correct, ${fixed} ${DRY_RUN ? 'would be fixed' : 'fixed'}, ` +
        `${notFoundInKeycloak} skipped (no matching Keycloak user).`
    );
  } finally {
    await disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  });
}
