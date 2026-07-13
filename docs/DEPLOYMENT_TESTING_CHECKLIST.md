# Pre-Deployment Manual Test Checklist

Full click-through checklist for the admin panel and the mobile app, to run before
deploying to the server. Organized by natural user flow (sign in → set up → daily use)
rather than alphabetically, so you can walk it top to bottom in one sitting.

Use a disposable test study and a couple of test participants — don't run this against
real participant data. Check items off as you go; anything that fails goes in the release
notes / bug tracker before shipping.

---

## 0. Pre-Flight (Infrastructure)

- [x] `docker compose ps` — all services `Up`/`healthy` (Traefik, Keycloak, keycloak-db, app,
      admin, recommender, mongo, neo4j, redis, lightrag, translate, grafana, prometheus)
- [ ] HTTPS cert valid on the public domain (or accepted self-signed in local/staging)
- [x] Admin panel loads at `/admin` and redirects to Keycloak login when signed out
- [x] Mobile app can reach the API base URL configured for this environment
- [x] Grafana dashboards load and Prometheus targets are all "up"

---

## Part 1 — Admin Panel

### 1.1 Sign-in & Access Control
- [x] Sign in via Keycloak (`/api/auth/signin`) with an admin account
- [x] Sign in with a researcher account — confirm reduced access where applicable (e.g.
      Insights tab hidden on Analytics page)
- [x] Sign in with an account that has neither role — redirected to `/access-denied`
- [x] `/access-denied` page: "Sign out" link works
- [x] Leave the tab open and idle past token expiry, then navigate — confirm it silently
      recovers (no stuck 401) instead of requiring a manual page reload
- [x] Session persists across a page reload; sign-out clears the session

### 1.2 First-Run Welcome
- [x] `/welcome` onboarding walkthrough displays correctly (no stray border on Skip)
- [x] "Skip" and "Finish" both land you on the studies list
- [x] Welcome doesn't reappear on next login once dismissed

### 1.3 Studies — the core configuration hub
This is the biggest page in the admin panel; budget the most test time here.

**List & lifecycle**
- [x] Studies list loads and auto-refreshes periodically while the tab stays open
- [x] Create a new study (name + description)
- [x] Set a study as default; confirm the "Default" badge moves
- [x] Deactivate a study; confirm it's blocked while it's the only/default study
- [x] Delete a study (confirm-by-typing-name flow)
- [x] Download a study's full data export (zip)

**Details tab**
- [ ] Edit name/description
- [ ] Toggle recommender on/off for the study
- [ ] Toggle onboarding on/off
- [ ] Toggle self-service habit creation on/off
- [ ] Switch habit entry mode between free-text and structured; when structured, manage the
      activity-type catalog (`ActivityTypesManager`)
- [ ] Toggle questionnaire reminders on/off and set the reminder hour
- [ ] Set/clear the study end date
- [ ] Toggle end-of-study notification and edit its title/body
- [ ] Change the number of groups (G1–Gn) and edit group labels; confirm the
      removal-warning appears when shrinking group count

**Cue Config tab**
- [ ] Per-group: set cue count (single/multi)
- [ ] Per-group: set cue source (low-quality / high-quality / self-selected)
- [ ] Per-group: assign a cue pool and max-habits cap
- [ ] Per-group: tri-state override (inherit / on / off) applies correctly against the
      study-level onboarding/self-habit-creation defaults

**Questionnaires tab**
- [ ] Assign library questionnaires to the study
- [ ] Assign custom questionnaires to the study
- [ ] Inactive questionnaires show their "inactive" badge
- [ ] Save persists the selection

**Schedule tab**
- [ ] Add a questionnaire assignment scoped to the whole study
- [ ] Add a questionnaire assignment scoped to a single group
- [ ] Add an interval-cadence assignment (start offset, every-N-days, occurrence count)
- [ ] Add a fixed-cadence assignment (specific weeks/days)
- [ ] Click a calendar day to pre-fill the add-assignment form
- [ ] Delete an assignment (confirm dialog)
- [ ] Completion counts and the due-date calendar render correctly

**Codes tab**
- [ ] Adjust per-group allocation weight sliders; "Equalize" resets them; save persists
- [ ] Generate study-level codes (count, optional max redemptions, optional expiry); copy
      all to clipboard
- [ ] Generate targeted group codes via the collapsible "targeted" section
- [ ] Revoke an unredeemed code; confirm a redeemed code cannot be revoked
- [ ] Paginate the existing-codes table

**Participants tab (per-study)**
- [ ] Enrollment summary (total + per-group counts) is correct
- [ ] Paginated enrollment table loads
- [ ] Download participants CSV
- [ ] Download research export ZIP

