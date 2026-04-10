# Full Repo Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fresh full-codebase review — read every layer, apply P0/P1 fixes, rewrite AUDIT.md with scored findings.

**Architecture:** Sequential layer-by-layer review (Infrastructure → Backend → Python API → Admin → Flutter). Per layer: read all files, record findings in a scratch doc, apply fixes per severity policy, commit. Final task consolidates findings into AUDIT.md.

**Tech Stack:** Node.js/Express, FastAPI/Python, Next.js/TypeScript, Flutter/Dart, MongoDB, Neo4j, Apache Fuseki, Docker/Traefik, Keycloak JWKS JWT auth

**Severity policy:**
- P0 = critical/security-breaking → fix immediately
- P1 = bug or meaningful security gap → fix unless requires large refactor, otherwise document
- P2 = clean code / maintainability → fix if small and safe, otherwise document

---

### Task 1: Infrastructure Layer Review

**Files:**
- Read: `docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.local.yml`, `stack.env`
- Modify: `docker-compose.yml`
- Create: `docs/superpowers/review-scratch.md`

- [ ] **Step 1: Read all compose files and stack.env**

```bash
cat docker-compose.yml docker-compose.prod.yml docker-compose.local.yml stack.env
```

Look for: hardcoded credentials in `environment:` blocks (not from `env_file`), ports exposed to host that should be internal-only, insecure Traefik flags (`--api.insecure`), missing restart policies, missing network isolation, secrets committed to git.

- [ ] **Step 2: Fix — remove hardcoded credentials from docker-compose.yml app service**

In `docker-compose.yml`, the `app` service environment block contains hardcoded values that duplicate (and override) what `env_file` already provides:

```yaml
# Before — these three lines exist inside the app service's environment block:
    - MONGO_DB=surveyjs
    - MONGO_USER=admin
    - MONGO_PASSWORD=admin
```

`MONGO_USER` and `MONGO_PASSWORD` are already declared in `stack.env` / `.env` and loaded via `env_file`. Remove the hardcoded lines so the `.env` values are the single source of truth. Keep only `NODE_ENV`, `NODE_OPTIONS`, and `MONGO_DB` if `MONGO_DB` is not in `.env`:

```yaml
# After:
    environment:
      - NODE_ENV=production
      - NODE_OPTIONS=--no-warnings
      - MONGO_DB=surveyjs
```

- [ ] **Step 3: Record infrastructure findings**

Create `docs/superpowers/review-scratch.md`:

```markdown
# Review Scratch Notes — 2026-04-10

## Infrastructure

| Severity | File | Line | Finding | Fix |
|----------|------|------|---------|-----|
| P1 | docker-compose.yml | app.environment | Hardcoded MONGO_USER=admin and MONGO_PASSWORD=admin override env_file values | Fixed — removed lines |
| P1 | docker-compose.yml | proxy.command | --api.insecure=true exposes Traefik dashboard without auth in dev compose | Document: acceptable in local dev, blocked behind auth in prod compose |
| [add rows for any additional findings] | | | | |
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml docs/superpowers/review-scratch.md
git commit -m "fix: remove hardcoded Mongo credentials from docker-compose app service"
```

---

### Task 2: Backend Middleware and Utils Review

**Files:**
- Read: `app/middleware/staticFileMiddleware.js`, `app/middleware/requestParser.js`, `app/middleware/roles.js`, `app/loadEnv.js`, `app/utils/localization.js`, `app/utils/healthCheck.js`, `app/utils/surveyTargeting.js`, `app/utils/getDb.js`, `app/utils/config.js`, `app/routes/v1Router.js`
- Create: `app/middleware/securityHeaders.js`
- Modify: `app/app.js`, `app/routes/internalRouter.js`, `app/middleware/auth.js`

- [ ] **Step 1: Read all middleware and util files**

