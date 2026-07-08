<!-- MASCHINELL ÜBERSETZT aus der englischen Quelle — vor Veröffentlichung bitte durch Muttersprachler prüfen -->
# Health Habit Hub — Administrationshandbuch

Dieses Handbuch führt Forschende und Administrierende durch alle alltäglichen Aufgaben in der Health Habit Hub Plattform. Für die hier beschriebenen Vorgänge ist keine Entwicklerunterstützung erforderlich.

---

## Schnellstart: Einrichtung einer neuen Studie-Kohorte

Verwenden Sie diese Checkliste beim Start einer neuen Teilnehmerkohorte.

1. **Als Admin anmelden** — öffnen Sie `https://hhh.tu-dresden.de/admin` und authentifizieren Sie sich mit Ihren Admin-Zugangsdaten (Abschnitt 1).
2. **Teilnehmerkonten erstellen** — erstellen Sie für jeden Teilnehmer ein Konto über *Teilnehmer → Neuer Teilnehmer*; das System generiert sofort sowohl die Zugangsdaten als auch die Token-Karten-PDF (Abschnitt 2).
3. **Token-Karten herunterladen und verteilen** — tippen Sie auf „Token-Karte herunterladen" in der Detailansicht jedes Teilnehmers, um die fertige PDF abzurufen; drucken Sie diese aus und übergeben Sie sie persönlich oder per Post (Abschnitt 2).
4. **Studiengruppen zuweisen** — weisen Sie jedem Teilnehmer eine der vier Studiengruppen (G1–G4) in der Detailansicht zu (Abschnitt 3).
5. **Fragebögen erstellen oder veröffentlichen** — richten Sie den Basisprofil-Survey und alle Folgefragebögen ein; weisen Sie sie den richtigen Gruppen zu (Abschnitt 4).
6. **Erste Anmeldungen prüfen** — öffnen Sie das Teilnehmerfortschritts-Dashboard und bestätigen Sie, dass der erste Login jedes Teilnehmers registriert wurde (Abschnitt 6).
7. **Gewohnheitsspenden beobachten** — sobald die Studie läuft, nutzen Sie das Gewohnheits-Dashboard, um die Spendenanzahl pro Gruppe zu prüfen (Abschnitt 5).
8. **Daten für die Analyse exportieren** — verwenden Sie den CSV-Export-Button, um gespendete Gewohnheiten für Offline-Analysen herunterzuladen (Abschnitt 5).

---

## Inhaltsverzeichnis