**Notifications tab**
- [ ] Send a notification now, targeted to "all" and to a single group
- [ ] Schedule a notification for a future time
- [ ] Cancel a scheduled notification
- [ ] Sent-notification history list is accurate (recipient count, status)

### 1.4 Participants (global)
- [ ] Create a single participant (choose group, token-card format)
- [ ] Bulk-create participants (1–50) and view the generated credentials
- [ ] Open a token card (QR/print/both) for a participant
- [ ] Select individual rows and "select all on page"; bulk export selected to CSV
- [ ] Bulk anonymize/delete selected participants (confirm dialog)
- [ ] Change a participant's group inline
- [ ] Anonymize/delete a single participant (confirm dialog)
- [ ] View a participant's recovery phrase (copy to clipboard)
- [ ] Open the "Progress" modal: profile completion, habits, recommendations, surveys
      (view submitted answers), activity timeline
- [ ] Dev-only "fast-forward" tool (only visible when test tools enabled on the backend) —
      confirm it's **not** visible/usable against production
- [ ] Paginate the participant list

### 1.5 Questionnaires (library/custom)
- [ ] Preview a library questionnaire (switch language if multi-lingual)
- [ ] Create a custom questionnaire: multiple languages, title/description/version per
      language, slug auto-generates (and can be overridden)
- [ ] Add/remove/reorder questions via drag-and-drop
- [ ] Configure each question type: text, single choice, multi choice, scale — including
      answer options and required toggle
- [ ] Edit an existing custom questionnaire (all languages reload correctly)
- [ ] Delete an unassigned custom questionnaire
- [ ] Attempt to delete a questionnaire that's assigned to a study — confirm it's blocked
      with the "assigned" error instead of silently failing

### 1.6 Cue Pools
- [ ] Filter by quality (high/low) and by language
- [ ] Add a cue: multiple languages, quality, domain, and the three dimension sliders
      (stability/salience/specificity)
- [ ] Import cues via CSV (valid file → inserted count; malformed file → clear error)
- [ ] Delete a cue
- [ ] Paginate the cue list

### 1.7 Profile Fields
- [ ] Add a field of each type: text, number, date, select (with option values)
- [ ] Edit an existing field (fieldId stays locked)
- [ ] Reorder / set display order
- [ ] Toggle required on/off
- [ ] Delete a field (confirm dialog)
- [ ] Confirm changes are reflected in the mobile app's profile-setup screen

### 1.8 Knowledge Base
- [ ] Upload a document (PDF/TXT/MD) with a category
- [ ] Confirm it appears with the correct ready/pending indexing status
- [ ] Delete a document (confirm dialog)
- [ ] Open the LightRAG graph visualizer link

### 1.9 Comments Moderation
- [ ] Flagged-comments queue shows reported comments separately from the main list
- [ ] Approve a flagged comment — confirm it becomes visible again
- [ ] Delete a comment from either the flagged queue or the main list
- [ ] Paginate the main comments list

### 1.10 Donations (habit feed)
- [ ] Filter by group, category, and date range
- [ ] Export the current filtered view to CSV
- [ ] Paginate results

### 1.11 Analytics
- [ ] Select a study and confirm all 8 KPI cards populate
- [ ] All 7 charts render (weekly active rate, SRHI trajectory, cumulative dropout,
      questionnaire completion, enrollment over time, daily active participants, habits
      by group)
- [ ] Open the "underlying queries" panel; Neo4j Browser / mongo-express links work
- [ ] Click a participant row — detail drawer opens with habits/surveys/recommendations/
      reminder plans/timeline; closes cleanly
- [ ] Empty state when no study selected; loading states don't hang

### 1.12 Insights
- [ ] Insight cards render as stat tiles or tables as appropriate
- [ ] Per-card "Refresh" bypasses cache and updates the computed timestamp
- [ ] "Reload all" refreshes every card
- [ ] Only visible to admin, not researcher

### 1.13 Devices
- [ ] Active sessions table shows participant, device type, app version, last seen
- [ ] Revoke a session (confirm dialog) — confirm the mobile app is signed out
- [ ] Paginate sessions

### 1.14 Restore Attempts
- [ ] Flagged-IPs panel appears when there are repeated failed attempts
- [ ] Filter by outcome (success / invalid_phrase / invalid_credentials / rate_limited /
      keycloak_unreachable)
- [ ] Table shows timestamp, IP, attempted username, outcome

### 1.15 Audit Log
- [ ] Filter by resource type (study/participant/questionnaire/team_member)
- [ ] Change page size (25/50/100/200)
- [ ] Entries show who/what/when/result accurately for actions performed earlier in this
      checklist (e.g. the study you created, the participant you deleted)