```bash
cat app/middleware/staticFileMiddleware.js app/middleware/requestParser.js app/middleware/roles.js
cat app/loadEnv.js app/utils/localization.js app/utils/healthCheck.js app/utils/surveyTargeting.js
cat app/routes/v1Router.js
```

Look for: unvalidated path traversal in static serving, missing body-size limits on parsers, role definition completeness, env var loading safety, localization file injection, uncaught async errors. For `v1Router.js`: verify that `authenticate`, `sanitizeBody`, and `apiRateLimiter` are applied to every route that requires them — any route missing these is a security gap.

- [ ] **Step 2: Fix — timing-safe internal secret comparison (P0)**

`app/routes/internalRouter.js` uses JavaScript string equality for the shared-secret check, which is vulnerable to timing attacks:

```js
// Current (line ~14):
if (req.headers['x-internal-secret'] !== secret) {
```

Open `app/routes/internalRouter.js`. Add this import at the top of the file alongside the existing `import express`:

```js
import { timingSafeEqual } from 'node:crypto';
```

Replace the secret comparison block with:

```js
const provided = req.headers['x-internal-secret'];
const secretBuf = Buffer.from(secret);
const providedBuf = Buffer.from(provided || '');
if (
  !provided ||
  providedBuf.length !== secretBuf.length ||
  !timingSafeEqual(providedBuf, secretBuf)
) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

- [ ] **Step 3: Fix — remove unused `ready` promise from auth middleware (P2)**

`app/middleware/auth.js` has dead code at the bottom of `createAuthMiddleware`:

```js
// These two lines serve no purpose — nothing reads authMiddleware.ready:
const ready = Promise.resolve();
// ...
authMiddleware.ready = ready;
```

Delete both lines from `app/middleware/auth.js`.

- [ ] **Step 4: Create security headers middleware (P1)**

Create `app/middleware/securityHeaders.js`:

```js
/**
 * Security headers middleware.
 * Sets baseline HTTP security response headers on every request.
 * CSP is intentionally omitted pending EJS/inline-script audit (tracked in backlog).
 */
export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0'); // Disabled — CSP is the correct mitigation
  next();
}
```

- [ ] **Step 5: Register security headers middleware in app.js (P1)**

In `app/app.js`, add this import near the top with the other middleware imports:

```js
import { securityHeaders } from './middleware/securityHeaders.js';
```

Add this line immediately after `const app = express();` and before any other `app.use(...)` calls:

```js
app.use(securityHeaders);
```

- [ ] **Step 6: Record middleware/utils findings in scratch notes**

Append to `docs/superpowers/review-scratch.md`:

```markdown
## Backend Middleware & Utils

