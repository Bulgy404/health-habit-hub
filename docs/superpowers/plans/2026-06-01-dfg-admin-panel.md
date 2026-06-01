# DFG Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the four new admin panel sections for the DFG study: cue pool management, per-group cue configuration, researcher notification campaigns, and public default cue config in Settings.

**Architecture:** All new pages follow the established Next.js 15 pattern: `"use client"` page.tsx + page.module.css, `useSession` for auth token, `apiFetch` helper, Jest + React Testing Library. One small backend addition (group cue-config PATCH endpoint + status fix for scheduled campaigns) unblocks all frontend tasks.

**Tech Stack:** Next.js 15 App Router, React 18, CSS Modules, next-auth v4, Jest + @testing-library/react, TypeScript.

**Spec reference:** `docs/superpowers/specs/2026-06-01-dfg-study-integration-design.md` §6

---

## File Map

**Backend — create/modify:**
- Modify: `app/services/studyService.js` — add `updateGroupCueConfig`
- Modify: `app/routes/admin/studiesRouter.js` — add `PATCH /studies/:id/groups/:groupId/cue-config`
- Modify: `app/services/notificationCampaignService.js` — fix status:'scheduled' when scheduledFor is set
- Modify: `app/tests/unit/study.service.test.js` — add updateGroupCueConfig tests
- Modify: `app/tests/unit/notificationCampaignService.test.js` — add scheduled status test

**Admin panel — create:**
- Create: `admin/src/app/(admin)/cue-pools/page.tsx`
- Create: `admin/src/app/(admin)/cue-pools/page.module.css`
- Create: `admin/src/__tests__/cue-pools.test.tsx`
- Create: `admin/src/__tests__/settings.test.tsx`

**Admin panel — modify:**
- Modify: `admin/src/components/sidebar.tsx` — add Cue Pools nav entry
- Modify: `admin/src/app/(admin)/studies/page.tsx` — add CueConfigTab, update NotificationsTab API calls, add Export ZIP button
- Modify: `admin/src/app/(admin)/settings/page.tsx` — implement public default cue config form
- Modify: `admin/src/app/(admin)/settings/page.module.css` — add styles for settings form
- Modify: `admin/src/__tests__/studies.test.tsx` — add cue config and export tests

---

## Task 1: Backend — Group Cue-Config Endpoint + Notification Status Fix

**Files:**
- Modify: `app/services/studyService.js`
- Modify: `app/routes/admin/studiesRouter.js`
- Modify: `app/services/notificationCampaignService.js`
- Modify: `app/tests/unit/study.service.test.js`
- Modify: `app/tests/unit/notificationCampaignService.test.js`

- [ ] **Step 1: Add `updateGroupCueConfig` tests to `app/tests/unit/study.service.test.js`**

Read the existing file first to understand the `makeDb` helper, then append these tests:

```js
// Append to app/tests/unit/study.service.test.js

test('updateGroupCueConfig: sets cueConfig on a specific group', async () => {
  const { ObjectId } = await import('mongodb');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    studies: [{
      _id: studyId,
      name: 'CuB Study',
      isDefault: false,
      isActive: true,
      groups: [{ id: groupId, label: 'C3', index: 1, cueConfig: null }],
      questionnaires: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }],
  });
  const cueConfig = {
    cueCount: 'single',
    cueSource: 'high_quality',
    cuePoolId: null,
    behaviorOptions: ['walking', 'yoga'],
    maxHabits: 1,
  };
  const result = await updateGroupCueConfig({
    db,
    studyId: studyId.toString(),
    groupId: groupId.toString(),
    cueConfig,
  });
  assert.equal(result.updated, true);
});

test('updateGroupCueConfig: returns notFound for missing study', async () => {
  const { ObjectId } = await import('mongodb');
  const db = makeDb({ studies: [] });
  const result = await updateGroupCueConfig({
    db,
    studyId: new ObjectId().toString(),
    groupId: new ObjectId().toString(),
    cueConfig: { cueCount: 'single', cueSource: 'high_quality', cuePoolId: null, behaviorOptions: [], maxHabits: null },
  });
  assert.equal(result.notFound, true);
});
```

Also add the import at the top of the imports block:
```js
import {
  listStudies,
  createStudy,
  getStudy,
  updateStudy,
  softDeleteStudy,
  setDefaultStudy,
  updateGroupCueConfig,   // add this
} from '../../services/studyService.js';
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
cd app && node --test tests/unit/study.service.test.js 2>&1 | grep -E "fail|Error|updateGroupCueConfig" | head -5
```
Expected: tests for `updateGroupCueConfig` fail with "not a function" or similar.

- [ ] **Step 3: Add `updateGroupCueConfig` to `app/services/studyService.js`**

Append before the final `export` or at the end of the file:

```js
/**
 * Update the cueConfig for a specific group within a study.
 * Uses MongoDB positional operator to update the matching group array element.
 * @param {{ db, studyId: string, groupId: string, cueConfig: object }} deps
 */
export async function updateGroupCueConfig({ db, studyId, groupId, cueConfig }) {
  let studyOid, groupOid;
  try {
    studyOid = new ObjectId(studyId);
    groupOid = new ObjectId(groupId);
  } catch {
    return { notFound: true };
  }

  const result = await db.collection(STUDIES).updateOne(
    { _id: studyOid, 'groups.id': groupOid },
    { $set: { 'groups.$.cueConfig': cueConfig, updatedAt: new Date() } }
  );

  if (result.matchedCount === 0) return { notFound: true };
  return { updated: true };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd app && node --test tests/unit/study.service.test.js
```
Expected: all tests pass (including the 2 new ones).

- [ ] **Step 5: Add PATCH route to `app/routes/admin/studiesRouter.js`**

Read the existing file to find a good insertion point (after the PUT `/studies/:id` route, around line 135). Add:

```js
// PATCH /api/v1/admin/studies/:id/groups/:groupId/cue-config
router.patch('/studies/:id/groups/:groupId/cue-config', async (req, res) => {
  try {
    const { cueCount, cueSource, cuePoolId, behaviorOptions, maxHabits } = req.body;
    if (!cueCount || !cueSource) {
      return res.status(400).json({ error: 'cueCount and cueSource are required' });
    }
    const database = await getDb();
    const result = await updateGroupCueConfig({
      db: database,
      studyId: req.params.id,
      groupId: req.params.groupId,
      cueConfig: {
        cueCount,
        cueSource,
        cuePoolId: cuePoolId ?? null,
        behaviorOptions: behaviorOptions ?? [],
        maxHabits: maxHabits ?? null,
      },
    });
    if (result.notFound) return res.status(404).json({ error: 'Study or group not found' });
    res.json({ updated: true });
  } catch (err) {
    console.error('[route] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

Also add `updateGroupCueConfig` to the import at the top of studiesRouter.js:
```js
import {
  listStudies,
  createStudy,
  getStudy,
  updateStudy,
  softDeleteStudy,
  setDefaultStudy,
  listStudyParticipants,
  updateGroupCueConfig,    // add this
} from '../../services/studyService.js';
```

- [ ] **Step 6: Fix notification campaign status for scheduled campaigns**

In `app/services/notificationCampaignService.js`, find `createCampaign`. Change:

```js
status: 'draft',
```

To:

```js
status: scheduledFor ? 'scheduled' : 'draft',
```

- [ ] **Step 7: Add scheduled status test**

In `app/tests/unit/notificationCampaignService.test.js`, add:

```js
test('createCampaign: sets status scheduled when scheduledFor is provided', async () => {
  const db = makeDb();
  const result = await createCampaign({
    db, createdBy: 'r1', studyId: null,
    title: 'Reminder', body: 'Check in',
    targetType: 'all_enrolled', targetIds: [],
    scheduledFor: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(result.status, 'scheduled');
});
```

- [ ] **Step 8: Run full unit suite**

```bash
cd app && npm run test:unitTests
```
Expected: all tests pass.

- [ ] **Step 9: Prettier + commit**

```bash
cd app && npx prettier --write services/studyService.js routes/admin/studiesRouter.js services/notificationCampaignService.js tests/unit/study.service.test.js tests/unit/notificationCampaignService.test.js
git add app/services/studyService.js app/routes/admin/studiesRouter.js app/services/notificationCampaignService.js app/tests/unit/study.service.test.js app/tests/unit/notificationCampaignService.test.js
git commit -m "feat: add group cue-config endpoint and fix scheduled campaign status"
```

---

## Task 2: Cue Pools Admin Page

**Files:**
- Create: `admin/src/app/(admin)/cue-pools/page.tsx`
- Create: `admin/src/app/(admin)/cue-pools/page.module.css`
- Modify: `admin/src/components/sidebar.tsx`
- Create: `admin/src/__tests__/cue-pools.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// admin/src/__tests__/cue-pools.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import CuePoolsPage from '../app/(admin)/cue-pools/page';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { accessToken: 'test-token' },
    status: 'authenticated',
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/cue-pools',
}));

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({ total: 0, page: 1, limit: 50, cues: [] }),
  } as unknown as Response);
});

afterEach(() => { jest.resetAllMocks(); });