### 1.16 Backups — **be careful, exercise on a non-production environment first**
- [ ] Trigger a manual backup with all components selected; watch live progress
- [ ] Trigger a backup with some components excluded
- [ ] "Last backup" summary shows correct per-component status
- [ ] Upload a `.tar.gz`/`.tgz` backup file manually
- [ ] Download a backup
- [ ] Restore from a backup (type-to-confirm flow); acknowledge warnings if a component
      previously failed
- [ ] Delete a backup (type-to-confirm flow)
- [ ] Recent-activity audit table logs trigger/restore/upload/download/delete
- [ ] Buttons are disabled while a job is in flight (can't double-trigger)
- [ ] Confirm scheduled automatic backups are configured and `BACKUP_RETENTION_DAYS` is
      correct for this environment

### 1.17 System / Monitoring
- [ ] Status banner reflects real state (all operational / N services down / elevated
      error rate)
- [ ] Downstream services grid (Mongo/Neo4j/Keycloak/Recommender) shows correct
      reachability and latency
- [ ] Performance stats populate (req/s, error rate, p95 latency, CPU, memory, event-loop
      lag) — or shows "unavailable" gracefully if Prometheus is unreachable
- [ ] Queue pipelines (BullMQ) and Redis cache stats populate
- [ ] All 8 external tool links work (Keycloak, Grafana, Prometheus, Bull Board,
      RedisInsight, Neo4j Browser, mongo-express, API docs)
- [ ] Auto-refreshes every 30s; manual refresh button works

### 1.18 Team
- [ ] Members table shows username/email/roles
- [ ] Add a member: search by username/email, grant admin or researcher role
- [ ] Revoke a role (confirm dialog)
- [ ] Confirm a newly granted admin/researcher can actually sign in with those permissions

### 1.19 Help
- [ ] Static reference content renders
- [ ] "Email support" (mailto) and GitHub repo link both work

### 1.20 Alerting (cross-cutting with System/Backups)
- [ ] Force a backup failure (or check `docs/runbook.md`'s test procedure) and confirm a
      critical-alert email arrives at `ALERT_EMAIL` via the configured SMTP relay
- [ ] Confirm Grafana alert rules (service unreachable, BullMQ failures, 5xx spike) have a
      working contact point (not the placeholder/empty address)

---

## Part 2 — Mobile App

Run through this as a fresh participant account, then again as a returning/restored
participant.

### 2.1 Onboarding
- [x] Welcome walkthrough (3 steps) — page indicator, "Skip", "Get Started"
- [x] Consent screen loads the localized document in-app; Accept vs Decline (Decline
      returns to welcome)
- [x] Passphrase creation: 24-word BIP39 phrase shown, copy-to-clipboard, "I've written it
      down" gates Continue
- [x] "Restore existing account" with a valid 24-word phrase succeeds
- [ ] Restore with an invalid phrase / wrong word count shows a clear error
- [ ] Profile setup: dynamic fields from admin's Profile Fields config render (text/number/
      date/select); required fields block Continue; Skip works where allowed
- [ ] Redeem a valid study code (`HHH-XXXXX` format)
- [ ] Invalid/expired/already-used code shows the right error (404/410/409 mapped
      correctly)
- [x] Skip study code → enrolls in the default study
- [x] Re-launching an already-enrolled account skips onboarding correctly
- [ ] Consent-version bump on the backend forces existing users through `/consent-update`
      on next launch

### 2.2 Share Tab
- [ ] Share-activity heatmap renders (adaptive color intensity, not pinned)
- [ ] "Today's tasks" card and any due-questionnaire task cards appear correctly
- [ ] Submit a habit donation via the survey form
- [ ] Submit while offline — confirm it queues and drains automatically once back online,
      with a success snackbar showing the count submitted
- [ ] "Shared today" state updates immediately after a successful share

### 2.3 Explore Tab
- [ ] Bubble graph (dimension-level) loads without a noticeable freeze, even for a
      dimension with many habits
- [ ] Drilling into a dimension shows its habit bubbles; back button returns to overview
- [ ] Tapping a habit bubble opens the detail sheet (annotations, comments, related
      habits)
- [ ] "I do this too" / "Helpful" toggles update counts and persist
- [ ] Post a comment; report a comment (Guideline 1.2 flow)
- [ ] Stats tab: numbers refresh when revisited (re-pulled, not stale)
- [ ] Saved tab: shows "I do this too" and "Helpful" sections; tapping a habit navigates
      back into the graph at the right node
- [ ] Refresh button in the app bar reloads the graph
- [ ] Error state + retry when the graph fails to load
- [ ] Confirm the tab bar stays white during normal use (regression check for the jank/
      grey-flash issue on this page)

### 2.4 My Habits Tab

**List**
- [ ] Aggregate activity heatmap renders (adaptive scaling)
- [ ] SRHI check-in prompt appears when a window is due
- [ ] "New Habit" button hidden once the study's max-habits limit is reached

**New habit creation**
- [ ] Behavior step: catalog picker (study participants) or free-text entry (public,
      min length validated)
- [ ] Cue step: pre-rated assigned cues vs self-selected cues (add/remove up to 7)
- [ ] Guided studies route through the animated "stitching" screen; non-guided studies go
      straight to Confirm
- [ ] Confirm step: edit intention statement, set/accept reminder time, toggle
      community-share (only visible if study default allows it), Create Habit
- [ ] Habit-limit-reached error surfaces correctly instead of a generic failure

**Habit detail + SRHI**
- [ ] Per-habit contribution graph renders; "no logs yet" empty state when unused
- [ ] SRHI trajectory sparkline + latest score + next-check-in date
- [ ] Abandon habit (confirm dialog) — only available while active
- [ ] SRHI check-in form: all 7 sliders must be touched before Submit enables; submit
      updates the trajectory

### 2.5 Recommend Tab
- [ ] Tab is hidden when the study's `recommenderEnabled` flag is off — confirm both
      directions (on → visible, off → hidden) without requiring app restart
- [ ] Enter a goal and submit; loading animation plays through its phases
- [ ] Results list renders with rationale, suggested cue, and expandable sources
      (citation links open externally)
- [ ] "Add to habits" pre-fills the new-habit flow with the suggested behavior/cue
- [ ] Submit feedback on a recommendation
- [ ] Empty state (no share history yet) and error state (API failure) both show "Try
      Again"

### 2.6 Settings Tab
- [ ] Language picker: switch through en/de/ja/fr/nl — verify UI text actually changes
      (spot-check the intention-stitch screen and Project Info screen, which only have
      en/de/ja copy and fall back to English for fr/nl)
- [ ] Appearance picker: light, dark, system — switch rapidly a few times, confirm no
      crash/visual glitch (regression check for the theme-switch assertion crash)
- [ ] Community comments toggle
- [ ] Notification toggles: habit reminders, questionnaire reminders, study updates
- [ ] Export my data (GDPR) — downloads and opens the system share sheet
- [ ] Sign out (confirm dialog)
- [ ] Delete account (confirm dialog) — wipes local storage and returns to onboarding

**Profile**
- [ ] View vs edit mode toggle; dynamic fields save correctly; Cancel discards changes
- [ ] Offline banner + retry when the fetch fails

**Legal documents**
- [ ] Privacy, accessibility, imprint, consent each load their localized document with
      version/effective-date footer
- [ ] Offline banner + retry

**Study membership**
- [ ] Join another study by code (same validation as onboarding)
- [ ] Leave a study (confirm dialog)
- [ ] "Restore account on device" link works

**Rotate passphrase**
- [ ] Warning banner shown before proceeding
- [ ] New 24-word phrase generated, copy-to-clipboard, "saved" checkbox gates Done
- [ ] Old phrase no longer works to restore; new one does

**Help & Support**
- [ ] "Send email" opens mail client (mailto) with a graceful failure snackbar if none
      configured
- [ ] FAQ items expand/collapse

### 2.7 Questionnaire Flow (in-app)
- [ ] Triggered from a due-questionnaire snackbar and from the Share tab task card
- [ ] Question types render correctly: single choice, multi choice, scale, free text
- [ ] Required-question validation blocks "Save & Continue"
- [ ] Back button hidden on the first question, present after
- [ ] Submit on the last question, with a validation pass over all required questions
- [ ] Confirmation screen shown after successful submit
- [ ] Submission failure shows a retryable error, not a silent loss of answers

### 2.8 Cross-cutting
- [x] Push notification permission prompt appears on first launch (or is skipped
      gracefully if Firebase isn't configured for this build)
- [ ] Tapping a push notification from a terminated app state routes to the right screen
- [ ] Tapping a push notification while backgrounded routes to the right screen
- [ ] Airplane mode: consent/legal-document screens, profile fetch, and habit-share queue
      all degrade gracefully and recover once back online
- [ ] Cold start while already online drains any leftover offline queue automatically

---

## Part 3 — Cross-System Checks

- [ ] An admin action in Studies (e.g. disabling the recommender, changing questionnaire
      assignments, changing profile fields) shows up correctly on a mobile client without
      requiring a reinstall
- [ ] A habit donated on mobile appears in the admin Donations feed and Explore graph
      within the expected time
- [ ] A participant created in the admin panel can actually redeem their study code and
      complete onboarding on mobile
- [ ] Backup → restore round-trip: restore a backup into a scratch environment and spot-
      check that studies/participants/habits came back intact
- [ ] Translations: spot-check a couple of screens on both admin and mobile in German and
      Japanese for obviously broken/untranslated strings
- [ ] Time zone handling: an SRHI/questionnaire scheduled for "due today" behaves
      consistently between the admin's server time and the participant's local time