| Severity | File | Line | Finding | Fix |
|----------|------|------|---------|-----|
| P0 | app/routes/internalRouter.js | ~14 | Timing-unsafe string equality on shared secret | Fixed — timingSafeEqual |
| P1 | app/app.js | — | No security response headers (X-Content-Type-Options etc.) | Fixed — securityHeaders middleware |
| P2 | app/middleware/auth.js | end | Dead code: unused `ready` Promise attached to middleware fn | Fixed — removed |
| [add rows for any findings from Step 1] | | | | |
```

- [ ] **Step 7: Commit**

```bash
git add app/routes/internalRouter.js app/middleware/auth.js app/middleware/securityHeaders.js app/app.js docs/superpowers/review-scratch.md
git commit -m "fix: timing-safe secret comparison; security headers middleware; remove dead auth ready promise"
```

---

### Task 3: Backend Routes — Admin Router

**Files:**
- Read: `app/routes/adminRouter.js` (full, ~1200 lines), `app/db/adminQueries.js`
- Modify: `app/routes/adminRouter.js` (targeted fixes only — no structural refactor)

- [ ] **Step 1: Read adminRouter.js in full**

```bash
cat app/routes/adminRouter.js
```

Look for:
- Call site for `assignGroupLabel` — verify whitelist guard exists
- IDOR: admin endpoints that accept a userId param without verifying caller has admin role
- Missing `sanitizeBody` on mutation endpoints that aren't under the `sanitizeBody` middleware
- ObjectId usage without try/catch (invalid ObjectId throws)
- POST endpoints returning 200 (should be 201)
- Inline business logic that should live in service layer (P2, document only)

- [ ] **Step 2: Verify or fix Cypher label injection guard (P0)**

In `app/db/adminQueries.js:28`, `newLabel` is string-interpolated into Cypher: `` SET d:`${newLabel}` ``. The comment says callers must validate.

Search `adminRouter.js` for the `assignGroupLabel` call:

```bash
grep -n "assignGroupLabel\|VALID_GROUP\|whitelist" app/routes/adminRouter.js
```

**If no whitelist check exists**, add it immediately before the `assignGroupLabel` call:

```js
const VALID_GROUPS = ['hhh__Group1', 'hhh__Group2', 'hhh__Group3', 'hhh__Group4'];
if (!VALID_GROUPS.includes(newLabel)) {
  return res.status(400).json({ error: 'Invalid group' });
}
await assignGroupLabel(neo4jRun, userId, newLabel);
```

**If a whitelist check already exists**, record it as confirmed-safe in the scratch notes.

- [ ] **Step 3: Fix ObjectId validation (P1)**

Any route that does `new ObjectId(req.params.id)` without wrapping in try/catch will throw a 500 if the id is not a valid 24-hex string.

For each such pattern found in adminRouter.js:

```js
// Replace:
const id = new ObjectId(req.params.id);

// With:
let id;
try {
  id = new ObjectId(req.params.id);
} catch {
  return res.status(400).json({ error: 'Invalid id' });
}
```

- [ ] **Step 4: Record admin router findings in scratch notes**

Append to `docs/superpowers/review-scratch.md`:

```markdown
## Backend Routes — Admin