describe('CuePoolsPage', () => {
  it('renders without crashing', () => {
    render(<CuePoolsPage />);
  });

  it('renders the page title', () => {
    render(<CuePoolsPage />);
    expect(screen.getByRole('heading', { name: /cue pools/i })).toBeInTheDocument();
  });

  it('shows empty state when no cues', async () => {
    render(<CuePoolsPage />);
    expect(await screen.findByText(/no cues yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd admin && npx jest --testPathPattern="cue-pools" --no-coverage 2>&1 | head -10
```
Expected: fails (module not found).

- [ ] **Step 3: Create `admin/src/app/(admin)/cue-pools/page.module.css`**

Copy from an adjacent page's CSS to get the baseline styles, then use as-is (the existing CSS classes like `.page`, `.header`, `.title`, `.subtitle`, `.table`, `.tableWrap`, `.loadingState`, `.emptyState`, `.errorMsg`, `.saveBtn`, `.addButton`, `.formGroup`, `.label`, `.input`, `.select` are shared across pages — replicate the same class names as in `studies/page.module.css`):

```css
/* admin/src/app/(admin)/cue-pools/page.module.css */
.page { padding: 2rem; max-width: 1200px; }
.header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.5rem; gap: 1rem; }
.headerText { flex: 1; }
.title { font-size: 1.5rem; font-weight: 600; margin: 0 0 0.25rem; color: var(--color-text); }
.subtitle { font-size: 0.875rem; color: var(--color-text-muted); margin: 0; }
.addButton { padding: 0.5rem 1rem; background: var(--color-primary); color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 0.875rem; white-space: nowrap; }
.addButton:hover { background: var(--color-primary-dark); }
.tableWrap { overflow-x: auto; border: 1px solid var(--color-border); border-radius: 8px; }
.table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.table th { padding: 0.75rem 1rem; text-align: left; background: var(--color-surface-alt); border-bottom: 1px solid var(--color-border); font-weight: 600; color: var(--color-text-muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
.table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--color-border); color: var(--color-text); vertical-align: middle; }
.table tr:last-child td { border-bottom: none; }
.loadingState { padding: 2rem; text-align: center; color: var(--color-text-muted); }
.emptyState { padding: 2rem; text-align: center; color: var(--color-text-muted); }
.errorMsg { padding: 0.75rem 1rem; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; color: #dc2626; font-size: 0.875rem; margin-bottom: 1rem; }
.deleteBtn { padding: 0.25rem 0.6rem; background: transparent; border: 1px solid #fca5a5; color: #dc2626; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
.deleteBtn:hover { background: #fef2f2; }
.deleteBtn:disabled { opacity: 0.4; cursor: not-allowed; }
.qualityBadge { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
.qualityHigh { background: #dcfce7; color: #15803d; }
.qualityLow { background: #fef9c3; color: #854d0e; }
.panel { border: 1px solid var(--color-border); border-radius: 8px; padding: 1.25rem; margin-bottom: 1.5rem; background: var(--color-surface); }
.panelTitle { font-size: 0.95rem; font-weight: 600; margin: 0 0 1rem; color: var(--color-text); }
.formGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; }
.formGroup { display: flex; flex-direction: column; gap: 0.25rem; }
.label { font-size: 0.8rem; font-weight: 500; color: var(--color-text-muted); }
.input, .select { padding: 0.4rem 0.6rem; border: 1px solid var(--color-border); border-radius: 6px; font-size: 0.875rem; background: var(--color-surface); color: var(--color-text); }
.input:focus, .select:focus { outline: none; border-color: var(--color-primary); }
.formFull { grid-column: 1 / -1; }
.formFooter { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.75rem; }
.saveBtn { padding: 0.45rem 1rem; background: var(--color-primary); color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 0.875rem; }
.saveBtn:hover { background: var(--color-primary-dark); }
.saveBtn:disabled { opacity: 0.5; cursor: not-allowed; }
.filterRow { display: flex; gap: 0.75rem; margin-bottom: 1rem; align-items: flex-end; }
.pagination { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; border-top: 1px solid var(--color-border); }
.pageBtn { padding: 0.35rem 0.75rem; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); border-radius: 6px; cursor: pointer; font-size: 0.8rem; }
.pageBtn:disabled { opacity: 0.4; cursor: not-allowed; }
.pageInfo { font-size: 0.8rem; color: var(--color-text-muted); }
.dimBadge { font-size: 0.75rem; color: var(--color-text-muted); white-space: nowrap; }
```

- [ ] **Step 4: Create `admin/src/app/(admin)/cue-pools/page.tsx`**

```tsx
// admin/src/app/(admin)/cue-pools/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import styles from "./page.module.css";

interface Cue {
  id: string;
  text: string;
  quality: "low" | "high";
  dimensions: { stability: number; salience: number; specificity: number };
  domain: string;
  language: string;
  createdAt: string | null;
}

const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") +
  "/admin/cue-pools";

async function apiFetch(url: string, token: string, opts: RequestInit = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `HTTP ${res.status}`
    );
  }
  return res.json();
}

export default function CuePoolsPage() {
  const { data: session } = useSession();
  const token =
    (session as { accessToken?: string } | null)?.accessToken ?? "";

  const [cues, setCues] = useState<Cue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 25;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filterQuality, setFilterQuality] = useState("");
  const [filterLang, setFilterLang] = useState("");

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [newText, setNewText] = useState("");
  const [newQuality, setNewQuality] = useState<"high" | "low">("high");
  const [newDomain, setNewDomain] = useState("physical_activity");
  const [newLang, setNewLang] = useState("en");
  const [newStability, setNewStability] = useState(3);
  const [newSalience, setNewSalience] = useState(3);
  const [newSpecificity, setNewSpecificity] = useState(3);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Delete state
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchCues = useCallback(
    async (p: number) => {
      if (!token) return;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ page: String(p), limit: String(limit) });
        if (filterQuality) params.set("quality", filterQuality);
        if (filterLang) params.set("language", filterLang);
        const data = await apiFetch(`${API_BASE}?${params}`, token);
        setCues((data as { cues: Cue[] }).cues ?? []);
        setTotal((data as { total: number }).total ?? 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load cues");
      } finally {
        setLoading(false);
      }
    },
    [token, filterQuality, filterLang]
  );

  useEffect(() => {
    setPage(1);
    fetchCues(1);
  }, [fetchCues]);

  async function handleCreate() {
    if (!newText.trim()) { setCreateError("Text is required."); return; }
    setCreating(true);
    setCreateError("");
    try {
      await apiFetch(API_BASE, token, {
        method: "POST",
        body: JSON.stringify({
          text: newText.trim(),
          quality: newQuality,
          domain: newDomain,
          language: newLang,
          dimensions: { stability: newStability, salience: newSalience, specificity: newSpecificity },
        }),
      });
      setNewText(""); setShowForm(false);
      await fetchCues(1); setPage(1);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await apiFetch(`${API_BASE}/${id}`, token, { method: "DELETE" });
      await fetchCues(page);
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Cue Pools</h1>
          <p className={styles.subtitle}>
            Manage pre-rated contextual cues for study conditions.
          </p>
        </div>
        <button className={styles.addButton} onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "+ Add Cue"}
        </button>
      </div>

      {showForm && (
        <div className={styles.panel}>
          <p className={styles.panelTitle}>New cue</p>
          {createError && <div className={styles.errorMsg}>{createError}</div>}
          <div className={styles.formGrid}>
            <div className={`${styles.formGroup} ${styles.formFull}`}>
              <label className={styles.label}>Cue text *</label>
              <input
                className={styles.input}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="e.g. After dinner each evening"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Quality</label>
              <select
                className={styles.select}
                value={newQuality}
                onChange={(e) => setNewQuality(e.target.value as "high" | "low")}
              >
                <option value="high">High</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Domain</label>
              <input
                className={styles.input}
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Language</label>
              <select
                className={styles.select}
                value={newLang}
                onChange={(e) => setNewLang(e.target.value)}
              >
                <option value="en">English</option>
                <option value="de">German</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Stability (1–5)</label>
              <input className={styles.input} type="number" min={1} max={5}
                value={newStability} onChange={(e) => setNewStability(Number(e.target.value))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Salience (1–5)</label>
              <input className={styles.input} type="number" min={1} max={5}
                value={newSalience} onChange={(e) => setNewSalience(Number(e.target.value))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Specificity (1–5)</label>
              <input className={styles.input} type="number" min={1} max={5}
                value={newSpecificity} onChange={(e) => setNewSpecificity(Number(e.target.value))} />
            </div>
          </div>
          <div className={styles.formFooter}>
            <button className={styles.saveBtn} onClick={handleCreate} disabled={creating}>
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}

      <div className={styles.filterRow}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Quality</label>
          <select className={styles.select} value={filterQuality}
            onChange={(e) => setFilterQuality(e.target.value)}>
            <option value="">All</option>
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Language</label>
          <select className={styles.select} value={filterLang}
            onChange={(e) => setFilterLang(e.target.value)}>
            <option value="">All</option>
            <option value="en">English</option>
            <option value="de">German</option>
          </select>
        </div>
      </div>

      {error && <div className={styles.errorMsg}>{error}</div>}

      {loading ? (
        <div className={styles.loadingState}>Loading…</div>
      ) : cues.length === 0 ? (
        <div className={styles.emptyState}>No cues yet. Click "+ Add Cue" to create one.</div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Text</th>
                  <th>Quality</th>
                  <th>Dimensions</th>
                  <th>Domain</th>
                  <th>Lang</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {cues.map((cue) => (
                  <tr key={cue.id}>
                    <td>{cue.text}</td>
                    <td>
                      <span className={`${styles.qualityBadge} ${cue.quality === "high" ? styles.qualityHigh : styles.qualityLow}`}>
                        {cue.quality}
                      </span>
                    </td>
                    <td>
                      <span className={styles.dimBadge}>
                        S:{cue.dimensions.stability} Sa:{cue.dimensions.salience} Sp:{cue.dimensions.specificity}
                      </span>
                    </td>
                    <td>{cue.domain}</td>
                    <td>{cue.language}</td>
                    <td>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDelete(cue.id)}
                        disabled={deleting === cue.id}
                      >
                        {deleting === cue.id ? "…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button className={styles.pageBtn}
                onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                ‹ Prev
              </button>
              <span className={styles.pageInfo}>Page {page} of {totalPages} ({total} total)</span>
              <button className={styles.pageBtn}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                Next ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Add "Cue Pools" to sidebar**

In `admin/src/components/sidebar.tsx`, add a new entry to `NAV_ITEMS` after Studies:

```ts
{ href: "/cue-pools", label: "Cue Pools", icon: "🎯" },
```

- [ ] **Step 6: Run test — verify it passes**

```bash
cd admin && npx jest --testPathPattern="cue-pools" --no-coverage
```
Expected: 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add admin/src/app/\(admin\)/cue-pools/page.tsx admin/src/app/\(admin\)/cue-pools/page.module.css admin/src/components/sidebar.tsx admin/src/__tests__/cue-pools.test.tsx
git commit -m "feat: add cue pools admin page and sidebar entry"
```

---

## Task 3: Cue Config Tab in Study Modal

**Files:**
- Modify: `admin/src/app/(admin)/studies/page.tsx`

This task adds a "Cue Config" tab to the existing `StudyModal`. Participants in a group get the cue configuration set here.

- [ ] **Step 1: Add types and API constant at the top of `studies/page.tsx`**

Find the `StudyGroup` interface and extend it:

```ts
interface StudyGroup {
  id: string;
  label: string;
  index: number;
  cueConfig?: CueConfig | null;    // add this
}

interface CueConfig {
  cueCount: "single" | "multi";
  cueSource: "low_quality" | "high_quality" | "self_selected";
  cuePoolId: string | null;
  behaviorOptions: string[];
  maxHabits: number | null;
}
```

Add the API constant (after existing `API_BASE`):

```ts
const BEHAVIOR_OPTIONS = [
  { key: "walking", label: "Walking" },
  { key: "light_jogging", label: "Light jogging" },
  { key: "cycling", label: "Cycling" },
  { key: "structured_calisthenics", label: "Structured calisthenics" },
  { key: "yoga", label: "Yoga" },
];
```

- [ ] **Step 2: Add `CueConfigTab` component inside `studies/page.tsx`**

Add this component before `StudyModal`:

```tsx
function CueConfigTab({
  study,
  token,
}: {
  study: StudySummary;
  token: string;
}) {
  const [groupStates, setGroupStates] = useState<
    Record<string, CueConfig & { saving: boolean; saved: boolean; error: string }>
  >(() =>
    Object.fromEntries(
      study.groups.map((g) => [
        g.id,
        {
          cueCount: g.cueConfig?.cueCount ?? "multi",
          cueSource: g.cueConfig?.cueSource ?? "high_quality",
          cuePoolId: g.cueConfig?.cuePoolId ?? null,
          behaviorOptions:
            g.cueConfig?.behaviorOptions ?? BEHAVIOR_OPTIONS.map((b) => b.key),
          maxHabits: g.cueConfig?.maxHabits ?? null,
          saving: false,
          saved: false,
          error: "",
        },
      ])
    )
  );

  function update(
    groupId: string,
    patch: Partial<(typeof groupStates)[string]>
  ) {
    setGroupStates((prev) => ({
      ...prev,
      [groupId]: { ...prev[groupId], ...patch, saved: false },
    }));
  }

  function toggleBehavior(groupId: string, key: string) {
    const current = groupStates[groupId].behaviorOptions;
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    update(groupId, { behaviorOptions: next });
  }

  async function handleSave(groupId: string) {
    const s = groupStates[groupId];
    update(groupId, { saving: true, error: "" });
    try {
      await apiFetch(
        `${API_BASE}/${study.id}/groups/${groupId}/cue-config`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify({
            cueCount: s.cueCount,
            cueSource: s.cueSource,
            cuePoolId: s.cuePoolId,
            behaviorOptions: s.behaviorOptions,
            maxHabits: s.maxHabits,
          }),
        }
      );
      update(groupId, { saving: false, saved: true });
    } catch (err) {
      update(groupId, {
        saving: false,
        error: err instanceof Error ? err.message : "Save failed",
      });
    }
  }

  if (study.groups.length === 0) {
    return (
      <div className={styles.emptyState}>
        No groups defined. Add groups in the Details tab first.
      </div>
    );
  }

  return (
    <div>
      {study.groups.map((g) => {
        const s = groupStates[g.id];
        if (!s) return null;
        return (
          <div key={g.id} className={styles.cueConfigGroup}>
            <p className={styles.cueConfigGroupLabel}>
              {g.label || `Group ${g.index}`}
            </p>
            {s.error && <div className={styles.errorMsg}>{s.error}</div>}
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Cue count</label>
                <select
                  className={styles.select}
                  value={s.cueCount}
                  onChange={(e) =>
                    update(g.id, {
                      cueCount: e.target.value as "single" | "multi",
                    })
                  }
                >
                  <option value="single">Single cue</option>
                  <option value="multi">Multi-cue</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Cue source</label>
                <select
                  className={styles.select}
                  value={s.cueSource}
                  onChange={(e) =>
                    update(g.id, {
                      cueSource: e.target.value as CueConfig["cueSource"],
                    })
                  }
                >
                  <option value="low_quality">Low quality (pre-rated)</option>
                  <option value="high_quality">High quality (pre-rated)</option>
                  <option value="self_selected">Self-selected</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Max habits</label>
                <select
                  className={styles.select}
                  value={s.maxHabits ?? ""}
                  onChange={(e) =>
                    update(g.id, {
                      maxHabits: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                >
                  <option value="">Unlimited (public)</option>
                  <option value="1">1 (study participant)</option>
                </select>
              </div>
            </div>
            <div className={styles.formGroup} style={{ marginTop: "0.75rem" }}>
              <label className={styles.label}>Allowed behaviors</label>
              <div className={styles.behaviorCheckboxes}>
                {BEHAVIOR_OPTIONS.map((b) => (
                  <label key={b.key} className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={s.behaviorOptions.includes(b.key)}
                      onChange={() => toggleBehavior(g.id, b.key)}
                    />
                    {b.label}
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.cueConfigFooter}>
              {s.saved && <span className={styles.savedMsg}>Saved!</span>}
              <button
                className={styles.saveBtn}
                onClick={() => handleSave(g.id)}
                disabled={s.saving}
              >
                {s.saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Add the Cue Config tab to `StudyModal`**

In `StudyModal`, add `"cue-config"` to the `ModalTab` type:

```ts
type ModalTab = "details" | "questionnaires" | "codes" | "participants" | "notifications" | "cue-config";
```

Add the tab button in the tabs bar (after the Notifications button):
```tsx
<button
  className={`${styles.tab} ${activeTab === "cue-config" ? styles.tabActive : ""}`}
  onClick={() => setActiveTab("cue-config")}
>
  Cue Config
</button>
```

Add the tab content in the modal body (as a new `else if` case before the closing `)`):
```tsx
) : activeTab === "cue-config" ? (
  initial && <CueConfigTab study={initial} token={token} />
) : (
  initial && <NotificationsTab study={initial} token={token} />
)}
```

- [ ] **Step 4: Add CSS classes to `studies/page.module.css`**

Append to the existing CSS file:

```css
.cueConfigGroup { border: 1px solid var(--color-border); border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
.cueConfigGroupLabel { font-weight: 600; font-size: 0.9rem; margin: 0 0 0.75rem; color: var(--color-text); }
.cueConfigFooter { display: flex; align-items: center; justify-content: flex-end; gap: 0.75rem; margin-top: 0.75rem; }
.behaviorCheckboxes { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; }
.checkboxLabel { display: flex; align-items: center; gap: 0.35rem; font-size: 0.875rem; cursor: pointer; }
.savedMsg { font-size: 0.8rem; color: var(--color-success, #16a34a); }
```

- [ ] **Step 5: Verify the admin build compiles**

```bash
cd admin && npx tsc --noEmit
```
Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add admin/src/app/\(admin\)/studies/page.tsx admin/src/app/\(admin\)/studies/page.module.css
git commit -m "feat: add cue config tab to study modal"
```

---

## Task 4: Update Notifications Tab + Add Export

**Files:**
- Modify: `admin/src/app/(admin)/studies/page.tsx`

### Part A: Update NotificationsTab to new campaign API

The existing `NotificationsTab` hits old backend endpoints. Update it to use the new `/admin/notifications` campaign API.

- [ ] **Step 1: Update API constants at top of `studies/page.tsx`**

The `NOTIFICATIONS_BASE` already points to `/admin/notifications`. The endpoints change:

| Old | New |
|---|---|
| `POST ${NOTIFICATIONS_BASE}/send` | `POST ${NOTIFICATIONS_BASE}` |
| `POST ${NOTIFICATIONS_BASE}/schedule` | `POST ${NOTIFICATIONS_BASE}` |
| `GET ${NOTIFICATIONS_BASE}/scheduled?studyId=` | `GET ${NOTIFICATIONS_BASE}?studyId=&status=scheduled` |
| `DELETE ${NOTIFICATIONS_BASE}/scheduled/:id` | `DELETE ${NOTIFICATIONS_BASE}/:id` |

- [ ] **Step 2: Update `ScheduledNotification` type**

Replace the existing type:
```ts
interface ScheduledNotification {
  id: string;          // was _id
  studyId: string;
  targetIds: string[];
  targetType: string;
  title: string;
  body: string;
  scheduledFor: string;  // was scheduledAt
  status: string;
}
```

- [ ] **Step 3: Replace `fetchScheduled` in `NotificationsTab`**

```ts
const fetchScheduled = useCallback(async () => {
  setLoadingScheduled(true);
  setCancelError("");
  try {
    const data = await apiFetch(
      `${NOTIFICATIONS_BASE}?studyId=${study.id}&status=scheduled`,
      token
    );
    const items = Array.isArray(data)
      ? data
      : (data as { campaigns?: ScheduledNotification[] }).campaigns ?? data;
    setScheduled(Array.isArray(items) ? items : []);
  } catch {
    // non-critical
  } finally {
    setLoadingScheduled(false);
  }
}, [study.id, token]);
```

- [ ] **Step 4: Replace `handleSend` in `NotificationsTab`**

```ts
async function handleSend() {
  if (!title.trim()) { setSendError("Title is required."); return; }
  if (!body.trim()) { setSendError("Body is required."); return; }
  if (sendMode === "schedule" && !scheduledAt) {
    setSendError("Scheduled time is required.");
    return;
  }
  setSending(true);
  setSendError("");
  try {
    const payload: Record<string, unknown> = {
      studyId: study.id,
      title: title.trim(),
      body: body.trim(),
      targetType: targetGroupId === "all" ? "all_enrolled" : "group",
      targetIds: targetGroupId === "all" ? [] : [targetGroupId],
    };
    if (sendMode === "schedule") {
      payload.scheduledFor = new Date(scheduledAt).toISOString();
    }

    const result = await apiFetch(NOTIFICATIONS_BASE, token, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (sendMode === "now") {
      const r = result as { recipientCount?: number };
      showToast(`Sent to ${r.recipientCount ?? 0} participant${(r.recipientCount ?? 0) !== 1 ? "s" : ""}`);
    } else {
      showToast(
        `Scheduled for ${new Date(scheduledAt).toLocaleString("en-GB", {
          day: "2-digit", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        })}`
      );
      await fetchScheduled();
    }
    setTitle(""); setBody(""); setTargetGroupId("all");
    setSendMode("now"); setScheduledAt("");
  } catch (err) {
    setSendError(err instanceof Error ? err.message : "Send failed");
  } finally {
    setSending(false);
  }
}
```

- [ ] **Step 5: Replace `handleCancel` in `NotificationsTab`**

```ts
async function handleCancel(id: string) {
  setCancellingId(id);
  setCancelError("");
  try {
    await apiFetch(`${NOTIFICATIONS_BASE}/${id}`, token, { method: "DELETE" });
    setScheduled((prev) => prev.filter((n) => n.id !== id));
  } catch (err) {
    setCancelError(err instanceof Error ? err.message : "Cancel failed");
  } finally {
    setCancellingId(null);
  }
}
```

- [ ] **Step 6: Update the scheduled list render in `NotificationsTab`**

Find `n._id` references and change to `n.id`. Find `n.scheduledAt` references and change to `n.scheduledFor`. Find `n.groupId` references and replace with:

```tsx
{n.targetType === "group" && n.targetIds.length > 0
  ? study.groups.find((g) => n.targetIds.includes(g.id))?.label ?? n.targetIds[0]
  : "All participants"}
```

### Part B: Add Export ZIP button to ParticipantsTab

- [ ] **Step 7: Add export button to `ParticipantsTab`**

In `ParticipantsTab`, after the existing `handleDownloadCsv` function, add:

```ts
const EXPORT_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") +
  `/admin/studies/${study.id}/export`;

const [exportingZip, setExportingZip] = useState(false);

async function handleExportZip() {
  setExportingZip(true);
  try {
    const res = await fetch(EXPORT_BASE, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${study.name.replace(/[^a-z0-9]/gi, "_")}_research_export.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    // silently fail
  } finally {
    setExportingZip(false);
  }
}
```

In the JSX of `ParticipantsTab`, add the export ZIP button next to the existing "Download CSV" button:

```tsx
<button
  className={styles.csvBtn}
  onClick={handleExportZip}
  disabled={exportingZip || total === 0}
>
  {exportingZip ? "Exporting…" : "Export ZIP (R-ready)"}
</button>
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd admin && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add admin/src/app/\(admin\)/studies/page.tsx
git commit -m "feat: update notifications tab to campaign API, add research export button"
```

---

## Task 5: Settings Page — Public Default Cue Config

**Files:**
- Modify: `admin/src/app/(admin)/settings/page.tsx`
- Modify: `admin/src/app/(admin)/settings/page.module.css`
- Create: `admin/src/__tests__/settings.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// admin/src/__tests__/settings.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import SettingsPage from '../app/(admin)/settings/page';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { accessToken: 'test-token', roles: ['admin'] },
    status: 'authenticated',
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/settings',
}));

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({
      default_cue_count: 'multi',
      default_cue_source: 'high_quality',
      default_reminder_time: '19:00',
    }),
  } as unknown as Response);
});

afterEach(() => { jest.resetAllMocks(); });

describe('SettingsPage', () => {
  it('renders without crashing', () => {
    render(<SettingsPage />);
  });

  it('renders the page title', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument();
  });

  it('renders cue config section heading', async () => {
    render(<SettingsPage />);
    expect(await screen.findByText(/public default cue config/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd admin && npx jest --testPathPattern="settings" --no-coverage 2>&1 | head -10
```

- [ ] **Step 3: Implement `admin/src/app/(admin)/settings/page.module.css`**

Replace the existing CSS (currently only has `.page`, `.header`, etc. as stubs):

```css
.page { padding: 2rem; max-width: 800px; }
.header { margin-bottom: 2rem; }
.title { font-size: 1.5rem; font-weight: 600; margin: 0 0 0.25rem; color: var(--color-text); }
.subtitle { font-size: 0.875rem; color: var(--color-text-muted); margin: 0; }
.section { border: 1px solid var(--color-border); border-radius: 8px; padding: 1.25rem; margin-bottom: 1.5rem; background: var(--color-surface); }
.sectionTitle { font-size: 1rem; font-weight: 600; margin: 0 0 0.25rem; color: var(--color-text); }
.sectionDesc { font-size: 0.8rem; color: var(--color-text-muted); margin: 0 0 1rem; }
.formGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
.formGroup { display: flex; flex-direction: column; gap: 0.3rem; }
.label { font-size: 0.8rem; font-weight: 500; color: var(--color-text-muted); }
.select, .input { padding: 0.4rem 0.6rem; border: 1px solid var(--color-border); border-radius: 6px; font-size: 0.875rem; background: var(--color-surface); color: var(--color-text); }
.select:focus, .input:focus { outline: none; border-color: var(--color-primary); }
.footer { display: flex; align-items: center; gap: 0.75rem; justify-content: flex-end; margin-top: 1rem; }
.saveBtn { padding: 0.45rem 1rem; background: var(--color-primary); color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 0.875rem; }
.saveBtn:hover { background: var(--color-primary-dark); }
.saveBtn:disabled { opacity: 0.5; cursor: not-allowed; }
.savedMsg { font-size: 0.8rem; color: var(--color-success, #16a34a); }
.errorMsg { padding: 0.6rem 0.9rem; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; color: #dc2626; font-size: 0.875rem; margin-bottom: 0.75rem; }
.loadingState { padding: 1rem; color: var(--color-text-muted); font-size: 0.875rem; }
```

- [ ] **Step 4: Implement `admin/src/app/(admin)/settings/page.tsx`**

```tsx
// admin/src/app/(admin)/settings/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

const SETTINGS_API =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") +
  "/admin/settings";

async function apiFetch(url: string, token: string, opts: RequestInit = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `HTTP ${res.status}`
    );
  }
  return res.json();
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const token =
    (session as { accessToken?: string } | null)?.accessToken ?? "";

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.roles?.includes("admin")) {
      router.replace("/access-denied");
    }
  }, [session, status, router]);

  // Public default cue config
  const [cueCount, setCueCount] = useState("multi");
  const [cueSource, setCueSource] = useState("high_quality");
  const [reminderTime, setReminderTime] = useState("19:00");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    apiFetch(SETTINGS_API, token)
      .then((data: Record<string, string>) => {
        if (data.default_cue_count) setCueCount(data.default_cue_count);
        if (data.default_cue_source) setCueSource(data.default_cue_source);
        if (data.default_reminder_time) setReminderTime(data.default_reminder_time);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await Promise.all([
        apiFetch(`${SETTINGS_API}/default_cue_count`, token, {
          method: "PUT",
          body: JSON.stringify({ value: cueCount }),
        }),
        apiFetch(`${SETTINGS_API}/default_cue_source`, token, {
          method: "PUT",
          body: JSON.stringify({ value: cueSource }),
        }),
        apiFetch(`${SETTINGS_API}/default_reminder_time`, token, {
          method: "PUT",
          body: JSON.stringify({ value: reminderTime }),
        }),
      ]);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>System configuration and platform settings.</p>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionTitle}>Public Default Cue Config</p>
        <p className={styles.sectionDesc}>
          Configuration used for app-store users who join without a study code.
          Study participants override these with their condition-specific settings.
        </p>

        {loading ? (
          <div className={styles.loadingState}>Loading…</div>
        ) : (
          <>
            {error && <div className={styles.errorMsg}>{error}</div>}
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Cue count</label>
                <select
                  className={styles.select}
                  value={cueCount}
                  onChange={(e) => { setCueCount(e.target.value); setSaved(false); }}
                >
                  <option value="single">Single cue</option>
                  <option value="multi">Multi-cue (recommended)</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Cue source</label>
                <select
                  className={styles.select}
                  value={cueSource}
                  onChange={(e) => { setCueSource(e.target.value); setSaved(false); }}
                >
                  <option value="high_quality">High quality (recommended)</option>
                  <option value="low_quality">Low quality</option>
                  <option value="self_selected">Self-selected</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Default reminder time</label>
                <input
                  className={styles.input}
                  type="time"
                  value={reminderTime}
                  onChange={(e) => { setReminderTime(e.target.value); setSaved(false); }}
                />
              </div>
            </div>
            <div className={styles.footer}>
              {saved && <span className={styles.savedMsg}>Saved!</span>}
              <button
                className={styles.saveBtn}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test — verify it passes**

```bash
cd admin && npx jest --testPathPattern="settings" --no-coverage
```
Expected: 3 tests pass.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd admin && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add admin/src/app/\(admin\)/settings/page.tsx admin/src/app/\(admin\)/settings/page.module.css admin/src/__tests__/settings.test.tsx
git commit -m "feat: implement settings page with public default cue config"
```

---

## Task 6: Run Full Admin Test Suite + Push

**Files:** None — verification only.

- [ ] **Step 1: Run full admin test suite**

```bash
cd admin && npx jest --no-coverage
```
Expected: all tests pass (existing + new).

- [ ] **Step 2: Run TypeScript check**

```bash
cd admin && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Run lint**

```bash
cd admin && npm run lint
```
Expected: no errors (warnings are acceptable).

- [ ] **Step 4: Run backend unit tests to confirm backend changes are clean**

```bash
cd app && npm run test:unitTests
```
Expected: all tests pass.

- [ ] **Step 5: Push**

```bash
git push origin main
```
