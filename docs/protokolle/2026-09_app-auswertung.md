# App-Auswertung – DBZ-App (aus Lehrerbesprechung, September 2026)

**Zweck dieses Dokuments:** Vollständige, eigenständig verständliche Auswertung aller Aussagen über die DBZ-App aus einer Besprechung zwischen zwei Lehrkräften (einer davon der App-Entwickler, der andere Direktor/Leitung). Gedacht als Grundlage, um mit einer anderen KI zu prüfen, ob die App die genannten Anforderungen erfüllt, was fehlt und was verbessert werden sollte. Alle Aussagen stammen ausschließlich aus dem Gespräch; nichts wurde hinzuerfunden. Unklare Stellen sind als **[UNKLAR]** markiert.

Kontext: Es handelt sich um eine App für eine Koranschule (DBZ) mit den Rollen **Admin, Leitung/Direktoren, Klassenlehrer, Klassensprecher (Schüler mit Zusatzrechten), Schüler, Eltern**. Die App befand sich zum Zeitpunkt des Gesprächs noch im "Demo"-Modus (ohne echte Datenbank/Authentifizierung) und sollte ab der Woche des Gesprächs auf Supabase migriert werden.

---

## 1. Rollen & Dashboards (vorgestellte Bereiche)

### 1.1 DBZ-Leitung / Direktoren-Dashboard
- Übersicht: Gesamtzahl Schüler, Anzahl angemeldeter Eltern, Anzahl Lehrkräfte.
- Übersicht offener Strafen schulweit: **Geldstrafen gesamt**, **Seitenstrafen** (Entwickler selbst bezeichnet diese Kennzahl als "eigentlich irrelevant" — **Kritik/offene Frage:** sollte diese Metrik in der Leitungsansicht bleiben?), **offene Strafen gesamt**.
- Klassenübersicht (Klasse 1–6) mit pro Klasse: Anwesenheitsprozent, Anzahl unentschuldigter Fehlzeiten. Zweck: Auffälligkeiten erkennen (z. B. "Klasse 2 hat nur 20 % Anwesenheit → nachfragen").
- **Ankündigungen:** Leitung kann schulweite Ankündigungen erstellen, Schüler erhalten Benachrichtigung.
- **Nachrichten:** Messaging zwischen allen Rollen möglich.
- **Verwaltung:** Nutzer manuell anlegen (Name, Adresse, Rolle: Schüler etc.), Rollen/Beförderungen verwalten. **Wichtiges Sicherheitsprinzip (bestätigt funktionierend):** Nutzer können ihre Rolle **nicht selbst wechseln** — nur die Leitung kann jemanden z. B. zum Lehrer befördern. Ziel: verhindern, dass sich jemand unautorisiert höhere Rechte verschafft.
- **Klassenliste:** Klassen 1–6 direkt einsehbar, pro Klasse Schülerliste.
- **Zeugnisse:** Bereich vorhanden, aber Entwickler äußert Zweifel, ob dieser für die Leitung überhaupt relevant ist **[UNKLAR / zu klären]**.
- **Strafprotokolle:** Leitung kann auch direkt individuelle Strafen an einzelne Schüler vergeben (z. B. bei Kleiderordnungsverstoß).
- **Regeln:** Leitung kann schulweite Regeln festlegen; Lehrer können zusätzlich klassenspezifische Regeln ergänzen.
- **Strafkatalog:** aktuell nur als Notizen im System hinterlegt, noch nicht final ausgearbeitet. **Offener Punkt:** Was genau die Leitung/Admin-Rolle konkret an Funktionen braucht, wurde im Gespräch nicht abschließend geklärt ("das müssen wir noch klären, aber nicht heute").

### 1.2 Eltern-Account
- Struktur identisch zum Schüleraccount, aber Verknüpfung über einen **Familiencode** (wird vom Schüleraccount kopiert und an die Eltern weitergegeben).
- Eltern sehen (laut Zielsetzung im Gespräch): Anwesenheit, Verspätungen, Strafen/Schulden, Hausaufgaben (inkl. Audio-Abgaben anhören), Verhalten/Rückmeldungen, Zeugnis.
- **Bekannte Einschränkung (im Gespräch entdeckt/diskutiert):** Entwickler wollte, dass Eltern/Schüler Benachrichtigungen **nicht deaktivieren können**. Direktor weist darauf hin, dass dies auf Betriebssystem-Ebene (Smartphone-Benachrichtigungseinstellungen) trotzdem möglich ist, weil es sich um eine **Web-App handelt, keine native Apple-App**. → Ziel "Benachrichtigungen nicht abschaltbar" ist technisch **nicht vollständig umsetzbar**, dies wurde im Gespräch als Einschränkung akzeptiert, nicht gelöst.
- Kleinkinder/junge Schüler ohne eigenes Smartphone: Lösung laut Gespräch = Elternteil bekommt in diesem Fall einen "Schüleraccount" (**Formulierung im Gespräch etwas widersprüchlich/knapp — Detailumsetzung [UNKLAR]**, aber Grundidee: Eltern-Account kann stellvertretend für ein Kind ohne eigenes Handy genutzt werden).