| Severity | File | Line | Finding | Fix |
|----------|------|------|---------|-----|
| P0 | app/db/adminQueries.js | 28 | Cypher label injection via `${newLabel}` | [Fixed / Confirmed safe — whitelist at line X] |
| P1 | app/routes/adminRouter.js | [line] | ObjectId(req.params.id) without try/catch | Fixed |
| P2 | app/routes/adminRouter.js | — | ~1200-line file; inline business logic should be extracted to service layer | Backlog |
| [add rows] | | | | |
```

- [ ] **Step 5: Commit fixes**

```bash
git add app/routes/adminRouter.js docs/superpowers/review-scratch.md
git commit -m "fix: add group label whitelist guard; validate ObjectId params in admin router"
```

(Skip commit if no changes were needed.)

---

### Task 4: Backend Routes — Habits, Profile, Onboard, Questionnaires

**Files:**
- Read: `app/routes/habitsRouter.js`, `app/routes/profileRouter.js`, `app/routes/onboardRouter.js`, `app/routes/questionnairesRouter.js`, `app/routes/questionnaireResponsesRouter.js`
- Modify: `app/controllers/surveyController.js`, `app/routes/surveyRouter.js`, plus any files with P0/P1 findings

- [ ] **Step 1: Read the five routers**

```bash
cat app/routes/habitsRouter.js app/routes/profileRouter.js app/routes/onboardRouter.js
cat app/routes/questionnairesRouter.js app/routes/questionnaireResponsesRouter.js
```

Look for:
- SPARQL injection: user-controlled strings interpolated into SPARQL queries (the AUDIT.md flagged this in `SparqlDatabase.js` — find the source)
- IDOR: `/profile/:userId` or similar where caller can access any user's data
- Missing auth middleware on routes that should be protected
- Free-text user input written to DB without length limits
- `_id` leaked in JSON responses (MongoDB internal field)

- [ ] **Step 2: Find and fix SPARQL injection (P0)**

```bash
grep -rn 'sparql\|SPARQL\|\`.*\${\|query.*\${'  app/ --include="*.js" | grep -v node_modules | grep -v test
```

For each finding where a user-controlled value is interpolated into a SPARQL string, parameterize it. SPARQL HTTP clients typically don't support named parameters natively — the safe approach is to validate and allowlist the value before interpolation:

```js
// For string values that should match a controlled vocabulary:
const ALLOWED_VALUES = ['value1', 'value2']; // define the allowlist
if (!ALLOWED_VALUES.includes(userInput)) {
  return res.status(400).json({ error: 'Invalid value' });
}
// Only then interpolate
const query = `... ${userInput} ...`;
```

For free-text values (e.g. habit sentences), escape single quotes and angle brackets before interpolation:

```js
function escapeSparqlLiteral(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
```

- [ ] **Step 3: Fix — PII logging in surveyController.js (P1)**

`app/controllers/surveyController.js` line that logs the full submission:

```js
// Current:
console.log('Survey submission with user ID:', submission);
```

Replace with:

```js
console.log('[survey] Recorded submission for surveyId:', submission.surveyId, 'userId:', submission.userId);
```

- [ ] **Step 4: Fix — legacy userId cookie missing secure and sameSite flags (P1)**

`app/routes/surveyRouter.js` sets a userId cookie without `secure` or `sameSite`:

```js
// Current:
res.cookie('userId', userId, {
  maxAge: 365 * 24 * 60 * 60 * 1000,
  httpOnly: true,
});
```

Replace with:

```js
res.cookie('userId', userId, {
  maxAge: 365 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
});
```

- [ ] **Step 5: Apply any IDOR or injection fixes discovered in Step 1**

For each IDOR finding (e.g. `/profile/:userId` accessible without ownership check), add a guard:

```js
if (req.params.userId !== req.user.sub) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

- [ ] **Step 6: Record findings in scratch notes**

Append to `docs/superpowers/review-scratch.md`:

```markdown
## Backend Routes — Habits, Profile, Onboard, Questionnaires

| Severity | File | Line | Finding | Fix |
|----------|------|------|---------|-----|
| P0 | [file] | [line] | SPARQL injection via user-controlled input | [Fixed / Allowlist added] |
| P1 | app/controllers/surveyController.js | 39 | Full submission object (incl. user data) logged | Fixed — redacted log |
| P1 | app/routes/surveyRouter.js | 20 | userId cookie missing secure + sameSite flags | Fixed |
| [add rows] | | | | |
```

- [ ] **Step 7: Commit**

```bash
git add app/controllers/surveyController.js app/routes/surveyRouter.js
git commit -m "fix: redact PII from survey log; secure cookie flags; SPARQL injection guards"
```

---

### Task 5: Backend Routes — Recommend, KB, StudyEnroll, Participant

**Files:**
- Read: `app/routes/recommendRouter.js`, `app/routes/recommendationsRouter.js`, `app/routes/kbRouter.js`, `app/routes/studyEnrollRouter.js`, `app/routes/participantRouter.js`

- [ ] **Step 1: Read all five routers**

```bash
cat app/routes/recommendRouter.js app/routes/recommendationsRouter.js app/routes/kbRouter.js
cat app/routes/studyEnrollRouter.js app/routes/participantRouter.js
```

Look for:
- IDOR on `/recommend/:userId` (prior audit flagged this — verify the guard is present)
- Study enroll routes that allow double-enrollment
- Participant endpoints leaking other participants' data
- KB routes returning unfiltered internal data
- Missing `sanitizeBody` on any POST/PUT that accepts free text

- [ ] **Step 2: Verify IDOR guard on recommend endpoint**

The prior audit (US-138) claimed an IDOR guard was added to `/recommend/:userId`. Confirm it exists:

```bash
grep -n "req.user.sub\|req.params.userId\|Forbidden" app/routes/recommendRouter.js app/routes/recommendationsRouter.js
```

If the guard is missing, add it to the route handler:

```js
if (req.params.userId !== req.user.sub) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

- [ ] **Step 3: Apply any P0/P1 fixes discovered in Step 1**

For each finding, apply the minimal targeted fix. Record in scratch notes.

- [ ] **Step 4: Record findings in scratch notes**

Append to `docs/superpowers/review-scratch.md`:

```markdown
## Backend Routes — Recommend, KB, StudyEnroll, Participant

| Severity | File | Line | Finding | Fix |
|----------|------|------|---------|-----|
| P0/P1 | app/routes/recommendRouter.js | — | IDOR guard on /recommend/:userId | [Confirmed present / Fixed] |
| [add rows] | | | | |
```

- [ ] **Step 5: Commit any fixes**

```bash
git add app/routes/recommendRouter.js app/routes/recommendationsRouter.js app/routes/studyEnrollRouter.js app/routes/participantRouter.js app/routes/kbRouter.js
git commit -m "fix: [describe what was fixed]"
```

(Skip commit if no changes were needed.)

---

### Task 6: Backend Services Review

**Files:**
- Read: `app/services/adminHabitService.js`, `app/services/adminParticipantService.js`, `app/services/adminStatsService.js`, `app/services/habitDonationService.js`, `app/services/studyService.js`, `app/services/studyCodeService.js`, `app/services/token_card_service.js`, `app/services/notificationService.js`

- [ ] **Step 1: Read all service files**

```bash
cat app/services/adminHabitService.js app/services/adminParticipantService.js app/services/adminStatsService.js
cat app/services/habitDonationService.js app/services/studyService.js app/services/studyCodeService.js
cat app/services/token_card_service.js app/services/notificationService.js
```

Look for:
- N+1 MongoDB queries (find in loop instead of `$in`)
- Unvalidated user input written to DB without sanitization
- Error messages that leak internal state (stack traces, DB structure)
- `soft delete` bypass: queries that don't filter `deletedAt: { $exists: false }`
- Missing `await` on async calls (silent failure)
- Firebase token not cleaned up on `registration-token-not-registered` errors

- [ ] **Step 2: Fix — Firebase invalid token cleanup (P1)**

In `app/services/notificationService.js`, after `sendEach` batch, invalid tokens should be removed from the `deviceTokens` collection to prevent accumulating dead tokens.

Find the section that processes `batchResponse.responses` and add cleanup for invalid tokens:

```js
// After building the invalidTokens array in sendToTokens:
if (invalidTokens.length > 0) {
  // The caller (sendStudyNotification) should clean up these tokens.
  // Pass invalidTokens back in the return value.
}
return { sent, failed, invalidTokens };
```

Then in `sendStudyNotification` (or wherever `sendToTokens` is called), after the call:

```js
const { sent, failed, invalidTokens } = await sendToTokens({ ... });
if (invalidTokens.length > 0) {
  await db.collection(COLLECTION_DEVICE_TOKENS).deleteMany({
    token: { $in: invalidTokens },
  });
}
```

If this cleanup already exists, confirm it and document as confirmed-safe.

- [ ] **Step 3: Apply any other P0/P1 fixes discovered in Step 1**

For each N+1 query, convert to a batch query using `$in`:

```js
// N+1 pattern (bad):
for (const id of ids) {
  const doc = await db.collection('x').findOne({ _id: id });
}

// Batch pattern (good):
const docs = await db.collection('x').find({ _id: { $in: ids } }).toArray();
const byId = Object.fromEntries(docs.map(d => [d._id.toString(), d]));
```

- [ ] **Step 4: Record findings in scratch notes**

Append to `docs/superpowers/review-scratch.md`:

```markdown
## Backend Services

| Severity | File | Line | Finding | Fix |
|----------|------|------|---------|-----|
| P1 | app/services/notificationService.js | — | Invalid FCM tokens not cleaned up after failed delivery | Fixed / Backlog |
| [add rows] | | | | |
```

- [ ] **Step 5: Commit any fixes**

```bash
git add app/services/notificationService.js
git commit -m "fix: clean up invalid FCM device tokens after failed delivery"
```

(Skip commit if no changes were needed. Include all modified service files.)

---

### Task 7: Python API Service Review

**Files:**
- Read: `API-service/llm_client.py`, `API-service/routers/classify_habit.py`, `API-service/routers/classify_context.py`, `API-service/routers/extract_habits.py`, `API-service/routers/extract_profile.py`, `API-service/routers/map_bcio.py`, `API-service/routers/retrieve.py`, `API-service/routers/refine_translation.py`, `API-service/routers/refine_translation_de.py`
- Modify: `API-service/routers/recommend.py`, plus any files with P0/P1 findings

- [ ] **Step 1: Read llm_client.py**

```bash
cat API-service/llm_client.py
```

Look for: API key hardcoded vs env var, missing timeout on HTTP calls, no retry on transient errors, exception handling that silently swallows errors.

- [ ] **Step 2: Read all remaining routers**

```bash
cat API-service/routers/classify_habit.py API-service/routers/classify_context.py
cat API-service/routers/extract_habits.py API-service/routers/extract_profile.py
cat API-service/routers/map_bcio.py API-service/routers/retrieve.py
cat API-service/routers/refine_translation.py API-service/routers/refine_translation_de.py
```

Look for:
- No authentication on any endpoint (service must be network-isolated — verify Docker network config confirms this)
- Unbounded `goal`/`text` fields accepted without length validation
- User-controlled text directly interpolated into prompts (prompt injection)
- Missing error handling on LLM call failure (should return HTTP 502/503, not 500 with stack trace)
- Global mutable state (`_redis`, `_mongo_client`) — safe in asyncio but document

- [ ] **Step 3: Fix — add field length limits to all request models (P1)**

In `API-service/routers/recommend.py`, update `RecommendRequest`:

```python
from pydantic import BaseModel, Field

class RecommendRequest(BaseModel):
    user_id: str = Field(..., max_length=128)
    goal: str = Field(..., min_length=1, max_length=2000)
    session_id: str = Field(..., max_length=128)
```

Apply the same pattern to every other router that accepts a free-text user field. For each router read in Step 2, find `class ...Request(BaseModel)` and add `Field(max_length=...)` to string fields that originate from user input.

- [ ] **Step 4: Fix — LLM call timeout (P1)**

In `API-service/llm_client.py`, if `chat_complete` calls the OpenAI client without a timeout, add one:

```python
# If using openai.AsyncOpenAI:
response = await client.chat.completions.create(
    model=...,
    messages=messages,
    temperature=temperature,
    timeout=30.0,  # seconds
)
```

If a timeout is already set, record it as confirmed-safe.

- [ ] **Step 5: Record findings in scratch notes**

Append to `docs/superpowers/review-scratch.md`:

```markdown
## Python API Service

| Severity | File | Line | Finding | Fix |
|----------|------|------|---------|-----|
| P1 | API-service/routers/recommend.py | RecommendRequest | No field length limits — unbounded goal string inflates prompt cost | Fixed — Field(max_length=...) |
| P1 | API-service/llm_client.py | chat_complete | Missing HTTP timeout on LLM calls | Fixed / Confirmed |
| P1 | API-service/main.py | — | No auth on any endpoint — relies on network isolation only | Document: verify Docker network config; track as backlog |
| P2 | API-service/routers/recommend.py | _get_mongo_db | Synchronous client init in async context — acceptable for one-time init but note | Documented |
| [add rows] | | | | |
```

- [ ] **Step 6: Commit**

```bash
git add API-service/routers/recommend.py API-service/llm_client.py
git commit -m "fix: add field length limits to API request models; set LLM call timeout"
```

---

### Task 8: Next.js Admin Review

**Files:**
- Read: `admin/package.json`, `admin/src/middleware.ts`, `admin/src/app/**/*.tsx`, `admin/src/components/**/*.tsx`, `admin/src/lib/**/*.ts`

- [ ] **Step 1: List all admin source files**

```bash
find admin/src -name "*.tsx" -o -name "*.ts" | sort
cat admin/package.json
```

- [ ] **Step 2: Read all source files**

Read each file returned from Step 1. Look for:
- Client-side role checks that could be bypassed (all authorization must happen in `middleware.ts` or server components)
- API calls from client components that include auth tokens — verify tokens are from session, not localStorage
- `dangerouslySetInnerHTML` without sanitization (XSS)
- Hardcoded API URLs or secrets
- Sensitive data (participant PII, tokens) rendered in client state visible in React DevTools
- Known vulnerable dependencies in `package.json`

- [ ] **Step 3: Apply any P0/P1 fixes discovered**

For `dangerouslySetInnerHTML` without sanitization:

```tsx
// Unsafe:
<div dangerouslySetInnerHTML={{ __html: userContent }} />

// Safe — sanitize first:
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userContent) }} />
```

For client-side-only role checks (P0 — bypass risk):

```tsx
// Unsafe pattern — client-only guard:
if (session?.user?.roles?.includes('admin')) { ... }

