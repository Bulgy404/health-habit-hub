# Health Habit Hub — Admin Guide

This guide walks researchers and administrators through every day-to-day task in the Health Habit Hub platform. No developer assistance is needed for the operations described here.

---

## Quick Start: Setting Up a New Study Cohort

Use this checklist when launching a new cohort of participants.

1. **Log in as admin** — open `https://hhh.tu-dresden.de/admin` and authenticate with your admin credentials (Section 1).
2. **Create participant accounts** — for each participant, use *Participants → New Participant*; the system immediately generates both credentials and the token card PDF (Section 2).
3. **Download and distribute token cards** — tap Download Token Card on each participant's detail view to retrieve the ready-made PDF; print and hand it out physically or via post (Section 2).
4. **Assign study groups** — assign each participant to one of the four study groups (G1–G4) in the participant's detail view (Section 3).
5. **Create or publish questionnaires** — set up the baseline profile survey and any follow-up questionnaires; assign them to the correct groups (Section 4).
6. **Verify first logins** — open the participant progress dashboard and confirm each participant's first login is registered (Section 6).
7. **Monitor habit donations** — once the study is running, use the habits dashboard to check donation counts per group (Section 5).
8. **Export data for analysis** — use the CSV export button to download donated habits for offline analysis (Section 5).

---

## Table of Contents

