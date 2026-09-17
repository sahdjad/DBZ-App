# Übergabe / Handoff — ʿAqīdah-Projekt

**Zweck:** Diese Datei fasst den gesamten Projektstand zusammen, damit die Arbeit
auf einem anderen Claude-Code-Account nahtlos fortgesetzt werden kann. Der
komplette Gesprächsverlauf steht in `CHAT_VERLAUF.md`.

---

## 1. Überblick

Vollständige, publikationsreife **deutsche Übersetzung** des arabischen ʿAqīdah-Werks
**„دروس مهمة لعامة الأمة في العقيدة" / „Wichtige Lektionen für die allgemeine Ummah
in der ʿAqīdah"** von Šaykh Aḥmad ibn Muḥammad ibn aṣ-Ṣādiq an-Naǧǧār — im
islamisch-akademischen Stil, mit professionellem Layout (Dunkelgrün · Gold · Beige,
geometrische Motive, keine Lebewesen), arabischen Diagrammen, Qurʾān/Hadith-Boxen.
Dazu eine **IGCSE-Prüfung** zum Werk.

- **Repo:** `y6sy94pz7g-sudo/Discipline-`
- **Branch:** `claude/aqidah-german-translation-cnq3vf`
- **Alles ist committet und gepusht** (Stand letzter Commit `95f8290`).

## 2. Dateien im Repo

| Datei | Inhalt |
|---|---|
| `aqidah_lektionen_deutsch_final.md` | Quelltext der Übersetzung (Markdown) — **hier werden Korrekturen gemacht** |
| `aqidah_lektionen_deutsch_final.css` | Islamisches Layout (Farben, Diagramme, Qurʾān/Hadith-Boxen, Fußnoten) |
| `aqidah_lektionen_deutsch_final.html` | generiert aus der .md |
| `aqidah_lektionen_deutsch_final.pdf` | finale Buch-PDF (mit Amiri-Schrift) |
| `aqidah_lektionen_deutsch_final.docx` | Word-Fassung |
| `aqidah_pruefung_igcse.md` | Quelltext der IGCSE-Prüfung (65 Fragen, 211 Punkte) |
| `aqidah_pruefung_igcse.css` | Prüfungs-Layout (Basis-CSS + Prüfungs-Komponenten) |
| `aqidah_pruefung_igcse.html/.pdf/.docx` | generierte Prüfung |
| `CHAT_VERLAUF.md` | kompletter lesbarer Gesprächsverlauf |
| `hochmut_deutsch_final.*`, `index.html`, `style.css` | **separates** Hochmut-Projekt — NICHT überschreiben |

## 3. Build-Prozess (wie PDFs neu erzeugt werden)

Die Konverter-Skripte `build_html.py` (Buch) und `build_exam.py` (Prüfung) liegen
**jetzt im Repo**. Voraussetzungen:

```bash
pip install weasyprint pymupdf
apt-get install -y pandoc fonts-hosny-amiri fonts-sil-scheherazade   # WICHTIG: arabische Schriften!
```

**Wichtig – arabische Schrift:** Das Layout nutzt **Amiri** und **Amiri Quran**
(via `fonts-hosny-amiri`) sowie Scheherazade als Fallback. Fehlen diese Schriften,
rendert das Arabische als hässliche Ersatz-„Handschrift". Immer zuerst installieren.

**Buch bauen:**
```bash
python3 build_html.py        # .md -> .html
python3 -c "from weasyprint import HTML; HTML('aqidah_lektionen_deutsch_final.html').write_pdf('aqidah_lektionen_deutsch_final.pdf')"
pandoc aqidah_lektionen_deutsch_final.html -o aqidah_lektionen_deutsch_final.docx
```

**Prüfung bauen:** analog mit `build_exam.py` und den `aqidah_pruefung_igcse.*`-Dateien.

### Zwei Besonderheiten des Konverters (build_html.py)
- **Diagramme:** ```` ```html ````-Blöcke müssen als **rohes HTML durchgereicht**
  werden (nicht escapen!), sonst erscheint Code statt Diagramm. (Andere Codeblöcke
  escapen und in `<pre>`.)
- **Fußnoten:** `[^1]` → hochgestellte Referenz `<sup class="fn-ref">1</sup>`;
  Zeile `[^1]: …` → `<div class="footnote"><span class="fn-num">1</span> …</div>`.
- Qurʾān/Hadith-Blockquotes werden automatisch erkannt (Arabisch / `﴿﴾`-Zeichen)
  und in Boxen gerendert; arabische Läufe im Fließtext werden in
  `<span class="ar-inline">` gewickelt.

## 4. Feste Anforderungen des Nutzers (immer beachten)

- **Vollständig & wörtlich** übersetzen — nichts auslassen, nichts hinzufügen.
- Islamisch-akademisches Deutsch, spezielle Terminologie (Tawḥīd, Nawāqiḍ, …).
- **Qurʾān-Verse:** Arabisch + deutsche Übersetzung + Referenz `[Sure: Vers]`.
- **Hadithe:** Arabisch + Übersetzung + Quelle — **niemals** Quellen/Nummern erfinden.
- Ehrfurchtsformeln: ﷺ / ﷻ als arabische Ligaturen; رضي الله عنه ausgeschrieben.
- Layout: professionell islamisch (dunkelgrün/gold/beige), Diagramme auf Deutsch.
- Der Nutzer ist sehr detailgenau. Bei arabischem Text **äußerste Sorgfalt** —
  kein Wort/Tashkeel verändern; im Zweifel gegen eine authentische Quelle prüfen.

## 5. Stand der Verse-Prüfung

Alle **124 referenzierten Qurʾān-Verse** wurden gegen die authentische ʿUthmānī-Quelle
(api.alquran.cloud) geprüft (Konsonantengerüst) — **alle korrekt, keine Abweichung.**
Der arabische Inhalt ist seit der ersten vollständigen Übersetzung unverändert.

## 6. So geht es auf dem neuen Account weiter

1. Auf dem neuen Claude-Code-Account **dasselbe GitHub-Repo** verbinden
   (`y6sy94pz7g-sudo/Discipline-`).
2. Eine neue Session auf dem Branch `claude/aqidah-german-translation-cnq3vf` starten.
3. Claude bitten, zuerst `UEBERGABE_HANDOFF.md` und bei Bedarf `CHAT_VERLAUF.md` zu lesen —
   damit ist der volle Kontext wieder da.
4. Vor dem PDF-Bauen die arabischen Schriften installieren (Abschnitt 3);
   die Build-Skripte `build_html.py` / `build_exam.py` sind bereits im Repo.