1. [Als Admin anmelden](#1-als-admin-anmelden)
2. [Teilnehmer erstellen und Token-Karte herunterladen](#2-teilnehmer-erstellen-und-token-karte-herunterladen)
3. [Studiengruppen zuweisen](#3-studiengruppen-zuweisen)
4. [Fragebögen konfigurieren](#4-fragebögen-konfigurieren)
5. [Gespendete Gewohnheiten überwachen](#5-gespendete-gewohnheiten-überwachen)
6. [Teilnehmerfortschritt verfolgen](#6-teilnehmerfortschritt-verfolgen)
7. [Gerätesitzungen widerrufen](#7-gerätesitzungen-widerrufen)
8. [Token-Karten-Format in den Einstellungen konfigurieren](#8-token-karten-format-in-den-einstellungen-konfigurieren)
9. [Spracheinstellungen für Teilnehmer](#9-spracheinstellungen-für-teilnehmer)
10. [Verwaltung des Cue-Pools](#10-verwaltung-des-cue-pools)
11. [Studienbedingungen konfigurieren (Cue-Konfiguration)](#11-studienbedingungen-konfigurieren-cue-konfiguration)
12. [Studien-Analytik einsehen](#12-studien-analytik-einsehen)
13. [Benachrichtigungen an Teilnehmende senden](#13-benachrichtigungen-an-teilnehmende-senden)
14. [Das Erlebnis der öffentlichen App konfigurieren](#14-das-erlebnis-der-öffentlichen-app-konfigurieren)
15. [Backups verwalten](#15-backups-verwalten)

---

## 1. Als Admin anmelden

Das Admin-Panel ist nur für Benutzer mit der Keycloak-Rolle `admin` oder `researcher` zugänglich. Teilnehmer können keine Admin-Ansicht aufrufen, auch wenn sie die URL direkt eingeben.

**Schritt 1.** Öffnen Sie einen Browser und navigieren Sie zu `https://hhh.tu-dresden.de` (oder `http://localhost:3000` in der Entwicklungsumgebung).

**Schritt 2.** Geben Sie im Anmeldebildschirm Ihren **Admin-Benutzernamen** und Ihr **Passwort** ein (keine Token-Karte — Admin-Konten verwenden ein reguläres Passwort, das in Keycloak festgelegt wird). Tippen Sie auf **Anmelden**.

**Schritt 3.** Nach der Anmeldung zeigt die Navigationsleiste einen zusätzlichen **Admin**-Tab (Zahnrad-Symbol). Tippen Sie darauf, um das Admin-Panel zu öffnen.

| Screenshot | Beschriftungen |
|---|---|
| ![Admin-Anmeldebildschirm](../assets/screenshots/admin/01-admin-login.png) | **(1)** Benutzernamenfeld — geben Sie Ihren Admin-Kontonamen ein. **(2)** Passwortfeld — geben Sie Ihr Admin-Passwort ein (kein Token-Karten-Code). **(3)** Anmelden-Button — tippen Sie zum Authentifizieren. **(4)** HHH-Logo und Versionsnummer oben auf der Anmeldekarte. |

*Abbildung 1: Admin-Anmeldebildschirm. Die Beschriftungsnummern entsprechen der obigen Tabelle.*

> **Tipp:** Wenn Sie „Ungültige Zugangsdaten" sehen, prüfen Sie, ob Sie ein Admin-Konto verwenden (kein Teilnehmer-Token). Teilnehmer-Token sind Einmal-Token und können nicht für Admin-Anmeldungen verwendet werden.

---

## 2. Teilnehmer erstellen und Token-Karte herunterladen

Jeder Studienteilnehmer benötigt ein Konto und eine druckbare Token-Karte mit QR-Code-Zugangsdaten.

**Schritt 1.** Tippen Sie im Admin-Panel auf **Teilnehmer** in der linken Seitenleiste.

**Schritt 2.** Tippen Sie oben rechts auf den Button **+ Neuer Teilnehmer**.

**Schritt 3.** Geben Sie den **Anzeigenamen** ein (optional, nur für Ihre Referenz — Teilnehmer sind pseudonymisiert) und wählen Sie die **Studiengruppe** aus (diese kann später geändert werden; siehe Abschnitt 3).

**Schritt 4.** Tippen Sie auf **Erstellen**. Das System führt sofort folgende Schritte aus:
- Es generiert einen pseudonymen Benutzernamen (z. B. `p-2024-0042`) und ein zufälliges Zugriffspasswort
- Es erstellt das Keycloak-Konto des Teilnehmers
- Es generiert die Token-Karten-PDF und speichert sie — vor dem Herunterladen ist keine weitere Aktion erforderlich

> **Hinweis:** Teilnehmerpasswörter werden intern als bcrypt-Hash gespeichert. Weder Sie noch ein anderer Admin können das Klartextpasswort abrufen — es existiert nur in lesbarer Form auf der gedruckten Token-Karte. Dies ist beabsichtigt und erfordert keine Admin-Aktion.

| Screenshot | Beschriftungen |
|---|---|
| ![Teilnehmer erstellen Formular](../assets/screenshots/admin/02-create-participant.png) | **(1)** Anzeigenamen-Feld — nur für Forschende sichtbar; wird dem Teilnehmer nicht angezeigt. **(2)** Studiengruppen-Dropdown — Standardwert G1; kann später geändert werden. **(3)** Erstellen-Button — generiert Zugangsdaten, erstellt das Keycloak-Konto und erzeugt sofort die Token-Karten-PDF. |

*Abbildung 2a: Formular zum Erstellen eines neuen Teilnehmers.*

**Schritt 5.** Nach der Erstellung öffnet sich automatisch die Detailansicht des Teilnehmers. Tippen Sie auf **Token-Karte herunterladen**, um die vorab generierte PDF abzurufen. Der Download erfolgt sofort — die PDF wurde in dem Moment erstellt, als Sie auf „Erstellen" getippt haben.

**Schritt 6.** Drucken Sie die Token-Karte und übergeben Sie sie dem Teilnehmer. Die Karte enthält:
- Das Studienlogo und das Teilnehmer-Pseudonym
- Einen QR-Code, der `hhh://login?user=<username>&token=<password>` kodiert
- Den Benutzernamen und das Passwort im Klartext (für die manuelle Eingabe)

| Screenshot | Beschriftungen |
|---|---|
| ![Token-Karte herunterladen Button](../assets/screenshots/admin/02-download-token-card.png) | **(1)** Teilnehmer-Pseudonym und interne ID. **(2)** Token-Karte herunterladen-Button — ruft die vorab generierte PDF sofort ab. **(3)** Zugangsdaten kopieren-Button — kopiert Benutzername:Passwort in die Zwischenablage für die digitale Verteilung. **(4)** QR-Code-Vorschau des kodierten Deep Links. |

*Abbildung 2b: Detailansicht des Teilnehmers nach der Erstellung mit dem Token-Karte-Download-Button.*

> **Tipp:** Die Token-Karten-PDF kann jederzeit erneut aus der Detailansicht des Teilnehmers heruntergeladen werden. Token laufen nicht ab, sofern Sie diese nicht manuell widerrufen.

---

## 3. Studiengruppen zuweisen

Jeder Teilnehmer muss genau einer Studiengruppe (G1–G4) zugewiesen werden. Die Gruppe bestimmt, welche Fragebogenelemente angezeigt werden und wie Gewohnheiten klassifiziert werden.

| Gruppe | Beschreibung |
|---|---|
| G1 | Volle Intervention — strukturierte Gewohnheitsspende |
| G2 | Teilintervention — strukturierte Spende ohne Empfehlungen |
| G3 | Volle Intervention + Freitext-Annotation |
| G4 | Minimale Intervention + Freitext-Annotation |

**Schritt 1.** Tippen Sie im Admin-Panel auf **Teilnehmer** und öffnen Sie den Teilnehmer, dem Sie eine Gruppe zuweisen möchten.

**Schritt 2.** Tippen Sie auf das **Studiengruppen**-Dropdown (zeigt aktuell die bei der Erstellung zugewiesene Gruppe).

**Schritt 3.** Wählen Sie die neue Gruppe aus und tippen Sie auf **Speichern**.

| Screenshot | Beschriftungen |
|---|---|
| ![Studiengruppe zuweisen](../assets/screenshots/admin/03-assign-group.png) | **(1)** Teilnehmer-Pseudonym und aktuelles Gruppen-Badge. **(2)** Studiengruppen-Dropdown — G1, G2, G3 oder G4 auswählen. **(3)** Speichern-Button — aktualisiert die Gruppe sofort in Keycloak und Neo4j. **(4)** Gruppenänderungsprotokoll mit früheren Zuweisungen und Zeitstempeln. |

*Abbildung 3: Zuweisung einer Studiengruppe an einen Teilnehmer.*

> **Warnung:** Das Ändern der Gruppe eines Teilnehmers während der Studie kann die Empfehlungsqualität und Datenintegrität beeinträchtigen. Ändern Sie die Gruppe nur vor dem ersten Login des Teilnehmers, es sei denn, die Studienleitung hat dies angewiesen.

---

## 4. Fragebögen konfigurieren

Die Plattform verfügt über zwei Fragebogensysteme für unterschiedliche Zwecke.

| System | Konfigurationsort | Darstellung | Verwendungszweck |
|--------|------------------|-------------|------------------|
| **SurveyJS-Formulare** | Admin-Panel → Surveys | WebView (SurveyJS) | Spenden-Prompts, Profilformulare — frei gestaltbar mit JSON-Schema-Editor |
| **Studien-Fragebögen** | Admin-Panel → Questionnaires / Web-Portal → Studies | Native Flutter-UI | Validierte Messinstrumente (SLIQ, RAND-36, SRHI) und benutzerdefinierte Fragebögen für Studien |

---

### 4a. SurveyJS-Formulare

SurveyJS-Formulare sind JSON-Schema-gesteuerte Formulare, die Teilnehmern auf den Spenden- und Profilbildschirmen angezeigt werden. Admins können Fragebögen erstellen, bearbeiten, veröffentlichen, archivieren und gezielt für bestimmte Teilnehmergruppen freischalten.

Die Verfügbarkeit von Umfragen folgt nun vier Regeln:

- `habit-donation` ist für alle Teilnehmer immer auf dem Spenden-Bildschirm verfügbar.
- `group_assigned`-Umfragen sind nur für Teilnehmer sichtbar, deren Studiengruppe in der Umfrage eingetragen ist.
- `unassigned_only`-Umfragen sind der Standard-/Standardfall für Teilnehmer ohne Studiengruppe.
- `all_participants`-Umfragen sind für alle Teilnehmer sichtbar, unabhängig von ihrer Gruppe.

### Einen Fragebogen erstellen

**Schritt 1.** Tippen Sie im Admin-Panel auf **Surveys** in der Seitenleiste, dann auf **+ New Survey**.

**Schritt 2.** Geben Sie einen **Titel** ein und wählen Sie einen **Typ** aus: `profile`, `habit-donation` oder `custom`.

**Schritt 3.** Wählen Sie einen **Verfügbarkeitsmodus**:

- **Alle Teilnehmer**: für alle Teilnehmer sichtbar.
- **Nur Standard**: nur für Teilnehmer ohne Studiengruppe sichtbar.
- **Studiengruppen**: nur für die ausgewählten Gruppen sichtbar.

`habit-donation` wird immer auf **Alle Teilnehmer** festgelegt.

**Schritt 4.** Fügen Sie das **JSON Schema** ein oder tippen Sie es ein, das die Formularfelder definiert. Das Schema muss dem JSON Schema draft-07 Format entsprechen. Jede Eigenschaft wird zu einem Formularfeld.

**Schritt 5.** Tippen Sie auf **Als Entwurf speichern**. Der Fragebogen ist noch nicht für Teilnehmer sichtbar.

| Screenshot | Beschriftungen |
|---|---|
| ![Fragebogenliste](../assets/screenshots/admin/04-questionnaire-list.png) | **(1)** Liste aller Fragebögen mit Status-Badges (Entwurf / Veröffentlicht / Archiviert). **(2)** + Neuer Fragebogen-Button. **(3)** Filterleiste zur Suche nach Titel oder Typ. **(4)** Zeilenaktions-Buttons: Bearbeiten, Veröffentlichen/Archivieren, Gruppen zuweisen, Löschen. |

*Abbildung 4a: Fragebogen-Listenansicht.*

| Screenshot | Beschriftungen |
|---|---|
| ![Fragebogen erstellen Formular](../assets/screenshots/admin/04-questionnaire-create.png) | **(1)** Titelfeld. **(2)** Typauswahl (profile / habit). **(3)** JSON Schema-Editor mit Syntaxhervorhebung. **(4)** Vorschau-Button — rendert das Formular so, wie Teilnehmer es sehen werden. **(5)** Als Entwurf speichern-Button. |

*Abbildung 4b: Erstellungsformular für einen neuen Fragebogen.*

### Veröffentlichen und Archivieren

- **Veröffentlichen:** Tippen Sie auf die Aktion **Veröffentlichen** bei einem Entwurfs-Fragebogen. Veröffentlichte Fragebögen werden gemäß ihrem konfigurierten Verfügbarkeitsmodus sichtbar.
- **Archivieren:** Tippen Sie auf **Archivieren** bei einem veröffentlichten Fragebogen, um ihn vor Teilnehmern zu verbergen. Vorhandene Antworten bleiben erhalten.

### Fragebögen Gruppen zuweisen

**Schritt 1.** Öffnen Sie in der Fragebogenliste einen Fragebogen und setzen Sie **Verfügbarkeit** auf **Studiengruppen**.

**Schritt 2.** Aktivieren Sie die Studiengruppen (G1–G4), die diesen Fragebogen sehen sollen.

**Schritt 3.** Tippen Sie auf **Speichern**.

Wenn ein Fragebogen für Teilnehmer ohne Studiengruppe sichtbar sein soll, setzen Sie **Verfügbarkeit** auf **Nur Standard** und lassen Sie die Gruppenliste leer.

| Screenshot | Beschriftungen |
|---|---|
| ![Fragebogen Gruppen zuweisen](../assets/screenshots/admin/04-questionnaire-assign-groups.png) | **(1)** Fragebogenname oben angezeigt. **(2)** Gruppen-Toggle-Checkboxen (G1–G4). **(3)** Aktuell zugewiesene Gruppen sind türkis hervorgehoben. **(4)** Zuweisung speichern-Button. |

*Abbildung 4c: Zuweisung eines Fragebogens an bestimmte Studiengruppen.*

---

### 4b. Studien-Fragebögen (Native Messinstrumente)

Studien-Fragebögen sind validierte Messinstrumente und benutzerdefinierte Fragebögen, die Teilnehmern im Rahmen einer Studie verabreicht werden. Sie werden nativ in der Flutter-App dargestellt und erscheinen auf dem **Profil**-Bildschirm der Teilnehmenden nach der Einschreibung.

**Bibliotheks-Instrumente** — SLIQ, RAND-36 und SRHI sind vorinstalliert und schreibgeschützt. Sie erscheinen im **Bibliothek**-Tab beider Admin-Oberflächen.

**Benutzerdefinierte Fragebögen** — Forscher können eigene Fragebogendefinitionen vollständig über die Admin-Oberfläche erstellen und verwalten. Es sind keine Seed-Skripte oder JSON-Dateibearbeitungen erforderlich.

#### Benutzerdefinierten Fragebogen erstellen (Web-Portal — empfohlen)

**Schritt 1.** Im Web-Admin-Portal zu **Questionnaires** in der Seitenleiste navigieren.

**Schritt 2.** Den Tab **Custom** öffnen und auf **+ New questionnaire** klicken.

**Schritt 3.** Titel und Beschreibung eingeben. Fragen mit dem visuellen Fragen-Editor hinzufügen — jede Frage hat einen Typ (Freitext, Einfachauswahl, Mehrfachauswahl, Skala) und optional eine Antwortliste.

**Schritt 4.** Auf **Save** klicken. Der Fragebogen steht nun zur Verknüpfung mit Studien zur Verfügung.

#### Benutzerdefinierten Fragebogen erstellen (Flutter Admin-Panel)

**Schritt 1.** Das Admin-Panel in der App öffnen und auf **Questionnaires** in der Seitennavigation tippen.

**Schritt 2.** Zum Tab **Custom** wechseln und auf das **+**-Symbol tippen.

**Schritt 3.** Titel, Beschreibung und Fragen eingeben. Auf **Create** tippen.

#### Fragebögen einer Studie zuweisen

Fragebögen werden Teilnehmenden über Studien zugänglich gemacht. Teilnehmende sehen die Fragebögen, die der Studie zugewiesen sind, in der sie eingeschrieben sind.

**Über das Web-Admin-Portal:**

**Schritt 1.** Zu **Studies** in der Seitenleiste navigieren.

**Schritt 2.** Eine vorhandene Studie öffnen oder eine neue erstellen.

**Schritt 3.** Den Tab **Questionnaires** im Studien-Editor öffnen. Die Fragebögen (Bibliothek oder benutzerdefiniert) auswählen, die den Teilnehmenden in dieser Studie verabreicht werden sollen.

**Schritt 4.** Auf **Save** klicken — Teilnehmende, die in der Studie eingeschrieben sind, sehen die zugewiesenen Fragebögen sofort auf ihrem Profil-Bildschirm.

> **Kein Seed-Skript erforderlich.** Die gesamte Fragebogenverwaltung — einschließlich neuer Bibliotheksinstrumente und benutzerdefinierter Fragebögen — erfolgt vollständig über die Admin-Oberfläche.

---

### 4c. Fragebögen nach Zeitplan einplanen

Der Tab **Questionnaires** (oben) macht einen Fragebogen für eine Studie verfügbar; der Tab **Schedule** legt fest, *wann* er für jede teilnehmende Person fällig wird — als wiederkehrendes Intervall (z. B. alle 7 Tage) oder als feste Studienwochen/-tage (z. B. Baseline, Woche 4, Woche 8).

**Schritt 1.** Zu **Studies** navigieren, eine Studie öffnen und den Tab **Schedule** anklicken.

**Schritt 2.** Unter **Add a questionnaire** den Fragebogen auswählen, festlegen, ob er für die gesamte Studie oder nur eine Gruppe gilt, und den Turnus (wiederkehrendes Intervall oder feste Wochen/Tage) einstellen. Auf **Add assignment** klicken.

**Schritt 3.** Mit dem **Schedule calendar** unterhalb des Formulars prüfen, was Teilnehmende sehen werden:

| Element | Verhalten |
|---|---|
| **Today**-Schaltfläche | Springt im Kalender zurück zum aktuellen Monat, unabhängig davon, wie weit navigiert wurde. |
| Klick auf einen Tag | Füllt das Formular zum Hinzufügen einer Zuweisung mit einem wiederkehrenden Turnus vor, der an diesem Tag beginnt, und scrollt dorthin — praktisch, um einen Zeitplan visuell zu skizzieren, statt Tagesabstände manuell zu berechnen. |
| Durchgezogene Einträge | Reale Termine, die bereits für eingeschriebene Teilnehmende generiert wurden. |
| Gestrichelte, kursive Einträge | Eine **Vorschau**, wie der Zeitplan für eine Person aussähe, die sich heute einschreibt — wird für Zuweisungen angezeigt, die noch keine eingeschriebenen Teilnehmenden haben, damit neu erstellte Zuweisungen im Kalender nicht wie "fehlend" wirken. |
| Ausgegraute Tage | Liegen nach dem Studienenddatum (siehe unten), falls eines gesetzt ist. |

> **Warum Zeitpläne relativ und nicht als Kalenderdatum angegeben sind.** Jeder Zeitplan wird als Versatz zum individuellen Einschreibedatum jeder teilnehmenden Person ausgedrückt, da Teilnehmende an unterschiedlichen Tagen einer Studie beitreten. Ein Klick auf einen Kalendertag berechnet den entsprechenden Versatz unter der Annahme, dass die Einschreibung heute erfolgt — das tatsächliche Fälligkeitsdatum für jede Person bleibt relativ zu ihrem eigenen Einschreibedatum.

#### Studienenddatum & Benachrichtigung zum Studienende festlegen

Im Tab **Details** der Studie:

**Schritt 1.** Das **Study end date** setzen. Der Schedule-Kalender projiziert dann keine Termine mehr nach diesem Datum.

**Schritt 2.** **Send end-of-study notification** aktivieren und Titel sowie Text der Benachrichtigung ausfüllen.

**Schritt 3.** Auf **Save** klicken.

Die Benachrichtigung wird lokal auf dem Gerät jeder teilnehmenden Person eingeplant (kein Server-Push) — beim nächsten App-Start nach dem Enddatum oder einer Textänderung — und löst automatisch am Enddatum aus, auch wenn die Person an diesem Tag offline ist. Wird die Einstellung deaktiviert oder das Enddatum entfernt, wird die anstehende Benachrichtigung beim nächsten App-Start der teilnehmenden Person storniert.

---

## 5. Gespendete Gewohnheiten überwachen

Das Gewohnheits-Dashboard zeigt alle gespendeten Gewohnheiten aller Teilnehmer mit Filter- und Exportfunktionen.

**Schritt 1.** Tippen Sie im Admin-Panel auf **Gewohnheiten** in der Seitenleiste.

**Schritt 2.** Die Liste zeigt alle Gewohnheitsspenden sortiert nach Einreichungsdatum (neueste zuerst). Jede Zeile zeigt: Pseudonym, Gewohnheitstext, Studiengruppe, BCIO-Kategorie und Einreichungszeitstempel.

| Screenshot | Beschriftungen |
|---|---|
| ![Gewohnheitsliste](../assets/screenshots/admin/05-habits-list.png) | **(1)** Gesamtanzahl der Spenden. **(2)** Liste der Gewohnheitsspenden mit Gruppen- und BCIO-Kategoriespalten. **(3)** Sortiersteuerelemente (nach Datum, Gruppe oder Kategorie). **(4)** Filterleiste (siehe unten). **(5)** CSV-Export-Button. |

*Abbildung 5a: Gewohnheits-Überwachungsliste.*

### Gewohnheiten filtern

**Schritt 1.** Verwenden Sie die Filterleiste oberhalb der Liste, um Ergebnisse einzugrenzen:
- **Gruppenfilter:** G1, G2, G3, G4 oder Alle auswählen.
- **BCIO-Kategoriefilter:** Eine BCT-Taxonomiekategorie oder Alle auswählen.
- **Datumsbereich:** Start- und Enddatum festlegen, um nach Spendendatum zu filtern.

**Schritt 2.** Die Liste aktualisiert sich in Echtzeit, wenn Sie die Filter ändern.

| Screenshot | Beschriftungen |
|---|---|
| ![Gewohnheits-Filterleiste](../assets/screenshots/admin/05-habits-filter.png) | **(1)** Gruppenfilter-Dropdown. **(2)** BCIO-Kategorie-Dropdown. **(3)** Startdatum-Auswahl. **(4)** Enddatum-Auswahl. **(5)** Filter zurücksetzen-Button. |

*Abbildung 5b: Filtersteuerelemente im Gewohnheits-Dashboard.*

### Als CSV exportieren

**Schritt 1.** Wenden Sie die gewünschten Filter an (oder lassen Sie alle auf „Alle", um alles zu exportieren).

**Schritt 2.** Tippen Sie auf **CSV exportieren**. Der Browser lädt `habits_export_<date>.csv` herunter.

Die CSV-Datei enthält folgende Spalten: `participant_pseudonym`, `study_group`, `habit_text`, `bcio_category`, `submitted_at`, `annotation_text` (nur G3/G4).

| Screenshot | Beschriftungen |
|---|---|
| ![CSV-Export Bestätigung](../assets/screenshots/admin/05-habits-export.png) | **(1)** CSV exportieren-Button. **(2)** Zeilenanzahl vor dem Export angezeigt (bestätigt den Umfang). **(3)** Download-Fortschrittsanzeige. |

*Abbildung 5c: Auslösen eines CSV-Exports.*

---

## 6. Teilnehmerfortschritt verfolgen

Die Teilnehmerfortschritts-Ansicht zeigt Aktivitätszusammenfassungen für jeden Teilnehmer, um inaktive oder in Schwierigkeiten befindliche Teilnehmer zu identifizieren.

**Schritt 1.** Tippen Sie im Admin-Panel auf **Teilnehmer** und öffnen Sie die Detailansicht eines Teilnehmers.

**Schritt 2.** Scrollen Sie zum Abschnitt **Aktivität**. Er zeigt:
- **Datum der ersten Anmeldung** (oder „Noch nicht angemeldet")
- **Profilfragebogen ausgefüllt** (Ja / Nein)
- **Gespendete Gewohnheiten** (Gesamtzahl und pro Woche)
- **Datum der letzten Aktivität**
- **Anzahl angenommener / abgelehnter Empfehlungen**

| Screenshot | Beschriftungen |
|---|---|
| ![Teilnehmerfortschritt-Ansicht](../assets/screenshots/admin/06-participant-progress.png) | **(1)** Datum der ersten Anmeldung (oder „Noch nicht angemeldet"-Banner). **(2)** Profilabschluss-Badge — grünes Häkchen, wenn ausgefüllt. **(3)** Gespendete Gewohnheiten — Nummerierungs-Badge mit wöchentlichem Sparkline. **(4)** Empfehlungsbereich — Verhältnisbalken angenommen vs. abgelehnt. **(5)** Zeitstempel der letzten Aktivität. |

*Abbildung 6: Teilnehmer-Aktivitätszusammenfassung.*

> **Tipp:** Verwenden Sie den Filter **„Noch keine Anmeldungen"** in der Teilnehmerlistenansicht (Gruppenfilter → Status: Noch nie angemeldet), um Teilnehmer zu identifizieren, die ihre Token-Karten noch nicht aktiviert haben.

---

## 7. Gerätesitzungen widerrufen

Wenn ein Teilnehmer seine Token-Karte verliert oder ein Gerät kompromittiert wird, können Sie seine aktiven Sitzungen widerrufen. Dies erzwingt eine erneute Authentifizierung mit einem neuen Token.

**Schritt 1.** Öffnen Sie die Detailansicht des Teilnehmers (Admin-Panel → Teilnehmer → Teilnehmer auswählen).

**Schritt 2.** Tippen Sie auf **Alle Sitzungen widerrufen**. Ein Bestätigungsdialog erscheint: *„Dadurch wird der Teilnehmer sofort von allen Geräten abgemeldet. Fortfahren?"*

**Schritt 3.** Tippen Sie auf **Bestätigen**. Die Keycloak-Sitzungen des Teilnehmers werden beendet. Er erhält beim nächsten App-Aufruf die Meldung „Ungültige Sitzung".

**Schritt 4.** Wenn der Teilnehmer eine neue Token-Karte benötigt (z. B. Karte verloren), tippen Sie auf **Token erneuern**, um ein neues zufälliges Passwort auszustellen, und laden Sie dann die aktualisierte Token-Karte herunter (Abschnitt 2).

| Screenshot | Beschriftungen |
|---|---|
| ![Sitzungen widerrufen Bereich](../assets/screenshots/admin/07-revoke-session.png) | **(1)** Anzahl aktiver Sitzungen — zeigt, wie viele Geräte aktuell authentifiziert sind. **(2)** Alle Sitzungen widerrufen-Button (rot, destruktive Aktion). **(3)** Bestätigungsdialog mit Teilnehmer-Pseudonym. **(4)** Token erneuern-Button — gibt ein neues Passwort aus, ohne bestehende Sitzungen zu widerrufen. |

*Abbildung 7: Widerruf der aktiven Gerätesitzungen eines Teilnehmers.*

> **Warnung:** Das Widerrufen von Sitzungen ist sofort und unwiderruflich. Der Teilnehmer benötigt seine neue Token-Karte, um sich wieder anzumelden.

---

## 8. Token-Karten-Format in den Einstellungen konfigurieren

Das Token-Karten-PDF-Layout — Logo, Schriftgröße, QR-Code-Position und Farbschema — kann in den Admin-Einstellungen ohne Code-Änderungen angepasst werden.

> **Hinweis:** Token-Karten-Formateinstellungen gelten für alle neuen Teilnehmer, die nach dem Speichern der Einstellungen erstellt werden. Vorhandene Token-Karten-PDFs (die zum Zeitpunkt der Teilnehmererstellung generiert wurden) werden nicht rückwirkend aktualisiert. Um ein neues Format auf einen bestehenden Teilnehmer anzuwenden, verwenden Sie **Token erneuern** in dessen Detailansicht und laden Sie dann die Token-Karte erneut herunter.

**Schritt 1.** Tippen Sie im Admin-Panel auf **Einstellungen** (Zahnrad-Symbol in der Seitenleisten-Fußzeile).

**Schritt 2.** Unter **Token-Karten-Format** können Sie Folgendes konfigurieren:

| Einstellung | Beschreibung | Standard |
|---|---|---|
| Logo-URL | URL oder Base64 des oben auf der Karte angezeigten Logo-Bilds | HHH-Schild-Logo |
| Primärfarbe | Hex-Farbe für Kopfzeile und QR-Code-Rahmen | `#1A73E8` |
| Schriftgröße | Textkörper-Schriftgröße in pt | `11` |
| QR-Code-Größe | QR-Block-Pixelgröße (80–200) | `120` |
| Fußzeilen-Text | Benutzerdefinierter Text unten auf der Karte (z. B. Studienkontakt) | `"Contact: study@tu-dresden.de"` |
| Klartext-Zugangsdaten anzeigen | Benutzername/Passwort unterhalb des QR-Codes anzeigen | `true` |

**Schritt 3.** Tippen Sie auf **Token-Karte vorschau**, um eine Live-Vorschau-PDF mit den aktuellen Einstellungen für einen Beispiel-Teilnehmer zu sehen.

**Schritt 4.** Tippen Sie auf **Einstellungen speichern**. Alle danach erstellten Teilnehmer erhalten Token-Karten im neuen Format.

| Screenshot | Beschriftungen |
|---|---|
| ![Token-Karten-Einstellungen](../assets/screenshots/admin/08-token-card-settings.png) | **(1)** Logo-URL-Eingabe mit Inline-Bildvorschau. **(2)** Primärfarbe-Farbauswahl. **(3)** QR-Code-Größen-Schieberegler. **(4)** Fußzeilen-Text-Eingabe. **(5)** Klartext-Zugangsdaten anzeigen-Toggle. **(6)** Token-Karte vorschau-Button — öffnet die PDF-Vorschau in einem neuen Tab. **(7)** Einstellungen speichern-Button. |

*Abbildung 8: Token-Karten-Format-Einstellungen.*

---

## 9. Spracheinstellungen für Teilnehmer

Die App unterstützt Englisch und Deutsch. Jeder Teilnehmer kann seine bevorzugte Anzeigesprache unabhängig einstellen. Die Sprachpräferenz wird serverseitig gespeichert (MongoDB-Collection `users`) und wird auf alle Anzeigetexte von Gewohnheiten (Feld `displayText`), Fragebogen-Bezeichnungen und Benutzeroberflächentexte angewendet.

### Wie Teilnehmer ihre Sprache ändern

**Schritt 1.** In der mobilen App tippt der Teilnehmer auf den **Einstellungen**-Tab (Zahnrad-Symbol in der unteren Navigationsleiste).

**Schritt 2.** Auf dem Einstellungsbildschirm zeigt ein **Sprache**-Dropdown die aktuell ausgewählte Sprache an.

**Schritt 3.** Der Teilnehmer wählt **English** oder **Deutsch**. Die Änderung wird sofort gespeichert und eine Bestätigungsmeldung („Einstellungen gespeichert") erscheint.

**Schritt 4.** Die App-Oberfläche und alle Gewohnheits-Übersetzungen wechseln zur ausgewählten Sprache, ohne dass ein Neustart erforderlich ist.

| Einstellung | Beschreibung |
|---|---|
| English | Alle Texte und Gewohnheits-Anzeigetexte auf Englisch. Gespendete Gewohnheiten werden mit englischer Übersetzung (`translationEN`) angezeigt, falls vorhanden, sonst Originaltext. |
| Deutsch | Alle Texte und Gewohnheits-Anzeigetexte auf Deutsch. Gespendete Gewohnheiten werden mit deutscher Übersetzung (`translationDE`) angezeigt, falls vorhanden, sonst Originaltext. |

> **Hinweis für Admins:** Die Sprachpräferenz eines Teilnehmers kann nicht aus dem Admin-Panel heraus gesetzt werden. Sprache ist eine persönliche Einstellung, die jeder Teilnehmer in seinem eigenen Einstellungsbildschirm konfiguriert. Falls ein Teilnehmer meldet, dass Inhalte in der falschen Sprache angezeigt werden, bitten Sie ihn, die Einstellungen zu öffnen und die bevorzugte Sprache erneut auszuwählen.

> **Technischer Hinweis:** Das Backend speichert die Präferenz als `preferredLanguage: 'en'` oder `preferredLanguage: 'de'` in der MongoDB-Collection `users` (indiziert nach Keycloak-Subject-ID). Der Query-Parameter `GET /api/v1/habits?lang=de` wird von der Flutter-App automatisch anhand der gespeicherten Präferenz gesetzt — er muss nicht manuell konfiguriert werden.

---

## 10. Verwaltung des Cue-Pools

Der Cue-Pool ist eine Bibliothek vorbewerteter kontextueller Cues, die von der Empfehlungs-Engine verwendet wird. Er ist sowohl für die Rolle `admin` als auch für `researcher` über **Cue-Pools** in der linken Seitenleiste zugänglich.

### Cues anzeigen und filtern

Die Liste zeigt für jeden Cue den Text, ein Qualitäts-Badge (hoch / niedrig), die Dimensionswerte (Stabilität, Auffälligkeit, Spezifität auf einer Skala von 1–5), die Domäne und die Sprache. Verwenden Sie die Dropdowns **Qualität** und **Sprache** oberhalb der Liste, um die angezeigten Zeilen zu filtern.

### Einen einzelnen Cue erstellen

**Schritt 1.** Tippen Sie auf **+ Cue hinzufügen**.

**Schritt 2.** Füllen Sie das Formular aus:

| Feld | Gültige Werte |
|---|---|
| Text | Freitext — der Cue-Satz |
| Qualität | `low` oder `high` |
| Domäne | z. B. `health`, `fitness`, `nutrition` |
| Sprache | z. B. `en`, `de` |
| Stabilität | Ganzzahl 1–5 |
| Auffälligkeit | Ganzzahl 1–5 |
| Spezifität | Ganzzahl 1–5 |

**Schritt 3.** Tippen Sie auf **Erstellen**. Der Cue erscheint sofort in der Liste.

### CSV-Massenimport

**Schritt 1.** Tippen Sie auf **CSV importieren** und wählen Sie eine `.csv`-Datei von Ihrem Computer aus.

Die Datei muss folgende Spalten enthalten (die Reihenfolge ist unerheblich):

```
text,quality,stability,salience,specificity,domain,language
```

Gültige Werte: `quality` muss `low` oder `high` sein; die Dimensionswerte müssen Ganzzahlen von 1–5 sein.

**Schritt 2.** Nach dem Hochladen zeigt ein Ergebnisdialog die Anzahl der **eingefügten** und **übersprungenen** Zeilen an (übersprungene Zeilen weisen Validierungsfehler auf und werden einzeln aufgeführt).

### Einen Cue löschen

Tippen Sie in einer Cue-Zeile auf das **Löschen**-Symbol (Papierkorb) und bestätigen Sie den Dialog. Das Löschen erfolgt sofort und ist endgültig.

---

## 11. Studienbedingungen konfigurieren (Cue-Konfiguration)

> **Empfehlungssystem-Schalter (auf Studienebene).** Der Tab **Details** der Studie enthält die Checkbox *„Empfehlungssystem für diese Studie aktivieren"*. Ist sie deaktiviert, sehen die in dieser Studie eingeschriebenen Teilnehmenden den Empfehlungsbildschirm (den Tab „Empfehlungen") in der App nicht mehr. Die Einstellung gilt für die gesamte Studie (alle Gruppen) und ist standardmäßig aktiviert; die Änderung wird wirksam, sobald die App der teilnehmenden Person das nächste Mal ihre Konfiguration aktualisiert.

Jede Studiengruppe kann eigene Einstellungen zur Cue-Zustellung haben. Diese werden im Tab **Cue-Konfiguration** innerhalb des Bearbeitungsdialogs einer Studie verwaltet.

**Schritt 1.** Navigieren Sie im Admin-Panel zu **Studien**.

**Schritt 2.** Öffnen Sie eine Studie durch Klick auf ihre Zeile und klicken Sie anschließend auf den Tab **Cue-Konfiguration**.

**Schritt 3.** Konfigurieren Sie für jede aufgeführte Gruppe die folgenden Einstellungen:

| Einstellung | Optionen | Beschreibung |
|---|---|---|
| Cue-Anzahl | Einzeln / Multi | Ob Teilnehmende pro Sitzung einen oder mehrere Cues sehen |
| Cue-Quelle | `low_quality` / `high_quality` / `self_selected` | Pool, aus dem die Cues stammen |
| Erlaubte Verhaltensweisen | Checkliste | Verhaltenstypen, die Teilnehmende für diese Gruppe protokollieren dürfen |
| Max. Gewohnheiten | 1 / Unbegrenzt | `1` beschränkt Teilnehmende auf die Studienbedingungen; Unbegrenzt entspricht dem öffentlichen App-Erlebnis |

**Schritt 4.** Tippen Sie für jede Gruppe einzeln auf den **Speichern**-Button. Die Einstellungen anderer Gruppen bleiben davon unberührt.

---

## 12. Studien-Analytik einsehen

Die eigenständige **Analytik**-Seite (`/analytics`) ist das primäre Dashboard zur Studienüberwachung. Sie ist sowohl für die Rolle `admin` als auch für `researcher` zugänglich.

**Schritt 1.** Klicken Sie in der linken Seitenleiste auf **Analytik**.

**Schritt 2.** Wählen Sie oben auf der Seite eine Studie aus dem Dropdown aus. Alle Diagramme und die Teilnehmertabelle aktualisieren sich automatisch.

### KPI-Kacheln

| Kachel | Was sie zeigt |
|---|---|
| Eingeschrieben insgesamt | Alle Teilnehmenden, die aktuell in der Studie aktiv sind |
| Aktiv (letzte 7 Tage) | Prozentsatz, der in der vergangenen Woche mindestens ein Verhalten protokolliert hat (gelb ab 10 % Inaktivität, rot ab 20 %) |
| Anzahl / Rate der Studienabbrüche | Kumulierte Abbruchzahlen; die Rate ist farbcodiert |
| Ø SRHI (letzte Woche) | Durchschnittlicher Selbstbericht-Score zur Gewohnheitsstärke über alle Gruppen zum jüngsten wöchentlichen Messzeitpunkt |
| Fragebogen-Rücklaufquote | Durchschnittliche Rücklaufquote über alle zugewiesenen Fragebögen |

### Diagramme

| Diagramm | Was es zeigt |
|---|---|
| Wöchentliche Aktivrate | Balkendiagramm — Prozentsatz der eingeschriebenen Teilnehmenden pro Gruppe, die in den letzten 7 Tagen aktiv waren |
| SRHI-Verlauf | Liniendiagramm — mittlerer SRHI-Score pro Gruppe und Woche; gestrichelte Referenzlinie bei Score 4 (Gewohnheitsschwelle) |
| Kumulierte Studienabbrüche | Stufendiagramm — laufende Abbruchzahl pro Gruppe im Zeitverlauf |
| Fragebogen-Rücklaufquote | Horizontales Balkendiagramm — Rücklaufquote pro Fragebogen |

### Teilnehmertabelle und Detail-Panel

Die Tabelle unterhalb der Diagramme listet alle eingeschriebenen Teilnehmenden mit Benutzername, Gruppe, Einschreibedatum, Datum der letzten Aktivität, einer eingebetteten Fortschrittsleiste für den Fragebogen-Abschluss sowie einem Status-Badge. Klicken Sie auf eine beliebige Zeile, um das Teilnehmerdetail-Panel zu öffnen (eine vollständige Beschreibung der Panel-Inhalte, einschließlich des Bereichs **Erinnerungen**, finden Sie in Abschnitt 6).

---

## 13. Benachrichtigungen an Teilnehmende senden

Push-Benachrichtigungen können über den Tab **Benachrichtigungen** im Bearbeitungsdialog einer Studie an Studienteilnehmende gesendet werden. Dies steht den Rollen `admin` und `researcher` zur Verfügung.

### Eine Benachrichtigung verfassen und senden

**Schritt 1.** Navigieren Sie zu **Studien**, öffnen Sie eine Studie und klicken Sie auf den Tab **Benachrichtigungen**.

**Schritt 2.** Geben Sie einen **Titel** und einen **Text** für die Push-Benachrichtigung ein.

**Schritt 3.** Wählen Sie die Zielgruppe:

| Zieloption | Wer sie erhält |
|---|---|
| Alle Teilnehmenden | Jede Person, die aktuell in der Studie eingeschrieben ist |
| Bestimmte Gruppe | Nur Teilnehmende der ausgewählten Gruppe (z. B. G1) |
| Alle in der Studie Eingeschriebenen | Synonym zu „Alle Teilnehmenden" — zur Klarheit bei Konfigurationen mit mehreren Studien enthalten |

**Schritt 4.** Wählen Sie den Sendezeitpunkt:
- **Sofort senden** — wählen Sie bei **Sendezeitpunkt** die Option **Jetzt** und tippen Sie auf **Senden**; der Versand beginnt innerhalb weniger Sekunden.
- **Planen** — aktivieren Sie die Datums-/Uhrzeitauswahl, indem Sie die Option **Planen** wählen, legen Sie das gewünschte Datum und die Uhrzeit fest und tippen Sie dann auf **Senden**.

### Geplante Kampagnen verwalten

Ausstehende Kampagnen werden im unteren Bereich des Tabs **Benachrichtigungen** aufgelistet. Jede Zeile zeigt Datum/Uhrzeit der geplanten Versendung, Zielgruppe und Status. Um eine ausstehende Kampagne zu stornieren, tippen Sie in ihrer Zeile auf **Abbrechen**.

---

## 14. Das Erlebnis der öffentlichen App konfigurieren

Die Seite **App-Einstellungen** (Bereich „Öffentliche App" in der Seitenleiste, Smartphone-Symbol) steuert das Erlebnis für App-Store-Nutzer, die in keiner Studie eingeschrieben sind. Nur `admin`-Konten können diese Seite sehen und ändern. Öffentliche Nutzer geben ihre Gewohnheit und Auslöser immer als Freitext ein — eine Auslöser- oder Verhaltenskonfiguration existiert nur pro Studiengruppe (Abschnitt 11, Cue-Konfiguration).

**Schritt 1.** Klicken Sie im Admin-Panel in der Seitenleiste unter **Öffentliche App** auf **App-Einstellungen**.

**Schritt 2.** Aktivieren oder deaktivieren Sie im Abschnitt **Funktionen** die folgenden Optionen:

| Einstellung | Beschreibung |
|---|---|
| Geführter Assistent für Vorsatzbildung | Wenn aktiviert, werden öffentliche Nutzer durch einen schrittweisen Assistenten geführt (Gewohnheit → Auslöser → KI-Verknüpfung → Bestätigung → Erinnerung). Gewohnheit und Auslöser sind für öffentliche Nutzer immer Freitext; das Deaktivieren überspringt nur den KI-Verknüpfungsschritt. |
| Community-Teilen-Option standardmäßig angezeigt | Wenn aktiviert, erscheint der Community-Teilen-Schalter am Ende der Gewohnheitserstellung und ist bereits vorausgewählt. |

Tippen Sie auf **Änderungen speichern**, um die Einstellungen zu übernehmen.

**Schritt 3.** Legen Sie im Abschnitt **Standardwerte** die **Standard-Erinnerungszeit** fest — die Tageszeit für die tägliche Check-in-Push-Benachrichtigung (Teilnehmende können dies in ihrem eigenen Profil überschreiben).

Tippen Sie auf **Änderungen speichern**, um die Einstellungen zu übernehmen. Änderungen werden sofort für alle öffentlichen Nutzer in ihrer nächsten Sitzung wirksam — weder ein App-Neustart noch eine erneute Einschreibung sind erforderlich.

---

## 15. Backups verwalten

> **Nur Admin.** Die Backups-Seite ist für `researcher`-Konten ausgeblendet — Backups enthalten den vollständigen Datenbankinhalt, weshalb dieser Bereich strenger eingeschränkt ist als die meisten anderen Admin-Seiten.

**Schritt 1.** Tippen Sie im Admin-Panel in der Seitenleiste (unter Überwachung) auf **Backups**.

Die Seite zeigt:

| Bereich | Inhalt |
|---|---|
| Letztes Backup | Datum, Alter, Größe, Auslöser, Status pro Komponente (Mongo / LightRAG / Neo4j / Keycloak) sowie einen **Herunterladen**-Button |
| Alle Backups | Jedes Backup, das sich noch innerhalb des Aufbewahrungsfensters befindet, einschließlich selbst hochgeladener Backups, jeweils mit eigenem **Herunterladen**-Button |
| Letzte Aktivitäten | Wer was ausgelöst, wiederhergestellt, hochgeladen oder heruntergeladen hat und ob es erfolgreich war |

> **Aufbewahrung.** Automatische (geplante) Backups, die älter als das Aufbewahrungsfenster sind, werden automatisch gelöscht, und — unabhängig davon — werden stets nur die 10 neuesten geplanten Backups aufbewahrt, unabhängig von ihrem Alter, damit die Liste nicht unbegrenzt wächst. Manuelle und hochgeladene Backups unterliegen dieser Anzahlbegrenzung nicht.

### Ein Backup manuell auslösen

**Schritt 1.** Tippen Sie auf **Backup jetzt auslösen**. Dies ist deaktiviert, solange bereits ein anderes Backup oder eine Wiederherstellung läuft.

**Schritt 2.** Eine Fortschrittsanzeige verfolgt das Backup Schritt für Schritt (z. B. „Schritt 3 von 5 — Neo4j wird gesichert") und aktualisiert sich automatisch; nach Abschluss wechselt sie zu **Fertig**. Es ist nichts weiter zu tun.

### Ein Backup herunterladen

Tippen Sie neben einem beliebigen Backup — der hervorgehobenen Zeile „Letztes Backup" oder einer beliebigen Zeile in der Liste „Alle Backups" — auf **Herunterladen**, um dessen `.tar.gz`-Archiv lokal zu speichern, zum Beispiel um eine Kopie außerhalb des Systems aufzubewahren. Der Download wird unter **Letzte Aktivitäten** protokolliert.

### Ein Backup hochladen

Sie können ein `.tar.gz`-Backup-Archiv hochladen — zum Beispiel eines, das aus einem externen Speicher heruntergeladen oder aus einer anderen Umgebung kopiert wurde —, damit es von hier aus wiederhergestellt werden kann.

**Schritt 1.** Wählen Sie die Datei aus und tippen Sie auf **Backup hochladen**.

**Schritt 2.** Das Archiv wird vor der Annahme geprüft: Es muss mindestens eine erkennbare Backup-Komponente enthalten (MongoDB-Dump, Neo4j-Dump, LightRAG-Index oder Keycloak-Realm-Export) und wird auf unsichere Dateipfade darin überprüft. Alles, was diese Prüfung nicht besteht, wird mit einer Erklärung abgelehnt, statt gespeichert zu werden.

> **Hochgeladene Backups werden als „erkannt, nicht verifiziert" gekennzeichnet.** Die Plattform kann erkennen, welche Komponenten in einer hochgeladenen Datei enthalten sind, aber — anders als bei einem Backup, das diese Instanz selbst erstellt hat — kann sie erst nach einer Wiederherstellung bestätigen, ob diese Daten tatsächlich intakt sind.

### Aus einem Backup wiederherstellen

> **Dies ist destruktiv.** Eine Wiederherstellung überschreibt die aktuellen MongoDB-, Neo4j- und LightRAG-Daten (und, sofern Sie nicht widersprechen, den Keycloak-Realm) mit dem Inhalt des ausgewählten Backups. Lesen Sie diesen gesamten Abschnitt, bevor Sie Ihre erste Wiederherstellung durchführen.

**Schritt 1.** Suchen Sie das Backup in der Liste und tippen Sie auf **Wiederherstellen**.

**Schritt 2.** Zunächst wird immer automatisch ein Sicherheits-Backup des *aktuellen* Zustands erstellt — die Wiederherstellung wird nur fortgesetzt, wenn dieses Sicherheits-Backup erfolgreich ist, sodass eine missglückte Wiederherstellung stets rückgängig gemacht werden kann. Dies verlängert die Zeit, bevor die eigentliche Wiederherstellung beginnt.

**Schritt 3.** Wenn das Backup, das Sie wiederherstellen, eine bekannt fehlgeschlagene Komponente enthält (z. B. ist Neo4j bei der ursprünglichen Erstellung fehlgeschlagen), zeigt der Dialog eine Warnung an, und Sie müssen explizit **Trotzdem wiederherstellen** aktivieren, um fortzufahren.

**Schritt 4.** Entscheiden Sie speziell bei einem **hochgeladenen** Backup, ob Sie **Auch den Keycloak-Realm aus dieser Datei neu importieren** aktivieren möchten — standardmäßig ist dies deaktiviert. Ein Keycloak-Realm-Export kann Client-Secrets und Benutzerkonten enthalten; das erneute Importieren eines Exports aus einer Datei, die Sie nicht selbst erzeugt haben, könnte einem Angreifer Admin-Zugriff verschaffen, falls die Datei manipuliert wurde. Lassen Sie die Option deaktiviert, außer Sie müssen Keycloak gezielt aus genau dieser Datei wiederherstellen und vertrauen deren Herkunft.

**Schritt 5.** Geben Sie den exakten Dateinamen des Backups in das Bestätigungsfeld ein — der **Wiederherstellen**-Button bleibt deaktiviert, bis er exakt übereinstimmt — und tippen Sie dann auf **Wiederherstellen**.

**Schritt 6.** Die Seite zeigt den Live-Fortschritt (Sicherheits-Backup → Wiederherstellung → Fertig). Während eine Wiederherstellung läuft, verweigert die übrige Plattform kurzzeitig neue Anfragen, um zu vermeiden, dass die im Hintergrund ausgetauschte Datenbank in einen Wettlaufzustand gerät; dies hebt sich automatisch auf, sobald die Wiederherstellung abgeschlossen ist.

Jeder Auslöse-, Upload- und Wiederherstellungsvorgang — ob erfolgreich oder nicht — wird in der Tabelle **Letzte Aktivitäten** mit Angabe von Person und Zeitpunkt protokolliert.

---

*Health Habit Hub — Admin-Handbuch v1.2 · TU Dresden · 2026*