// Safe pattern — gate in middleware.ts (already exists) AND in server components:
// In a server component or API route:
import { getServerSession } from 'next-auth';
const session = await getServerSession(authOptions);
if (!session?.user?.roles?.includes('admin')) {
  redirect('/access-denied');
}
```

- [ ] **Step 4: Record findings in scratch notes**

Append to `docs/superpowers/review-scratch.md`:

```markdown
## Next.js Admin

| Severity | File | Line | Finding | Fix |
|----------|------|------|---------|-----|
| [add rows from reading] | | | | |
```

- [ ] **Step 5: Commit any fixes**

```bash
git add admin/src/...
git commit -m "fix: [describe what was fixed in admin]"
```

---

### Task 9: Flutter Mobile Review (Read-Only)

**Files:**
- Read: `mobile/lib/**/*.dart` (no modifications)

- [ ] **Step 1: List Flutter lib structure**

```bash
find mobile/lib -name "*.dart" | sort
```

- [ ] **Step 2: Read auth and service layer**

```bash
find mobile/lib -name "*.dart" | xargs grep -l "token\|auth\|http\|dio\|storage" 2>/dev/null | head -15
```

Then read those files. Look for:
- Tokens stored in `SharedPreferences` instead of `flutter_secure_storage` (insecure)
- Hardcoded production URLs or API keys
- JWT decoded client-side without server validation (informational — expected with PKCE)
- WebView JS bridge accepting messages from any origin
- Missing null checks on JWT payload fields used for routing decisions

- [ ] **Step 3: Read routing and screens**

```bash
find mobile/lib -name "*router*" -o -name "*route*" -o -name "*guard*" | xargs cat 2>/dev/null | head -300
```

Look for: unauthenticated routes reachable by direct navigation, auth guard redirect correctness.

- [ ] **Step 4: Record Flutter findings in scratch notes (no code fixes)**

Append to `docs/superpowers/review-scratch.md`:

```markdown
## Flutter Mobile (Read-Only — No Fixes Applied)

