/**
 * Audit logging.
 *
 * Written to THIS service's database, not HHH's, so an HHH admin cannot alter
 * the trail and it travels with the register if the service is relocated.
 *
 * Two rules that are easy to get wrong and expensive to get wrong:
 *
 * 1. RECORD FIELD NAMES, NEVER FIELD VALUES. An audit log that quotes the PII
 *    it is auditing is a second copy of that PII, under weaker access controls
 *    and a longer retention period. This is the mistake this class of system
 *    makes most often.
 *
 * 2. Record the roles AS SEEN IN THE TOKEN AT THE TIME. Roles change; the log
 *    must show what authority was actually exercised, not what the account
 *    happens to hold when someone reads the log later.
 *
 * Unlike HHH's admin audit log — which deliberately skips GETs, because the
 * studies page polls every 30 seconds — this one audits reads too. Different
 * volume regime: tens to hundreds of sensitive requests a day, all of them
 * worth knowing about.
 */

import { hashIp } from '../crypto/blindIndex.js';

/** Sensitivity classes. Only these two are ever collapsed. */
const DEDUPABLE = new Set(['list', 'pii_read']);
const DEDUP_WINDOW_MS = 60_000;

/**
 * Collapse identical repeated events inside a short window.
 *
 * A nurse hammering refresh should produce one row saying "viewed roster ×14",
 * not fourteen rows — a log nobody can read is not a control. `reveal`,
 * `write` and `export` are NEVER collapsed.
 */
function makeDeduper() {
  const seen = new Map();
  return {
    /** @returns {{ collapse: boolean, key?: string }} */
    check(entry) {
      if (!DEDUPABLE.has(entry.sensitivity)) return { collapse: false };
      const key = [
        entry.actorSub,
        entry.route,
        entry.subjectCode ?? '',
        entry.sensitivity,
      ].join('|');
      const now = Date.now();
      const prev = seen.get(key);
      if (prev && now - prev.at < DEDUP_WINDOW_MS) {
        prev.count += 1;
        return { collapse: true, key, id: prev.id, count: prev.count };
      }
      seen.set(key, { at: now, count: 1, id: null });
      return { collapse: false, key };
    },
    remember(key, id) {
      const e = seen.get(key);
      if (e) e.id = id;
    },
    /** Drop expired keys so the map cannot grow without bound. */
    prune() {
      const cutoff = Date.now() - DEDUP_WINDOW_MS;
      for (const [k, v] of seen) if (v.at < cutoff) seen.delete(k);
    },
  };
}

export function createAuditor({ db, keys, logger }) {
  const deduper = makeDeduper();
  setInterval(() => deduper.prune(), DEDUP_WINDOW_MS).unref?.();

  /**
   * Write one audit entry. Never throws and never blocks the response — a
   * failed audit write must not break a nurse's workflow, but it must be
   * loudly logged.
   */
  async function record(entry) {
    try {
      const dedup = deduper.check(entry);
      if (dedup.collapse && dedup.id) {
        await db.query(
          `UPDATE identity_audit_log SET repeat_count = $2 WHERE id = $1`,
          [dedup.id, dedup.count]
        );
        return;
      }

      const { rows } = await db.query(
        `INSERT INTO identity_audit_log
           (register_id, actor_sub, actor_roles, action, sensitivity,
            subject_code, request_id, fields, method, route, status_code,
            ip_hash, detail)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          entry.registerId ?? null,
          entry.actorSub,
          entry.actorRoles ?? [],
          entry.action,
          entry.sensitivity,
          entry.subjectCode ?? null,
          entry.requestId ?? null,
          // Field NAMES only. Never values.
          entry.fields ?? null,
          entry.method ?? null,
          entry.route ?? null,
          entry.statusCode ?? null,
          entry.ip ? hashIp(keys.peppers.ip, entry.ip) : null,
          entry.detail ? JSON.stringify(entry.detail) : null,
        ]
      );
      if (dedup.key) deduper.remember(dedup.key, rows[0].id);
    } catch (err) {
      logger?.error({ err, action: entry.action }, 'AUDIT WRITE FAILED');
    }
  }

  /**
   * Express middleware. Classification is set by the route via
   * `res.locals.audit`, because only the route knows whether it actually
   * decrypted anything.
   */
  function middleware(req, res, next) {
    res.on('finish', () => {
      const a = res.locals.audit;
      if (!a) return; // health checks and similar
      void record({
        ...a,
        actorSub: req.user?.sub ?? 'anonymous',
        actorRoles: req.user?.realm_access?.roles ?? [],
        method: req.method,
        route: req.route?.path ?? req.path,
        statusCode: res.statusCode,
        ip: req.ip,
      });
    });
    next();
  }

  return { record, middleware };
}

/** Helper so routes declare their classification legibly. */
export function audit(res, entry) {
  res.locals.audit = { ...(res.locals.audit ?? {}), ...entry };
}
