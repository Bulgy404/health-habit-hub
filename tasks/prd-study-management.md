# PRD: Study Management, Enrollment Codes & Push Notifications

## Introduction

Enable researchers to configure multiple independent studies from the admin panel,
each with its own groups, questionnaires, and short enrollment codes. Participants
can optionally enter a study code during the app onboarding sequence; those who
skip it are placed in a configurable "default study". Admins can send immediate
or scheduled push notifications scoped to a whole study or a specific group
within it.

This feature replaces the current hardcoded group-assignment logic with a fully
configurable multi-study system while keeping the existing login and personal-code
flow intact.

---

## Goals

- Researchers can configure, activate, and monitor multiple studies from the
  admin panel without touching code.
- Participants are assigned to the correct study and group automatically when
  they enter a short alphanumeric study code at onboarding.
- Participants who skip the code prompt are silently enrolled in the default
  study (admin-configurable).
- Each study has its own questionnaire set drawn from a shared library or
  created from scratch.
- Admins can reach study participants via targeted push notifications, either
  immediately or at a scheduled future time.

---

## User Stories

---

### US-173: Data model — Study, Group, Enrollment, StudyCode

**Description:** As a developer, I need a data model that represents studies,
their groups, participant enrollments, and redeemable study codes so that all
subsequent features have a stable foundation.

**Acceptance Criteria:**
- [ ] MongoDB collection `studies` with schema:
  - `_id`, `name` (string), `description` (string), `isDefault` (boolean, only
    one document may have `isDefault: true`), `isActive` (boolean), `groups`
    (array of `{ id, label, index: 1–4 }`), `questionnaires` (array of
    questionnaire refs), `createdAt`, `updatedAt`.
- [ ] MongoDB collection `studyCodes` with schema:
  - `_id`, `code` (string, unique, e.g. `HHH-AB12C`), `studyId` (ref),
    `groupId` (ref — which group the code assigns to), `maxRedemptions`
    (number, default `null` = unlimited), `redemptionCount` (number, default
    0), `expiresAt` (date, nullable), `createdAt`.
- [ ] MongoDB collection `enrollments` with schema:
  - `_id`, `userId` (Keycloak UUID), `studyId`, `groupId`, `studyCodeUsed`
    (string or null), `enrolledAt`.
- [ ] Unique index on `enrollments(userId)` — one active enrollment per user.
- [ ] Unique index on `studyCodes(code)`.
- [ ] Sparse unique index on `studies(isDefault)` where `isDefault = true` to
    enforce only one default.
- [ ] Migration/seed script in `scripts/` creates the default study with 4
    groups on a clean install.
- [ ] `npm run lint` passes.

---

### US-174: Backend — Study CRUD API

**Description:** As an admin, I want REST endpoints to create, read, update,
and delete studies (including their group configuration) so I can manage the
study catalogue.

**Acceptance Criteria:**
- [ ] `GET /api/v1/admin/studies` — returns paginated list of all studies with
  participant count per study.
- [ ] `POST /api/v1/admin/studies` — creates a new study; body: `{ name,
  description, groups: [{ label }], questionnaires: [] }`. Auto-assigns group
  indices 1–4. Returns 201 with created document.
- [ ] `GET /api/v1/admin/studies/:id` — returns full study document including
  groups and questionnaire refs.
- [ ] `PUT /api/v1/admin/studies/:id` — updates name, description, isActive,
  groups (additive only — groups cannot be removed if participants are enrolled
  in them), and questionnaire assignment.
- [ ] `DELETE /api/v1/admin/studies/:id` — soft-deletes (sets `isActive:
  false`). Returns 409 if study has enrolled participants.
- [ ] `PUT /api/v1/admin/studies/:id/default` — marks study as the default;
  clears `isDefault` on the previously default study atomically.
- [ ] All routes protected by admin JWT middleware.
- [ ] All routes return consistent error shapes.
- [ ] `npm run lint` passes; existing tests still pass.

