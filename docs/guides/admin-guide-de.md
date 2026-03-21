# Health Habit Hub — Administrationshandbuch

Dieses Handbuch fuehrt Forschende und Administrierende durch alle alltaeglichen Aufgaben in der Health Habit Hub Plattform. Fuer die hier beschriebenen Vorgaenge ist keine Entwickleruntersteutzung erforderlich.

---

## Schnellstart: Einrichtung einer neuen Studie-Kohorte

Verwenden Sie diese Checkliste beim Start einer neuen Teilnehmerkohorte.

1. **Als Admin anmelden** — oeffnen Sie `https://hhh.tu-dresden.de/admin` und authentifizieren Sie sich mit Ihren Admin-Zugangsdaten (Abschnitt 1).
2. **Teilnehmerkonten erstellen** — erstellen Sie fuer jeden Teilnehmer ein Konto ueber *Teilnehmer → Neuer Teilnehmer* und notieren Sie das generierte Token (Abschnitt 2).
3. **Token-Karten herunterladen und verteilen** — laden Sie die druckbare PDF-Token-Karte fuer jeden Teilnehmer herunter und verteilen Sie sie physisch oder per Post (Abschnitt 2).
4. **Studiengruppen zuweisen** — weisen Sie jedem Teilnehmer eine der vier Studiengruppen (G1–G4) in der Detailansicht des Teilnehmers zu (Abschnitt 3).
5. **Fragebögen erstellen oder veroeffentlichen** — richten Sie den Basisprofil-Survey und alle Folgefragebögen ein; weisen Sie sie den richtigen Gruppen zu (Abschnitt 4).
6. **Erste Anmeldungen pruefen** — oeffnen Sie das Teilnehmerfortschritts-Dashboard und bestaetigen Sie, dass der erste Login jedes Teilnehmers registriert wurde (Abschnitt 6).
7. **Gewohnheitsspenden beobachten** — sobald die Studie laeuft, nutzen Sie das Gewohnheits-Dashboard, um die Spendenanzahl pro Gruppe zu pruefen (Abschnitt 5).
8. **Daten fuer die Analyse exportieren** — verwenden Sie den CSV-Export-Button, um gespendete Gewohnheiten fuer Offline-Analysen herunterzuladen (Abschnitt 5).

---

## Inhaltsverzeichnis

