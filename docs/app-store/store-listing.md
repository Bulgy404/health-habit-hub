# Store listing copy — English & German

Ready-to-paste text for App Store Connect and Google Play Console. Character
counts are given against each store's limit; the informal **du** is used in
German, matching the app's own strings (`mobile/lib/l10n/app_de.arb`).

> **Keep this honest.** Health Habit Hub is a research data-collection tool that
> people use as a habit tracker, and both stores' reviewers read the privacy
> declarations against the listing. Nothing below claims a medical benefit,
> promises a health outcome, or implies the app is a medical device.

---

## 1. Promotional text

App Store Connect → *Promotional Text* (max 170 characters). Updatable without
a new build, unlike the description.

### English (151)

```
Manage your habits, and contribute to research along the way. Measured with instruments from published behavioural science. No name, no email required.
```

### German (145)

```
Gewohnheiten managen und ganz nebenbei zur Forschung beitragen. Gemessen mit Instrumenten aus der Verhaltenswissenschaft. Ohne Name, ohne E-Mail.
```

---

## 2. Short description

Google Play Console → *Short description* (max 80 characters).

### English (69)

```
Manage your habits and contribute to behavioural research. Anonymous.
```

### German (67)

```
Gewohnheiten managen und zur Verhaltensforschung beitragen. Anonym.
```

---

## 3. Full description

Both stores, max 4000 characters. Google Play renders no Markdown — the plain
line breaks below are intentional.

### English (2008)

```
Health Habit Hub is a habit tracker built by the Digital Health research group at TU Dresden. You use it to manage your everyday habits. Researchers use what you choose to share to understand how habits actually form.

Both halves are real, and we would rather say so plainly than dress one up as the other.

WHAT YOU GET

• Track your daily habits and see, at a glance, how consistent you have been
• Measure how automatic a habit has become, using the Self-Report Habit Index — the same instrument used in published research
• Attach a new habit to one you already have (habit stacking), tied to a specific cue and moment
• Personalised suggestions, generated from a curated library of peer-reviewed behavioural-science papers rather than generic advice
• Reminders at the times you choose, worded to support the intention you set

PRIVACY, CONCRETELY

• No name, no email address, no phone number. Your account is a 24-word recovery passphrase and nothing else.
• That passphrase is the only way back into your account. Write it down. We cannot reset it, because we hold nothing that could identify you.
• Your data is stored under a pseudonym. Researchers analysing it cannot see who you are.
• Export everything you have contributed at any time, or delete your account outright, from inside the app.
• Hosted on university infrastructure in Germany, under the GDPR.

Some clinical studies do need to know who their participants are. Those studies are separate, are joined with a different kind of invitation code, and ask for your explicit consent first. If you are not in one, none of that applies to you and nothing about your account changes.

ABOUT THE RESEARCH

Health Habit Hub supports "HabConnect — from Habit to Health" and related work on how habits form and hold. Taking part is voluntary, you are told what is collected before you agree, and you can stop at any time.

This app does not diagnose, treat, or give medical advice. If something about your health concerns you, speak to a doctor.
```

### German (2314)