| Severity | File | Line | Finding | Recommendation |
|----------|------|------|---------|----------------|
| [add rows] | | | | |
```

- [ ] **Step 5: No commit — read-only task**

---

### Task 10: Write AUDIT.md

**Files:**
- Read: `docs/superpowers/review-scratch.md`
- Modify: `AUDIT.md`
- Delete: `docs/superpowers/review-scratch.md`

- [ ] **Step 1: Read all scratch notes**

```bash
cat docs/superpowers/review-scratch.md
```

Consolidate all findings into a mental/working model: count per severity per layer, identify what was fixed vs what remains.

- [ ] **Step 2: Score each layer (1–5 per dimension)**

For each layer, assign a score 1–5 on each dimension based on findings. Use this rubric:
- 5 = no significant issues found
- 4 = minor issues only, all fixed or trivial
- 3 = moderate issues, most fixed
- 2 = serious issues, some fixed
- 1 = critical unresolved issues

Dimensions: Code Quality, Test Coverage, Security, Documentation, Consistency

- [ ] **Step 3: Overwrite AUDIT.md with the full report**

Write `AUDIT.md` with this exact structure (fill in all sections from your findings):

```markdown
# Health Habit Hub — Full System Audit

**Date:** 2026-04-10
**Branch:** ralph/hhh-platform-unified
**Auditor:** Claude (Sonnet 4.6)
**Scope:** Fresh full-codebase review — Infrastructure, Node.js backend, Python API service, Next.js admin, Flutter mobile

