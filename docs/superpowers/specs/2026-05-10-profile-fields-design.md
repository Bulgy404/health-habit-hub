# Configurable Profile Fields Design

**Date:** 2026-05-10
**Status:** Approved
**Scope:** Replace hardcoded age/gender onboarding fields with admin-configurable profile field definitions; store all profile fields on the Neo4j User node; add admin portal tab for managing definitions.

---

## Goal

Allow admins and researchers to define which profile fields appear in the Flutter onboarding flow, including the input type. Replace the hardcoded birthday (formerly age) and gender fields with dynamically fetched definitions. Sync all submitted profile fields to the Neo4j User node as direct properties.

---

## Data Model

### MongoDB: `profile_field_definitions`

```json
{
  "fieldId": "birthday",
  "label": "When were you born?",
  "type": "date",
  "options": [],
  "required": false,
  "order": 1,
  "createdAt": ISODate,
  "updatedAt": ISODate
}
```

| Field | Type | Notes |
|---|---|---|
| `fieldId` | string | Unique slug; becomes the Neo4j User node property name |
| `label` | string | Shown to the user in onboarding |
| `type` | `"text"` \| `"number"` \| `"date"` \| `"select"` | Controls Flutter input widget |
| `options` | string[] | Only used when `type = "select"`; admin-defined option list |
| `required` | boolean | Whether the user must fill the field before continuing |
| `order` | number | Display order in the onboarding form |

### MongoDB: `user_profiles` (existing, extended)

The `fields` array is unchanged structurally, but each entry now includes `type`:

```json
{
  "userId": "user-uuid",
  "fields": [
    {
      "questionId": "birthday",
      "questionText": "When were you born?",
      "type": "date",
      "value": ISODate("1990-05-15"),
      "label": "May 15, 1990"
    },
    {
      "questionId": "gender",
      "questionText": "What is your gender?",
      "type": "select",
      "value": "female",
      "label": "Female"
    }
  ],
  "updatedAt": ISODate
}
```

- `value` for `date` fields is stored as a BSON `ISODate` object (backend converts from ISO string)
- `value` for `number` fields is stored as a JS number (float)
- `label` for `date` fields is the human-readable formatted string (e.g. `"May 15, 1990"`)
- `label` for `number` and `text` fields equals the value as a string
- `label` for `select` fields is the selected option string

Flutter includes `type` in the submitted payload so the backend can convert without a separate definitions lookup.

### Neo4j: User node (extended)

All submitted profile fields are synced as direct properties on the User node:

```cypher
(:User {
  userId: "user-uuid",
  createdAt: datetime(),
  birthday: date("1990-05-15"),
  gender: "female"
})
```

Type-aware conversion in Cypher:
- `date` fields: `date($val)` (val is ISO string `"YYYY-MM-DD"` derived from the stored ISODate)
- `number` fields: stored as-is (already a number)
- `text` / `select` fields: stored as string

The sync builds a dynamic `SET` clause from whatever fields arrive — no hardcoded field names in the Cypher function.

---

## Backend API

### New: `profileFieldDefinitionsRouter.js`

Admin-only endpoints (require `admin` role), mounted at `/api/v1/admin/`:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/admin/profile-field-definitions` | List all definitions, sorted by `order` |
| `POST` | `/api/v1/admin/profile-field-definitions` | Create definition; `fieldId` must be unique |
| `PUT` | `/api/v1/admin/profile-field-definitions/:fieldId` | Update label, type, options, required, order |
| `DELETE` | `/api/v1/admin/profile-field-definitions/:fieldId` | Delete definition |

Validation: `fieldId` is required and must match `/^[a-z][a-z0-9_]*$/`; `type` must be one of the four valid values; `options` must be a non-empty array when `type = "select"`.

Public endpoint added to `userProfileRouter.js` (any authenticated user — used by Flutter):

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/profile-field-definitions` | List definitions sorted by `order` |

### Updated: `POST /api/v1/user-profile`