```
Health Habit Hub ist ein Gewohnheits-Tracker der Forschungsgruppe Digital Health an der TU Dresden. Du nutzt ihn, um deine Gewohnheiten zu managen. Die Forschung nutzt das, was du freiwillig teilst, um zu verstehen, wie Gewohnheiten wirklich entstehen.

Beides stimmt – und wir sagen das lieber deutlich, als das eine als das andere auszugeben.

WAS DIE APP KANN

• Tägliche Gewohnheiten festhalten und auf einen Blick sehen, wie konsequent du warst
• Messen, wie automatisch eine Gewohnheit geworden ist – mit dem Self-Report Habit Index, dem Instrument aus der publizierten Forschung
• Eine neue Gewohnheit an eine bestehende koppeln (Habit Stacking), mit konkretem Auslöser und Moment
• Persönliche Vorschläge, erzeugt aus einer kuratierten Sammlung begutachteter verhaltenswissenschaftlicher Fachartikel – kein allgemeiner Ratgeber-Text
• Erinnerungen zu den Zeiten, die du wählst, formuliert passend zu deinem Vorsatz

DATENSCHUTZ, KONKRET

• Kein Name, keine E-Mail-Adresse, keine Telefonnummer. Dein Konto ist eine 24-Wort-Wiederherstellungsphrase und sonst nichts.
• Diese Phrase ist der einzige Weg zurück in dein Konto. Schreib sie auf. Wir können sie nicht zurücksetzen, weil wir nichts haben, was dich identifizieren würde.
• Deine Daten werden unter einem Pseudonym gespeichert. Forschende, die sie auswerten, sehen nicht, wer du bist.
• Du kannst alle deine Beiträge jederzeit exportieren oder dein Konto vollständig löschen – direkt in der App.
• Betrieb auf Universitätsinfrastruktur in Deutschland, nach DSGVO.

Manche klinischen Studien müssen wissen, wer ihre Teilnehmenden sind. Diese Studien sind davon getrennt, man tritt ihnen mit einer anderen Art von Einladungscode bei, und sie fragen vorher ausdrücklich um deine Einwilligung. Wenn du in keiner solchen Studie bist, betrifft dich das nicht und an deinem Konto ändert sich nichts.

ZUR FORSCHUNG

Health Habit Hub unterstützt „HabConnect – from Habit to Health" und verwandte Arbeiten dazu, wie Gewohnheiten entstehen und bestehen bleiben. Die Teilnahme ist freiwillig, du erfährst vor deiner Zustimmung, was erhoben wird, und du kannst jederzeit aufhören.

Diese App stellt keine Diagnosen, behandelt nicht und gibt keine medizinischen Ratschläge. Wenn dich etwas an deiner Gesundheit beunruhigt, sprich mit einer Ärztin oder einem Arzt.
```

---

## 4. Keywords

App Store Connect → *Keywords* (max 100 characters, comma-separated).

**Do not waste characters on spaces after commas, and do not repeat the app
name.** Apple indexes the title and subtitle separately, so "health", "habit"
and "hub" are already covered and would be dead weight here.

**Google Play has no keywords field.** Its ranking reads the title, short
description and full description, so the terms below are worked into the
description text instead — which is why the full description says "behavioural
science", "Self-Report Habit Index" and "reminders" in plain prose rather than
gesturing at them.

### English (97)

```
routine,tracker,behaviour,science,research,wellbeing,streak,reminder,daily,goals,psychology,study
```

### German (97)

```
Routine,Tracker,Verhalten,Wissenschaft,Forschung,Wohlbefinden,Erinnerung,Ziele,Alltag,Psychologie
```

Notes on the choices:

- **`research`, `science`, `study`, `psychology`** are deliberate. The
  scientific framing is the differentiator against the hundreds of consumer
  habit trackers, and people looking for a study app search these words.
- **`streak`, `reminder`, `routine`, `tracker`** cover the ordinary
  habit-tracker vocabulary people actually type.
- Both British and American spellings of *behaviour* cannot fit; Apple's
  matching handles common variants, and the store locale here is primarily
  UK/EU English.
- Avoid competitor names — App Store review rejects listings that use them.

---

## 5. Release notes

**Newest first. Never delete an older release's text** — see §6 for why, and for
the five-point rule the entries below follow.

The same five points go to both stores: App Store → *What's New in This
Version* (max 4000), Google Play → *What's new* (max 500).

### 1.3.0 — current submission

> 1.3.0 is the resubmission after the 1.2.0 (4) rejection under guideline
> 5.1.3(iv), so **1.2.0 never reached App Store users** — its clinical-study
> points are repeated here because they are new to anyone upgrading from 1.1.x.
> The only change that is new on both platforms is usage measurement: a release
> build now sends events to the self-hosted PostHog instance by default
> (`AppConfig._prodPosthogProjectKey`). **Disclosing it is not optional** — see
> the privacy note below.

#### English (456)

```
• Usage is now measured as fixed event names and counts — never your habit text, and no session recording
• That usage data stays on TU Dresden's own servers; no commercial analytics provider
• Join a clinical study that verifies its participants — optional, separate from anonymous use
• Such studies ask for their own consent in full first; your subject code is in Settings
• The age question at setup is now required, plus security and reliability fixes
```

#### German (495)

