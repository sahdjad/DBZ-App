# KI-Assistent für die DBZ-App – Bestandsaufnahme und Umsetzungsplan

Stand: 20.11.2026. Grundlage ist der Auftrag des Betreibers („Master-Prompt DBZ AI Assistant“) vom 20.11.2026.
Ziel: ein in die App integrierter Assistent für Lehrkräfte, Klassensprecher, Leitung und Systemadministration,
der Aufträge in Text oder Sprache versteht und **erlaubte Aktionen tatsächlich ausführt**: Arbeitsblätter,
Hausaufgaben und Anwesenheit. Kritische Aktionen leitet er zur Genehmigung weiter. Außerdem soll er selbst
Vorschläge machen, z. B. „X ist heute nicht eingetragen“ oder „Y war zu spät“. Kein reiner Chatbot. Die App
wird erweitert, nicht neu gebaut.

## 1. Bestandsaufnahme (im Code geprüft)

| Bereich | Vorhanden | Ort | Nutzen für den Assistenten |
|---|---|---|---|
| Stack | Node/Express, React/Vite-PWA, Daten im Arbeitsspeicher, Supabase (Blöcke je Sammlung) | `server/`, `client/` | Werkzeuge als normale Server-Funktionen |
| Anmeldung | JWT im httpOnly-Cookie, Sitzungsversion, Rollenwechsel | `server/auth.js` | jeder Werkzeugaufruf läuft mit dem echten Nutzer |
| Rollen | `super_admin`, `leitung`, `klassenlehrer`, `vertretung`, `klassensprecher`, `schueler`, `eltern` | `server/rbac.js` | Rechte nie über das Modell, immer über `canManageClass`, `canDecideForClass`, `isAdmin` |
| Klassen | Stammklasse/Zusatzkurs, Klassenverlauf, Sammel-Versetzen, Schuljahreswechsel | `server/api.js` | Werkzeuge „meine Klassen“, „Schüler der Klasse“ |
| Hausaufgaben | `POST /assignments` mit Rechte- und Eingabeprüfung (`createAssignment`) | `server/api.js` | Werkzeug „Hausaufgabe anlegen“ ruft dieselbe Funktion |
| Materialien | `POST /materials` mit Text, Link oder Dateien, Bereichsprüfung (`checkMaterialScope`) | `server/api.js` | Arbeitsblatt = Material mit Text + Druckansicht (keine neue Bibliothek) |
| Anwesenheit | Tagesansicht, `POST /sessions/:id/attendance`, Nachtragen einzelner und vieler Tage, Check-in per QR | `server/api.js` | Werkzeuge „Anwesenheit abrufen/eintragen“, Vorschläge |
| Genehmigungen | `change_requests` (create_user, create_class, assign_class), Reiter „Genehmigungen“, Benachrichtigung, Freigabe nur durch Administrator | `server/api.js` (`submitChangeRequest`, `applyChangeRequest`) | wird zum allgemeinen Genehmigungssystem erweitert |
| Protokoll | `audit()` für alle Verwaltungsvorgänge, Aufbewahrung ca. 13 Monate | `server/domain.js` | jeder Assistenten-Schritt wird protokolliert |
| Benachrichtigungen | `notify()` mit Push (ohne Inhalte heikler Einträge) | `server/domain.js`, `server/webpush.js` | Rückmeldung an Antragsteller und Genehmiger |
| Sicherung | täglich und vor Massenänderungen (`safeguard`) | `server/backup.js` | vor jeder Sammeländerung durch den Assistenten |
| Qur'an-Quelle | Text Tanzil Uthmani + Übersetzung Bubenheim über AlQuran Cloud, Muṣḥaf-Daten QPC 1421H | `server/providers/quranProvider.js` | Verse kommen **nur** von hier, nie vom Modell |
| Sprache | NVIDIA FastConformer **nur für Qur'an-Rezitation (Arabisch)**, läuft auf dem Gerät | `client/src/lib/asr/` | für deutsche Befehle **nicht** geeignet |
| Sprachmodell (LLM) | **keines** vorhanden | – | muss neu angebunden werden (siehe Entscheidungen) |
| E-Mail | Anbieter-Schnittstelle vorbereitet, noch nicht eingerichtet | `server/providers/emailProvider.js` | später für Elternbriefe |