### 1.3 Schüler-Dashboard
- Standard-Startseite mit Nachrichten/Ankündigungen.
- Direkte Anzeige von Kennzahlen: Anwesenheit %, Verspätung (kumuliert) etc.
- **Check-in-Funktion:**
  - QR-Code hängt (ausgedruckt) an der Tür; Schüler scannen sich beim Betreten ein.
  - Zeitfenster: 14:00–14:15 Uhr = pünktlich; danach = "zu spät" mit automatisch berechneter Minutenanzahl, rot markiert.
  - QR-Code muss **nicht** jede Woche neu erstellt/ausgedruckt werden — im Gespräch geklärt: alle 2–4 Wochen reicht, um die Zettel/Logistik zu reduzieren (Ursprungsproblem: "Freitag kleben, aber wer druckt es am selben Tag").
  - Alternativen wurden diskutiert und verworfen: Schüler selbst in der App als anwesend markieren (Risiko: Schummeln); QR-Code beim Lehrer scannen (Risiko: Lehrer nicht immer physisch anwesend). **Entscheidung:** Check-in bleibt an der Tür per Papier-QR-Code, da keine Kapazität für dediziertes Scan-Gerät vorhanden ist.
  - **Genannte Schwachstelle/Risiko [noch nicht gelöst]:** Wenn ein Lehrer versehentlich einen neuen QR-Code erzeugt, während der alte Zettel noch an der Tür hängt, funktioniert der Check-in nicht mehr — keine Absicherung dagegen erwähnt.
- **Aufgabenbereich:** Liste offener Aufgaben/To-dos für den Schüler.
- **Kalender:** Von Lehrern/Leitung eingetragene Termine erscheinen automatisch; zusätzlich Abo-Link zum Einbinden in private Kalender-Apps (z. B. Apple-Kalender) — als optionales Feature gedacht, nicht verpflichtend.
- **Koran-Modul:**
  - Grundfunktionen (Text anzeigen, Audio-Rezitationen) funktionieren.
  - **Bekannte Bugs/Mängel:** Ein UI-Element erscheint, das nicht erscheinen sollte, und erfordert einen zusätzlichen Klick, um weiterzukommen (**genauer Bug [UNKLAR]**, im Gespräch nur gezeigt, nicht präzise beschrieben). Seitenanzeige ist zu klein, Nutzer muss zoomen, um lesen zu können. Layout gefällt dem Entwickler selbst noch nicht ("sehr vogelwild").
  - Geplantes Feature: Mitlese-Tracking während des Lesens (ähnlich der App **Tarteel**) — laut Entwickler bereits einstellbar/vorhanden, aber noch nicht final poliert.
- **Hifz & Muraja'ah:**
  - Fleißige Schüler können Audio-Aufnahmen zur Bewertung durch die Lehrkraft einreichen.
  - Alternativ: Lehrer zieht Schüler im Unterricht einzeln raus, hört Rezitation, bewertet direkt in der App; Ergebnis wird als Prozentzahl aggregiert dargestellt.
- **Notenberechnung / Zeugnis (zentrales Ziel):** Alles, was der Schüler an Aktivität liefert (Hausaufgaben, Quizze, Mitarbeit, Anwesenheit, Verspätungen) wird automatisch von der App zu einer Endnote/einem Zeugnis verrechnet. Ziel: Lehrer müssen am Ende nur noch punktuell nachjustieren (z. B. Extrapunkte), nicht die Note manuell berechnen.
- **Prüfungen:** Lehrer schaltet Prüfungen frei (Titel, Bestehensgrenze); können auch als Heimprüfung genutzt werden. Unterstützte Formate: Audio-Aufnahme als Antwort, oder Quiz-/Frage-Format. **Angesprochener, aber ungelöster Punkt:** Kein technischer Schutz gegen Schummeln bei Heimprüfungen — verlässt sich auf mündlichen Hinweis an die Schüler.
- **Materialien:**
  - **Kritikpunkt/To-do:** Aktuell alles unstrukturiert in einer Liste ("einfach alles runter"). Gewünscht: Struktur nach Themenbereichen/Fächern (z. B. Adab, Aqida, Tajweed, Sira), jeweils mit Datum.
  - KI-Unterstützung vorhanden: Beim Hochladen einer kompletten YouTube-Playlist übernimmt die KI automatisch das Anlegen der einzelnen Einträge, statt dass der Lehrer jedes Video einzeln eintragen muss.