---

## 1. Executive Summary

[3–5 sentences: overall health rating, top 3 risks that remain, summary of what was fixed]

---

## 2. Fixes Applied This Session

| Commit | Description |
|--------|-------------|
[List all commits made during this review in order]

---

## 3. Component Scorecards

### 3.1 Infrastructure

| Dimension | Score | Justification |
|-----------|-------|---------------|
| Code Quality | X/5 | ... |
| Security | X/5 | ... |
| Documentation | X/5 | ... |
| Consistency | X/5 | ... |

**Infrastructure composite: X/20**

### 3.2 Node.js Backend

| Dimension | Score | Justification |
|-----------|-------|---------------|
| Code Quality | X/5 | ... |
| Test Coverage | X/5 | ... |
| Security | X/5 | ... |
| Documentation | X/5 | ... |
| Consistency | X/5 | ... |

**Backend composite: X/25**

### 3.3 Python API Service

[same table]

**Python API composite: X/25**

### 3.4 Next.js Admin

[same table]

**Admin composite: X/25**

### 3.5 Flutter Mobile

[same table]

**Flutter composite: X/25**

---

## 4. All Findings

| ID | Severity | Layer | File | Description | Status |
|----|----------|-------|------|-------------|--------|
| F-001 | P0 | Backend | app/routes/internalRouter.js | Timing-unsafe string equality on shared secret | Fixed |
| F-002 | P1 | Backend | app/app.js | No security response headers | Fixed |
| F-003 | P2 | Backend | app/middleware/auth.js | Dead code: unused ready Promise | Fixed |
| F-004 | P1 | Infra | docker-compose.yml | Hardcoded Mongo credentials override env_file | Fixed |
[... all findings from scratch notes ...]

---

## 5. Backlog (Unfixed — Priority Order)

1. **[P1] Python API service has no authentication** — relies entirely on Docker network isolation. Add an API key or mTLS between the Node backend and the Python service. Track in a dedicated US.
2. **[P1] CSP headers not set** — EJS templates need inline script audit before CSP can be enabled. Assign a dedicated task.
3. **[P2] adminRouter.js is ~1200 lines** — extract business logic into service layer. No functional risk, but high maintenance burden.
4. **[P2] Dual Neo4j schema** — `hhh__Habit` (old ontology) and `Habit` (new pipeline) are disjoint. Stats/public-list endpoints show 0 for newly donated habits.
[... any other unfixed items ...]

---

## 6. Recommended Next Steps

1. [Highest-priority unresolved item + suggested approach]
2. ...
```

- [ ] **Step 4: Delete scratch notes file**

```bash
rm docs/superpowers/review-scratch.md
```

- [ ] **Step 5: Commit**

```bash
git add AUDIT.md
git rm docs/superpowers/review-scratch.md
git commit -m "docs: rewrite AUDIT.md — 2026-04-10 full system review"
```
