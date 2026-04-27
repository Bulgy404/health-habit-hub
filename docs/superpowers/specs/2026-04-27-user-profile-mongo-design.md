# User Profile MongoDB Collection — Design Spec

**Date:** 2026-04-27  
**Status:** Approved

## Overview

Replace the current `form_responses` write for the `user-profile` questionnaire slug with a dedicated `user_profiles` MongoDB collection that stores structured Q&A pairs (question ID, question text, selected value, human-readable label). Wire this collection into the LLM recommendation pipeline and add a settings screen for users to view and edit their profile after skipping onboarding.

## Current State

- `profile_setup_screen.dart` asks age and gender during onboarding
- Submits to `POST /api/v1/questionnaire-responses` with `{questionnaireSlug: 'user-profile', answers: {age: 21, gender: 'male'}}`
- Stored in `form_responses` collection
- Python `extract_profile.py` fetches via `GET /api/v1/questionnaire-responses/service/:userId/user-profile`
- LLM receives raw `{age: 21, gender: "male"}` JSON as `profile_json`

## Target State

- New `user_profiles` MongoDB collection replaces `form_responses` for user profile data
- Flutter sends structured fields (question text + answer label) from the point of collection
- Python pipeline reads from new service endpoint and feeds human-readable Q&A to LLM
- Settings screen lets users update their profile at any time

---

## Section 1: MongoDB Collection

**Collection name:** `user_profiles`

**Schema:**
```json
{
  "userId": "uuid-from-keycloak",
  "fields": [
    {
      "questionId": "age",
      "questionText": "Age",
      "value": 21,
      "label": "18–24"
    },
    {
      "questionId": "gender",
      "questionText": "Gender",
      "value": "male",
      "label": "Male"
    }
  ],
  "updatedAt": "2026-04-27T10:00:00.000Z"
}
```

**Rules:**
- One document per user (upsert on every write)
- No history — only current state is kept
- Unique index on `userId`
- `fields` is extensible — new questions added to onboarding flow automatically appear here

---

## Section 2: Backend — Node.js (app/)

**New file:** `app/routes/userProfileRouter.js`

### Endpoints

#### `POST /api/v1/user-profile`
- Auth: Bearer JWT (`req.user.sub`)
- Body: `{ fields: [{ questionId, questionText, value, label }] }`
- Validation: `fields` must be a non-empty array; each item must have all four keys
- Action: upsert `user_profiles` document for `req.user.sub`, set `updatedAt: now`
- Response: `200 { ok: true }`

#### `GET /api/v1/user-profile`
- Auth: Bearer JWT
- Action: return caller's `user_profiles` document or 404
- Response: `{ userId, fields, updatedAt }` (strips `_id`)

#### `GET /api/v1/user-profile/service/:userId`
- Auth: `X-Service-Auth-Token` header (API_SERVICE_SECRET)
- Action: return `user_profiles` document for given userId
- Response: `{ userId, fields, updatedAt }` or 404
- Replaces: `GET /api/v1/questionnaire-responses/service/:userId/user-profile`

**Registration:** mount in `app/app.js` at `/api/v1/user-profile`.

---

## Section 3: Flutter — Onboarding Screen

**File:** `mobile/lib/screens/onboarding/profile_setup_screen.dart`

The `_submit()` method changes endpoint and payload:

```dart
// OLD — POST /api/v1/questionnaire-responses
data: {
  'questionnaireSlug': 'user-profile',
  'answers': {'age': _age, 'gender': _gender},
}

// NEW — POST /api/v1/user-profile
data: {
  'fields': [
    {
      'questionId': 'age',
      'questionText': 'Age',
      'value': _age,
      'label': _ageLabel,   // e.g. "18–24"
    },
    {
      'questionId': 'gender',
      'questionText': 'Gender',
      'value': _gender,
      'label': _genderLabel, // e.g. "Male"
    },
  ],
}
```

A helper that maps `_age` integer → display label (e.g. `21 → "18–24"`) is added inside the screen, co-located with the `_ageRanges` constant. Similarly for gender.

Flutter is the single source of truth for question labels. Adding a new question means adding a new chip widget and one more entry in the `fields` array.

---

## Section 4: Python Pipeline — extract_profile.py

**File:** `API-service/routers/extract_profile.py`

Replace the third parallel fetch:

```python
# OLD
_fetch_questionnaire_response(body.user_id, "user-profile")

# NEW
_fetch_user_profile(body.user_id)
```

New helper `_fetch_user_profile(user_id)` calls:
```
GET {BACKEND_URL}/api/v1/user-profile/service/{user_id}
X-Service-Auth-Token: {API_SERVICE_SECRET}
```

The returned `fields` array is formatted as a human-readable string for the LLM prompt:
```
Age: 18–24
Gender: Male
```

This replaces the raw `{age: 21, gender: "male"}` JSON currently injected as `{profile_json}`. The prompt template `prompts/extract_profile.txt` is unchanged — it already uses `{profile_json}`; we just feed it richer, labelled text. The Python local variable is renamed from `profile_json` to `profile_text` to reflect that it is no longer JSON.

---

## Section 5: Flutter — Settings Edit Screen

### New screen: `PersonalInfoScreen`

**File:** `mobile/lib/screens/settings/personal_info_screen.dart`  
**Route:** `/settings/personal-info` (registered in `main.dart` under the `/settings` shell route)

**Behaviour:**
- On load: calls `GET /api/v1/user-profile` (user-auth JWT) to fetch current values and pre-fill chips
- If 404 (user skipped onboarding): all chips start unselected
- Same chip UI as `profile_setup_screen.dart` — shared `_ageRanges` / `_genderOptions` constants extracted to a shared location (e.g. `lib/screens/onboarding/profile_fields.dart`)
- On save: POST `{fields: [...]}` to `POST /api/v1/user-profile` — same upsert endpoint
- On success: shows snackbar "Saved" and pops back

### Settings row

In `UserSettingsScreen`, add a row in the Profile section below the existing "My Profile" row:

```
[ person_outline ]  Personal info    >
```

Tapping navigates to `/settings/personal-info`.

---

## Out of Scope

- Migration of existing `form_responses` user-profile documents (new collection starts fresh; existing data in `form_responses` is not migrated)
- Deleting the old `questionnaire-responses/service/:userId/user-profile` endpoint (can be removed in a follow-up once confirmed unused)
- i18n for `questionText` / `label` fields (currently English-only; the LLM prompt receives whatever language the app is running in — acceptable for now)
- Redis cache invalidation: `extract_profile.py` caches results keyed on `{user_id}||{goal}` for 24 h. If a user updates their profile via settings, their next recommendation within that window may use stale profile data. This is a pre-existing limitation of the cache layer and is not addressed here.

---

## File Checklist

| File | Change |
|------|--------|
| `app/routes/userProfileRouter.js` | New file |
| `app/app.js` | Mount new router |
| `app/tests/integration/user-profile.routes.test.js` | New integration tests |
| `mobile/lib/screens/onboarding/profile_fields.dart` | New shared constants |
| `mobile/lib/screens/onboarding/profile_setup_screen.dart` | Update `_submit()` |
| `mobile/lib/screens/settings/personal_info_screen.dart` | New file |
| `mobile/lib/main.dart` | Register new route |
| `mobile/lib/screens/user_settings_screen.dart` | Add Personal info row |
| `API-service/routers/extract_profile.py` | Replace fetch + format |
| `API-service/tests/test_extract_profile.py` | Update tests |