- **Anwesenheit (Detailansicht für Schüler):** Schüler kann auf einzelne Tage klicken und sehen, wann genau er zu spät war/warum sich z. B. eine Gesamtsumme von "50 Minuten zu spät" zusammensetzt. Laut Entwickler bereits umgesetzt.
- **Verhalten / Tarbiyah:** Lehrer gibt Rückmeldung (positiv oder Hinweis), sichtbar für Schüler und/oder Eltern (einstellbar). **Gewünschtes, noch nicht gebautes Feature:** Möglichkeit, statt/zusätzlich zu Text eine **Audio-Nachricht** aufzunehmen — Begründung: höhere emotionale Wirkung, besonders wenn Eltern die Nachricht abends hören.
- **Strafprotokoll (Schülersicht):** zeigt z. B. eingereichten Zahlungsnachweis, wartet auf Bestätigung durch die Lehrkraft; nach Bestätigung verschwindet der Eintrag.
- **Regelungen:** für Schüler einsehbar.
- **Zeugnis:** Vorschau/PDF-Export möglich; Lehrer kann Verhaltenskommentar ergänzen; Sichtbarkeit einstellbar (nur Schüler / nur Eltern / beide).
- **Familiencode:** im Schüleraccount sichtbar, zum Kopieren/Weitergeben an Eltern zur Kontoverknüpfung.
- **"Aktivitäten"-Bereich:** **[UNKLAR]** — selbst der Entwickler weiß im Gespräch nicht mehr genau, wofür dieser Bereich gedacht ist ("Ich weiß nicht mehr, was das ist"), vermutet etwas wie "Extra-Aufgaben". **To-do:** Zweck klären/dokumentieren oder Funktion entfernen, falls überflüssig.

### 1.4 Lehrer-Dashboard
- Klassenübersicht mit z. B. offenen Krankmeldungen, offenen Strafen, Vermerken.
- **Aufgaben erstellen:** Titel, Beschreibung, Fach/Thema auswählbar, Abgabeform (Audio/Text/Datei/Koran-bezogen), Frist, Veröffentlichen. Auch der **Klassensprecher** kann Aufgaben vorbereiten/erstellen; die Lehrkraft muss dann nur noch freigeben (Arbeitsentlastung).
- **Zugriffsschutz zwischen Klassen ("Schilfrohr-Reihe"):** Ein Lehrer aus einer anderen Klasse braucht explizite Genehmigung der zuständigen Klassenlehrkraft, um in einer fremden Klasse etwas zu tun. Nur die **Leitung** hat klassenübergreifend volle Rechte. Ziel: verhindern, dass sich Lehrkräfte gegenseitig unautorisiert in andere Klassen einmischen.
- **Kalender:** Termine für eigene Klasse eintragen (erscheinen automatisch bei Schülern der Klasse).
- **Hifz-Muraja'ah:** individuelle Aufgaben pro Schüler zuweisen, Fortschritt in Prozent je Schüler sichtbar.
- **Prüfungen:** anlegen (Titel, Bestehensgrenze), für zu Hause freigeben, Audio- oder Quiz-Format.
- **Materialien:** hochladen (Titel, YouTube-Links etc.), inkl. KI-gestütztem Playlist-Bulk-Upload (siehe oben).
- **Korrekturen (Korrekturqueue):** eingereichte Audio-Hausaufgaben erscheinen hier zur Bewertung/Rückgabe.
- **Entschuldigungen / Krankmeldungen:**
  - Aktionen: genehmigen / ablehnen / Rückfrage stellen.
  - **Kritikpunkt/Lücke:** Eine "Rückfrage" muss aktuell **außerhalb der App** (z. B. mündlich/telefonisch) geklärt und danach manuell im System nachkorrigiert werden — kein eingebauter Rückfrage-Dialog innerhalb der App.
  - Krankmeldungsformular verlangt eine **Begründung mit Mindestlänge (30 Zeichen)**, um zu verhindern, dass Schüler nur "Ich bin krank" schreiben.
  - **Im Gespräch geäußerte Kritik an dieser Lösung:** Eine reine Zeichenanzahl-Prüfung ist ein grobes Werkzeug — z. B. reicht "Ich habe Bauchschmerzen" allein nicht aus, obwohl es inhaltlich bereits eine Begründung ist; Schüler müssten stattdessen z. B. mit einer Grußformel ("As-salamu alaikum ...") auffüllen, um auf die Zeichenzahl zu kommen. Das Grundziel (echte Begründung statt Einzeiler) wird als sinnvoll bewertet, die Umsetzung über reine Zeichenanzahl aber implizit als verbesserungswürdig angesprochen.
