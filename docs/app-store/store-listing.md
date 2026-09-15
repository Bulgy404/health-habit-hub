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

### English (141)

```
Build habits that last — and help behavioural science understand how. A research app from TU Dresden. No name, no email, no tracking profile.
```

### German (150)

```
Gewohnheiten aufbauen, die bleiben – und der Verhaltensforschung helfen zu verstehen, wie. Eine Forschungs-App der TU Dresden. Ohne Name, ohne E-Mail.
```

---

## 2. Short description

Google Play Console → *Short description* (max 80 characters).

### English (73)

```
Habit tracking that feeds real behavioural research. Anonymous by design.
```

### German (70)

```
Gewohnheiten tracken und Forschung unterstützen. Anonym von Grund auf.
```

---

## 3. Full description

Both stores, max 4000 characters. Google Play renders no Markdown — the plain
line breaks below are intentional.

### English (1995)

```
Health Habit Hub is a habit tracker built by the Digital Health research group at TU Dresden. You use it to build everyday habits. Researchers use what you choose to share to understand how habits actually form.

Both halves are real, and we would rather say so plainly than dress one up as the other.

WHAT YOU GET

• Track daily habits and see your streaks and progress over time
• Measure how automatic a habit has become, using the Self-Report Habit Index — the same instrument used in published research
• Build new habits on top of existing ones (habit stacking) and tie them to a specific cue and moment
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

### German (2323)

```
Health Habit Hub ist ein Gewohnheits-Tracker der Forschungsgruppe Digital Health an der TU Dresden. Du nutzt ihn, um Alltagsgewohnheiten aufzubauen. Die Forschung nutzt das, was du freiwillig teilst, um zu verstehen, wie Gewohnheiten wirklich entstehen.

Beides stimmt – und wir sagen das lieber deutlich, als das eine als das andere auszugeben.

WAS DIE APP KANN

• Tägliche Gewohnheiten festhalten und den eigenen Fortschritt über die Zeit sehen
• Messen, wie automatisch eine Gewohnheit geworden ist – mit dem Self-Report Habit Index, dem Instrument aus der publizierten Forschung
• Neue Gewohnheiten an bestehende koppeln (Habit Stacking) und mit einem konkreten Auslöser und Moment verbinden
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

## 4. Release notes — 1.2.0

Google Play → *What's new* (max 500 characters). App Store → *What's New in
This Version* (max 4000; the same text is fine).

> Most of what 1.2.0 contains is server- and portal-side — the identity
> register, per-study control over which research papers inform
> recommendations, scoped researcher access, and security fixes. Very little of
> it is visible in the app, and the notes below say only what a participant can
> actually see. Claiming more would be the easiest thing here to get wrong.

### English (464)

```
Support for clinical studies that verify who their participants are — entirely optional, and separate from ordinary anonymous use.

• Join a clinical study with the new invitation code format
• Studies that need it now ask for their own consent, shown in full before you agree
• Your study subject code is visible in Settings
• The age question during setup is now required, because eligibility depends on it

Plus security and reliability improvements throughout.
```

### German (496)

```
Unterstützung für klinische Studien, die wissen müssen, wer teilnimmt – optional und getrennt von der anonymen Nutzung.

• Klinischer Studie mit dem neuen Einladungscode beitreten
• Studien, die es brauchen, holen jetzt ihre eigene Einwilligung ein – vollständig sichtbar, bevor du zustimmst
• Dein Studien-Subjektcode steht in den Einstellungen
• Die Altersangabe beim Einrichten ist jetzt Pflicht, weil die Teilnahmeberechtigung davon abhängt

Dazu Verbesserungen bei Sicherheit und Stabilität.
```

---

## 5. Notes for whoever updates this

- **Legal URLs** the stores require are listed in
  [`DOCUMENTATION.md` §15](../../DOCUMENTATION.md#15-mobile-release--ios-and-android)
  under *Legal URLs required by the stores*.
- **Promotional text is the only field updatable without a new build** — use it
  for anything time-sensitive; keep the description stable.
- When writing the next release's notes, start from `CHANGELOG.md` but filter
  hard: most entries there are backend or admin-portal changes that no
  participant will ever notice, and listing them reads as padding.
- Keep the German informal (**du**). The app's own strings do.
