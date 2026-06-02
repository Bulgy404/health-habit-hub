# DFG: Cue Serving, CSV Import & Study Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three complementary DFG features: (1) serve actual pre-rated cue text from the cue pool in `GET /me/habit-config` and display it in the Flutter app; (2) bulk CSV import for the cue pool admin page; (3) per-group study analytics (weekly active rate, mean SRHI trajectory, dropout curve) shown in the admin study modal.

**Architecture:** Feature 1 extends `habitConfigService.js` to randomly pick cues from `cue_pools`, adds `assignedCues` to the API response, and updates the Flutter `HabitConfig` model + `SetCueScreen`. Feature 2 adds a backend `POST /admin/cue-pools/import` JSON endpoint (admin panel parses the CSV in the browser via FileReader and sends rows as JSON — no multipart dependency needed). Feature 3 adds `app/services/studyAnalyticsService.js` with MongoDB aggregation pipelines and a new `GET /admin/studies/:id/analytics` route; the admin panel adds an Analytics tab to the study modal rendered with inline SVG charts (no new library).

**Tech Stack:** Node.js 20 ESM, MongoDB aggregation pipelines, `node:test` + `node:assert`, Next.js 15 App Router, React 18, CSS Modules, Flutter 3 / Dart 3, Riverpod 3, fl_chart (already in pubspec).

**Spec reference:** `docs/superpowers/specs/2026-06-01-dfg-study-integration-design.md` §3.2, §6.1, §6.3

---

## File Map

**Feature 1 — Cue serving:**
- Modify: `app/services/cuePoolService.js` — add `pickAssignedCues()`
- Modify: `app/services/habitConfigService.js` — call `pickAssignedCues`, add `assignedCues` to result
- Modify: `app/tests/unit/habitConfigService.test.js` — add tests for cue assignment
- Modify: `app/tests/unit/cuePoolService.test.js` — add tests for `pickAssignedCues`
- Modify: `mobile/lib/features/my_habits/my_habits_models.dart` — add `assignedCues` to `HabitConfig`
- Modify: `mobile/lib/features/my_habits/new_habit_screen_2_cue.dart` — display real cue text

**Feature 2 — CSV bulk import:**
- Modify: `app/services/cuePoolService.js` — add `importCues()`
- Modify: `app/routes/cuePoolRouter.js` — add `POST /import` endpoint
- Modify: `app/tests/unit/cuePoolService.test.js` — add `importCues` tests
- Modify: `admin/src/app/(admin)/cue-pools/page.tsx` — add CSV import UI
- Modify: `admin/src/app/(admin)/cue-pools/page.module.css` — add import button styles
- Modify: `admin/src/__tests__/cue-pools.test.tsx` — add import UI tests

**Feature 3 — Study analytics:**
- Create: `app/services/studyAnalyticsService.js` — three aggregation functions
- Modify: `app/routes/admin/studiesRouter.js` — add `GET /studies/:id/analytics`
- Create: `app/tests/unit/studyAnalyticsService.test.js` — unit tests for all three functions
- Modify: `admin/src/app/(admin)/studies/page.tsx` — add Analytics tab to StudyModal
- Modify: `admin/src/app/(admin)/studies/page.module.css` — chart + analytics styles
- Create: `admin/src/__tests__/studies-analytics.test.tsx` — analytics tab rendering test

---

## Task 1: `pickAssignedCues` in cuePoolService + tests (TDD)

**Files:**
- Modify: `app/services/cuePoolService.js`
- Modify: `app/tests/unit/cuePoolService.test.js`

- [ ] **Step 1: Read existing `cuePoolService.test.js`** to understand the `makeDb` helper pattern, then append these tests:

```js
// Append to app/tests/unit/cuePoolService.test.js

import { pickAssignedCues } from '../../services/cuePoolService.js';

// --- pickAssignedCues ---

function makePoolDb(cues = []) {
  return {
    collection(name) {
      if (name !== 'cue_pools') throw new Error(`unexpected: ${name}`);
      return {
        aggregate(pipeline) {
          // Simulate $sample by returning first N docs matching quality
          const matchStage = pipeline.find(s => s.$match)?..$match ?? {};
          const sampleN = pipeline.find(s => s.$sample)?.$sample?.size ?? 1;
          const filtered = cues.filter(c =>
            !matchStage.quality || c.quality === matchStage.quality
          );
          return { toArray: async () => filtered.slice(0, sampleN) };
        },
      };
    },
  };
}

test('pickAssignedCues: returns empty array for self_selected source', async () => {
  const db = makePoolDb([]);
  const result = await pickAssignedCues({ db, cueSource: 'self_selected', cueCount: 'single' });
  assert.deepEqual(result, []);
});

test('pickAssignedCues: returns one cue for single count', async () => {
  const db = makePoolDb([
    { _id: 'c1', text: 'After dinner', quality: 'high', dimensions: { stability: 5, salience: 5, specificity: 5 }, domain: 'physical_activity', language: 'en' },
  ]);
  const result = await pickAssignedCues({ db, cueSource: 'high_quality', cueCount: 'single' });
  assert.equal(result.length, 1);
  assert.equal(result[0].text, 'After dinner');
  assert.equal(result[0].source, 'pre_rated');
});

test('pickAssignedCues: returns two cues for multi count', async () => {
  const db = makePoolDb([
    { _id: 'c1', text: 'After dinner', quality: 'low', dimensions: { stability: 2, salience: 2, specificity: 2 }, domain: 'physical_activity', language: 'en' },
    { _id: 'c2', text: 'On weekends', quality: 'low', dimensions: { stability: 2, salience: 2, specificity: 2 }, domain: 'physical_activity', language: 'en' },
  ]);
  const result = await pickAssignedCues({ db, cueSource: 'low_quality', cueCount: 'multi' });
  assert.equal(result.length, 2);
  assert.ok(result.every(c => c.source === 'pre_rated'));
});

test('pickAssignedCues: returns empty array when pool is empty', async () => {
  const db = makePoolDb([]);
  const result = await pickAssignedCues({ db, cueSource: 'high_quality', cueCount: 'single' });
  assert.deepEqual(result, []);
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd app && node --test tests/unit/cuePoolService.test.js 2>&1 | grep -E "fail|Error|pickAssigned" | head -5
```
Expected: fail with "pickAssignedCues is not a function" or similar.

- [ ] **Step 3: Add `pickAssignedCues` to `app/services/cuePoolService.js`**