- **Protokolle:** vom Klassensprecher eingereichte Protokolle einsehbar.
- **Anwesenheit verwalten:** Check-in öffnen, neuen QR-Code erzeugen, gleiche 14:00–14:15-Logik wie oben, manuelle Korrektur möglich (z. B. Grund "Handy ist ausgegangen" oder Markierung als unentschuldigt).
- **Verhalten/Rückmeldung-Formular:** Zielgruppe (Schüler/Eltern/beide), Typ (Positiv/Hinweis), Kategorie (Adab, Mitarbeit, Pünktlichkeit, Hausaufgabe, Koran, Hifz, Verhalten allgemein), Freitext. **Gewünschtes Feature (noch nicht gebaut):** Audio-Aufnahme als Alternative zum Text.
- **Strafen erfassen:** Grund, Art (Geldstrafe oder Seiten-Strafe), vollständige Historie; Zahlungsbestätigungen der Schüler werden geprüft/freigegeben, danach verschwindet die Strafe.
- **Regelungen:** klassenspezifische Regeln zusätzlich zu den schulweiten bearbeitbar.
- **Zeugnis-Erstellung:** automatisch berechnet aus allen erfassten Aktivitäten; Lehrer ergänzt Abschlusskommentar zum Verhalten; PDF-Export/Freigabe; Sichtbarkeit granular einstellbar.
- **"Aktivitäten"-Bereich:** siehe oben, Zweck unklar, zu prüfen.

---

## 2. Übergreifende Ziele der App (aus dem Gespräch)

- **WhatsApp vollständig ersetzen** für: Entschuldigungen, Protokolle, Ankündigungen, Kommunikation Lehrer↔Schüler. Begründung: zu unübersichtlich, Verlust der professionellen Distanz (Schüler bekommt sonst z. B. die private WhatsApp-Nummer der Lehrerin und schreibt respektlose Nachrichten).
- **Automatische Notenberechnung/Zeugnis** aus allen in der App erfassten Aktivitäten, um manuellen Aufwand am Jahresende zu minimieren.
- **Rollenwechsel nur mit Genehmigung der Leitung**, kein Selbst-Upgrade von Rechten möglich (Sicherheitsprinzip, bereits umgesetzt).
- **Langfristige Vision (noch nicht umgesetzt, nur angedacht):** komplette Anmeldung neuer Schüler **schulweit** (nicht nur Klasse 3) digital über die App/ein iPad abwickeln (Name, Adresse, Herkunft, Bankdaten, Unterschrift) statt auf Papier — soll der Leitung vorgeschlagen werden, sobald sich der Ansatz in Klasse 3 bewährt hat.
- Entwicklung erfolgt mit **Claude Code** und **ChatGPT**.

---

## 3. Zusammenfassung: Bereits funktionierende Punkte

- Login/Rollensystem inkl. sicherem Rollenwechsel nur durch die Leitung.
- QR-Check-in mit automatischer Verspätungsberechnung und roter Markierung.
- Aufgaben-/Hausaufgabenerstellung inkl. Freigabe-Workflow für Klassensprecher-Entwürfe.
- Korrekturqueue für Audio-Hausaufgaben.
- Entschuldigungs-Workflow (genehmigen/ablehnen), inkl. Pflichtfeld mit Mindestlänge.
- Strafenverwaltung inkl. Zahlungsbestätigung/Freigabe-Workflow.
- Verhalten/Rückmeldung an Schüler/Eltern, mit granularer Sichtbarkeitssteuerung.
- Automatische Zeugnisberechnung auf Basis erfasster Aktivitäten, PDF-Export.
- Kalenderfunktion inkl. Abo-Link für externe Kalender-Apps.
- Nachrichten/Ankündigungen (Ersatz für WhatsApp).
- Klassenübergreifender Zugriffsschutz ("Schilfrohr-Reihe"-Prinzip).
- KI-gestützter Bulk-Upload von Materialien (z. B. ganze YouTube-Playlist).
- Detaillierte Anwesenheitsansicht (Aufschlüsselung nach Datum) für Schüler.
- Familiencode-System zur Eltern-Kind-Verknüpfung.