Rolle „Verwaltungsmitarbeiter“ aus dem Auftrag gibt es noch nicht (siehe Entscheidung E4).

## 2. Architektur (Grundsätze)

1. **Werkzeug-Schicht auf dem Server** (`server/assistant/tools.js`): eine feste Liste erlaubter Aktionen. Jede
   Aktion ruft dieselbe Funktion wie die normale App (z. B. `createAssignment`), prüft Rechte und Eingaben
   selbst und schreibt einen Audit-Eintrag. Das Modell erzeugt **nie** Datenbankabfragen oder Code.
2. **Sicherheitsstufen je Werkzeug** (fest im Code, nicht vom Modell):
   - Stufe 1 (sofort): Arbeitsblatt, Material, Hausaufgabe, eigene Klassenliste, Anwesenheit eintragen.
   - Stufe 2 (Bestätigung im Assistenten, Befehl sichtbar): Sammeländerungen, Nachrichten an viele Eltern,
     Klassenwechsel (nur Leitung/Admin).
   - Stufe 3 (Genehmigungsantrag): Schüler/Konto/Klasse löschen, Rollen ändern, Lehrkraft entfernen.
3. **Genehmigungen erweitern** statt neu bauen (`change_requests`): neue Typen (z. B. `remove_student`,
   `delete_user`), Status *ausstehend, genehmigt, abgelehnt, ausgeführt, fehlgeschlagen, abgelaufen,
   zurückgezogen*, Prüfsumme der betroffenen Daten (ändern sie sich, ist neue Genehmigung nötig),
   Ausführung genau einmal (Status-Sperre vor der Ausführung), vor der Ausführung erneute Rechteprüfung,
   Leitung darf je nach Typ genehmigen, Löschen zuerst als Deaktivieren (endgültig nur gesondert).
4. **Datensparsamkeit beim Modell**: Namen von Schülern werden vor dem Senden durch Platzhalter ersetzt
   („Schüler S1“) und erst auf dem Server wieder aufgelöst; keine Adressen, Telefonnummern, Gesundheitsangaben
   an das Modell; nur die Daten, die der Auftrag braucht. Gesprächsverläufe nur kurz speichern (z. B. 30 Tage).
5. **Schutz gegen Manipulation**: Rechte hängen nie an der Modellantwort; Inhalte hochgeladener Dateien sind
   Daten, keine Anweisungen; höchstens z. B. 8 Werkzeugaufrufe je Auftrag; kein Umgehen von Genehmigungen durch
   viele kleine Schritte (Zählung je Auftrag und Tag).
6. **Ehrliche Rückmeldung**: Ergebnis je Schritt *ausgeführt / teilweise / Genehmigung nötig / fehlgeschlagen*,
   mit Link zum erzeugten Eintrag; nie „erledigt“ ohne gespeicherten Datensatz.
7. **Islamische Inhalte**: Verse nur als Verweis (Sure:Vers), der Server setzt den geprüften Text ein; Aḥādīṯ nur mit
   Quellenangabe und als „bitte prüfen“ markiert; die Lehrkraft bleibt fachlich verantwortlich (Arbeitsblätter
   gehen als Entwurf in die Vorschau, Veröffentlichen mit einem Tipp).

## 3. Phasen