Append before the final export or at the bottom of the file (after `deleteCue`):

```js
/**
 * Randomly pick 1 or 2 pre-rated cues from the pool matching the quality tier.
 * Returns [] for self_selected (user provides their own cue).
 * @param {{ db, cueSource: string, cueCount: string, cuePoolId?: string|null }} deps
 * @returns {Promise<Array<{text: string, source: 'pre_rated', cueId: string}>>}
 */
export async function pickAssignedCues({ db, cueSource, cueCount, cuePoolId = null }) {
  if (cueSource === 'self_selected') return [];

  const qualityMap = { low_quality: 'low', high_quality: 'high' };
  const quality = qualityMap[cueSource];
  if (!quality) return [];

  const n = cueCount === 'multi' ? 2 : 1;
  const match = { quality };
  if (cuePoolId) {
    try { match._id = new ObjectId(cuePoolId); } catch { /* ignore invalid id */ }
  }

  const docs = await db
    .collection(COLLECTION)
    .aggregate([{ $match: match }, { $sample: { size: n } }])
    .toArray();

  return docs.map(d => ({
    text: d.text,
    source: 'pre_rated',
    cueId: d._id.toString(),
  }));
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd app && node --test tests/unit/cuePoolService.test.js 2>&1 | tail -10
```
Expected: all tests pass (including the 4 new ones).

- [ ] **Step 5: Commit**

```bash
git add app/services/cuePoolService.js app/tests/unit/cuePoolService.test.js
git commit -m "feat: add pickAssignedCues to cuePoolService"
```

---

## Task 2: Update `habitConfigService` to include `assignedCues`

**Files:**
- Modify: `app/services/habitConfigService.js`
- Modify: `app/tests/unit/habitConfigService.test.js`

- [ ] **Step 1: Add tests to `app/tests/unit/habitConfigService.test.js`**

Read the existing file to understand the `makeDb` helper, then append:

```js
// Append to app/tests/unit/habitConfigService.test.js

test('resolveHabitConfig: pre-rated study participant gets assignedCues from pool', async () => {
  const db = {
    collection(name) {
      if (name === 'enrollments') return {
        findOne: async () => ({
          groupId: 'g1', studyId: 's1',
          cueConfig: { cueCount: 'single', cueSource: 'high_quality', cuePoolId: null, behaviorOptions: ['walking'], maxHabits: 1 },
        }),
      };
      if (name === 'cue_pools') return {
        aggregate: () => ({ toArray: async () => [{ _id: 'pool-1', text: 'After dinner', quality: 'high' }] }),
      };
      if (name === 'admin_settings') return { find: () => ({ toArray: async () => [] }) };
      throw new Error(`unexpected: ${name}`);
    },
  };
  const config = await resolveHabitConfig({ db, userId: 'u1' });
  assert.equal(config.assignedCues.length, 1);
  assert.equal(config.assignedCues[0].text, 'After dinner');
  assert.equal(config.assignedCues[0].source, 'pre_rated');
});

test('resolveHabitConfig: self_selected participant gets empty assignedCues', async () => {
  const db = {
    collection(name) {
      if (name === 'enrollments') return {
        findOne: async () => ({
          groupId: 'g1', studyId: 's1',
          cueConfig: { cueCount: 'single', cueSource: 'self_selected', cuePoolId: null, behaviorOptions: ['walking'], maxHabits: 1 },
        }),
      };
      if (name === 'cue_pools') return {
        aggregate: () => ({ toArray: async () => [] }),
      };
      if (name === 'admin_settings') return { find: () => ({ toArray: async () => [] }) };
      throw new Error(`unexpected: ${name}`);
    },
  };
  const config = await resolveHabitConfig({ db, userId: 'u2' });
  assert.deepEqual(config.assignedCues, []);
});

test('resolveHabitConfig: public user gets empty assignedCues', async () => {
  const db = makeDb({
    enrollment: { groupId: 'g0', studyId: 's0', cueConfig: null },
    adminSettings: [{ key: 'default_cue_count', value: 'multi' }, { key: 'default_cue_source', value: 'high_quality' }],
  });
  // makeDb doesn't have cue_pools — extend it:
  const realDb = {
    collection(name) {
      if (name === 'cue_pools') return { aggregate: () => ({ toArray: async () => [] }) };
      return db.collection(name);
    },
  };
  const config = await resolveHabitConfig({ db: realDb, userId: 'u3' });
  assert.deepEqual(config.assignedCues, []);
});
```

Also add `pickAssignedCues` to the import at the top:
```js
// Add to existing import or add new one:
import { pickAssignedCues } from '../../services/cuePoolService.js';
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
cd app && node --test tests/unit/habitConfigService.test.js 2>&1 | grep -E "fail|assignedCues" | head -5
```

- [ ] **Step 3: Update `app/services/habitConfigService.js`**

Replace the entire file:

```js
// app/services/habitConfigService.js
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';
import { DEFAULT_BEHAVIOR_KEYS } from '../utils/srhi.js';
import { pickAssignedCues } from './cuePoolService.js';

const FALLBACK = {
  cueCount: 'multi',
  cueSource: 'high_quality',
  cuePoolId: null,
  behaviorOptions: DEFAULT_BEHAVIOR_KEYS,
  maxHabits: null,
};

async function readAdminSettings(db) {
  const docs = await db
    .collection('admin_settings')
    .find({
      key: {
        $in: [
          'default_cue_count',
          'default_cue_source',
          'default_reminder_time',
        ],
      },
    })
    .toArray();
  return Object.fromEntries(docs.map((d) => [d.key, d.value]));
}

/**
 * Resolve cue configuration for a user, including pre-sampled assigned cues.
 * Priority: enrollment.cueConfig > admin_settings defaults > hardcoded fallback.
 * @param {{ db: object, userId: string }} deps
 */
export async function resolveHabitConfig({ db, userId }) {
  const enrollment = await db.collection(ENROLLMENTS).findOne({ userId });

  let cueCount, cueSource, cuePoolId, behaviorOptions, maxHabits;

  if (enrollment?.cueConfig) {
    cueCount = enrollment.cueConfig.cueCount;
    cueSource = enrollment.cueConfig.cueSource;
    cuePoolId = enrollment.cueConfig.cuePoolId ?? null;
    behaviorOptions = enrollment.cueConfig.behaviorOptions ?? DEFAULT_BEHAVIOR_KEYS;
    maxHabits = enrollment.cueConfig.maxHabits ?? null;
  } else {
    const settings = await readAdminSettings(db);
    cueCount = settings['default_cue_count'] ?? FALLBACK.cueCount;
    cueSource = settings['default_cue_source'] ?? FALLBACK.cueSource;
    cuePoolId = null;
    behaviorOptions = DEFAULT_BEHAVIOR_KEYS;
    maxHabits = null;
  }

  const assignedCues = await pickAssignedCues({ db, cueSource, cueCount, cuePoolId });

  return { cueCount, cueSource, cuePoolId, behaviorOptions, maxHabits, assignedCues };
}
```

