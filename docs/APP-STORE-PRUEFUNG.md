# App-Store-Prüfung der DBZ-App (Stand 22.11.2026)

Angewendet wurden die Skills `app-store-review`, `hig` und `ios-accessibility` (`.claude/skills/`, Quellen in
`.claude/skills/QUELLEN.md`). Grundlage ist die Web-App (PWA) im heutigen Stand. Eine native iOS-Hülle gibt es noch
nicht. Apples Regeln ändern sich: Vor der Einreichung die aktuellen App Review Guidelines und Upload-Anforderungen
erneut prüfen (siehe Skill `app-store-review`).

## Erfüllt (im Code geprüft)

| Regel | Stand |
|---|---|
| 2.1 Vollständigkeit, Zugang für Prüfer | Demo-Sandkasten mit festen Demo-Konten auch in Produktion; berührt keine echten Daten. In den Review-Notizen Demo-Konten je Rolle angeben |
| 5.1.1(v) Konto in der App löschen | vorhanden (Konto → „Konto löschen“) |
| 5.1.2 Datenschutzerklärung in der App und als Link | `/#/datenschutz`, `/#/impressum` öffentlich, in Login, Konto und Einwilligung verlinkt |
| Kinder / Minderjährige | Einwilligung der Erziehungsberechtigten unter 16 Jahren bei der Anmeldung, nachtragbar |
| ATT (App Tracking Transparency) | kein Tracking, keine Werbung → **keinen** ATT-Dialog zeigen |
| 3.1.1 In-App-Käufe | keine digitalen Käufe; Strafen sind nur Vermerke, keine Zahlung in der App. So lassen |
| 4.8 Sign in with Apple | nicht nötig, da nur eigene Konten (keine Google-/Facebook-Anmeldung) |
| HIG Navigation | Tab-Leiste mit höchstens 5 Einträgen, „Mehr“ statt Hamburger-Menü |
| HIG Dunkelmodus | vorhanden |
| HIG Textgröße | **neu:** Stufen bis 200 % („Riesig“, „Maximal“); alle Hauptseiten bei 200 % auf Handybreite ohne abgeschnittene Inhalte geprüft |
| HIG Mindestgröße Bedienelemente (28 pt, Standard 44 pt) | **neu:** Kontrollkästchen 28 px; Knöpfe 32–44 px |

## Offen – Blocker für die Einreichung

1. **1.2 Nutzerinhalte:** Apple verlangt bei Nachrichten zwischen Nutzern normalerweise „Melden“ und „Blockieren“.
   **Entscheidung des Betreibers (22.11.2026): kein Blockieren und kein Löschen für Schüler/Eltern** – der Chat ist
   ein geschlossener Schul-Chat, nur vom Verein aufgenommene Personen schreiben einander (steht in
   Datenschutzerklärung und Einwilligung). In den Review-Notizen begründen: geschlossene Nutzergruppe, keine
   Fremden, keine öffentliche Registrierung ohne Freigabe, Ansprechpartner ist die Leitung. Risiko: Apple kann
   trotzdem eine Meldefunktion verlangen. Noch nötig: veröffentlichte Kontaktadresse (E-Mail im Impressum fehlt).
2. **4.2 Mindestfunktion:** Eine reine Web-Hülle wird abgelehnt. Die native App braucht echten Mehrwert: Push über
   APNs (Skill `push-notifications`), Kamera für den QR-Check-in, Schülerausweis in Apple Wallet (`passkit`), Web-Inhalt
   über WebKit (`swiftui-webkit`).
3. **Anmeldung in der Hülle:** Cookies sind im WebView unzuverlässig. Den Token im Schlüsselbund speichern
   (`authentication`, `swift-security`).
4. **Datenschutz-Angaben:** `PrivacyInfo.xcprivacy` und die Datenschutz-Etiketten in App Store Connect müssen zur
   Datenschutzerklärung passen. Erhoben werden: Name, E-Mail, Telefon, Anschrift, Geburtsdatum, Nutzerinhalte
   (Texte, Fotos, Audio), ggf. Gesundheitsangaben in Entschuldigungen, nichts davon zu Tracking-Zwecken.
5. **Regionen der Dienstleister** (Render, Supabase) bestätigen und in der Datenschutzerklärung anpassen.

## Offen – Vorbereitung

- **Systemschriftgröße übernehmen:** In der nativen Hülle die iOS-Textgröße (Dynamic Type) auf die App-Textgröße
  abbilden.
- **Kategorie und Altersfreigabe:** Kategorie „Bildung“, **nicht** die „Kids“-Kategorie (strenge Zusatzregeln,
  z. B. keine Links nach außen ohne Elternschranke).
- **Metadaten und Screenshots:** iPhone- und iPad-Sätze nach aktueller Vorgabe (`app-store-optimization`).
- **Kosten:** Apple Developer Program (jährliche Gebühr; für gemeinnützige Organisationen gibt es je nach Land einen
  Gebührenerlass – prüfen) und ein Mac mit Xcode oder ein Cloud-Build-Dienst. Beides fällt unter die Regel
  „nichts Kostenpflichtiges ohne Zustimmung“.

## Nicht geprüft

Kein Xcode-Projekt, kein Archiv, keine echte Prüfung durch Apple. Bedienung mit VoiceOver auf einem echten Gerät steht aus.
