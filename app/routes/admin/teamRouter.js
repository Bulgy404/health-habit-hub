import express from 'express';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../middleware/auth.js';
import { createKeycloakAdminClient } from '../../services/keycloakAdminClient.js';
import { logger } from '../../utils/logger.js';

const log = logger.child({ module: 'teamRouter' });

const MANAGEABLE_ROLES = [ROLES.ADMIN, ROLES.RESEARCHER];

/**
 * Admin "Team & Roles" management — surfaces and edits who holds the
 * `admin`/`researcher` realm roles, which today live entirely in the
 * Keycloak console with no in-app visibility.
 *
 * @param {{ db?: import('mongodb').Db, keycloak?: object }} deps
 */
export function createTeamRouter({ keycloak } = {}) {
  const router = express.Router();
  const kcAdmin = keycloak || createKeycloakAdminClient();

  // GET /api/v1/admin/team — list current admin+researcher role holders,
  // merged by user id (a user can hold both roles).
  router.get('/team', requireRole(ROLES.ADMIN), async (req, res) => {
    try {
      const byRole = await Promise.all(
        MANAGEABLE_ROLES.map((role) => kcAdmin.listUsersByRole(role))
      );
      const members = new Map();
      MANAGEABLE_ROLES.forEach((role, i) => {
        for (const u of byRole[i]) {
          const existing = members.get(u.id) || {
            id: u.id,
            username: u.username,
            email: u.email ?? null,
            roles: [],
          };
          existing.roles.push(role);
          members.set(u.id, existing);
        }
      });
      res.json({ members: Array.from(members.values()) });
    } catch (err) {
      log.error({ err }, 'failed to list team members');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/admin/team/search?q= — find an existing Keycloak account to
  // grant a role to.
  router.get('/team/search', requireRole(ROLES.ADMIN), async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q) return res.json({ users: [] });
      const users = await kcAdmin.searchUsers(q);
      res.json({
        users: users.map((u) => ({
          id: u.id,
          username: u.username,
          email: u.email ?? null,
        })),
      });
    } catch (err) {
      log.error({ err }, 'failed to search users');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/admin/team/:userId/roles — grant admin or researcher.
  router.post('/team/:userId/roles', requireRole(ROLES.ADMIN), async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body || {};
      if (!MANAGEABLE_ROLES.includes(role)) {
        return res.status(400).json({
          error: `role must be one of: ${MANAGEABLE_ROLES.join(', ')}`,
        });
      }
      await kcAdmin.assignRole(userId, role);
      res.locals.auditAction = `grant_role_${role}`;
      res.locals.auditResourceType = 'team_member';
      res.locals.auditResourceId = userId;
      res.json({ ok: true, userId, role });
    } catch (err) {
      log.error({ err }, 'failed to grant role');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/v1/admin/team/:userId/roles/:role — revoke admin or researcher.
  router.delete(
    '/team/:userId/roles/:role',
    requireRole(ROLES.ADMIN),
    async (req, res) => {
      try {
        const { userId, role } = req.params;
        if (!MANAGEABLE_ROLES.includes(role)) {
          return res.status(400).json({
            error: `role must be one of: ${MANAGEABLE_ROLES.join(', ')}`,
          });
        }
        await kcAdmin.removeRole(userId, role);
        res.locals.auditAction = `revoke_role_${role}`;
        res.locals.auditResourceType = 'team_member';
        res.locals.auditResourceId = userId;
        res.json({ ok: true, userId, role });
      } catch (err) {
        log.error({ err }, 'failed to revoke role');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  return router;
}

export default createTeamRouter;