## 4. Bekannte Probleme / Bugs / Kritikpunkte

1. **Koran-Modul:** unerwünschtes UI-Element/zusätzlicher Klick nötig (genauer Bug nicht spezifiziert); Text/Seiten zu klein, Zoom nötig; Layout insgesamt unfertig/unzufriedenstellend.
2. **Materialien:** keine thematische Struktur, alles in einer flachen Liste — Struktur nach Fach/Thema gewünscht.
3. **Benachrichtigungen:** können auf OS-Ebene trotzdem stummgeschaltet werden, da Web-App statt native App — Zielsetzung "nicht abschaltbar" ist so nicht vollständig erreichbar.
4. **QR-Check-in:** kein dediziertes Scan-Gerät vorhanden (Kapazitätsgrund), Workaround über ausgedruckten Papier-Code; Risiko, dass ein neu erzeugter Code den noch hängenden alten Zettel ungültig macht, ohne dass dies abgefangen wird.
5. **"Aktivitäten"-Bereich:** Zweck unklar, auch dem Entwickler selbst — Klärung/Dokumentation nötig.
6. **Strafkatalog:** in der App bisher nur Notizen, offizieller DBZ-Strafkatalog noch nicht vollständig integriert.
7. **Admin-/Leitungsanforderungen:** nicht abschließend spezifiziert, gesonderter Termin mit der Leitung nötig.
8. **Krankmeldungs-Validierung:** Mindestzeichenzahl (30) als Qualitätskriterium ist angreifbar/grob (kann mit Füllfloskeln erfüllt werden, ohne echten Mehrwert).
9. **Rückfrage bei Entschuldigungen:** kein In-App-Dialog, läuft aktuell manuell außerhalb der App.
10. **Seitenstrafen-Kennzahl** im Leitungs-Dashboard vom Entwickler selbst als vermutlich irrelevant eingestuft — Praxisnutzen fraglich.
11. **Zeugnis-Bereich in der Leitungsansicht:** Relevanz für die Leitung wird vom Entwickler selbst infrage gestellt.

## 5. Gewünschte / geplante, aber noch nicht umgesetzte Features

- Audio-Nachricht als Format für Lehrer-Rückmeldungen (Verhalten/Tarbiyah) an Schüler/Eltern.
- Überarbeitung/Redesign des Koran-Moduls (Layout, Lese-Tracking wie bei Tarteel weiter ausbauen).
- Themenbasierte Strukturierung des Materialien-Bereichs.
- Klärung und ggf. Ausbau oder Entfernung des "Aktivitäten"-Bereichs.
- Vollständige Integration des offiziellen DBZ-Strafkatalogs.
- Schulweiter digitaler Anmeldeprozess (Langfrist-Idee, noch nicht spezifiziert).
- Klärung der Admin-/Leitungsfunktionen im Detail.
- Ggf. Lösung/Absicherung für das QR-Code-Regenerierungs-Risiko.

## 6. Offene Fragen für die Anforderungsprüfung durch eine andere KI

- Sind alle oben unter Abschnitt 1 gelisteten Funktionen tatsächlich im Code vorhanden und funktionsfähig, oder nur teilweise/geplant?
- Entspricht die aktuelle Umsetzung des Check-in-Zeitfensters (14:00–14:15 Uhr pünktlich, danach rot mit Minutenanzahl) exakt der Beschreibung?
- Ist die Materialien-Struktur bereits nach Themen/Fächern gegliedert oder noch als flache Liste umgesetzt?
- Existiert bereits eine Möglichkeit, Audio-Nachrichten für Verhalten/Tarbiyah-Rückmeldungen aufzunehmen?
- Wie ist der "Aktivitäten"-Bereich aktuell implementiert/benannt, und lässt sich sein Zweck aus dem Code ableiten?
- Gibt es eine Absicherung gegen das Überschreiben eines gültigen QR-Codes, während der alte Papier-Code noch im Umlauf ist?
- Wie ist die Mindestzeichen-Validierung für Krankmeldungen aktuell umgesetzt, und wäre eine qualitativere Prüfung (z. B. Mindestwortzahl an Inhalt statt reiner Zeichenzahl inkl. Grußformel) sinnvoll nachrüstbar?
