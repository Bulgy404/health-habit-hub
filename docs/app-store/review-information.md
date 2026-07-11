# App Store Review Information — Health Habit Hub (HabHealth)

Material for the **App Review Information** section in App Store Connect and
the reviewer notes field. Update the credentials before each submission.

## App description (context for the reviewer)

Health Habit Hub is the mobile companion of **"HabConnect – from Habit to
Health"**, an academic health-habit research study conducted by the Digital
Health Research Group at Technische Universität Dresden (Germany). Participants
anonymously donate everyday habits, answer questionnaires, form implementation
intentions, and receive AI-generated habit suggestions grounded in a
researcher-curated knowledge base.

- **Research compliance:** the study protocol was submitted to the TU Dresden
  ethics committee (13 May 2025); the consultation raised no objections. The
  data-protection concept was assessed by the TU Dresden Data Protection
  Officer with no objections (ref. **0543-025/001**, 28 March 2025).
- **Informed consent:** a mandatory consent screen (HabConnect IC, version
  1.0.0) is shown before account creation; acceptance is recorded with the
  document version. The document can be re-read under Settings → Legal →
  Study consent.
- **Account model:** anonymous, passphrase-based accounts — no name, email, or
  phone number is collected. First-party Keycloak OIDC; no third-party or
  social login (Sign in with Apple therefore not required, Guideline 4.8).
- **Account deletion:** Settings → Delete account permanently removes all
  server-side participant data and the identity (Guideline 5.1.1(v)).
- **AI content:** habit recommendations are AI-generated; the screen carries a
  visible "not medical advice" disclaimer (Guideline 1.4.1).
- **Push notifications:** optional; requested in context after onboarding.
  All functionality works if permission is denied (Guideline 4.5.4).
- **No tracking:** no advertising or analytics SDKs; `NSPrivacyTracking` is
  `false` in the privacy manifest. No ATT prompt needed.
- **Community comments (Guideline 1.2):** participants can leave short
  anonymous comments on shared habits. Comments are auto-moderated
  server-side before publication; any comment can be reported via the flag
  icon, which hides it immediately and re-queues it for researcher/admin
  review. Comments can be turned off entirely from Settings → Community
  comments (this app's block-equivalent, since comments carry no visible
  identity to block a specific poster from).

## Privacy Policy URL (App Store Connect → App Information)

The in-app privacy document is served dynamically per locale from the
backend (`{appBaseUrl}/{locale}/privacy`), so there is no URL hardcoded in
the app. For the **App Privacy Policy URL** field in App Store Connect, use
the English version of the currently deployed backend:

```
https://<production-domain>/en/privacy
```

**Before submitting:** confirm `<production-domain>` — the value currently
set in this checkout's `.env` (`DOMAIN=habit.felixreinsch.de`) looks like a
personal/dev deployment, not necessarily the final production host. Resolve
against whatever domain the App Store build's `API_BASE_URL` --dart-define
actually points to, then verify the URL loads in a browser before pasting it
into Connect.

## Demo access for review

| Field | Value |
|---|---|
| Demo flow | Launch app → "Get Started" → consent screen → auto-generated anonymous account (no credentials needed) |
| Study code (for the enrollment step) | `HHH-REVW1` *(create before submission: Admin portal → Studies → Codes; set no expiry, generous redemption limit)* |
| Alternative | Tap "Skip" on the study-code screen to join the default study |
| Restore flow test | The 24-word passphrase shown during onboarding restores the account via "Restore existing account" |

**Before each submission:** verify `HHH-REVW1` (or the current review code) is
active: `POST /api/v1/enroll/redeem-code` must accept it. Generate via the
admin portal or `scripts/` seeding.

## Reviewer notes (paste into App Store Connect)

> Health Habit Hub is a university research app (TU Dresden, Germany) for the
> ethics-reviewed study "HabConnect – from Habit to Health". Participation is
> anonymous: accounts are auto-generated with a recovery passphrase; no
> personal contact data is collected. The mandatory in-app consent screen
> reflects the ethics-approved informed-consent document (v1.0.0). In-app
> account deletion is under Settings → Delete account. Habit recommendations
> are AI-generated and clearly labelled as not being medical advice. To review
> the full study flow, use study code HHH-REVW1 on the enrollment screen (or
> tap Skip). Push notifications are optional. Community comments on shared
> habits are auto-moderated, reportable via a flag icon, and can be turned off
> entirely under Settings → Community comments. Contact:
> felix.reinsch@tu-dresden.de.

## App Privacy (nutrition labels) — declare in App Store Connect

| Data type | Collected? | Linked to user? | Tracking? | Purpose |
|---|---|---|---|---|
| Health & Fitness → Health | Yes | Yes (pseudonymous study ID) | No | App functionality, research |
| User Content → Other (habit texts, questionnaire answers) | Yes | Yes | No | App functionality, research |
| Identifiers → User ID (pseudonymous Keycloak sub) | Yes | Yes | No | App functionality |
| Usage Data → Product interaction (daily logs, SRHI) | Yes | Yes | No | App functionality, research |
| Contact info / location / financial / browsing | No | — | — | — |

Matches `ios/Runner/PrivacyInfo.xcprivacy` (which must stay in sync).

## Guideline-by-guideline status

| Guideline | Status | Where |
|---|---|---|
| 5.1.1(v) account deletion | ✅ | Settings → Delete account → `DELETE /api/v1/users/me` |
| 5.1.3 health research consent | ✅ | Mandatory consent screen; versioned record in `consents` collection; ethics + DPO references above |
| 5.1.1 accurate privacy disclosures | ✅ | Versioned legal docs served from backend; privacy manifest; labels table above |
| Privacy manifest (ITMS-91053) | ✅ | `ios/Runner/PrivacyInfo.xcprivacy`, registered in the Runner target |
| 2.1 information needed | ✅ | This document (demo flow + study code) |
| 1.4.1 medical disclaimer | ✅ | Recommendations screen banner |
| 4.5.4 push optional | ✅ | Requested post-onboarding; app fully functional when denied |
| 4.8 Sign in with Apple | n/a | First-party auth only |
| 1.2 user-generated content | ✅ | Server-side auto-moderation; report button re-queues for admin review and hides immediately from everyone incl. reporter; Settings → Community comments toggle to disable the feature entirely |
| Export compliance (`ITSAppUsesNonExemptEncryption`) | ✅ | Set to `false` in `ios/Runner/Info.plist` — standard/exempt encryption only (TLS, OS keychain, local passphrase encoding) |