- [ ] **Step 4: Run all habitConfig + cuePool unit tests**

```bash
cd app && node --test tests/unit/habitConfigService.test.js tests/unit/cuePoolService.test.js 2>&1 | tail -10
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/services/habitConfigService.js app/tests/unit/habitConfigService.test.js
git commit -m "feat: habitConfigService returns assignedCues from cue pool"
```

---

## Task 3: Flutter — HabitConfig model + SetCueScreen

**Files:**
- Modify: `mobile/lib/features/my_habits/my_habits_models.dart`
- Modify: `mobile/lib/features/my_habits/new_habit_screen_2_cue.dart`

- [ ] **Step 1: Add `assignedCues` to `HabitConfig` in `my_habits_models.dart`**

Find the `HabitConfig` class (around line 14). Add `assignedCues` field and update `fromJson`:

```dart
class HabitConfig {
  const HabitConfig({
    required this.cueCount,
    required this.cueSource,
    this.cuePoolId,
    required this.behaviorOptions,
    this.maxHabits,
    required this.srhiItems,
    this.assignedCues = const [],   // ← add this
  });

  final String cueCount;
  final String cueSource;
  final String? cuePoolId;
  final List<String> behaviorOptions;
  final int? maxHabits;
  final List<SrhiItem> srhiItems;
  final List<IntentionCue> assignedCues;   // ← add this

  factory HabitConfig.fromJson(Map<String, dynamic> json) => HabitConfig(
        cueCount: json['cueCount'] as String? ?? 'multi',
        cueSource: json['cueSource'] as String? ?? 'high_quality',
        cuePoolId: json['cuePoolId'] as String?,
        behaviorOptions: (json['behaviorOptions'] as List<dynamic>?)
                ?.cast<String>() ??
            const [],
        maxHabits: json['maxHabits'] as int?,
        srhiItems: (json['srhiItems'] as List<dynamic>?)
                ?.cast<Map<String, dynamic>>()
                .map(SrhiItem.fromJson)
                .toList() ??
            const [],
        assignedCues: (json['assignedCues'] as List<dynamic>?)   // ← add this
                ?.cast<Map<String, dynamic>>()
                .map(IntentionCue.fromJson)
                .toList() ??
            const [],
      );
}
```

- [ ] **Step 2: Update `SetCueScreen` in `new_habit_screen_2_cue.dart`**

Replace the pre-rated display section and the cue-building logic. The screen should use `widget.config.assignedCues` when available instead of placeholder text.

Replace the `_onNext` method's pre-rated cue construction:

```dart
  void _onNext() {
    final l10n = AppLocalizations.of(context)!;
    final isPreRated = widget.config.cueSource != 'self_selected';

    if (!isPreRated) {
      if (_cue1Controller.text.trim().length < 10) {
        setState(() => _error = l10n.setCueTooShort);
        return;
      }
      // Note: cue2 is optional — only validate if non-empty
      if (widget.config.cueCount == 'multi' &&
          _cue2Controller.text.trim().isNotEmpty &&
          _cue2Controller.text.trim().length < 10) {
        setState(() => _error = l10n.setCueTooShort);
        return;
      }
    }

    setState(() => _error = null);

    final List<IntentionCue> cues;
    if (isPreRated) {
      // Use actual cues from the pool returned by the backend.
      // Fall back to placeholder only if the pool was empty.
      if (widget.config.assignedCues.isNotEmpty) {
        cues = widget.config.assignedCues;
      } else {
        cues = [
          IntentionCue(
            text: 'When it is time for ${widget.behaviorLabel.toLowerCase()}',
            source: 'pre_rated',
          ),
        ];
      }
    } else {
      cues = [
        IntentionCue(
          text: _cue1Controller.text.trim(),
          source: 'self_selected',
        ),
        if (widget.config.cueCount == 'multi' &&
            _cue2Controller.text.trim().isNotEmpty)
          IntentionCue(
            text: _cue2Controller.text.trim(),
            source: 'self_selected',
          ),
      ];
    }

    context.push(
      '/habits/new/confirm',
      extra: {
        'behaviorKey': widget.behaviorKey,
        'behaviorLabel': widget.behaviorLabel,
        'config': widget.config,
        'cues': cues,
      },
    );
  }
```

Replace the pre-rated display cards in `build()`:

```dart
            if (isPreRated) ...[
              if (widget.config.assignedCues.isEmpty)
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.hourglass_empty),
                    title: const Text('No cues available yet'),
                    subtitle: const Text('Contact your study coordinator.'),
                  ),
                )
              else
                ...widget.config.assignedCues.asMap().entries.map((e) {
                  final idx = e.key;
                  final cue = e.value;
                  return Card(
                    child: ListTile(
                      leading: const Icon(Icons.location_on),
                      title: Text(cue.text),
                      subtitle: isMulti
                          ? Text('Cue ${idx + 1} of ${widget.config.assignedCues.length} (assigned by study)')
                          : const Text('Assigned by study'),
                    ),
                  );
                }),
```

- [ ] **Step 3: Run analyze**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter analyze lib/features/my_habits/ 2>&1 | tail -5
```
Expected: `No issues found!`

- [ ] **Step 4: Run Flutter tests**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter test 2>&1 | tail -5
```
Expected: all 120 tests pass.

- [ ] **Step 5: Run backend unit suite**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/app && npm run test:unitTests 2>&1 | tail -5
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/features/my_habits/my_habits_models.dart mobile/lib/features/my_habits/new_habit_screen_2_cue.dart
git commit -m "feat(flutter): display real assigned cues from pool in SetCueScreen"
```

---

## Task 4: CSV bulk import — backend service + route (TDD)

**Files:**
- Modify: `app/services/cuePoolService.js`
- Modify: `app/routes/cuePoolRouter.js`
- Modify: `app/tests/unit/cuePoolService.test.js`

- [ ] **Step 1: Add `importCues` tests to `app/tests/unit/cuePoolService.test.js`**

Append:

```js
import { importCues } from '../../services/cuePoolService.js';

