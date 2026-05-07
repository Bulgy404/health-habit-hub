# Role System Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `participant` → `user`, enforce admin-only boundaries on KB and settings, role-aware HHH Portal sidebar, Flutter admin-only guard, Keycloak demo users, and full test coverage.

**Architecture:** Each layer (backend, Keycloak, Next.js portal, Flutter) is updated independently but in order — backend first so tests pass before touching UI layers. The `ROLES` constants object in `app/middleware/auth.js` is the single source of truth; all role strings are replaced with references to it.

**Tech Stack:** Node.js/Express (backend), Next.js 14 / NextAuth (portal), Dart/Flutter + GoRouter (mobile), Keycloak 26 (auth), Jest (portal tests), `node:test` (backend tests), `flutter_test` (mobile tests)

---

## Task 1: Backend — Rename ROLES.PARTICIPANT → ROLES.USER

**Files:**
- Modify: `app/middleware/auth.js`
- Modify: `app/routes/onboardRouter.js`

- [ ] **Step 1: Write the failing test**

Create `app/tests/roles.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, requireRole, isPrivileged } from '../middleware/auth.js';

// ── ROLES constants ──────────────────────────────────────────────────────────

test('ROLES.USER equals "user"', () => {
  assert.equal(ROLES.USER, 'user');
});

test('ROLES.ADMIN equals "admin"', () => {
  assert.equal(ROLES.ADMIN, 'admin');
});

test('ROLES.RESEARCHER equals "researcher"', () => {
  assert.equal(ROLES.RESEARCHER, 'researcher');
});

test('ROLES has no PARTICIPANT key', () => {
  assert.ok(!('PARTICIPANT' in ROLES));
});
```

Note: `requireRole` is imported from `../middleware/auth.js` — we will move it there in Task 3. For now it will fail on import. Run to confirm failure:

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/app
node --experimental-vm-modules --test tests/roles.test.js 2>&1 | head -20
```

Expected: `FAIL` — `ROLES.USER` is undefined (currently only `ROLES.PARTICIPANT` exists).

- [ ] **Step 3: Update ROLES constants in auth.js**

In `app/middleware/auth.js`, find the ROLES block and change:

```js
export const ROLES = {
  PARTICIPANT: 'participant',
  ADMIN: 'admin',
  RESEARCHER: 'researcher',
};
```

Replace with:

```js
export const ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  RESEARCHER: 'researcher',
};
```

- [ ] **Step 4: Export requireRole from auth.js**

`requireRole` lives in `app/middleware/requireRole.js` and is imported separately by v1Router. To make `import { requireRole } from '../middleware/auth.js'` work in tests, re-export it from auth.js. Add at the bottom of `app/middleware/auth.js`:

```js
export { requireRole } from './requireRole.js';
```

- [ ] **Step 5: Update onboardRouter.js to assign 'user' role**

In `app/routes/onboardRouter.js`, find:

```js
await kcAdmin.assignRole(keycloakUserId || userId, 'participant');
```

Replace with:

```js
await kcAdmin.assignRole(keycloakUserId || userId, 'user');
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/app
node --experimental-vm-modules --test tests/roles.test.js 2>&1 | head -30
```

Expected: 4 passing tests (ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER correct, no PARTICIPANT key).

- [ ] **Step 7: Commit**

```bash
cd /Users/felixreinsch/Github/health-habit-hub
git add app/middleware/auth.js app/routes/onboardRouter.js app/tests/roles.test.js
git commit -m "feat: rename ROLES.PARTICIPANT to ROLES.USER, assign user role on onboard"
```

---

## Task 2: Backend — Replace all role magic strings in v1Router

**Files:**
- Modify: `app/routes/v1Router.js`

- [ ] **Step 1: Add ROLES import to v1Router.js**

In `app/routes/v1Router.js`, after the existing imports, add:

```js
import { ROLES } from '../middleware/auth.js';
```

- [ ] **Step 2: Replace participant magic strings**

In `app/routes/v1Router.js`, replace every occurrence of `requireRole('participant', 'admin', 'researcher')` with `requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER)`.

There are 8 occurrences on these routes: `/surveys`, `/habits`, `/recommend`, `/profile`, `/questionnaires`, `/questionnaire-responses`, `/recommendations`, `/users`, `/onboarding`, `/participant`, `/user-profile`.

Result for each should look like:

```js
router.use(
  '/surveys',
  requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
  createSurveyRouter({ db })
);
```

- [ ] **Step 3: Make /kb admin-only**

Find the `/kb` route in `v1Router.js`:

```js
router.use(
  '/kb',
  requireRole('admin', 'researcher'),
  createKbRouter({ apiServiceUrl })
);
```

Replace with:

```js
router.use(
  '/kb',
  requireRole(ROLES.ADMIN),
  createKbRouter({ apiServiceUrl })
);
```

- [ ] **Step 4: Replace remaining admin+researcher magic string**

Find the `/admin` route guard (the outer one):

```js
router.use(
  '/admin',
  requireRole('admin', 'researcher'),
  createAdminRouter({ db, neo4jRun, keycloak, tokenCardService })
);
```

Replace with:

```js
router.use(
  '/admin',
  requireRole(ROLES.ADMIN, ROLES.RESEARCHER),
  createAdminRouter({ db, neo4jRun, keycloak, tokenCardService })
);
```

- [ ] **Step 5: Verify no bare role strings remain**

```bash
grep -n "'participant'\|'admin'\|'researcher'" /Users/felixreinsch/Github/health-habit-hub/app/routes/v1Router.js
```

Expected: no output (all replaced with ROLES.*).

- [ ] **Step 6: Commit**

```bash
cd /Users/felixreinsch/Github/health-habit-hub
git add app/routes/v1Router.js
git commit -m "feat: replace role magic strings with ROLES constants in v1Router, kb admin-only"
```

---

## Task 3: Backend — Settings endpoints admin-only in adminRouter

**Files:**
- Modify: `app/routes/adminRouter.js`
- Modify: `app/tests/roles.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `app/tests/roles.test.js`:

```js
// ── requireRole middleware ───────────────────────────────────────────────────

function makeReq(roles) {
  return { user: { realm_access: { roles } } };
}

function makeRes() {
  const res = {
    _status: null,
    _body: null,
    status(s) { res._status = s; return res; },
    json(b) { res._body = b; return res; },
  };
  return res;
}

test('requireRole allows user with matching role', () => {
  const mw = requireRole(ROLES.ADMIN);
  const req = makeReq([ROLES.ADMIN]);
  const res = makeRes();
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.ok(nextCalled, 'next() should have been called');
});

test('requireRole blocks user without matching role', () => {
  const mw = requireRole(ROLES.ADMIN);
  const req = makeReq([ROLES.RESEARCHER]);
  const res = makeRes();
  mw(req, res, () => { throw new Error('next() should not be called'); });
  assert.equal(res._status, 403);
  assert.deepEqual(res._body, { error: 'Forbidden' });
});

test('requireRole allows any of multiple accepted roles', () => {
  const mw = requireRole(ROLES.ADMIN, ROLES.RESEARCHER);
  const req = makeReq([ROLES.RESEARCHER]);
  const res = makeRes();
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.ok(nextCalled, 'next() should have been called');
});

test('requireRole blocks user role from admin+researcher route', () => {
  const mw = requireRole(ROLES.ADMIN, ROLES.RESEARCHER);
  const req = makeReq([ROLES.USER]);
  const res = makeRes();
  mw(req, res, () => { throw new Error('next() should not be called'); });
  assert.equal(res._status, 403);
});

// ── isPrivileged helper ──────────────────────────────────────────────────────

test('isPrivileged returns true for admin', () => {
  assert.ok(isPrivileged({ realm_access: { roles: [ROLES.ADMIN] } }));
});

test('isPrivileged returns true for researcher', () => {
  assert.ok(isPrivileged({ realm_access: { roles: [ROLES.RESEARCHER] } }));
});

test('isPrivileged returns false for user', () => {
  assert.ok(!isPrivileged({ realm_access: { roles: [ROLES.USER] } }));
});
```