```
• Die Nutzung wird als feste Ereignisnamen und Zahlen gemessen – nie dein Gewohnheitstext, keine Aufzeichnung
• Diese Nutzungsdaten bleiben auf Servern der TU Dresden; kein kommerzieller Anbieter
• Klinischer Studie beitreten, die ihre Teilnehmenden kennt – optional, getrennt von der anonymen Nutzung
• Solche Studien holen vorher ihre eigene Einwilligung ein; dein Subjektcode steht in den Einstellungen
• Altersangabe beim Einrichten ist Pflicht, dazu Korrekturen an Sicherheit und Stabilität
```

#### Privacy declarations must change with this release

Both stores' privacy answers were written for a build that sent no telemetry.
1.3.0 does, so before submitting:

- **App Store Connect → App Privacy**: declare *Usage Data → Product
  Interaction*, collected, **not linked** to identity, used for *Analytics* and
  *App Functionality*. Leave tracking as "no" — the data never leaves TU
  Dresden infrastructure and is not shared with any third party for
  advertising.
- **Google Play → Data safety**: the same addition under *App activity → App
  interactions*, collected, not shared, not required to use the app.
- §3's privacy bullets stay truthful against this: they claim no name, no email
  and pseudonymous storage — all still true — and none of them claims the app
  measures nothing.

### 1.2.0 — rejected at review, never published

Retained per §6. Most of 1.2.0 was server- and portal-side (identity register,
per-study control over which papers inform recommendations, scoped researcher
access, security fixes); these were the participant-visible parts.

#### English (464)

```
Support for clinical studies that verify who their participants are — entirely optional, and separate from ordinary anonymous use.

• Join a clinical study with the new invitation code format
• Studies that need it now ask for their own consent, shown in full before you agree
• Your study subject code is visible in Settings
• The age question during setup is now required, because eligibility depends on it

Plus security and reliability improvements throughout.
```

#### German (496)

```
Unterstützung für klinische Studien, die wissen müssen, wer teilnimmt – optional und getrennt von der anonymen Nutzung.

• Klinischer Studie mit dem neuen Einladungscode beitreten
• Studien, die es brauchen, holen jetzt ihre eigene Einwilligung ein – vollständig sichtbar, bevor du zustimmst
• Dein Studien-Subjektcode steht in den Einstellungen
• Die Altersangabe beim Einrichten ist jetzt Pflicht, weil die Teilnahmeberechtigung davon abhängt

Dazu Verbesserungen bei Sicherheit und Stabilität.
```

---

## 6. Notes for whoever updates this

### Release notes: the two rules that are not negotiable

1. **Exactly five key points, and nothing else.** No intro sentence, no
   ALL-CAPS section headings, no closing line — five bullets, newest release
   first, in both languages. They have to fit Google Play's 500-character
   limit, which is what keeps them honest; the App Store's 4000 is not an
   invitation to write more, because the same text goes to both stores. If a
   release has fewer than five participant-visible changes, fold the small ones
   into the fifth bullet ("plus security and reliability fixes") rather than
   padding to five. If it has more, cut to the five a participant would notice
   first.

2. **Never delete or overwrite an older release's What's New.** Add the new
   release as a new `###` block at the top of §5 and leave every previous one
   below it, oldest last, each under its version heading with a one-line note
   on what it was. The history is the only record of what a user upgrading from
   an old build has already been told, and of what was written but never
   published because a release was rejected — 1.2.0 is exactly that case. When
   a release is rejected, keep its text and say so in the heading; do not
   quietly fold it into the next one without a note.

### Everything else

- **Legal URLs** the stores require are listed in
  [`DOCUMENTATION.md` §15](../../DOCUMENTATION.md#15-mobile-release--ios-and-android)
  under *Legal URLs required by the stores*.
- **Promotional text is the only field updatable without a new build** — use it
  for anything time-sensitive; keep the description stable.
- When writing the next release's notes, start from `CHANGELOG.md` but filter
  hard: most entries there are backend or admin-portal changes that no
  participant will ever notice, and listing them reads as padding.
- Keep the German informal (**du**). The app's own strings do.
- **The voice here follows the marketing site**, `website/src/i18n/ui.ts` — the
  framing is *manage* / *track* your habits ("Gewohnheiten managen",
  "Verfolge deine Gewohnheiten"), not *build* them. If the site's wording
  changes, change it here too rather than letting the two drift.
- Keywords are an App Store field only. On Google Play the same terms have to
  appear in the description prose, so check both when adding one.