// --- importCues ---

function makeImportDb() {
  const inserted = [];
  return {
    inserted,
    collection(name) {
      if (name !== 'cue_pools') throw new Error(`unexpected: ${name}`);
      return {
        insertMany: async (docs) => {
          inserted.push(...docs);
          return { insertedCount: docs.length };
        },
      };
    },
  };
}

test('importCues: inserts valid rows and returns count', async () => {
  const { db, inserted } = Object.assign(makeImportDb(), { db: makeImportDb() });
  const mockDb = makeImportDb();
  const rows = [
    { text: 'After dinner', quality: 'high', stability: 5, salience: 5, specificity: 5, domain: 'physical_activity', language: 'en' },
    { text: 'On weekends', quality: 'low', stability: 2, salience: 2, specificity: 2, domain: 'physical_activity', language: 'de' },
  ];
  const result = await importCues({ db: mockDb, rows });
  assert.equal(result.inserted, 2);
  assert.equal(result.skipped, 0);
  assert.equal(mockDb.inserted.length, 2);
  assert.equal(mockDb.inserted[0].text, 'After dinner');
  assert.equal(mockDb.inserted[0].quality, 'high');
  assert.deepEqual(mockDb.inserted[0].dimensions, { stability: 5, salience: 5, specificity: 5 });
});

test('importCues: skips rows with missing required fields', async () => {
  const mockDb = makeImportDb();
  const rows = [
    { text: '', quality: 'high', stability: 5, salience: 5, specificity: 5, domain: 'physical_activity', language: 'en' },
    { text: 'Valid cue', quality: 'low', stability: 3, salience: 3, specificity: 3, domain: 'physical_activity', language: 'en' },
    { text: 'Bad quality', quality: 'medium', stability: 3, salience: 3, specificity: 3, domain: 'physical_activity', language: 'en' },
  ];
  const result = await importCues({ db: mockDb, rows });
  assert.equal(result.inserted, 1);
  assert.equal(result.skipped, 2);
});