1. [Logging In as Admin](#1-logging-in-as-admin)
2. [Creating a Participant and Downloading the Token Card](#2-creating-a-participant-and-downloading-the-token-card)
3. [Assigning Study Groups](#3-assigning-study-groups)
4. [Configuring Questionnaires](#4-configuring-questionnaires)
5. [Monitoring Donated Habits](#5-monitoring-donated-habits)
6. [Tracking Participant Progress](#6-tracking-participant-progress)
7. [Revoking Device Sessions](#7-revoking-device-sessions)
8. [Configuring Token Card Format in Settings](#8-configuring-token-card-format-in-settings)
9. [Language Settings for Participants](#9-language-settings-for-participants)
10. [Managing the Cue Pool](#10-managing-the-cue-pool)
11. [Configuring Study Conditions (Cue Config)](#11-configuring-study-conditions-cue-config)
12. [Viewing Study Analytics](#12-viewing-study-analytics)
13. [Sending Researcher Notifications](#13-sending-researcher-notifications)
14. [Configuring Public Default Cue Settings](#14-configuring-public-default-cue-settings)

---

## 1. Logging In as Admin

The admin panel is accessible only to users with the `admin` or `researcher` Keycloak role. Participants cannot access any admin screen even if they navigate to the URL.

**Step 1.** Open a browser and navigate to `https://hhh.tu-dresden.de` (or `http://localhost:3000` in development).

**Step 2.** On the login screen enter your **admin username** and **password** (not a token card — admin accounts use a regular password set in Keycloak). Tap **Login**.

**Step 3.** After login, the navigation bar will show an extra **Admin** tab (gear icon). Tap it to open the admin panel.

| Screenshot | Callout annotations |
|---|---|
| ![Admin login screen](../assets/screenshots/admin/01-admin-login.png) | **(1)** Username field — enter your admin account username. **(2)** Password field — enter your admin password (not a token card code). **(3)** Login button — tap to authenticate. **(4)** HHH logo and version number shown at the top of the login card. |

*Figure 1: Admin login screen. Callout numbers correspond to the table above.*

> **Tip:** If you see "Invalid credentials", check that you are using an admin account (not a participant token). Participant tokens are one-time tokens and cannot be used to log in as admin.

---

## 2. Creating a Participant and Downloading the Token Card

Each study participant needs an account and a printable token card with their QR-code credentials.

**Step 1.** In the Admin panel, tap **Participants** in the left sidebar.

**Step 2.** Tap the **+ New Participant** button in the top right.

**Step 3.** Fill in the **Display Name** (optional, for your reference only — participants are pseudonymised) and select the **Study Group** (you can change this later; see Section 3).

**Step 4.** Tap **Create**. The system immediately:
- Generates a pseudonymous username (e.g. `p-2024-0042`) and a random access password
- Creates the participant's Keycloak account
- Generates the token card PDF and stores it — no further action needed before downloading

> **Note:** Participant passwords are stored internally as a bcrypt hash. Neither you nor any other admin can retrieve the raw password — it exists in readable form only on the printed token card. This is by design and requires no admin action.

| Screenshot | Callout annotations |
|---|---|
| ![Create participant form](../assets/screenshots/admin/02-create-participant.png) | **(1)** Display Name field — researcher-visible only; not shown to the participant. **(2)** Study Group dropdown — defaults to G1; can be changed later. **(3)** Create button — generates credentials, creates the Keycloak account, and produces the token card PDF immediately. |

*Figure 2a: New participant creation form.*

**Step 5.** After creation, the participant's detail view opens automatically. Tap **Download Token Card** to retrieve the pre-generated PDF. The download is instant — the PDF was created at the moment you tapped Create.

**Step 6.** Print the token card and hand it to the participant. The card contains:
- The study logo and participant pseudonym
- A QR code that encodes `hhh://login?user=<username>&token=<password>`
- The username and password in plain text (for manual entry)

| Screenshot | Callout annotations |
|---|---|
| ![Download token card button](../assets/screenshots/admin/02-download-token-card.png) | **(1)** Participant pseudonym and internal ID. **(2)** Download Token Card button — retrieves the pre-generated PDF instantly. **(3)** Copy Credentials button — copies username:password to clipboard for digital distribution. **(4)** QR code preview showing the encoded deep link. |

*Figure 2b: Participant detail view after creation, showing the token card download button.*

> **Tip:** The token card PDF is re-downloadable at any time from the participant's detail view. Tokens do not expire unless you manually revoke them.

---

## 3. Assigning Study Groups

Each participant must be assigned to exactly one study group (G1–G4). The group determines which questionnaire items are shown and how habits are classified.

| Group | Description |
|---|---|
| G1 | Full intervention — structured habit donation |
| G2 | Partial intervention — structured donation without recommendations |
| G3 | Full intervention + free-text annotation |
| G4 | Minimal intervention + free-text annotation |

**Step 1.** In the Admin panel, tap **Participants** and open the participant you want to assign.

**Step 2.** Tap the **Study Group** dropdown (currently shows the group assigned at creation).

**Step 3.** Select the new group and tap **Save**.

| Screenshot | Callout annotations |
|---|---|
| ![Assign study group](../assets/screenshots/admin/03-assign-group.png) | **(1)** Participant pseudonym and current group badge. **(2)** Study Group dropdown — select G1, G2, G3, or G4. **(3)** Save button — immediately updates the group in Keycloak and Neo4j. **(4)** Group change history log showing previous assignments with timestamps. |

*Figure 3: Assigning a study group to a participant.*

> **Warning:** Changing a participant's group mid-study may affect recommendation quality and data integrity. Only change the group before the participant logs in for the first time, unless instructed by the study lead.

---

## 4. Configuring Questionnaires

The platform has two questionnaire systems that serve different purposes.

| System | Where configured | Rendered by | Use case |
|--------|-----------------|-------------|----------|
| **SurveyJS Forms** | Admin panel → Surveys | WebView (SurveyJS) | Habit-donation prompts, profile forms — freely designed with a JSON schema editor |
| **Study Questionnaires** | Admin panel → Questionnaires / Web portal → Studies | Native Flutter UI | Validated research instruments (SLIQ, RAND-36, SRHI) and researcher-created questionnaires assigned to studies |

---

### 4a. SurveyJS Forms

SurveyJS forms are JSON-schema driven forms shown to participants on the Donate and Profile screens. Admins can create, edit, publish, archive, and target them explicitly.

Survey availability follows four rules:

- `habit-donation` is always available to every participant on the Donate screen.
- `group_assigned` surveys are only visible to participants whose study group is listed in the survey.
- `unassigned_only` surveys are the standard/default case for participants who have no study group yet.
- `all_participants` surveys are visible to everyone regardless of group.

### Creating a SurveyJS Form

**Step 1.** In the Admin panel, tap **Surveys** in the sidebar, then tap **+ New Survey**.

**Step 2.** Enter a **Title** and select a **Type**: `profile`, `habit-donation`, or `custom`.

**Step 3.** Choose an **Availability** mode:

- **All participants**: visible to every participant.
- **Standard only**: visible only to participants without a study group.
- **Study groups**: visible only to the selected groups.

`habit-donation` is always forced to **All participants**.

**Step 4.** Paste or type the **JSON Schema** that defines the form fields. The schema must follow the JSON Schema draft-07 format. Each property becomes one form field.

**Step 5.** Tap **Save as Draft**. The questionnaire is not yet visible to participants.

| Screenshot | Callout annotations |
|---|---|
| ![Questionnaire list](../assets/screenshots/admin/04-questionnaire-list.png) | **(1)** List of all questionnaires with status badges (Draft / Published / Archived). **(2)** + New Questionnaire button. **(3)** Filter bar to search by title or type. **(4)** Row action buttons: Edit, Publish/Archive, Assign Groups, Delete. |

*Figure 4a: Questionnaire list view.*

| Screenshot | Callout annotations |
|---|---|
| ![Create questionnaire form](../assets/screenshots/admin/04-questionnaire-create.png) | **(1)** Title field. **(2)** Type selector (profile / habit). **(3)** JSON Schema editor with syntax highlighting. **(4)** Preview button — renders the form as participants will see it. **(5)** Save as Draft button. |

*Figure 4b: New questionnaire creation form.*

### Publishing and Archiving

- **Publish:** Tap the **Publish** action on a Draft questionnaire. Published questionnaires become visible according to their configured availability mode.
- **Archive:** Tap **Archive** on a Published questionnaire to hide it from participants. Existing responses are retained.

### Assigning Questionnaires to Groups

**Step 1.** On the questionnaire list, open a questionnaire and set **Availability** to **Study groups**.

**Step 2.** Toggle on the study groups (G1–G4) that should see this questionnaire.

**Step 3.** Tap **Save**.

If you want a questionnaire to appear for participants who are not assigned to any study group, set **Availability** to **Standard only** and leave the group list empty.

| Screenshot | Callout annotations |
|---|---|
| ![Assign questionnaire to groups](../assets/screenshots/admin/04-questionnaire-assign-groups.png) | **(1)** Questionnaire name shown at the top. **(2)** Group toggle checkboxes (G1–G4). **(3)** Currently assigned groups highlighted in teal. **(4)** Save Assignment button. |

*Figure 4c: Assigning a questionnaire to specific study groups.*

---

### 4b. Study Questionnaires (Native Instrument Library)

Study Questionnaires are validated research instruments and researcher-created questionnaires that are administered to participants as part of a study. They are rendered natively in the Flutter app and appear on the participant's **Profile** screen after enrolment.

**Library instruments** — SLIQ, RAND-36, and SRHI are pre-loaded and read-only. They appear in the **Library** tab in both admin interfaces.

**Custom questionnaires** — researchers can create and manage their own questionnaire definitions through the admin UI. No seed scripts or JSON file edits are required.

#### Creating a Custom Questionnaire (Web portal — recommended)

**Step 1.** In the web admin portal, navigate to **Questionnaires** in the sidebar.

**Step 2.** Open the **Custom** tab and click **+ New questionnaire**.

**Step 3.** Enter a **Title** and **Description**. Add questions using the visual question builder — each question has a type (Open text, Single choice, Multi choice, Scale) and an optional list of answer options.

**Step 4.** Click **Save**. The questionnaire is now available to link to studies.

#### Creating a Custom Questionnaire (Flutter admin panel)

**Step 1.** Open the admin panel in the app and tap **Questionnaires** in the side navigation.

**Step 2.** Switch to the **Custom** tab and tap the **+** button.

**Step 3.** Enter a title, description, and add questions. Tap **Create**.

#### Assigning Questionnaires to a Study

Questionnaires are linked to participants through studies. A participant sees the questionnaires assigned to the study they are enrolled in.

**Via the web admin portal:**

**Step 1.** Navigate to **Studies** in the sidebar.

**Step 2.** Open an existing study or create a new one.

**Step 3.** Open the **Questionnaires** tab in the study editor. Check the questionnaires (library or custom) that should be administered to participants in this study.

**Step 4.** Click **Save** — participants enrolled in the study will immediately see the assigned questionnaires on their Profile screen.

> **No seed script required.** All questionnaire management — including adding new library instruments and custom researcher-designed questionnaires — is handled entirely through the admin UI.

---

## 5. Monitoring Donated Habits

The Habits dashboard shows all habits donated across all participants, with filter and export capabilities.

**Step 1.** In the Admin panel, tap **Habits** in the sidebar.

**Step 2.** The list shows all habit donations sorted by submission date (newest first). Each row shows: pseudonym, habit text, study group, BCIO category, and submission timestamp.

| Screenshot | Callout annotations |
|---|---|
| ![Habits list](../assets/screenshots/admin/05-habits-list.png) | **(1)** Total donation count. **(2)** List of habit donations with group and BCIO category columns. **(3)** Sort controls (by date, group, or category). **(4)** Filter bar (see below). **(5)** CSV Export button. |

*Figure 5a: Habits monitoring list.*

### Filtering Habits

**Step 1.** Use the filter bar above the list to narrow results:
- **Group filter:** Select G1, G2, G3, G4, or All.
- **BCIO category filter:** Select a BCT taxonomy category or All.
- **Date range:** Set a start and end date to filter by donation date.

**Step 2.** The list updates in real time as you change filters.

| Screenshot | Callout annotations |
|---|---|
| ![Habits filter bar](../assets/screenshots/admin/05-habits-filter.png) | **(1)** Group filter dropdown. **(2)** BCIO category dropdown. **(3)** Start date picker. **(4)** End date picker. **(5)** Reset Filters button. |

*Figure 5b: Filter controls on the habits dashboard.*

### Exporting to CSV

**Step 1.** Apply any filters you want (or leave all at "All" to export everything).

**Step 2.** Tap **Export CSV**. The browser downloads `habits_export_<date>.csv`.

The CSV contains columns: `participant_pseudonym`, `study_group`, `habit_text`, `bcio_category`, `submitted_at`, `annotation_text` (G3/G4 only).

| Screenshot | Callout annotations |
|---|---|
| ![CSV export confirmation](../assets/screenshots/admin/05-habits-export.png) | **(1)** Export CSV button. **(2)** Row count shown before export (confirms scope). **(3)** Download progress indicator. |

*Figure 5c: Triggering a CSV export.*

---

## 6. Tracking Participant Progress

The participant progress view shows activity summaries for each participant to help identify inactive or struggling participants.

**Step 1.** In the Admin panel, tap **Participants** and open a participant's detail view.

**Step 2.** Scroll to the **Activity** section. It shows:
- **First login date** (or "Not yet logged in")
- **Profile survey completed** (Yes / No)
- **Habits donated count** (total and per week)
- **Last active date**
- **Recommendations accepted / dismissed count**

| Screenshot | Callout annotations |
|---|---|
| ![Participant progress view](../assets/screenshots/admin/06-participant-progress.png) | **(1)** First login date (or "Not yet logged in" banner). **(2)** Profile completion badge — green tick if completed. **(3)** Habits donated — number badge with weekly sparkline. **(4)** Recommendations panel — accepted vs dismissed ratio bar. **(5)** Last active timestamp. |

*Figure 6: Participant activity summary.*

> **Tip:** Use the **Participants** list view's **"No logins yet"** filter (Group filter → Status: Never logged in) to identify participants who have not activated their token cards.

---

## 7. Revoking Device Sessions

If a participant loses their token card or a device is compromised, you can revoke their active sessions. This forces a re-authentication with a new token.

**Step 1.** Open the participant's detail view (Admin panel → Participants → select participant).

**Step 2.** Tap **Revoke All Sessions**. A confirmation dialog appears: *"This will log the participant out of all devices immediately. Continue?"*

**Step 3.** Tap **Confirm**. The participant's Keycloak sessions are terminated. They will see an "Invalid session" message on their next app action.

**Step 4.** If the participant needs a new token card (e.g. lost card), tap **Regenerate Token** to issue a new random password, then download the updated token card (Section 2).

| Screenshot | Callout annotations |
|---|---|
| ![Revoke sessions panel](../assets/screenshots/admin/07-revoke-session.png) | **(1)** Active Sessions count — shows how many devices are currently authenticated. **(2)** Revoke All Sessions button (red, destructive action). **(3)** Confirmation dialog with participant pseudonym. **(4)** Regenerate Token button — issues a new password without revoking existing sessions. |

*Figure 7: Revoking a participant's active device sessions.*

> **Warning:** Revoking sessions is immediate and irreversible. The participant will need their new token card to log in again.

---

## 8. Configuring Token Card Format in Settings

The token card PDF layout — logo, font size, QR code position, and colour scheme — can be adjusted in the admin settings without code changes.

> **Note:** Token card format settings take effect for all new participants created after the settings are saved. Existing token card PDFs (generated at participant creation time) are not retroactively updated. To apply a new format to an existing participant, use **Regenerate Token** on their detail view and then re-download the token card.

**Step 1.** In the Admin panel, tap **Settings** (gear icon in the sidebar footer).

**Step 2.** Under **Token Card Format**, you can configure:

| Setting | Description | Default |
|---|---|---|
| Logo URL | URL or base64 of the logo image shown at the top | HHH shield logo |
| Primary colour | Hex colour for header and QR code border | `#1A73E8` |
| Font size | Body text size in pt | `11` |
| QR code size | QR block pixel size (80–200) | `120` |
| Footer text | Custom text at card bottom (e.g. study contact) | `"Contact: study@tu-dresden.de"` |
| Include plain text credentials | Show username/password below QR code | `true` |

**Step 3.** Tap **Preview Token Card** to see a live preview PDF with the current settings applied to a sample participant.

**Step 4.** Tap **Save Settings** to persist. All subsequently created participants will have token cards generated using the new format.

| Screenshot | Callout annotations |
|---|---|
| ![Token card settings panel](../assets/screenshots/admin/08-token-card-settings.png) | **(1)** Logo URL input with inline image preview. **(2)** Primary colour swatch picker. **(3)** QR code size slider. **(4)** Footer text input. **(5)** Include plain text credentials toggle. **(6)** Preview Token Card button — opens PDF preview in a new tab. **(7)** Save Settings button. |

*Figure 8: Token card format settings.*

---

## 9. Language Settings for Participants

The app supports English and German (Deutsch). Each participant can independently set their preferred display language. The language preference is stored server-side (MongoDB `users` collection) and is applied to all habit display text (`displayText` field), questionnaire labels, and UI strings.

### How Participants Change Their Language

**Step 1.** In the mobile app, the participant taps the **Settings** tab (gear icon in the bottom navigation bar).

**Step 2.** On the Settings screen, a **Language** dropdown shows the current language selection.

**Step 3.** The participant selects **English** or **Deutsch**. The change is saved immediately and a confirmation snackbar ("Settings saved") appears.

**Step 4.** The app UI and all habit translations switch to the selected language without requiring a restart.

| Setting | Description |
|---|---|
| English | All UI strings and habit display text in English. Donated habits are shown using the English translation (`translationEN`) if available, otherwise the original text. |
| Deutsch | All UI strings and habit display text in German. Donated habits are shown using the German translation (`translationDE`) if available, otherwise the original text. |

> **Note for admins:** You cannot set a participant's language preference from the admin panel. Language is a personal preference configured by each participant in their own Settings screen. If a participant reports seeing content in the wrong language, ask them to open Settings and re-select their preferred language.

> **Technical note:** The backend stores the preference as `preferredLanguage: 'en'` or `preferredLanguage: 'de'` in the `users` MongoDB collection (keyed by Keycloak subject ID). The `GET /api/v1/habits?lang=de` query parameter is set automatically by the Flutter app based on the stored preference — it does not need to be configured manually.

---

## 10. Managing the Cue Pool

The Cue Pool is a library of pre-rated contextual cues used by the recommendation engine. It is accessible to both `admin` and `researcher` roles via **Cue Pools** in the left sidebar.

### Viewing and Filtering Cues

The list shows each cue's text, a quality badge (high / low), dimension scores (stability, salience, specificity on a 1–5 scale), domain, and language. Use the **Quality** and **Language** dropdowns above the list to filter the displayed rows.

### Creating a Single Cue

**Step 1.** Tap **+ New Cue**.

**Step 2.** Fill in the form:

| Field | Valid values |
|---|---|
| Text | Free text — the cue sentence |
| Quality | `low` or `high` |
| Domain | e.g. `health`, `fitness`, `nutrition` |
| Language | e.g. `en`, `de` |
| Stability | Integer 1–5 |
| Salience | Integer 1–5 |
| Specificity | Integer 1–5 |

**Step 3.** Tap **Save**. The cue appears in the list immediately.

### Bulk CSV Import

**Step 1.** Tap **Import CSV** and select a `.csv` file from your computer.

The file must include these columns (order does not matter):

```
text,quality,stability,salience,specificity,domain,language
```

Valid values: `quality` must be `low` or `high`; dimension scores must be integers 1–5.

**Step 2.** After upload, a result dialog shows the number of rows **inserted** and **skipped** (skipped rows have validation errors and are reported individually).

### Deleting a Cue

Tap the **Delete** (trash) icon on any cue row and confirm the dialog. Deletion is immediate and permanent.

---

## 11. Configuring Study Conditions (Cue Config)

Each study group can have its own cue delivery settings. These are managed from the **Cue Config** tab inside a study's edit modal.

**Step 1.** In the Admin panel, navigate to **Studies**.

**Step 2.** Open a study by clicking its row, then click the **Cue Config** tab.

**Step 3.** For each group listed, configure the following settings:

| Setting | Options | Description |
|---|---|---|
| Cue count | Single / Multi | Whether participants see one cue or multiple cues per session |
| Cue source | `low_quality` / `high_quality` / `self_selected` | Pool from which cues are drawn |
| Allowed behaviors | Checklist | Behavior types participants may log for this group |
| Max habits | 1 / Unlimited | `1` restricts participants to study conditions; Unlimited mirrors the public app experience |

**Step 4.** Tap the **Save** button for each group individually. Settings for other groups are unaffected.

---

## 12. Viewing Study Analytics

The **Analytics** tab inside a study's edit modal provides live statistics for a running study.

**Step 1.** Navigate to **Studies** and open a study.

**Step 2.** Click the **Analytics** tab.

The tab contains three panels:

| Panel | What it shows |
|---|---|
| Weekly Active Rate | Bar chart showing the percentage of enrolled participants per group who logged at least one behavior in the last 7 days |
| SRHI Trajectory | Line chart showing the mean SRHI habit-strength score (1–7 scale) per week, with one line per study condition |
| Cumulative Dropout | Table listing each participant marked as dropped out, with their dropout date and a running total per group |

All data is fetched live on tab open — refresh the tab to update the figures.

---

## 13. Sending Researcher Notifications

Push notifications can be sent to study participants from the **Notifications** tab inside a study's edit modal. This is available to `admin` and `researcher` roles.

### Composing and Sending a Notification

**Step 1.** Navigate to **Studies**, open a study, and click the **Notifications** tab.

**Step 2.** Enter a **Title** and **Body** for the push notification.

**Step 3.** Choose the target audience:

| Target option | Who receives it |
|---|---|
| All enrolled | Every participant currently enrolled in the study |
| Specific group | Only participants in the selected group (e.g. G1) |
| All enrolled in study | Synonym for "All enrolled" — included for clarity in multi-study setups |

**Step 4.** Choose when to send:
- **Send immediately** — tap **Send Now**; delivery begins within seconds.
- **Schedule** — enable the date/time picker, set the desired date and time, then tap **Schedule**.

### Managing Scheduled Campaigns

Pending campaigns are listed in the lower section of the Notifications tab. Each row shows the scheduled date/time, target, and status. To cancel a pending campaign, tap **Cancel** on its row.

---

## 14. Configuring Public Default Cue Settings

The **Public Default Cue Config** section in Settings controls the cue experience for app-store users who are not enrolled in any study. Only `admin` accounts can modify these settings.

**Step 1.** In the Admin panel, tap **Settings** (gear icon in the sidebar footer).

**Step 2.** Scroll to the **Public Default Cue Config** section.

**Step 3.** Adjust the settings as needed:

| Setting | Options | Description |
|---|---|---|
| Default cue count | Single / Multi | Number of cues shown per session to public users |
| Default cue source | `low_quality` / `high_quality` / `self_selected` | Pool from which cues are drawn for public users |
| Default reminder time | Time picker (HH:MM) | Daily reminder push notification time for public users |

**Step 4.** Tap **Save Settings**. Changes take effect immediately for all public users on their next session — no app restart or re-enrolment is required.

---

*Health Habit Hub — Admin Guide v1.2 · TU Dresden · 2026*