---

### US-175: Backend — Study code generation and redemption API

**Description:** As an admin, I want to generate short alphanumeric enrollment
codes and as a participant I want to redeem one at onboarding so the system
assigns me to the correct study and group automatically.

**Acceptance Criteria:**
- [ ] `POST /api/v1/admin/studies/:id/codes` — generates one or more codes;
  body: `{ count: 1–100, groupId, maxRedemptions, expiresAt }`. Returns array
  of generated code strings. Format: `HHH-XXXXX` (5 uppercase alphanumeric
  chars after the dash), generated with `crypto.randomBytes`.
- [ ] `GET /api/v1/admin/studies/:id/codes` — returns paginated list of codes
  with `redemptionCount`, `expiresAt`, `groupId`.
- [ ] `DELETE /api/v1/admin/studies/:id/codes/:code` — revokes a code
  (deletes it). Returns 409 if code has been redeemed.
- [ ] `POST /api/v1/onboarding/redeem-code` — authenticated participant
  endpoint; body: `{ code }`. Validates code (exists, not expired, not
  exhausted), creates an `enrollment` document for the authenticated user,
  increments `redemptionCount`, returns `{ studyId, groupId, studyName,
  groupLabel }`. Returns 409 if user is already enrolled.
- [ ] If no code is provided during onboarding, the backend auto-enrolls the
  user in the default study with balanced group assignment (round-robin across
  the default study's groups).
- [ ] `POST /api/v1/onboarding/skip-code` — participant endpoint; explicitly
  enrolls user in default study (for cases where the app skips the code screen
  without a code). Idempotent.
- [ ] `npm run lint` passes; existing tests still pass.

---

### US-176: Backend — Questionnaire library and custom questionnaire API

**Description:** As an admin, I want to manage a shared questionnaire library
and create custom questionnaires so I can assign the right surveys to each
study.

**Acceptance Criteria:**
- [ ] MongoDB collection `questionnaires` extended with `isLibrary` (boolean)
  flag. Existing SLIQ and RAND-36 questionnaires are marked `isLibrary: true`.
- [ ] `GET /api/v1/admin/questionnaires` — returns all questionnaires. Query
  param `?library=true` filters to library items only.
- [ ] `POST /api/v1/admin/questionnaires` — creates a custom questionnaire;
  body mirrors existing questionnaire schema. Returns 201.
- [ ] `PUT /api/v1/admin/questionnaires/:id` — updates questionnaire (only if
  not `isLibrary`; library items return 403).
- [ ] `DELETE /api/v1/admin/questionnaires/:id` — deletes if not `isLibrary`
  and not currently assigned to an active study.
- [ ] Study questionnaire assignment handled by the study PUT endpoint
  (`/api/v1/admin/studies/:id`) — accepts `questionnaires: [id, ...]`.
- [ ] `GET /api/v1/participant/questionnaires` — returns questionnaires for the
  authenticated participant's enrolled study.
- [ ] `npm run lint` passes; existing tests still pass.

---

### US-177: Backend — Push notification API (immediate and scheduled)

**Description:** As an admin, I want to send push notifications to all
participants in a study or a specific group, either immediately or at a
scheduled future time, so I can coordinate study activities.

**Acceptance Criteria:**
- [ ] Firebase Cloud Messaging (FCM) Node.js Admin SDK (`firebase-admin`) added
  to `app/package.json` dependencies.
- [ ] `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable (path to FCM service
  account JSON) documented in `.env.example` and README.
- [ ] Participant FCM token stored: `POST /api/v1/participant/register-token`
  body `{ fcmToken }` upserts token into a `deviceTokens` collection keyed by
  `userId`.
- [ ] `POST /api/v1/admin/notifications/send` — body: `{ studyId, groupId?
  (optional), title, body, data? }`. Sends immediately to all active FCM tokens
  for matching participants. Returns `{ sent: N, failed: N }`.
- [ ] `POST /api/v1/admin/notifications/schedule` — same body plus
  `{ scheduledAt: ISO8601 }`. Stores in `scheduledNotifications` collection.
  A node-cron job (runs every minute) picks up due records and dispatches them
  via FCM, then marks them `sent`.
- [ ] `GET /api/v1/admin/notifications/scheduled` — returns pending scheduled
  notifications.
- [ ] `DELETE /api/v1/admin/notifications/scheduled/:id` — cancels a pending
  notification.
- [ ] Notifications to invalid/unregistered FCM tokens are silently removed
  from `deviceTokens`.
- [ ] `npm run lint` passes; existing tests still pass.

---

### US-178: Admin UI — Study list and study creation/edit form

**Description:** As an admin, I want a study management page listing all
studies with their status, and a form to create or edit a study, so I can
maintain the study catalogue from the browser.

**Acceptance Criteria:**
- [ ] New "Studies" section visible in the admin panel navigation sidebar.
- [ ] Study list page shows: study name, status (active/inactive), default
  badge, group count, enrolled participant count, created date.
- [ ] "New Study" button opens a form with fields: Name, Description, Number
  of groups (1–4), Group labels (editable per group).
- [ ] Save creates the study via `POST /api/v1/admin/studies`.
- [ ] Clicking a study row opens the study detail/edit view.
- [ ] Edit form pre-fills all current values; Save calls `PUT`.
- [ ] "Set as Default" button on the detail view calls the default endpoint.
  Currently-default study shows a non-removable badge.
- [ ] "Deactivate" button calls DELETE (soft-delete); shows inline error if
  participants are enrolled.
- [ ] All API errors displayed as inline toast messages.
- [ ] Admin panel runs without new JS console errors.

---

### US-179: Admin UI — Study code generation and management view

**Description:** As an admin, I want to generate and manage enrollment codes
for a study so I can distribute codes to participants before the study starts.

**Acceptance Criteria:**
- [ ] "Codes" tab on the study detail page shows a paginated table: code,
  group assigned, redemptions / max redemptions, expiry date, revoke action.
- [ ] "Generate Codes" form: select target group, quantity (1–100), optional
  max redemptions, optional expiry date/time.
- [ ] Submit calls `POST /api/v1/admin/studies/:id/codes` and displays
  generated codes in a copyable list (one per line) with a "Copy All" button.
- [ ] "Revoke" button next to each code calls DELETE; disabled with tooltip if
  code has been redeemed.
- [ ] Admin panel runs without new JS console errors.

---

### US-180: Admin UI — Questionnaire library and custom questionnaire editor

**Description:** As an admin, I want to browse the questionnaire library and
create custom questionnaires so I can assign the right surveys to each study.

**Acceptance Criteria:**
- [ ] "Questionnaires" section in admin navigation shows library + custom
  questionnaires in separate tabs.
- [ ] Library tab: read-only list of SLIQ and RAND-36 with a preview/view
  action.
- [ ] Custom tab: list of custom questionnaires with Create, Edit, Delete
  actions. Delete disabled with tooltip if questionnaire is assigned to an
  active study.
- [ ] Create / Edit form mirrors the structure of existing questionnaire
  documents: title, description, array of questions each with `text`, `type`
  (scale/multiple-choice/text), and `options` where applicable.
- [ ] Save calls POST or PUT accordingly.
- [ ] Admin panel runs without new JS console errors.

---

### US-181: Admin UI — Assign questionnaires to a study

**Description:** As an admin, I want to select which questionnaires are active
for a specific study so participants in that study see the right surveys.

**Acceptance Criteria:**
- [ ] "Questionnaires" tab on the study detail page shows all available
  questionnaires (library + custom) as a checkable list.
- [ ] Currently-assigned questionnaires are pre-checked.
- [ ] "Save" calls `PUT /api/v1/admin/studies/:id` with updated `questionnaires`
  array.
- [ ] Changes reflected immediately in the tab without page reload.
- [ ] Admin panel runs without new JS console errors.

---

### US-182: Admin UI — Default study configuration

**Description:** As an admin, I want a clear view of which study is the default
so I can ensure participants without a code land in the intended experience.

**Acceptance Criteria:**
- [ ] Studies list shows a "Default" badge on the current default study.
- [ ] "Set as Default" button visible on the detail page of any non-default
  study; triggers confirmation dialog before saving.
- [ ] Default study cannot be deactivated while it is the default — button
  shows tooltip explaining why.
- [ ] On initial install (seed), the system ships with a pre-configured default
  study named "Default Study" with Groups 1–4 and SLIQ + RAND-36 assigned.
- [ ] Admin panel runs without new JS console errors.

---

### US-183: Admin UI — Participant enrollment dashboard (per study)

**Description:** As an admin, I want to see which participants are enrolled in
a study and their group assignment so I can monitor recruitment and balance.

**Acceptance Criteria:**
- [ ] "Participants" tab on the study detail page shows a paginated table:
  user ID (or display name if available), group label, enrolled date, code used
  (or "direct / default").
- [ ] Summary row at top: total enrolled, count per group.
- [ ] Table supports export to CSV via a "Download CSV" button.
- [ ] Admin panel runs without new JS console errors.

---

### US-184: Admin UI — Push notification composer

**Description:** As an admin, I want to compose and send (or schedule) a push
notification to a study's participants so I can communicate time-sensitive
study events.

**Acceptance Criteria:**
- [ ] "Notifications" tab on the study detail page.
- [ ] Compose form: Title (max 50 chars), Body (max 200 chars), Target (all
  participants in study vs. specific group — dropdown), Send time (Now /
  Schedule — datetime picker appears when Schedule selected).
- [ ] "Send" calls the appropriate backend endpoint; success shows a toast with
  `"Sent to N participants"` or `"Scheduled for [datetime]"`.
- [ ] "Scheduled" sub-section lists pending notifications with Cancel button.
- [ ] Admin panel runs without new JS console errors.

---

### US-185: App — Study code entry screen in onboarding

**Description:** As a participant, I want to be prompted to enter a study code
during app onboarding so that I can be enrolled in the correct study and group
before the app experience begins.

**Acceptance Criteria:**
- [ ] A new onboarding step is inserted between the existing personal-code
  display step and the app's main experience.
- [ ] Screen shows: "Do you have a study code?" with a text field and "Continue
  with code" button plus a clearly visible "Skip" link.
- [ ] Code input is uppercase-forced and allows the `HHH-XXXXX` format.
- [ ] On submit: calls `POST /api/v1/onboarding/redeem-code`. On success,
  stores `studyId` and `groupId` in local secure storage / app state.
- [ ] On error: shows inline error message (invalid code, expired, already
  used).
- [ ] On skip: calls `POST /api/v1/onboarding/skip-code` to enrol in default
  study.
- [ ] Screen is shown only once — if user is already enrolled it is skipped on
  subsequent launches.
- [ ] `flutter analyze` passes with zero warnings.
- [ ] `flutter test` passes.

---

### US-186: App — Study-specific questionnaire display

**Description:** As a participant, I want to see the questionnaires configured
for my enrolled study so that I complete the right surveys.

**Acceptance Criteria:**
- [ ] Questionnaire list fetched from `GET /api/v1/participant/questionnaires`
  (study-scoped endpoint introduced in US-176) instead of a static list.
- [ ] If the participant's study has no questionnaires assigned, the
  questionnaire section shows an empty state rather than crashing.
- [ ] Existing questionnaire completion flow is unchanged.
- [ ] `flutter analyze` passes; `flutter test` passes.

---

### US-187: App — Push notification integration

**Description:** As a participant, I want to receive push notifications from
the research team so I am reminded of study activities and deadlines.

**Acceptance Criteria:**
- [ ] `firebase_messaging` Flutter package added to `mobile/pubspec.yaml`.
- [ ] App requests notification permission on first launch (iOS prompt, Android
  13+ prompt).
- [ ] FCM token registered with backend via `POST
  /api/v1/participant/register-token` on first launch and whenever token
  refreshes.
- [ ] Foreground notifications displayed using `flutter_local_notifications`.
- [ ] Background / terminated notifications navigate to the relevant screen
  when tapped (payload `{ screen: "questionnaire" | "explore" | "home" }`).
- [ ] `flutter analyze` passes; `flutter test` passes.

---

## Functional Requirements

- FR-1: A participant can enroll in exactly one study. Attempting a second
  code redemption returns a 409 error.
- FR-2: Study codes are case-insensitive at redemption (`hhh-ab12c` equals
  `HHH-AB12C`).
- FR-3: A code with `maxRedemptions` set stops being redeemable once the limit
  is reached.
- FR-4: Deleting/revoking a code does not un-enroll participants who have
  already redeemed it.
- FR-5: Push notifications are only dispatched to participants with a registered
  FCM token.
- FR-6: Scheduled notifications are processed within 60 seconds of their
  `scheduledAt` time.
- FR-7: Only one study may be the default at any time; the system must always
  have a default study.
- FR-8: The default study cannot be deactivated while it is the default.
- FR-9: Library questionnaires (SLIQ, RAND-36) cannot be edited or deleted by
  the admin.
- FR-10: All admin API routes require a valid admin-scoped JWT; participant
  routes require a participant-scoped JWT.

---

## Non-Goals

- Android emulator push notification testing (iOS Simulator only in local dev).
- In-app messaging or chat between admin and participants.
- Study analytics / data export beyond the enrollment CSV.
- A/B testing framework beyond the existing group-based design.
- Removing or changing the existing personal-code login flow.
- Multi-tenant admin access (all admins see all studies).

---

## Technical Considerations

- **FCM setup**: requires a Firebase project and a service account JSON file.
  `.env.example` should document `FIREBASE_SERVICE_ACCOUNT_JSON`.
- **Scheduled notifications**: use `node-cron` (already a common Express
  dependency) polling every 60 seconds. Redis (already present via `REDIS_URL`)
  can be used as a distributed lock if multiple app replicas are running.
- **Study code generation**: use `crypto.randomBytes(4)` converted to base-36,
  uppercased and prefixed with `HHH-`.
- **Default study seed**: `scripts/seed-local.js` (US-159) should be extended
  to create the default study if it does not already exist.
- **Admin panel**: the existing admin panel frontend lives in `app/public/admin/`
  or similar — new study/notification UI should follow the existing component
  patterns and not introduce a new frontend framework.
- **Flutter state**: enrolled study info (`studyId`, `groupId`) should be
  stored in `flutter_secure_storage` and exposed via a Riverpod provider.

---

## Execution Order

```
US-173 (data model)
  ↓
US-174, US-175, US-176, US-177   (backend APIs — parallel)
  ↓ all four complete
US-178, US-179, US-180, US-181   (admin UI — parallel)
US-182, US-183, US-184           (admin UI cont. — parallel)
  ↓ all admin UI complete
US-185, US-186, US-187           (Flutter app — parallel)
```

---

## Success Metrics

- A researcher can configure a new study with codes and questionnaires in under
  10 minutes via the admin panel.
- 100% of code-redeeming participants land in the correct study group.
- Participants without a code are enrolled in the default study automatically
  with zero error messages.
- Push notifications reach all registered participants within 60 seconds of
  dispatch (immediate) or within 60 seconds of the scheduled time.
- `flutter analyze`, `npm run lint`, and all tests pass after every story.

---

## Open Questions

- Should study codes be single-use by default, or unlimited? (Current design:
  admin configures `maxRedemptions` per code, default = unlimited.)
- Should the admin panel support exporting collected habit data filtered by
  study? (Deferred — out of scope for this cycle.)
- Do scheduled notifications need a timezone selector, or is the server's
  timezone sufficient?
