# Role System Refactor — Design Spec
Date: 2026-05-07

## Overview

Refactor the HHH role system to three well-defined roles (`admin`, `researcher`, `user`), enforce clean access boundaries across all layers, rename the admin portal to "HHH Portal", and add automated tests plus Keycloak demo seed accounts for verification.

---

## Role Model

| Role | Access |
|---|---|
| `admin` | Everything — HHH Portal (all sections) + Flutter admin screens |
| `researcher` | HHH Portal only — Studies + Questionnaires |
| `user` | Mobile app only — habit donation, UUID passphrase auth |

`admin` is a strict superset of `researcher`. Both log into the HHH Portal; navigation adapts by role. Researchers never access Flutter admin screens. Users never access either portal.

The `ROLES` constants object in `app/middleware/auth.js` is the single source of truth. No magic role strings anywhere in the codebase.

---

## Backend (`app/`)

### 1. ROLES constants
Update `ROLES.PARTICIPANT` → `ROLES.USER` with value `'user'` (was `'participant'`). Every `requireRole` call imports and uses `ROLES.*` — no bare strings.

### 2. Route access boundaries

| Route | Before | After |
|---|---|---|
| `/api/v1/kb` | `admin`, `researcher` | `admin` only |
| `/api/v1/admin/settings` (GET + PUT) | `admin`, `researcher` | `admin` only (inner guard inside adminRouter) |
| `/api/v1/admin/*` (everything else) | `admin`, `researcher` | `admin`, `researcher` (unchanged) |
| `/api/v1/surveys`, `/habits`, `/recommend`, `/profile`, `/questionnaires`, `/questionnaire-responses`, `/recommendations`, `/users`, `/onboarding`, `/participant`, `/user-profile` | `participant`, `admin`, `researcher` | `user`, `admin`, `researcher` |

### 3. Onboard router
`POST /onboard` assigns the `user` role (was `participant`) when creating a Keycloak account.

---

## HHH Portal (Next.js `admin/`)

### Rename
- Sidebar brand: "HHH Admin" → "HHH Portal"
- Page `<title>` and any other branding references updated

### Role-aware navigation
`NAV_ITEMS` in `sidebar.tsx` gains an optional `adminOnly: boolean` field:

```ts
const NAV_ITEMS = [
  { href: '/studies',        label: 'Studies',        icon: '🔬' },
  { href: '/questionnaires', label: 'Questionnaires', icon: '📋' },
  { href: '/knowledge-base', label: 'Knowledge Base', icon: '📚', adminOnly: true },
  { href: '/settings',       label: 'Settings',       icon: '⚙️', adminOnly: true },
];
```

Items with `adminOnly: true` are hidden when `session.roles` does not include `'admin'`.

### Page-level guard
`/knowledge-base/page.tsx` and `/settings/page.tsx` add a server-side role check — if the session user lacks the `admin` role, redirect to `/access-denied`. Prevents direct URL navigation bypassing the sidebar.

### Middleware (unchanged)
Both `admin` and `researcher` pass the portal middleware. No change needed.

---

## Flutter Mobile App (`mobile/`)

### Admin route guard
`redirect.dart` — admin guard updated to admin-only:

```dart
// Before
if (!roles.contains('admin') && !roles.contains('researcher')) return '/';
// After
if (!roles.contains('admin')) return '/';
```

### Display strings
Any UI text showing "participant" changed to "user".

### Passphrase / onboarding flow
Unchanged. UUID + 24-word BIP39 passphrase stays exactly as-is. The Keycloak account created during onboarding receives the `user` role instead of `participant`.

---

## Keycloak (`keycloak/hhh-realm.json`)

- Realm role `participant` renamed to `user`
- Three demo seed users added for manual smoke-testing:

| Username | Password | Role |
|---|---|---|
| `demo-admin` | `demo-admin` | `admin` |
| `demo-researcher` | `demo-researcher` | `researcher` |

No demo `user` account — users self-register via the passphrase onboarding flow.

---

## Testing

### Extended Jest tests — HHH Portal (`admin/src/__tests__/`)

**`middleware.test.ts`** — add cases:
- Researcher role → portal → 200 (pass)
- `user` role → portal → 307 to `/access-denied`
- Empty roles → portal → 307 to `/access-denied`

**`auth.test.ts`** — add case:
- JWT with `user` role extracted correctly

### New backend route tests (`app/tests/`)

Test file: `roles.test.js`

| JWT role | Endpoint | Expected |
|---|---|---|
| `researcher` | `GET /api/v1/kb` | 403 |
| `researcher` | `GET /api/v1/admin/settings` | 403 |
| `researcher` | `GET /api/v1/admin` | 200 |
| `admin` | `GET /api/v1/kb` | 200 |
| `admin` | `GET /api/v1/admin/settings` | 200 |
| `user` | `GET /api/v1/admin` | 403 |
| `user` | `GET /api/v1/habits` | 200 |

Tests use mock JWTs (same pattern as existing backend tests) — no live Keycloak required.

### Flutter redirect tests (`mobile/test/core/`)

Extend `auth_interceptor_contract_test.dart` or the redirect guard unit test:
- `researcher` role + `/admin/...` location → redirects to `/`
- `admin` role + `/admin/...` location → no redirect (null)

---

## Files Changed

| File | Change |
|---|---|
| `keycloak/hhh-realm.json` | Rename `participant` → `user`, add demo users |
| `app/middleware/auth.js` | `ROLES.PARTICIPANT` → `ROLES.USER = 'user'` |
| `app/routes/v1Router.js` | All `requireRole('participant', ...)` → `requireRole(ROLES.USER, ...)`, `/kb` → admin-only |
| `app/routes/adminRouter.js` | Inner `requireRole(ROLES.ADMIN)` on settings endpoints |
| `app/routes/onboardRouter.js` | Assign `user` role on account creation |
| `admin/src/components/sidebar.tsx` | Rename brand, add `adminOnly` filtering |
| `admin/src/app/(admin)/knowledge-base/page.tsx` | Add server-side admin role check |
| `admin/src/app/(admin)/settings/page.tsx` | Add server-side admin role check |
| `mobile/lib/router/redirect.dart` | Admin guard: admin-only |
| `admin/src/__tests__/middleware.test.ts` | Extended role cases |
| `admin/src/__tests__/auth.test.ts` | Add `user` role case |
| `app/tests/roles.test.js` | New — cross-role route boundary tests |
| `mobile/test/core/redirect_guard_test.dart` | Researcher admin redirect case |
