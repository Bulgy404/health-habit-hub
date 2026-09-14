import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { requireStudyAccess } from '../../middleware/requireStudyAccess.js';

const STUDY_ID = new ObjectId();

function makeDb({ study, memberships = [] } = {}) {
  return {
    collection(name) {
      if (name === 'studies') {
        return {
          async findOne() {
            return study ?? null;
          },
        };
      }
      return {
        async findOne(filter) {
          return (
            memberships.find(
              (m) =>
                m.userId === filter.userId &&
                String(m.studyId) === String(filter.studyId)
            ) ?? null
          );
        },
      };
    },
  };
}

async function run(
  guard,
  { roles = [], sub = 'u1', id = STUDY_ID.toString() }
) {
  const req = { user: { sub, realm_access: { roles } }, params: { id } };
  let status = null;
  let body = null;
  let nexted = false;
  const res = {
    status(s) {
      status = s;
      return this;
    },
    json(b) {
      body = b;
      return this;
    },
  };
  await guard(req, res, () => {
    nexted = true;
  });
  return { status, body, nexted };
}

const anonymousStudy = { _id: STUDY_ID, name: 'Open Study' };
const verifiedStudy = {
  _id: STUDY_ID,
  name: 'DFG',
  identity: { mode: 'verified', subjectCodePrefix: 'TUD-DFG01' },
};

describe('requireStudyAccess', () => {
  it('lets ANY researcher through for an anonymous study', async () => {
    // Today's behaviour. Nothing existing may break the day this ships.
    const guard = requireStudyAccess({
      getDb: async () => makeDb({ study: anonymousStudy }),
    });
    assert.equal((await run(guard, { roles: ['researcher'] })).nexted, true);
  });

  it('BLOCKS a researcher with no membership on a verified study', async () => {
    const guard = requireStudyAccess({
      getDb: async () => makeDb({ study: verifiedStudy }),
    });
    const r = await run(guard, { roles: ['researcher'] });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'not_a_study_member');
  });

  it('allows a researcher who IS a member', async () => {
    const guard = requireStudyAccess({
      getDb: async () =>
        makeDb({
          study: verifiedStudy,
          memberships: [{ userId: 'u1', studyId: STUDY_ID, scope: 'read' }],
        }),
    });
    assert.equal((await run(guard, { roles: ['researcher'] })).nexted, true);
  });

  it('admins always pass — scoping limits researchers, not operators', async () => {
    const guard = requireStudyAccess({
      getDb: async () => makeDb({ study: verifiedStudy }),
    });
    assert.equal((await run(guard, { roles: ['admin'] })).nexted, true);
  });

  it('read membership does NOT grant export', async () => {
    // Downloading a study bundle is materially more than viewing a page.
    const guard = requireStudyAccess({
      getDb: async () =>
        makeDb({
          study: verifiedStudy,
          memberships: [{ userId: 'u1', studyId: STUDY_ID, scope: 'read' }],
        }),
      requireExport: true,
    });
    const r = await run(guard, { roles: ['researcher'] });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'export_not_permitted');
  });

  it('export membership grants export', async () => {
    const guard = requireStudyAccess({
      getDb: async () =>
        makeDb({
          study: verifiedStudy,
          memberships: [{ userId: 'u1', studyId: STUDY_ID, scope: 'export' }],
        }),
      requireExport: true,
    });
    assert.equal((await run(guard, { roles: ['researcher'] })).nexted, true);
  });

  it('404s an unknown study', async () => {
    const guard = requireStudyAccess({
      getDb: async () => makeDb({ study: null }),
    });
    assert.equal((await run(guard, { roles: ['researcher'] })).status, 404);
  });

  it('400s an unparseable study id', async () => {
    const guard = requireStudyAccess({
      getDb: async () => makeDb({ study: verifiedStudy }),
    });
    assert.equal(
      (await run(guard, { roles: ['researcher'], id: 'nope' })).status,
      400
    );
  });

  it('FAILS CLOSED when the check itself errors', async () => {
    // An error resolving access must never become access.
    const guard = requireStudyAccess({
      getDb: async () => {
        throw new Error('mongo down');
      },
    });
    const r = await run(guard, { roles: ['researcher'] });
    assert.equal(r.status, 500);
    assert.equal(r.nexted, false);
  });
});
