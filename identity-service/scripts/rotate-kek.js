#!/usr/bin/env node
/**
 * Rotate the key-encryption key.
 *
 * Cheap by design: each register's data key is unwrapped under the OLD KEK and
 * rewrapped under the NEW one. **No participant data is decrypted or
 * rewritten** — the DEKs are unchanged, so every existing ciphertext stays
 * valid. That is the whole reason KEK and blind-index versions are separate
 * counters: a routine KEK rotation must never trigger the expensive re-index.
 *
 * Usage:
 *   IDENTITY_MASTER_KEY_FILE=... IDENTITY_KEK_VERSION=2 \
 *     node scripts/rotate-kek.js [--dry-run]
 *
 * The master key file is unchanged. Only the derivation VERSION moves, so the
 * old KEK stays derivable for as long as the master key exists — which is what
 * makes this reversible if a rotation is interrupted.
 */

import pg from 'pg';
import { loadConfig } from '../src/config.js';
import { deriveKekVersion } from '../src/crypto/keys.js';
import { unwrapDek, wrapDek } from '../src/crypto/envelope.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const config = loadConfig();
  const target = config.keys.kekVersion;

  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  const { rows } = await pool.query(
    `SELECT id, hhh_study_id, dek_wrapped, kek_version FROM study_registers`
  );

  console.log(`Target KEK version: ${target}`);
  console.log(
    `Registers found: ${rows.length}${dryRun ? '  (DRY RUN)' : ''}\n`
  );

  let rotated = 0;
  let skipped = 0;

  for (const r of rows) {
    if (r.kek_version === target) {
      console.log(`  = ${r.hhh_study_id}  already at v${target}`);
      skipped++;
      continue;
    }
    if (r.kek_version > target) {
      // Refuse rather than "rotate backwards": that would rewrap under an
      // older key, which is a downgrade, not a rotation.
      console.error(
        `  ! ${r.hhh_study_id}  is at v${r.kek_version}, target is v${target} — refusing to downgrade`
      );
      process.exitCode = 1;
      continue;
    }

    // Unwrap under the version it was written with, not the current one.
    const oldKek = deriveKekVersion(config.master, r.kek_version);
    let dek;
    try {
      dek = unwrapDek({
        kek: oldKek,
        registerId: r.id,
        kekVersion: r.kek_version,
        wrapped: r.dek_wrapped,
      });
    } catch (err) {
      // Almost always a different master key than the one this data was
      // written with. Stop rather than proceed: rewrapping under the wrong
      // key would make the register permanently unreadable.
      console.error(
        `  ! ${r.hhh_study_id}  could not unwrap v${r.kek_version}: ${err.message}`
      );
      console.error(
        '    Is IDENTITY_MASTER_KEY_FILE the same key this register was created with?'
      );
      process.exitCode = 1;
      continue;
    }

    const rewrapped = wrapDek({
      kek: config.keys.kek,
      registerId: r.id,
      kekVersion: target,
      dek,
    });

    // Verify BEFORE writing. A rewrap that cannot be unwrapped again would
    // lock the register out permanently, and there is no second copy.
    const check = unwrapDek({
      kek: config.keys.kek,
      registerId: r.id,
      kekVersion: target,
      wrapped: rewrapped,
    });
    if (!check.equals(dek)) {
      console.error(`  ! ${r.hhh_study_id}  verification failed — not written`);
      process.exitCode = 1;
      continue;
    }

    if (!dryRun) {
      await pool.query(
        `UPDATE study_registers SET dek_wrapped = $2, kek_version = $3 WHERE id = $1`,
        [r.id, rewrapped, target]
      );
    }
    console.log(`  ✓ ${r.hhh_study_id}  v${r.kek_version} -> v${target}`);
    rotated++;
  }

  console.log(
    `\n${dryRun ? 'Would rotate' : 'Rotated'}: ${rotated}, already current: ${skipped}`
  );
  if (!dryRun && rotated > 0) {
    console.log(
      'Set IDENTITY_KEK_VERSION=' +
        target +
        ' permanently before restarting the service.'
    );
  }
  await pool.end();
}

main().catch((err) => {
  console.error('Rotation failed:', err.message);
  process.exit(1);
});