test('importCues: returns inserted 0 for empty rows array', async () => {
  const mockDb = makeImportDb();
  const result = await importCues({ db: mockDb, rows: [] });
  assert.equal(result.inserted, 0);
  assert.equal(result.skipped, 0);
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd app && node --test tests/unit/cuePoolService.test.js 2>&1 | grep -E "importCues|fail" | head -5
```

- [ ] **Step 3: Add `importCues` to `app/services/cuePoolService.js`**

Append after `pickAssignedCues`:

```js
/**
 * Bulk-insert cues from a parsed CSV row array.
 * Each row: { text, quality, stability, salience, specificity, domain, language }
 * Skips rows with missing/invalid required fields.
 * @param {{ db, rows: object[] }} deps
 * @returns {Promise<{ inserted: number, skipped: number }>}
 */
export async function importCues({ db, rows }) {
  if (!rows || rows.length === 0) return { inserted: 0, skipped: 0 };

  const valid = [];
  let skipped = 0;

  for (const row of rows) {
    const text = (row.text ?? '').trim();
    const quality = (row.quality ?? '').trim();
    const stability = parseInt(row.stability, 10);
    const salience = parseInt(row.salience, 10);
    const specificity = parseInt(row.specificity, 10);
    const domain = (row.domain ?? '').trim();
    const language = (row.language ?? '').trim();

    const validQuality = ['low', 'high'].includes(quality);
    const validDims = [stability, salience, specificity].every(n => n >= 1 && n <= 5);

    if (!text || !validQuality || !validDims || !domain || !language) {
      skipped++;
      continue;
    }

    valid.push({
      text,
      quality,
      dimensions: { stability, salience, specificity },
      domain,
      language,
      createdAt: new Date(),
    });
  }

  if (valid.length === 0) return { inserted: 0, skipped };

  const result = await db.collection(COLLECTION).insertMany(valid);
  return { inserted: result.insertedCount, skipped };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd app && node --test tests/unit/cuePoolService.test.js 2>&1 | tail -10
```
Expected: all pass.

- [ ] **Step 5: Add `POST /import` to `app/routes/cuePoolRouter.js`**

Read the file, then add after the `POST /` route (single-cue creation):

```js
  // POST /api/v1/admin/cue-pools/import
  // Body: { cues: [{ text, quality, stability, salience, specificity, domain, language }] }
  router.post('/import', async (req, res) => {
    try {
      const { cues } = req.body;
      if (!Array.isArray(cues)) {
        return res.status(400).json({ error: 'cues must be an array' });
      }
      const database = await getDb();
      const result = await importCues({ db: database, rows: cues });
      res.status(201).json(result);
    } catch (err) {
      console.error('[cue-pools] POST /import:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
```

Also add `importCues` to the import at the top of the router file:
```js
import { createCue, listCues, deleteCue, importCues } from '../services/cuePoolService.js';
```

- [ ] **Step 6: Commit**

```bash
git add app/services/cuePoolService.js app/routes/cuePoolRouter.js app/tests/unit/cuePoolService.test.js
git commit -m "feat: add importCues service and POST /admin/cue-pools/import endpoint"
```

---

## Task 5: CSV import UI in admin cue pools page

**Files:**
- Modify: `admin/src/app/(admin)/cue-pools/page.tsx`
- Modify: `admin/src/app/(admin)/cue-pools/page.module.css`
- Modify: `admin/src/__tests__/cue-pools.test.tsx`

- [ ] **Step 1: Add import UI test to `admin/src/__tests__/cue-pools.test.tsx`**

Read the existing test file, then add:

```tsx
  it('renders the Import CSV button', () => {
    render(<CuePoolsPage />);
    expect(screen.getByRole('button', { name: /import csv/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd admin && npx jest --testPathPattern="cue-pools" --no-coverage 2>&1 | tail -10
```

- [ ] **Step 3: Add import state + handler + button to `admin/src/app/(admin)/cue-pools/page.tsx`**

Read the existing page file. Add these state variables in `CuePoolsPage` (after the existing state):

```tsx
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
```

Add `useRef` to the React import at the top: `import { useCallback, useEffect, useRef, useState } from "react";`

Add the CSV parse + import handler (after `handleDelete`):

```tsx
  async function handleImportCsv(file: File) {
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      const text = await file.text();
      const lines = text.trim().split("\n").filter(Boolean);
      if (lines.length < 2) {
        setImportError("CSV must have a header row and at least one data row.");
        return;
      }
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
      const required = ["text", "quality", "stability", "salience", "specificity", "domain", "language"];
      const missing = required.filter(h => !headers.includes(h));
      if (missing.length > 0) {
        setImportError(`Missing columns: ${missing.join(", ")}`);
        return;
      }
      const cues = lines.slice(1).map(line => {
        const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
        return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
      });
      const data = await apiFetch(`${API_BASE.replace("/cue-pools", "")}/cue-pools/import`, token, {
        method: "POST",
        body: JSON.stringify({ cues }),
      });
      setImportResult(data as { inserted: number; skipped: number });
      await fetchCues(1); setPage(1);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }
```

Add the hidden file input + Import CSV button in the JSX header (next to the existing "+ Add Cue" button):

```tsx
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportCsv(file);
            }}
          />
          <button
            className={styles.importButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? "Importing…" : "Import CSV"}
          </button>
          <button className={styles.addButton} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "+ Add Cue"}
          </button>
        </div>
```

Add import result/error display (after the existing `{error && ...}` line):

```tsx
      {importResult && (
        <div className={styles.importResult}>
          Imported {importResult.inserted} cues{importResult.skipped > 0 ? `, ${importResult.skipped} skipped (invalid)` : ""}.
        </div>
      )}
      {importError && <div className={styles.errorMsg}>{importError}</div>}
```

- [ ] **Step 4: Add CSS to `admin/src/app/(admin)/cue-pools/page.module.css`**

Append:

```css
.importButton { padding: 0.5rem 1rem; background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); border-radius: 6px; cursor: pointer; font-size: 0.875rem; white-space: nowrap; }
.importButton:hover { background: var(--color-surface-alt); }
.importButton:disabled { opacity: 0.5; cursor: not-allowed; }
.importResult { padding: 0.6rem 1rem; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; color: #166534; font-size: 0.875rem; margin-bottom: 0.75rem; }
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd admin && npx jest --testPathPattern="cue-pools" --no-coverage 2>&1 | tail -10
```
Expected: 4 tests pass (3 existing + 1 new).

- [ ] **Step 6: TypeScript check**

```bash
cd admin && npx tsc --noEmit 2>&1 | head -10
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add admin/src/app/\(admin\)/cue-pools/page.tsx admin/src/app/\(admin\)/cue-pools/page.module.css admin/src/__tests__/cue-pools.test.tsx
git commit -m "feat: add CSV bulk import to cue pools admin page"
```

---

## Task 6: Study analytics service (TDD)

**Files:**
- Create: `app/services/studyAnalyticsService.js`
- Create: `app/tests/unit/studyAnalyticsService.test.js`

- [ ] **Step 1: Create the test file**

```js
// app/tests/unit/studyAnalyticsService.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { getWeeklyActiveRate, getMeanSrhiTrajectory, getDropoutCurve } from '../../services/studyAnalyticsService.js';
import { ObjectId } from 'mongodb';

const studyId = new ObjectId();
const groupA = new ObjectId();
const groupB = new ObjectId();

function makeDb({ enrollments = [], logs = [], srhi = [] } = {}) {
  return {
    collection(name) {
      if (name === 'enrollments') return {
        find: (q) => ({ toArray: async () => enrollments.filter(e => e.studyId?.toString() === q.studyId?.toString()) }),
      };
      if (name === 'daily_behavior_logs') return {
        aggregate: (pipeline) => {
          // Extract the $match stage userId list
          const match = pipeline.find(s => s.$match)?.$match ?? {};
          const userIds = match.userId?.$in ?? [];
          const cutoff = match.date?.$gte;
          const filtered = logs.filter(l =>
            userIds.includes(l.userId) && (!cutoff || l.date >= cutoff)
          );
          // Group by userId
          const byUser = {};
          for (const l of filtered) { byUser[l.userId] = (byUser[l.userId] ?? 0) + 1; }
          return { toArray: async () => Object.entries(byUser).map(([userId, count]) => ({ userId, count })) };
        },
      };
      if (name === 'srhi_responses') return {
        aggregate: (pipeline) => {
          const match = pipeline.find(s => s.$match)?.$match ?? {};
          const filtered = srhi.filter(s =>
            (!match.studyId || s.studyId?.toString() === match.studyId?.toString()) &&
            s.submittedAt != null
          );
          // Group by groupId + weekNumber, compute mean
          const groups = {};
          for (const s of filtered) {
            const key = `${s.groupId}_${s.weekNumber}`;
            groups[key] = groups[key] ?? { groupId: s.groupId, weekNumber: s.weekNumber, scores: [] };
            if (s.score != null) groups[key].scores.push(s.score);
          }
          return { toArray: async () => Object.values(groups).map(g => ({ groupId: g.groupId, weekNumber: g.weekNumber, meanScore: g.scores.reduce((a,b) => a+b, 0) / g.scores.length })) };
        },
      };
      throw new Error(`unexpected: ${name}`);
    },
  };
}

test('getWeeklyActiveRate: returns per-group active rate', async () => {
  const today = new Date().toISOString().split('T')[0];
  const db = makeDb({
    enrollments: [
      { userId: 'u1', studyId, groupId: groupA },
      { userId: 'u2', studyId, groupId: groupA },
      { userId: 'u3', studyId, groupId: groupB },
    ],
    logs: [{ userId: 'u1', date: today, enacted: true }],
  });
  const result = await getWeeklyActiveRate({ db, studyId: studyId.toString() });
  const a = result.find(r => r.groupId === groupA.toString());
  const b = result.find(r => r.groupId === groupB.toString());
  assert.ok(a, 'groupA result exists');
  assert.equal(a.enrolled, 2);
  assert.equal(a.active, 1);
  assert.equal(a.rate, 0.5);
  assert.equal(b.active, 0);
  assert.equal(b.rate, 0);
});

test('getMeanSrhiTrajectory: returns mean score per group per week', async () => {
  const db = makeDb({
    enrollments: [],
    srhi: [
      { studyId, groupId: groupA, weekNumber: 1, score: 4, submittedAt: new Date() },
      { studyId, groupId: groupA, weekNumber: 1, score: 6, submittedAt: new Date() },
      { studyId, groupId: groupB, weekNumber: 1, score: 3, submittedAt: new Date() },
    ],
  });
  const result = await getMeanSrhiTrajectory({ db, studyId: studyId.toString() });
  const aW1 = result.find(r => r.groupId === groupA.toString() && r.weekNumber === 1);
  const bW1 = result.find(r => r.groupId === groupB.toString() && r.weekNumber === 1);
  assert.ok(aW1);
  assert.equal(aW1.meanScore, 5);
  assert.equal(bW1.meanScore, 3);
});

test('getDropoutCurve: returns cumulative dropouts per group by date', async () => {
  const db = makeDb({
    enrollments: [
      { userId: 'u1', studyId, groupId: groupA, droppedOutAt: new Date('2026-01-10') },
      { userId: 'u2', studyId, groupId: groupA, droppedOutAt: new Date('2026-01-15') },
      { userId: 'u3', studyId, groupId: groupB, droppedOutAt: null },
    ],
  });
  const result = await getDropoutCurve({ db, studyId: studyId.toString() });
  const aDropouts = result.filter(r => r.groupId === groupA.toString());
  assert.equal(aDropouts.length, 2);
  assert.ok(aDropouts.every(r => r.date && r.cumulative > 0));
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd app && node --test tests/unit/studyAnalyticsService.test.js 2>&1 | head -10
```

- [ ] **Step 3: Create `app/services/studyAnalyticsService.js`**

```js
// app/services/studyAnalyticsService.js
import { ObjectId } from 'mongodb';

const ENROLLMENTS = 'enrollments';
const DAILY_LOGS = 'daily_behavior_logs';
const SRHI = 'srhi_responses';

/**
 * Per-group weekly active rate: % of enrolled participants with ≥1 log in the last 7 days.
 */
export async function getWeeklyActiveRate({ db, studyId }) {
  let oid;
  try { oid = new ObjectId(studyId); } catch { return []; }

  const enrollments = await db.collection(ENROLLMENTS)
    .find({ studyId: oid })
    .toArray();

  if (enrollments.length === 0) return [];

  // Group enrolled users by groupId
  const byGroup = {};
  for (const e of enrollments) {
    const gid = e.groupId?.toString() ?? 'unknown';
    byGroup[gid] = byGroup[gid] ?? { groupId: gid, userIds: [] };
    byGroup[gid].userIds.push(e.userId);
  }

  // 7-day cutoff
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const results = [];
  for (const { groupId, userIds } of Object.values(byGroup)) {
    const activeDocs = await db.collection(DAILY_LOGS)
      .aggregate([
        { $match: { userId: { $in: userIds }, date: { $gte: cutoffStr } } },
        { $group: { _id: '$userId' } },
      ])
      .toArray();
    const active = activeDocs.length;
    const enrolled = userIds.length;
    results.push({ groupId, enrolled, active, rate: enrolled > 0 ? active / enrolled : 0 });
  }
  return results;
}

/**
 * Mean SRHI score per group per week (submitted responses only).
 */
export async function getMeanSrhiTrajectory({ db, studyId }) {
  let oid;
  try { oid = new ObjectId(studyId); } catch { return []; }

  const docs = await db.collection(SRHI)
    .aggregate([
      { $match: { studyId: oid, submittedAt: { $ne: null }, score: { $ne: null } } },
      {
        $group: {
          _id: { groupId: '$groupId', weekNumber: '$weekNumber' },
          meanScore: { $avg: '$score' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.weekNumber': 1 } },
    ])
    .toArray();

  return docs.map(d => ({
    groupId: d._id.groupId?.toString() ?? null,
    weekNumber: d._id.weekNumber,
    meanScore: Math.round(d.meanScore * 100) / 100,
    count: d.count,
  }));
}

/**
 * Cumulative dropout count per group by date (sorted ascending).
 * Only includes enrollments with a droppedOutAt date.
 */
export async function getDropoutCurve({ db, studyId }) {
  let oid;
  try { oid = new ObjectId(studyId); } catch { return []; }

  const dropped = await db.collection(ENROLLMENTS)
    .find({ studyId: oid, droppedOutAt: { $ne: null } })
    .toArray();

  if (dropped.length === 0) return [];

  // Sort by date, build cumulative per group
  const byGroup = {};
  for (const e of dropped) {
    const gid = e.groupId?.toString() ?? 'unknown';
    const date = e.droppedOutAt.toISOString().split('T')[0];
    byGroup[gid] = byGroup[gid] ?? [];
    byGroup[gid].push(date);
  }

  const result = [];
  for (const [groupId, dates] of Object.entries(byGroup)) {
    dates.sort();
    let cumulative = 0;
    for (const date of dates) {
      cumulative++;
      result.push({ groupId, date, cumulative });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd app && node --test tests/unit/studyAnalyticsService.test.js 2>&1 | tail -10
```
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/services/studyAnalyticsService.js app/tests/unit/studyAnalyticsService.test.js
git commit -m "feat: add studyAnalyticsService (weekly active rate, SRHI trajectory, dropout curve)"
```

---

## Task 7: Analytics API route

**Files:**
- Modify: `app/routes/admin/studiesRouter.js`

- [ ] **Step 1: Read `app/routes/admin/studiesRouter.js`** to find the import block and a good insertion point (after the participants route, around line 270+).

- [ ] **Step 2: Add the import**

Find the existing import block at the top of the file and add:

```js
import { getWeeklyActiveRate, getMeanSrhiTrajectory, getDropoutCurve } from '../../services/studyAnalyticsService.js';
```

- [ ] **Step 3: Add the route**

After the `GET /studies/:id/participants` route, add:

```js
  // GET /api/v1/admin/studies/:id/analytics
  router.get('/studies/:id/analytics', async (req, res) => {
    try {
      const database = await getDb();
      const [weeklyActiveRate, srhiTrajectory, dropoutCurve] = await Promise.all([
        getWeeklyActiveRate({ db: database, studyId: req.params.id }),
        getMeanSrhiTrajectory({ db: database, studyId: req.params.id }),
        getDropoutCurve({ db: database, studyId: req.params.id }),
      ]);
      res.json({ weeklyActiveRate, srhiTrajectory, dropoutCurve });
    } catch (err) {
      console.error('[studies] GET /:id/analytics:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
```

- [ ] **Step 4: Run full unit suite**

```bash
cd app && npm run test:unitTests 2>&1 | tail -8
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/routes/admin/studiesRouter.js
git commit -m "feat: add GET /admin/studies/:id/analytics endpoint"
```

---

## Task 8: Analytics tab in admin study modal

**Files:**
- Modify: `admin/src/app/(admin)/studies/page.tsx`
- Modify: `admin/src/app/(admin)/studies/page.module.css`
- Create: `admin/src/__tests__/studies-analytics.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// admin/src/__tests__/studies-analytics.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { accessToken: 'test-token' },
    status: 'authenticated',
  }),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/studies',
}));

// We test the AnalyticsTab component directly
import { AnalyticsTab } from '../app/(admin)/studies/page';

const mockStudy = {
  id: 'study-1',
  name: 'Test Study',
  description: '',
  isActive: true,
  isDefault: false,
  groups: [
    { id: 'g1', label: 'C1', index: 1 },
    { id: 'g2', label: 'C2', index: 2 },
  ],
  questionnaires: [],
  participantCount: 10,
  createdAt: null,
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({
      weeklyActiveRate: [
        { groupId: 'g1', enrolled: 5, active: 3, rate: 0.6 },
        { groupId: 'g2', enrolled: 5, active: 2, rate: 0.4 },
      ],
      srhiTrajectory: [
        { groupId: 'g1', weekNumber: 1, meanScore: 4.5, count: 3 },
        { groupId: 'g2', weekNumber: 1, meanScore: 3.2, count: 2 },
      ],
      dropoutCurve: [],
    }),
  } as unknown as Response);
});

afterEach(() => { jest.resetAllMocks(); });

describe('AnalyticsTab', () => {
  it('renders without crashing', () => {
    render(<AnalyticsTab study={mockStudy as any} token="test-token" />);
  });

  it('renders Weekly Active Rate heading', async () => {
    render(<AnalyticsTab study={mockStudy as any} token="test-token" />);
    expect(await screen.findByText(/weekly active rate/i)).toBeInTheDocument();
  });

  it('renders SRHI Trajectory heading', async () => {
    render(<AnalyticsTab study={mockStudy as any} token="test-token" />);
    expect(await screen.findByText(/srhi trajectory/i)).toBeInTheDocument();
  });

  it('renders group labels from mock data', async () => {
    render(<AnalyticsTab study={mockStudy as any} token="test-token" />);
    expect(await screen.findByText(/60%/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd admin && npx jest --testPathPattern="studies-analytics" --no-coverage 2>&1 | head -15
```

- [ ] **Step 3: Add `AnalyticsTab` component to `admin/src/app/(admin)/studies/page.tsx`**

Read the existing file to find where `CueConfigTab` is defined (around the "Cue config tab" comment). Add the `AnalyticsTab` component before `CueConfigTab`. Also add the `AnalyticsTab` type interfaces and update `ModalTab`.

**Add interfaces** (after existing `StudyGroup` interface — also add `cueConfig?: CueConfig | null` if not already there):

```ts
interface WeeklyActiveRate {
  groupId: string;
  enrolled: number;
  active: number;
  rate: number;
}

interface SrhiPoint {
  groupId: string;
  weekNumber: number;
  meanScore: number;
  count: number;
}

interface DropoutPoint {
  groupId: string;
  date: string;
  cumulative: number;
}

interface AnalyticsData {
  weeklyActiveRate: WeeklyActiveRate[];
  srhiTrajectory: SrhiPoint[];
  dropoutCurve: DropoutPoint[];
}
```

**Add `ANALYTICS_BASE` constant** (after existing API constants):

```ts
const ANALYTICS_BASE = (studyId: string) =>
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") +
  `/admin/studies/${studyId}/analytics`;
```

**Add `AnalyticsTab` component** (before `CueConfigTab`):

```tsx
export function AnalyticsTab({
  study,
  token,
}: {
  study: StudySummary;
  token: string;
}) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(ANALYTICS_BASE(study.id), token)
      .then((d) => { if (!cancelled) setData(d as AnalyticsData); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [study.id, token]);

  // Find group label by groupId
  const groupLabel = (gid: string) =>
    study.groups.find((g) => g.id === gid)?.label ?? gid;

  if (loading) return <div className={styles.loadingState}>Loading…</div>;
  if (error) return <div className={styles.errorMsg}>{error}</div>;
  if (!data) return null;

  const maxRate = Math.max(...data.weeklyActiveRate.map((r) => r.rate), 0.01);
  const maxSrhi = 7;

  // Group SRHI trajectory by groupId
  const srhiByGroup: Record<string, SrhiPoint[]> = {};
  for (const p of data.srhiTrajectory) {
    srhiByGroup[p.groupId] = srhiByGroup[p.groupId] ?? [];
    srhiByGroup[p.groupId].push(p);
  }

  // Unique week numbers
  const weeks = [...new Set(data.srhiTrajectory.map((p) => p.weekNumber))].sort((a, b) => a - b);

  const groupColors = ["#45B700", "#E679AB", "#3B82F6", "#F59E0B", "#8B5CF6", "#EF4444"];

  return (
    <div className={styles.analyticsTab}>
      {/* Weekly Active Rate */}
      <div className={styles.analyticsSection}>
        <p className={styles.analyticsSectionTitle}>Weekly Active Rate</p>
        <p className={styles.analyticsSectionDesc}>% of enrolled participants with ≥1 log in the last 7 days.</p>
        {data.weeklyActiveRate.length === 0 ? (
          <div className={styles.emptyState}>No enrollment data yet.</div>
        ) : (
          <div className={styles.barChart}>
            {data.weeklyActiveRate.map((r, i) => (
              <div key={r.groupId} className={styles.barRow}>
                <span className={styles.barLabel}>{groupLabel(r.groupId)}</span>
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{
                      width: `${(r.rate / maxRate) * 100}%`,
                      background: groupColors[i % groupColors.length],
                    }}
                  />
                </div>
                <span className={styles.barValue}>{Math.round(r.rate * 100)}%</span>
                <span className={styles.barSub}>({r.active}/{r.enrolled})</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SRHI Trajectory */}
      <div className={styles.analyticsSection}>
        <p className={styles.analyticsSectionTitle}>SRHI Trajectory</p>
        <p className={styles.analyticsSectionDesc}>Mean habit strength score per week per condition (1–7 scale).</p>
        {data.srhiTrajectory.length === 0 ? (
          <div className={styles.emptyState}>No SRHI data yet.</div>
        ) : (
          <div className={styles.lineChartWrap}>
            <svg viewBox={`0 0 ${Math.max(weeks.length * 60, 300)} 160`} className={styles.lineChart}>
              {/* Y axis lines */}
              {[1, 2, 3, 4, 5, 6, 7].map((y) => {
                const cy = 140 - ((y - 1) / 6) * 120;
                return <line key={y} x1="40" y1={cy} x2={Math.max(weeks.length * 60, 300) - 10} y2={cy} stroke="#e5e7eb" strokeWidth="1" />;
              })}
              {/* Y labels */}
              {[1, 4, 7].map((y) => {
                const cy = 140 - ((y - 1) / 6) * 120;
                return <text key={y} x="32" y={cy + 4} textAnchor="end" fontSize="10" fill="#6b7280">{y}</text>;
              })}
              {/* X labels */}
              {weeks.map((w, i) => (
                <text key={w} x={40 + i * 60} y="158" textAnchor="middle" fontSize="10" fill="#6b7280">W{w}</text>
              ))}
              {/* Lines per group */}
              {Object.entries(srhiByGroup).map(([gid, points], gi) => {
                const sorted = [...points].sort((a, b) => a.weekNumber - b.weekNumber);
                const pts = sorted.map((p) => {
                  const xi = weeks.indexOf(p.weekNumber);
                  const x = 40 + xi * 60;
                  const y = 140 - ((p.meanScore - 1) / 6) * 120;
                  return `${x},${y}`;
                });
                const color = groupColors[gi % groupColors.length];
                return (
                  <g key={gid}>
                    <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" />
                    {sorted.map((p, i) => {
                      const xi = weeks.indexOf(p.weekNumber);
                      const x = 40 + xi * 60;
                      const y = 140 - ((p.meanScore - 1) / 6) * 120;
                      return <circle key={i} cx={x} cy={y} r="4" fill={color} />;
                    })}
                  </g>
                );
              })}
            </svg>
            {/* Legend */}
            <div className={styles.chartLegend}>
              {Object.keys(srhiByGroup).map((gid, i) => (
                <span key={gid} className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: groupColors[i % groupColors.length] }} />
                  {groupLabel(gid)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dropout Curve */}
      <div className={styles.analyticsSection}>
        <p className={styles.analyticsSectionTitle}>Cumulative Dropout</p>
        <p className={styles.analyticsSectionDesc}>Participants marked as dropped out over time.</p>
        {data.dropoutCurve.length === 0 ? (
          <div className={styles.emptyState}>No dropouts recorded.</div>
        ) : (
          <div className={styles.dropoutList}>
            {data.dropoutCurve.map((p, i) => (
              <div key={i} className={styles.dropoutRow}>
                <span className={styles.dropoutDate}>{p.date}</span>
                <span className={styles.dropoutGroup}>{groupLabel(p.groupId)}</span>
                <span className={styles.dropoutCount}>cumulative: {p.cumulative}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Update `ModalTab` type** — add `"analytics"`:

```ts
type ModalTab = "details" | "questionnaires" | "codes" | "participants" | "notifications" | "cue-config" | "analytics";
```

**Add Analytics tab button** in the tabs bar (after the Cue Config button):

```tsx
            <button
              className={`${styles.tab} ${activeTab === "analytics" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("analytics")}
            >
              Analytics
            </button>
```

**Add Analytics tab content** in the modal body conditional chain (before the final else):

```tsx
          ) : activeTab === "analytics" ? (
            initial && <AnalyticsTab study={initial} token={token} />
```

- [ ] **Step 4: Add CSS classes to `admin/src/app/(admin)/studies/page.module.css`**

Append:

```css
/* ── Analytics tab ──────────────────────────────────────────────────────────── */
.analyticsTab { padding: 0.5rem 0; }
.analyticsSection { border: 1px solid var(--color-border); border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
.analyticsSectionTitle { font-weight: 600; font-size: 0.9rem; margin: 0 0 0.2rem; color: var(--color-text); }
.analyticsSectionDesc { font-size: 0.78rem; color: var(--color-text-muted); margin: 0 0 0.75rem; }
.barChart { display: flex; flex-direction: column; gap: 0.5rem; }
.barRow { display: flex; align-items: center; gap: 0.5rem; }
.barLabel { font-size: 0.8rem; font-weight: 600; width: 40px; flex-shrink: 0; color: var(--color-text); }
.barTrack { flex: 1; height: 12px; background: var(--color-surface-alt); border-radius: 6px; overflow: hidden; }
.barFill { height: 100%; border-radius: 6px; transition: width 0.3s; }
.barValue { font-size: 0.8rem; font-weight: 600; color: var(--color-text); width: 36px; text-align: right; }
.barSub { font-size: 0.75rem; color: var(--color-text-muted); width: 48px; }
.lineChartWrap { overflow-x: auto; }
.lineChart { width: 100%; min-width: 300px; }
.chartLegend { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; margin-top: 0.5rem; }
.legendItem { display: flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; color: var(--color-text); }
.legendDot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.dropoutList { display: flex; flex-direction: column; gap: 0.35rem; }
.dropoutRow { display: flex; gap: 1rem; font-size: 0.8rem; align-items: center; padding: 0.25rem 0; border-bottom: 1px solid var(--color-border); }
.dropoutRow:last-child { border-bottom: none; }
.dropoutDate { color: var(--color-text-muted); width: 90px; flex-shrink: 0; }
.dropoutGroup { font-weight: 600; color: var(--color-text); width: 50px; }
.dropoutCount { color: var(--color-text-muted); }
```

- [ ] **Step 5: Run the analytics test**

```bash
cd admin && npx jest --testPathPattern="studies-analytics" --no-coverage 2>&1 | tail -10
```
Expected: 4 tests pass.

- [ ] **Step 6: TypeScript check**

```bash
cd admin && npx tsc --noEmit 2>&1 | head -10
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add admin/src/app/\(admin\)/studies/page.tsx admin/src/app/\(admin\)/studies/page.module.css admin/src/__tests__/studies-analytics.test.tsx
git commit -m "feat: add Analytics tab to study modal with active rate, SRHI trajectory, dropout curve"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run backend unit tests**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/app && npm run test:unitTests 2>&1 | tail -8
```
Expected: all pass.

- [ ] **Step 2: Run admin tests**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/admin && npx jest --no-coverage 2>&1 | tail -8
```
Expected: all pass (pre-existing knowledge-base failures are acceptable — they pre-date this work).

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/admin && npx tsc --noEmit 2>&1 | head -10
```
Expected: no errors.

- [ ] **Step 4: Flutter tests**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter test 2>&1 | tail -5
```
Expected: all 120 tests pass.

- [ ] **Step 5: Push**

```bash
git push origin main
```