- [ ] **Step 2: Run tests to verify new ones pass (requireRole tests should pass already)**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/app
node --experimental-vm-modules --test tests/roles.test.js 2>&1
```

Expected: all tests pass (requireRole and isPrivileged tests work without any further changes).

- [ ] **Step 3: Add imports to adminRouter.js**

In `app/routes/adminRouter.js`, add to the import block at the top:

```js
import { requireRole } from '../middleware/requireRole.js';
import { ROLES } from '../middleware/auth.js';
```

- [ ] **Step 4: Add admin-only guard to GET /settings**

In `app/routes/adminRouter.js`, find the settings GET handler (around line 118):

```js
  // GET /api/v1/admin/settings
  router.get('/settings', async (req, res) => {
```

Replace with:

```js
  // GET /api/v1/admin/settings — admin only
  router.get('/settings', requireRole(ROLES.ADMIN), async (req, res) => {
```

- [ ] **Step 5: Add admin-only guard to PUT /settings/:key**

In `app/routes/adminRouter.js`, find the settings PUT handler (around line 190):

```js
  // PUT /api/v1/admin/settings/:key
  router.put('/settings/:key', async (req, res) => {
```

Replace with:

```js
  // PUT /api/v1/admin/settings/:key — admin only
  router.put('/settings/:key', requireRole(ROLES.ADMIN), async (req, res) => {
```

- [ ] **Step 6: Run all role tests**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/app
node --experimental-vm-modules --test tests/roles.test.js 2>&1
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/felixreinsch/Github/health-habit-hub
git add app/routes/adminRouter.js app/tests/roles.test.js
git commit -m "feat: restrict admin settings endpoints to admin role only, add requireRole tests"
```

---

## Task 4: Keycloak — Rename participant → user, add demo seed users

**Files:**
- Modify: `keycloak/hhh-realm.json`

- [ ] **Step 1: Rename participant role**

In `keycloak/hhh-realm.json`, find:

```json
{
  "name": "participant",
  "description": "Study participant role",
  "composite": false,
  "clientRole": false,
  "containerId": "hhh"
}
```

Replace with:

```json
{
  "name": "user",
  "description": "App user role — habit donation via mobile app",
  "composite": false,
  "clientRole": false,
  "containerId": "hhh"
}
```

- [ ] **Step 2: Add demo seed users**

In `keycloak/hhh-realm.json`, find the `"users"` key (currently `[]`). Replace with:

```json
"users": [
  {
    "id": "00000000-0000-0000-0000-000000000001",
    "username": "demo-admin",
    "enabled": true,
    "emailVerified": true,
    "email": "demo-admin@hhh.local",
    "credentials": [
      {
        "type": "password",
        "value": "demo-admin",
        "temporary": false
      }
    ],
    "realmRoles": ["admin"]
  },
  {
    "id": "00000000-0000-0000-0000-000000000002",
    "username": "demo-researcher",
    "enabled": true,
    "emailVerified": true,
    "email": "demo-researcher@hhh.local",
    "credentials": [
      {
        "type": "password",
        "value": "demo-researcher",
        "temporary": false
      }
    ],
    "realmRoles": ["researcher"]
  }
]
```

- [ ] **Step 3: Verify JSON is valid**

```bash
python3 -c "import json; json.load(open('keycloak/hhh-realm.json')); print('valid')"
```

Expected: `valid`

- [ ] **Step 4: Verify roles and users**

```bash
python3 -c "
import json
d = json.load(open('keycloak/hhh-realm.json'))
roles = [r['name'] for r in d['roles']['realm']]
users = [(u['username'], u.get('realmRoles', [])) for u in d.get('users', [])]
print('Roles:', roles)
print('Users:', users)
"
```

Expected:
```
Roles: ['user', 'admin', 'researcher']
Users: [('demo-admin', ['admin']), ('demo-researcher', ['researcher'])]
```

- [ ] **Step 5: Commit**

```bash
cd /Users/felixreinsch/Github/health-habit-hub
git add keycloak/hhh-realm.json
git commit -m "feat: rename participant role to user in Keycloak, add demo-admin and demo-researcher seed users"
```

---

## Task 5: HHH Portal — Rename branding

**Files:**
- Modify: `admin/src/app/layout.tsx`
- Modify: `admin/src/components/sidebar.tsx`

- [ ] **Step 1: Update root layout metadata**

In `admin/src/app/layout.tsx`, find:

```ts
export const metadata: Metadata = {
  title: "HHH Admin",
  description: "Health Habit Hub — Admin Panel",
};
```

Replace with:

```ts
export const metadata: Metadata = {
  title: "HHH Portal",
  description: "Health Habit Hub — Research Portal",
};
```

- [ ] **Step 2: Update sidebar brand name**

In `admin/src/components/sidebar.tsx`, find:

```tsx
<span className={styles.brandName}>HHH Admin</span>
```

Replace with:

```tsx
<span className={styles.brandName}>HHH Portal</span>
```

- [ ] **Step 3: Verify no remaining "HHH Admin" references**

```bash
grep -rn "HHH Admin\|Admin Panel\|Admin Portal" /Users/felixreinsch/Github/health-habit-hub/admin/src/
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /Users/felixreinsch/Github/health-habit-hub
git add admin/src/app/layout.tsx admin/src/components/sidebar.tsx
git commit -m "feat: rename HHH Admin to HHH Portal in layout and sidebar"
```

---

## Task 6: HHH Portal — Role-aware sidebar navigation

**Files:**
- Modify: `admin/src/components/sidebar.tsx`

- [ ] **Step 1: Write the failing test**

Create `admin/src/__tests__/sidebar.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '../components/sidebar';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: () => '/studies',
}));

// Mock next-auth/react
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}));

import { useSession } from 'next-auth/react';
const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>;

// Mock next/link
jest.mock('next/link', () => {
  return function Link({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
    return <a href={href} className={className}>{children}</a>;
  };
});

describe('Sidebar', () => {
  it('shows Studies and Questionnaires for researcher', () => {
    mockedUseSession.mockReturnValue({
      data: { roles: ['researcher'], user: { email: 'r@test.com' }, expires: '' },
      status: 'authenticated',
      update: jest.fn(),
    });
    render(<Sidebar />);
    expect(screen.getByText('Studies')).toBeInTheDocument();
    expect(screen.getByText('Questionnaires')).toBeInTheDocument();
    expect(screen.queryByText('Knowledge Base')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('shows all nav items for admin', () => {
    mockedUseSession.mockReturnValue({
      data: { roles: ['admin'], user: { email: 'a@test.com' }, expires: '' },
      status: 'authenticated',
      update: jest.fn(),
    });
    render(<Sidebar />);
    expect(screen.getByText('Studies')).toBeInTheDocument();
    expect(screen.getByText('Questionnaires')).toBeInTheDocument();
    expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/admin
npx jest src/__tests__/sidebar.test.tsx --no-coverage 2>&1 | tail -20
```

Expected: FAIL — Knowledge Base and Settings are visible to all roles (no filtering yet).

- [ ] **Step 3: Update sidebar.tsx with role-aware NAV_ITEMS**

Replace the full `sidebar.tsx` content with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import styles from "./sidebar.module.css";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/studies",        label: "Studies",        icon: "🔬" },
  { href: "/questionnaires", label: "Questionnaires", icon: "📋" },
  { href: "/knowledge-base", label: "Knowledge Base", icon: "📚", adminOnly: true },
  { href: "/settings",       label: "Settings",       icon: "⚙️",  adminOnly: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const isAdmin = (session?.roles ?? []).includes("admin");
  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.brandIcon}>🏥</span>
        <span className={styles.brandName}>HHH Portal</span>
      </div>

      <nav className={styles.nav}>
        <ul className={styles.navList}>
          {visibleItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`${styles.navLink} ${pathname.startsWith(item.href) ? styles.navLinkActive : ""}`}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className={styles.footer}>
        {session?.user?.email && (
          <div className={styles.userEmail}>{session.user.email}</div>
        )}
        <button
          onClick={() => signOut()}
          className={styles.signOutButton}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/admin
npx jest src/__tests__/sidebar.test.tsx --no-coverage 2>&1 | tail -20
```

Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/felixreinsch/Github/health-habit-hub
git add admin/src/components/sidebar.tsx admin/src/__tests__/sidebar.test.tsx
git commit -m "feat: role-aware sidebar — hide KB and Settings from researcher, add sidebar tests"
```

---

## Task 7: HHH Portal — Page-level admin guards for KB and Settings

**Files:**
- Modify: `admin/src/app/(admin)/knowledge-base/page.tsx`
- Modify: `admin/src/app/(admin)/settings/page.tsx`

- [ ] **Step 1: Add admin guard to knowledge-base page**

In `admin/src/app/(admin)/knowledge-base/page.tsx`, the component already uses `useSession`. Add a role check at the top of the `KnowledgeBasePage` function, right after the existing `useSession` and `token` lines:

Find:
```tsx
export default function KnowledgeBasePage() {
  const { data: session } = useSession();
  const token = (session as { accessToken?: string } | null)?.accessToken ?? "";

  const [entries, setEntries] = useState<KbEntry[]>([]);
```

Replace with:
```tsx
export default function KnowledgeBasePage() {
  const { data: session, status } = useSession();
  const token = (session as { accessToken?: string } | null)?.accessToken ?? "";
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.roles?.includes("admin")) {
      router.replace("/access-denied");
    }
  }, [session, status, router]);

  const [entries, setEntries] = useState<KbEntry[]>([]);
```

Also add the missing imports at the top of the file. Find:
```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
```

Replace with:
```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
```

- [ ] **Step 2: Add admin guard to settings page**

Replace the full content of `admin/src/app/(admin)/settings/page.tsx` with:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import styles from "./page.module.css";

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.roles?.includes("admin")) {
      router.replace("/access-denied");
    }
  }, [session, status, router]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>System configuration and platform settings.</p>
      </div>
      <div className={styles.placeholder}>
        <span className={styles.placeholderIcon}>⚙️</span>
        <p>Settings panel coming soon.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/admin
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/felixreinsch/Github/health-habit-hub
git add "admin/src/app/(admin)/knowledge-base/page.tsx" "admin/src/app/(admin)/settings/page.tsx"
git commit -m "feat: add admin-only page guard to KB and Settings pages"
```

---

## Task 8: HHH Portal — Extend middleware and auth tests

**Files:**
- Modify: `admin/src/__tests__/middleware.test.ts`
- Modify: `admin/src/__tests__/auth.test.ts`

- [ ] **Step 1: Add new middleware test cases**

In `admin/src/__tests__/middleware.test.ts`, add these test cases inside the existing `describe('middleware', ...)` block, after the existing tests:

```ts
  it('passes through when user has researcher role', async () => {
    mockedGetToken.mockResolvedValueOnce({ roles: ['researcher'] } as never);
    const req = makeRequest('/dashboard');
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  it('redirects to /access-denied when user has user role', async () => {
    mockedGetToken.mockResolvedValueOnce({ roles: ['user'] } as never);
    const req = makeRequest('/dashboard');
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/access-denied');
  });

  it('passes through for researcher on /studies path', async () => {
    mockedGetToken.mockResolvedValueOnce({ roles: ['researcher'] } as never);
    const req = makeRequest('/studies');
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });
```

- [ ] **Step 2: Add user role case to auth tests**

In `admin/src/__tests__/auth.test.ts`, add inside the existing `describe('auth jwt callback', ...)` block:

```ts
  it('extracts user role correctly', async () => {
    const profile = { realm_access: { roles: ['user'] } };
    const account = { access_token: 'tok-user' } as unknown as Account;
    const result = await jwtCallback({ token: { ...baseToken }, account, profile } as never);
    expect(result.roles).toEqual(['user']);
  });
```

- [ ] **Step 3: Run all portal tests**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/admin
npx jest --no-coverage 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/felixreinsch/Github/health-habit-hub
git add admin/src/__tests__/middleware.test.ts admin/src/__tests__/auth.test.ts
git commit -m "test: extend middleware and auth tests for researcher and user roles"
```

---

## Task 9: Flutter — Admin-only redirect guard + tests

**Files:**
- Modify: `mobile/lib/router/redirect.dart`
- Modify: `mobile/test/router/redirect_contract_test.dart`

- [ ] **Step 1: Write the failing tests**

In `mobile/test/router/redirect_contract_test.dart`, add these cases inside the existing `group('admin guard', ...)` block:

```dart
    test(
      'visiting /admin/participants when role is researcher redirects to /',
      () async {
        final result = await _guard(
          location: '/admin/participants',
          isLoggedIn: true,
          roles: ['researcher'],
        );
        expect(result, '/');
      },
    );

    test(
      'visiting /admin/participants when role is user redirects to /',
      () async {
        final result = await _guard(
          location: '/admin/participants',
          isLoggedIn: true,
          roles: ['user'],
        );
        expect(result, '/');
      },
    );
```

Also update the existing test that uses `'participant'` to use `'user'`:

Find:
```dart
    test(
      'visiting /admin/participants when role is plain user redirects to /',
      () async {
        final result = await _guard(
          location: '/admin/participants',
          isLoggedIn: true,
          roles: ['participant'],
        );
        expect(result, '/');
      },
    );
```

Replace with:
```dart
    test(
      'visiting /admin/participants when role is plain user redirects to /',
      () async {
        final result = await _guard(
          location: '/admin/participants',
          isLoggedIn: true,
          roles: ['user'],
        );
        expect(result, '/');
      },
    );
```

- [ ] **Step 2: Run tests to verify new ones fail**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/mobile
flutter test test/router/redirect_contract_test.dart 2>&1 | tail -20
```

Expected: FAIL — `researcher` currently passes the admin guard (returns null) instead of redirecting to `/`.

- [ ] **Step 3: Update redirect.dart admin guard**

In `mobile/lib/router/redirect.dart`, find the admin guard section:

```dart
  if (location.startsWith('/admin')) {
    try {
      final isLoggedIn = await getIsLoggedIn();
      if (!isLoggedIn) return '/onboarding/welcome';
      final roles = await getUserRoles();
      if (!roles.contains('admin') && !roles.contains('researcher')) {
        return '/';
      }
    } catch (_) {
      return '/onboarding/welcome';
    }
    return null;
  }
```

Replace with:

```dart
  if (location.startsWith('/admin')) {
    try {
      final isLoggedIn = await getIsLoggedIn();
      if (!isLoggedIn) return '/onboarding/welcome';
      final roles = await getUserRoles();
      if (!roles.contains('admin')) {
        return '/';
      }
    } catch (_) {
      return '/onboarding/welcome';
    }
    return null;
  }
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/mobile
flutter test test/router/redirect_contract_test.dart 2>&1 | tail -20
```

Expected: all tests pass (admin → null, researcher → '/', user → '/').

- [ ] **Step 5: Run full Flutter test suite to check for regressions**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/mobile
flutter test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/felixreinsch/Github/health-habit-hub
git add mobile/lib/router/redirect.dart mobile/test/router/redirect_contract_test.dart
git commit -m "feat: restrict Flutter admin routes to admin role only, update redirect tests"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run all backend tests**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/app
node --experimental-vm-modules --test tests/roles.test.js 2>&1
```

Expected: all pass.

- [ ] **Step 2: Run all portal tests**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/admin
npx jest --no-coverage 2>&1 | tail -15
```

Expected: all pass.

- [ ] **Step 3: Run all Flutter tests**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/mobile
flutter test 2>&1 | tail -15
```

Expected: all pass.

- [ ] **Step 4: Verify no remaining 'participant' role strings in app code**

```bash
grep -rn "'participant'\|\"participant\"" \
  /Users/felixreinsch/Github/health-habit-hub/app/middleware/ \
  /Users/felixreinsch/Github/health-habit-hub/app/routes/ \
  /Users/felixreinsch/Github/health-habit-hub/admin/src/ \
  /Users/felixreinsch/Github/health-habit-hub/mobile/lib/ \
  2>/dev/null | grep -v ".test." | grep -v "node_modules"
```

Expected: no output (all replaced with `ROLES.USER` or `'user'`).

- [ ] **Step 5: Commit final verification**

```bash
cd /Users/felixreinsch/Github/health-habit-hub
git commit --allow-empty -m "chore: all role refactor tasks complete, all tests passing"
```