| Phase | Inhalt | braucht LLM? | Stand |
|---|---|---|---|
| 0 | **Vorschläge ohne KI**: Startseite der Klassenlehrkraft „Anwesenheit vervollständigen“ (fehlende Einträge an erfassten Tagen der letzten 3 Wochen; bestätigte Entschuldigung → entschuldigt, sonst fehlend), mit einem Tipp übernehmen, rücknehmbar. Offene Entschuldigungen, Korrekturen, Protokolle stehen schon unter „Zu erledigen“ | nein | ✅ 20.11.2026 |
| 1 | Werkzeug-Schicht + Sicherheitsstufen + erweitertes Genehmigungssystem (inkl. Tests C, D, E, G, I, J) | nein | geplant |
| 2 | Assistent-Oberfläche (Knopf in der App, Eingabe, Ergebnisse, laufende Aufgaben, Kontext der geöffneten Klasse) | nein (Oberfläche) | geplant |
| 3 | Anbindung eines Sprachmodells mit Werkzeugaufrufen, Platzhalter für Namen, Kosten- und Missbrauchsgrenzen | **ja** | wartet auf E1/E2 |
| 4 | Arbeitsblätter (Material mit Text, Druckansicht, geprüfte Verse), Mehrschritt-Aufträge (Tests A, F, H) | ja | nach Phase 3 |
| 5 | Spracheingabe Deutsch | je nach E3 | wartet auf E3 |
| 6 | Testszenarien A–J automatisiert, Screenshots, Bildschirmaufnahmen (Browser-Aufnahmen mit Testdaten) | – | laufend |

## 4. Entscheidungen des Betreibers

**Entschieden am 20.11.2026 („Passt“ zu den Empfehlungen):** E1 EU-Anbieter mit Monatsgrenze (Betrag wird vor
Phase 3 erfragt) · E3 deutsches Modell auf dem Gerät · E5 Löschen von Schülern/Konten genehmigen Leitung oder
Administrator, Rollen und Systemeinstellungen nur der Administrator · E6 Klassensprecher: Protokoll-Entwürfe und
Anwesenheits-Vorschläge, die Lehrkraft bestätigt · E4 vorerst keine neue Rolle, Verwaltungsaufgaben bleiben bei der
Leitung (auf Wunsch später). Offen: E1 Monatsbetrag, E2 Zugangsschlüssel.

Ursprüngliche Fragen:

- **E1 – Sprachmodell-Anbieter und Kosten.** Ein Sprachmodell kostet in der Regel Geld; die Regel „alles
  kostenlos“ gilt bis zur Zustimmung. Optionen:
  - (a) EU-Anbieter mit Auftragsverarbeitungsvertrag (z. B. Mistral, Frankreich) – günstig, datenschutzfreundlich;
  - (b) kostenlose Kontingente (z. B. NVIDIA-Entwicklerzugang, Groq, Google) – oft nur zum Testen, Daten teils
    zum Training genutzt oder in den USA, für Schülerdaten **nicht empfohlen**;
  - (c) selbst betriebenes Modell – auf Render Free nicht möglich.
  Empfehlung: (a), mit Monatsgrenze, die Anbindung wird anbieterunabhängig gebaut.
- **E2 – Zugangsschlüssel** des gewählten Anbieters, einzutragen bei Render (nie im Repository).
- **E3 – Spracheingabe Deutsch.** Die vorhandene NVIDIA-Erkennung kann nur Qur'an-Arabisch. Optionen:
  - (a) Erkennung des Browsers/Handys – schnell, aber bei Chrome/Android geht Audio an Google (widerspricht der
    Regel „Audio nie versenden“);
  - (b) deutsches Modell auf dem Gerät (z. B. Whisper klein, einmalig ca. 40–150 MB Download) – regelkonform,
    langsamer auf älteren Handys.
  Empfehlung: (b), mit Textfeld zum Korrigieren.
- **E4 – Rolle „Verwaltungsmitarbeiter“.** Neue Rolle mit eingeschränkten Rechten anlegen oder die Aufgaben bei
  der Leitung belassen?
- **E5 – Wer genehmigt was?** Vorschlag: Löschen von Schülern und Konten – Leitung oder Administrator;
  Rollenänderungen und Systemeinstellungen – nur Administrator.
- **E6 – Klassensprecher.** Welche Aktionen dürfen sie über den Assistenten? Vorschlag: Protokoll-Entwurf,
  Anwesenheits-*Vorschläge* (die Lehrkraft bestätigt), keine Noten, keine Entschuldigungen.

## 5. Nicht verifiziert

Nichts aus diesem Dokument ist bereits gebaut. Kosten, Datenschutz-Bedingungen und Modellqualität der Anbieter
müssen vor der Auswahl aktuell geprüft werden.