1. [Als Admin anmelden](#1-als-admin-anmelden)
2. [Teilnehmer erstellen und Token-Karte herunterladen](#2-teilnehmer-erstellen-und-token-karte-herunterladen)
3. [Studiengruppen zuweisen](#3-studiengruppen-zuweisen)
4. [Fragebögen konfigurieren](#4-fragebögen-konfigurieren)
5. [Gespendete Gewohnheiten ueberwachen](#5-gespendete-gewohnheiten-ueberwachen)
6. [Teilnehmerfortschritt verfolgen](#6-teilnehmerfortschritt-verfolgen)
7. [Gerätesitzungen widerrufen](#7-gerätesitzungen-widerrufen)
8. [Token-Karten-Format in den Einstellungen konfigurieren](#8-token-karten-format-in-den-einstellungen-konfigurieren)
9. [Spracheinstellungen fuer Teilnehmer](#9-spracheinstellungen-fuer-teilnehmer)
8. [Token-Karten-Format in den Einstellungen konfigurieren](#8-token-karten-format-in-den-einstellungen-konfigurieren)

---

## 1. Als Admin anmelden

Das Admin-Panel ist nur fuer Benutzer mit der Keycloak-Rolle `admin` oder `researcher` zugaenglich. Teilnehmer koennen keine Admin-Ansicht aufrufen, auch wenn sie die URL direkt aufrufen.

**Schritt 1.** Oeffnen Sie einen Browser und navigieren Sie zu `https://hhh.tu-dresden.de` (oder `http://localhost:3000` in der Entwicklungsumgebung).

**Schritt 2.** Geben Sie im Anmeldebildschirm Ihren **Admin-Benutzernamen** und Ihr **Passwort** ein (keine Token-Karte — Admin-Konten verwenden ein regulaeres Passwort, das in Keycloak festgelegt wird). Tippen Sie auf **Anmelden**.

**Schritt 3.** Nach der Anmeldung zeigt die Navigationsleiste einen zusaetzlichen **Admin**-Tab (Zahnrad-Symbol). Tippen Sie darauf, um das Admin-Panel zu oeffnen.

| Screenshot | Beschriftungen |
|---|---|
| ![Admin-Anmeldebildschirm](../assets/screenshots/admin/01-admin-login.png) | **(1)** Benutzernamenfeld — geben Sie Ihren Admin-Kontonamen ein. **(2)** Passwortfeld — geben Sie Ihr Admin-Passwort ein (keine Token-Karte). **(3)** Anmelden-Button — tippen Sie zum Authentifizieren. **(4)** HHH-Logo und Versionsnummer oben auf der Anmeldekarte. |

*Abbildung 1: Admin-Anmeldebildschirm. Die Beschriftungsnummern entsprechen der obigen Tabelle.*

> **Tipp:** Wenn Sie "Ungueltige Zugangsdaten" sehen, pruefen Sie, ob Sie ein Admin-Konto verwenden (kein Teilnehmer-Token). Teilnehmer-Token sind Einmal-Token und koennen nicht fuer Admin-Anmeldungen verwendet werden.

---

## 2. Teilnehmer erstellen und Token-Karte herunterladen

Jeder Studienteilnehmer benoetigt ein Konto und eine druckbare Token-Karte mit QR-Code-Zugangsdaten.

**Schritt 1.** Tippen Sie im Admin-Panel auf **Teilnehmer** in der linken Seitenleiste.

**Schritt 2.** Tippen Sie oben rechts auf den Button **+ Neuer Teilnehmer**.

**Schritt 3.** Geben Sie den **Anzeigenamen** ein (optional, nur fuer Ihre Referenz — Teilnehmer sind pseudonymisiert) und waehlen Sie die **Studiengruppe** aus (dies kann spaeter geaendert werden; siehe Abschnitt 3).

**Schritt 4.** Tippen Sie auf **Erstellen**. Das System generiert einen pseudonymen Benutzernamen (z. B. `p-2024-0042`) und ein Einmal-Zugriffstoken.

| Screenshot | Beschriftungen |
|---|---|
| ![Teilnehmer erstellen Formular](../assets/screenshots/admin/02-create-participant.png) | **(1)** Anzeigenamen-Feld — nur fuer Forschende sichtbar; wird dem Teilnehmer nicht angezeigt. **(2)** Studiengruppen-Dropdown — Standardwert G1; kann spaeter geaendert werden. **(3)** Erstellen-Button — generiert Zugangsdaten und erstellt das Keycloak-Konto. |

*Abbildung 2a: Formular zum Erstellen eines neuen Teilnehmers.*

**Schritt 5.** Nach der Erstellung oeffnet sich automatisch die Detailansicht des Teilnehmers. Tippen Sie auf **Token-Karte herunterladen**, um eine druckbare PDF-Datei zu erhalten.

**Schritt 6.** Drucken Sie die Token-Karte und uebergeben Sie sie dem Teilnehmer. Die Karte enthaelt:
- Das Studienlogo und das Teilnehmer-Pseudonym
- Einen QR-Code, der `hhh://login?user=<benutzername>&token=<passwort>` kodiert
- Den Benutzernamen und das Passwort im Klartext (fuer die manuelle Eingabe)

| Screenshot | Beschriftungen |
|---|---|
| ![Token-Karte herunterladen Button](../assets/screenshots/admin/02-download-token-card.png) | **(1)** Teilnehmer-Pseudonym und interne ID. **(2)** Token-Karte herunterladen-Button — generiert die druckbare PDF-Datei. **(3)** Zugangsdaten kopieren-Button — kopiert Benutzername:Passwort in die Zwischenablage fuer digitale Verteilung. **(4)** QR-Code-Vorschau des kodierten Deep Links. |

*Abbildung 2b: Detailansicht des Teilnehmers nach der Erstellung mit dem Token-Karte-Download-Button.*

> **Tipp:** Die Token-Karte kann jederzeit aus der Detailansicht des Teilnehmers erneut heruntergeladen werden. Token laufen nicht ab, solange Sie diese nicht manuell widerrufen.

---

## 3. Studiengruppen zuweisen

Jeder Teilnehmer muss genau einer Studiengruppe (G1–G4) zugewiesen werden. Die Gruppe bestimmt, welche Fragebogenelemente angezeigt werden und wie Gewohnheiten klassifiziert werden.

| Gruppe | Beschreibung |
|---|---|
| G1 | Volle Intervention — strukturierte Gewohnheitsspende |
| G2 | Teilintervention — strukturierte Spende ohne Empfehlungen |
| G3 | Volle Intervention + Freitext-Annotation |
| G4 | Minimale Intervention + Freitext-Annotation |

**Schritt 1.** Tippen Sie im Admin-Panel auf **Teilnehmer** und oeffnen Sie den Teilnehmer, dem Sie eine Gruppe zuweisen moechten.

**Schritt 2.** Tippen Sie auf das **Studiengruppen**-Dropdown (zeigt aktuell die bei der Erstellung zugewiesene Gruppe).

**Schritt 3.** Waehlen Sie die neue Gruppe aus und tippen Sie auf **Speichern**.

| Screenshot | Beschriftungen |
|---|---|
| ![Studiengruppe zuweisen](../assets/screenshots/admin/03-assign-group.png) | **(1)** Teilnehmer-Pseudonym und aktuelles Gruppen-Badge. **(2)** Studiengruppen-Dropdown — G1, G2, G3 oder G4 auswaehlen. **(3)** Speichern-Button — aktualisiert die Gruppe sofort in Keycloak und Neo4j. **(4)** Gruppenänderungsprotokoll mit frueheren Zuweisungen und Zeitstempeln. |

*Abbildung 3: Zuweisung einer Studiengruppe an einen Teilnehmer.*

> **Warnung:** Das Aendern der Gruppe eines Teilnehmers nach Studienbeginn kann die Empfehlungsqualitaet und Datenintegritaet beeintraechtigen. Aendern Sie die Gruppe nur vor dem ersten Login des Teilnehmers, es sei denn, die Studienleitung hat dies angewiesen.

---

## 4. Fragebögen konfigurieren

Fragebögen (Surveys) sind JSON-Schema-gesteuerte Formulare, die Teilnehmern auf den Spenden- und Profilbildschirmen angezeigt werden. Admins koennen Fragebögen erstellen, bearbeiten, veroeffentlichen, archivieren und bestimmten Studiengruppen zuweisen.

### Einen Fragebogen erstellen

**Schritt 1.** Tippen Sie im Admin-Panel auf **Fragebögen** in der Seitenleiste, dann auf **+ Neuer Fragebogen**.

**Schritt 2.** Geben Sie einen **Titel** ein und waehlen Sie einen **Typ** aus: `profile` (auf dem Profilbildschirm angezeigt) oder `habit` (nach der Gewohnheitsspende angezeigt).

**Schritt 3.** Fuegen Sie das **JSON Schema** ein oder tippen Sie es ein, das die Formularfelder definiert. Das Schema muss dem JSON Schema draft-07 Format entsprechen. Jede Eigenschaft wird zu einem Formularfeld.

**Schritt 4.** Tippen Sie auf **Als Entwurf speichern**. Der Fragebogen ist noch nicht fuer Teilnehmer sichtbar.

| Screenshot | Beschriftungen |
|---|---|
| ![Fragebogenliste](../assets/screenshots/admin/04-questionnaire-list.png) | **(1)** Liste aller Fragebögen mit Status-Badges (Entwurf / Veroeffentlicht / Archiviert). **(2)** + Neuer Fragebogen-Button. **(3)** Filterleiste zur Suche nach Titel oder Typ. **(4)** Zeilenaktions-Buttons: Bearbeiten, Veroeffentlichen/Archivieren, Gruppen zuweisen, Loeschen. |

*Abbildung 4a: Fragebogen-Listenansicht.*

| Screenshot | Beschriftungen |
|---|---|
| ![Fragebogen erstellen Formular](../assets/screenshots/admin/04-questionnaire-create.png) | **(1)** Titelfeld. **(2)** Typauswahl (profile / habit). **(3)** JSON Schema-Editor mit Syntaxhervorhebung. **(4)** Vorschau-Button — rendert das Formular so, wie Teilnehmer es sehen werden. **(5)** Als Entwurf speichern-Button. |

*Abbildung 4b: Erstellungsformular fuer einen neuen Fragebogen.*

### Veroeffentlichen und Archivieren

- **Veroeffentlichen:** Tippen Sie auf die Aktion **Veroeffentlichen** bei einem Entwurfs-Fragebogen. Veroeffentlichte Fragebögen sind sofort fuer alle zugewiesenen Gruppen sichtbar.
- **Archivieren:** Tippen Sie auf **Archivieren** bei einem veroeffentlichten Fragebogen, um ihn vor Teilnehmern zu verbergen. Vorhandene Antworten bleiben erhalten.

### Fragebögen Gruppen zuweisen

**Schritt 1.** Tippen Sie in der Fragebogenliste auf **Gruppen zuweisen** fuer den jeweiligen Fragebogen.

**Schritt 2.** Aktivieren Sie die Studiengruppen (G1–G4), die diesen Fragebogen sehen sollen.

**Schritt 3.** Tippen Sie auf **Zuweisung speichern**.

| Screenshot | Beschriftungen |
|---|---|
| ![Fragebogen Gruppen zuweisen](../assets/screenshots/admin/04-questionnaire-assign-groups.png) | **(1)** Fragebogenname oben angezeigt. **(2)** Gruppen-Toggle-Checkboxen (G1–G4). **(3)** Aktuell zugewiesene Gruppen sind teal hervorgehoben. **(4)** Zuweisung speichern-Button. |

*Abbildung 4c: Zuweisung eines Fragebogens an bestimmte Studiengruppen.*

---

## 5. Gespendete Gewohnheiten ueberwachen

Das Gewohnheits-Dashboard zeigt alle gespendeten Gewohnheiten aller Teilnehmer mit Filter- und Exportfunktionen.

**Schritt 1.** Tippen Sie im Admin-Panel auf **Gewohnheiten** in der Seitenleiste.

**Schritt 2.** Die Liste zeigt alle Gewohnheitsspenden sortiert nach Einreichungsdatum (neueste zuerst). Jede Zeile zeigt: Pseudonym, Gewohnheitstext, Studiengruppe, BCIO-Kategorie und Einreichungszeitstempel.

| Screenshot | Beschriftungen |
|---|---|
| ![Gewohnheitsliste](../assets/screenshots/admin/05-habits-list.png) | **(1)** Gesamtanzahl der Spenden. **(2)** Liste der Gewohnheitsspenden mit Gruppen- und BCIO-Kategoriespalten. **(3)** Sortiersteuerelement (nach Datum, Gruppe oder Kategorie). **(4)** Filterleiste (siehe unten). **(5)** CSV-Export-Button. |

*Abbildung 5a: Gewohnheits-Ueberwachungsliste.*

### Gewohnheiten filtern

**Schritt 1.** Verwenden Sie die Filterleiste oberhalb der Liste, um Ergebnisse einzugrenzen:
- **Gruppenfilter:** G1, G2, G3, G4 oder Alle auswaehlen.
- **BCIO-Kategoriefilter:** Eine BCT-Taxonomiekategorie oder Alle auswaehlen.
- **Datumsbereich:** Start- und Enddatum festlegen, um nach Spendendatum zu filtern.

**Schritt 2.** Die Liste aktualisiert sich in Echtzeit, wenn Sie die Filter aendern.

| Screenshot | Beschriftungen |
|---|---|
| ![Gewohnheits-Filterleiste](../assets/screenshots/admin/05-habits-filter.png) | **(1)** Gruppenfilter-Dropdown. **(2)** BCIO-Kategorie-Dropdown. **(3)** Startdatum-Auswahl. **(4)** Enddatum-Auswahl. **(5)** Filter zuruecksetzen-Button. |

*Abbildung 5b: Filtersteuerelemente im Gewohnheits-Dashboard.*

### Als CSV exportieren

**Schritt 1.** Wenden Sie die gewuenschten Filter an (oder lassen Sie alle auf "Alle", um alles zu exportieren).

**Schritt 2.** Tippen Sie auf **CSV exportieren**. Der Browser laedt `habits_export_<datum>.csv` herunter.

Die CSV-Datei enthaelt folgende Spalten: `participant_pseudonym`, `study_group`, `habit_text`, `bcio_category`, `submitted_at`, `annotation_text` (nur G3/G4).

| Screenshot | Beschriftungen |
|---|---|
| ![CSV-Export Bestaetigung](../assets/screenshots/admin/05-habits-export.png) | **(1)** CSV exportieren-Button. **(2)** Zeilenanzahl vor dem Export angezeigt (bestaetigt den Umfang). **(3)** Download-Fortschrittsanzeige. |

*Abbildung 5c: Ausloesen eines CSV-Exports.*

---

## 6. Teilnehmerfortschritt verfolgen

Die Teilnehmerfortschritts-Ansicht zeigt Aktivitaetszusammenfassungen fuer jeden Teilnehmer, um inaktive oder in Schwierigkeiten geratene Teilnehmer zu identifizieren.

**Schritt 1.** Tippen Sie im Admin-Panel auf **Teilnehmer** und oeffnen Sie die Detailansicht eines Teilnehmers.

**Schritt 2.** Scrollen Sie zum Abschnitt **Aktivitaet**. Er zeigt:
- **Datum der ersten Anmeldung** (oder "Noch nicht angemeldet")
- **Profilfragebogen ausgefuellt** (Ja / Nein)
- **Gespendete Gewohnheiten** (Gesamtzahl und pro Woche)
- **Datum der letzten Aktivitaet**
- **Anzahl angenommener / abgelehnter Empfehlungen**

| Screenshot | Beschriftungen |
|---|---|
| ![Teilnehmerfortschritt-Ansicht](../assets/screenshots/admin/06-participant-progress.png) | **(1)** Datum der ersten Anmeldung (oder "Noch nicht angemeldet"-Banner). **(2)** Profilabschluss-Badge — gruenes Haekchen, wenn ausgefuellt. **(3)** Gespendete Gewohnheiten — Nummerierungs-Badge mit woechentlichem Sparkline. **(4)** Empfehlungsbereich — Verhaeltnisbalken angenommen vs. abgelehnt. **(5)** Zeitstempel der letzten Aktivitaet. |

*Abbildung 6: Teilnehmer-Aktivitaetszusammenfassung.*

> **Tipp:** Verwenden Sie den Filter **"Noch keine Anmeldungen"** in der Teilnehmerlistenansicht (Gruppenfilter → Status: Noch nie angemeldet), um Teilnehmer zu identifizieren, die ihre Token-Karten noch nicht aktiviert haben.

---

## 7. Gerätesitzungen widerrufen

Wenn ein Teilnehmer seine Token-Karte verliert oder ein Geraet kompromittiert wird, koennen Sie seine aktiven Sitzungen widerrufen. Dies erzwingt eine erneute Authentifizierung mit einem neuen Token.

**Schritt 1.** Oeffnen Sie die Detailansicht des Teilnehmers (Admin-Panel → Teilnehmer → Teilnehmer auswaehlen).

**Schritt 2.** Tippen Sie auf **Alle Sitzungen widerrufen**. Ein Bestaedigungsdialog erscheint: *"Dadurch wird der Teilnehmer sofort von allen Geraeten abgemeldet. Fortfahren?"*

**Schritt 3.** Tippen Sie auf **Bestaetigen**. Die Keycloak-Sitzungen des Teilnehmers werden beendet. Er erhaelt beim naechsten App-Aufruf die Meldung "Ungueltige Sitzung".

**Schritt 4.** Wenn der Teilnehmer eine neue Token-Karte benoetigt (z. B. Karte verloren), tippen Sie auf **Token erneuern**, um ein neues zufaelliges Passwort auszustellen, und laden Sie dann die aktualisierte Token-Karte herunter (Abschnitt 2).

| Screenshot | Beschriftungen |
|---|---|
| ![Sitzungen widerrufen Bereich](../assets/screenshots/admin/07-revoke-session.png) | **(1)** Anzahl aktiver Sitzungen — zeigt, wie viele Geraete aktuell authentifiziert sind. **(2)** Alle Sitzungen widerrufen-Button (rot, destruktive Aktion). **(3)** Bestaedigungsdialog mit Teilnehmer-Pseudonym. **(4)** Token erneuern-Button — gibt ein neues Passwort aus, ohne bestehende Sitzungen zu widerrufen. |

*Abbildung 7: Widerruf der aktiven Gerätesitzungen eines Teilnehmers.*

> **Warnung:** Das Widerrufen von Sitzungen ist sofort und unwiderruflich. Der Teilnehmer benoetigt seine neue Token-Karte, um sich wieder anzumelden.

---

## 8. Token-Karten-Format in den Einstellungen konfigurieren

Das Token-Karten-PDF-Layout — Logo, Schriftgroesse, QR-Code-Position und Farbschema — kann in den Admin-Einstellungen ohne Code-Aenderungen angepasst werden.

**Schritt 1.** Tippen Sie im Admin-Panel auf **Einstellungen** (Zahnrad-Symbol in der Seitenleisten-Fusszeile).

**Schritt 2.** Unter **Token-Karten-Format** koennen Sie folgendes konfigurieren:

| Einstellung | Beschreibung | Standard |
|---|---|---|
| Logo-URL | URL oder Base64 des oben angezeigten Logos | HHH-Schild-Logo |
| Primaerfarbe | Hex-Farbe fuer Kopfzeile und QR-Code-Rahmen | `#1A73E8` |
| Schriftgroesse | Textkörper-Schriftgroesse in pt | `11` |
| QR-Code-Groesse | QR-Block-Pixelgroesse (80–200) | `120` |
| Fusszeilen-Text | Benutzerdefinierter Text unten auf der Karte (z. B. Studienkontakt) | `"Kontakt: study@tu-dresden.de"` |
| Klartext-Zugangsdaten anzeigen | Benutzername/Passwort unterhalb des QR-Codes anzeigen | `true` |

**Schritt 3.** Tippen Sie auf **Token-Karte vorschau**, um eine Live-Vorschau-PDF mit den aktuellen Einstellungen fuer einen Beispiel-Teilnehmer zu sehen.

**Schritt 4.** Tippen Sie auf **Einstellungen speichern**. Alle danach heruntergeladenen Token-Karten verwenden das neue Format.

| Screenshot | Beschriftungen |
|---|---|
| ![Token-Karten-Einstellungen](../assets/screenshots/admin/08-token-card-settings.png) | **(1)** Logo-URL-Eingabe mit Inline-Bildvorschau. **(2)** Primaerfarbe-Farbauswahl. **(3)** QR-Code-Groessen-Schieberegler. **(4)** Fusszeilen-Text-Eingabe. **(5)** Klartext-Zugangsdaten anzeigen-Toggle. **(6)** Token-Karte vorschau-Button — oeffnet die PDF-Vorschau in einem neuen Tab. **(7)** Einstellungen speichern-Button. |

*Abbildung 8: Token-Karten-Format-Einstellungen.*

---

## 9. Spracheinstellungen fuer Teilnehmer

Die App unterstuetzt Englisch und Deutsch. Jeder Teilnehmer kann seine bevorzugte Anzeigesprache unabhaengig einstellen. Die Sprachpraeferenz wird serverseitig gespeichert (MongoDB-Collection `users`) und wird auf alle Anzeige-Texte von Gewohnheiten (Feld `displayText`), Fragebogen-Bezeichnungen und Benutzeroberflaechen-Texte angewendet.

### Wie Teilnehmer ihre Sprache aendern

**Schritt 1.** In der mobilen App tippt der Teilnehmer auf den **Einstellungen**-Tab (Zahnrad-Symbol in der unteren Navigationsleiste).

**Schritt 2.** Auf dem Einstellungsbildschirm zeigt ein **Sprache**-Dropdown die aktuell ausgewaehlte Sprache an.

**Schritt 3.** Der Teilnehmer waehlt **English** oder **Deutsch**. Die Aenderung wird sofort gespeichert und eine Bestaetigung ("Einstellungen gespeichert") erscheint.

**Schritt 4.** Die App-Oberflaeche und alle Gewohnheits-Uebersetzungen wechseln zur ausgewaehlten Sprache ohne Neustart.

| Einstellung | Beschreibung |
|---|---|
| English | Alle Texte und Gewohnheits-Anzeigetexte auf Englisch. Gespendete Gewohnheiten werden mit englischer Uebersetzung (`translationEN`) angezeigt, falls vorhanden, sonst Originaltext. |
| Deutsch | Alle Texte und Gewohnheits-Anzeigetexte auf Deutsch. Gespendete Gewohnheiten werden mit deutscher Uebersetzung (`translationDE`) angezeigt, falls vorhanden, sonst Originaltext. |

> **Hinweis fuer Admins:** Die Sprachpraeferenz eines Teilnehmers kann nicht aus dem Admin-Panel heraus gesetzt werden. Sprache ist eine persoenliche Einstellung, die jeder Teilnehmer in seinem eigenen Einstellungsbildschirm konfiguriert. Falls ein Teilnehmer meldet, dass Inhalte in der falschen Sprache angezeigt werden, bitten Sie ihn, Einstellungen zu oeffnen und die bevorzugte Sprache erneut auszuwaehlen.

---

*Health Habit Hub — Administrationshandbuch v1.1 · TU Dresden · 2026*