- Accepts `type` on each field entry (ignored if absent for backwards compatibility)
- Before `insertOne`, converts field values by type: `date` → `new Date(value)`, `number` → `parseFloat(value)`, others unchanged
- After MongoDB upsert, fire-and-forget Neo4j sync (same `.catch(console.error)` pattern)

### New: `setUserProfileProperties` in `app/db/userQueries.js`

```js
export async function setUserProfileProperties(queryNeo4j, userId, fields)
// fields: [{ questionId, value, type }]
// Builds dynamic SET clause; converts date values to ISO string for date()
// MERGE (u:User {userId: $userId}) then SET u.fieldId = coerced_value for each field
```

---

## Admin Portal

New "Profile Fields" page at `/profile-fields`, added to the sidebar (admin role only, same guard pattern as KB and Settings).

**Page layout:**
- Table of existing definitions: columns for Label, Field ID, Type, Options (truncated), Required, Order — with Edit and Delete actions per row
- "Add Field" button opens an inline form:
  - Field ID (slug input, read-only after creation)
  - Label (text input)
  - Type (dropdown: Text / Number / Date / Select)
  - Options (shown only when type = Select): add/remove string list
  - Required (toggle)
  - Order (number input)

Order is a plain number; no drag-to-reorder.

---

## Flutter Onboarding

`profile_setup_screen.dart` and `profile_fields.dart` are rewritten to be fully dynamic.

On onboarding load, fetch `GET /api/v1/profile-field-definitions`. Render one input widget per definition in `order` sequence:

| Type | Widget | Stored value | Label |
|---|---|---|---|
| `date` | `CupertinoDatePicker` (date mode) | ISO string `"YYYY-MM-DD"` | Formatted string e.g. `"May 15, 1990"` |
| `number` | `CupertinoTextField` numeric keyboard | `double` | String representation |
| `text` | `CupertinoTextField` | string | Same as value |
| `select` | `CupertinoPicker` with definition's `options` | selected option string | Same as value |

Each submitted field includes `type` (taken from the definition). Skipped fields (user tapped "Skip") are omitted from the payload entirely — the backend upserts only what arrives.

---

## Seed Data

A one-time seed script (`scripts/seed-profile-field-definitions.js`) inserts the two initial definitions so existing behavior is preserved after deploy:

```js
{ fieldId: 'birthday', label: 'When were you born?', type: 'date', options: [], required: false, order: 1 }
{ fieldId: 'gender', label: 'What is your gender?', type: 'select',
  options: ['Male', 'Female', 'Non-binary', 'Prefer not to say'], required: false, order: 2 }
```

Script is idempotent (uses upsert on `fieldId`).

---

## Files Changed

### New files

| File | Purpose |
|---|---|
| `app/routes/profileFieldDefinitionsRouter.js` | Admin CRUD + public GET for field definitions |
| `admin/app/profile-fields/page.tsx` | Admin portal page |
| `admin/app/profile-fields/ProfileFieldsClient.tsx` | Client component with table + form |
| `scripts/seed-profile-field-definitions.js` | One-time seed script |

### Modified files

| File | Change |
|---|---|
| `app/routes/userProfileRouter.js` | Type-aware value conversion; Neo4j sync call; add public `GET /profile-field-definitions` |
| `app/db/userQueries.js` | Add `setUserProfileProperties` |
| `app/routes/v1Router.js` | Mount `profileFieldDefinitionsRouter` |
| `admin/app/components/Sidebar.tsx` | Add Profile Fields nav item |
| `mobile/lib/screens/onboarding/profile_setup_screen.dart` | Dynamic field rendering |
| `mobile/lib/screens/onboarding/profile_fields.dart` | Replace hardcoded data with dynamic model |

### Unchanged

- `user_profiles` MongoDB collection schema (additive only — `type` field is new but optional)
- Questionnaire infrastructure
- `extract_profile.py` — already reads `fields` generically; `label` values continue to work

---

## Error Handling

- Neo4j sync is fire-and-log: same pattern as questionnaire sync — never blocks the HTTP response
- If `profile_field_definitions` is empty (e.g. before seed), Flutter shows an empty onboarding step and the user skips — no crash
- Unknown `type` values in submitted fields are stored as-is (string) without conversion
