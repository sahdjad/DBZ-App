#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Markdown -> semantic HTML converter for the ʿAqīdah IGCSE exam.
Reuses the Islamic layout of the book (same design tokens) and adds
exam-specific components: cover, Name/Datum bar, Prüfungsordnung, Hadith,
Hinweise, Bewertungsschlüssel and point badges."""
import re, html

SRC = "/home/user/Discipline-/aqidah_pruefung_igcse.md"
OUT = "/home/user/Discipline-/aqidah_pruefung_igcse.html"
BASE_CSS = "/home/user/Discipline-/aqidah_lektionen_deutsch_final.css"
EXAM_CSS = "/home/user/Discipline-/aqidah_pruefung_igcse.css"

TOTAL = None  # computed from source

ARCLASS = "؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿"
AR_ONE = re.compile("[" + ARCLASS + "]")
QURAN = re.compile("[﴾﴿]")

def is_arabic(s):
    letters = [c for c in s if c.isalpha()]
    if not letters:
        return False
    ar = sum(1 for c in s if AR_ONE.match(c))
    return ar >= max(3, len(letters) * 0.4)

def has_quran_marks(s):
    return bool(QURAN.search(s))

def inline(text):
    text = html.escape(text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'<em>\1</em>', text)
    text = re.sub(r'`(.+?)`', r'<code>\1</code>', text)
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', text)
    # point badge 【N P】
    text = re.sub(r'【(\d+)\s*P】', r'<span class="pts">\1 P</span>', text)
    # generic hint 【…】
    text = re.sub(r'【([^】]+)】', r'<span class="hint">\1</span>', text)
    # arabic runs
    pat = "[" + ARCLASS + "](?:[" + ARCLASS + " ]*[" + ARCLASS + "])?"
    text = re.sub(pat, lambda m: '<span class="ar-inline">%s</span>' % m.group(0), text)
    return text

def render_blockquote(lines):
    while lines and not lines[0].strip(): lines.pop(0)
    while lines and not lines[-1].strip(): lines.pop()
    quran = any(has_quran_marks(l) for l in lines)
    rows = []
    box_kind = 'quran' if quran else None
    for l in lines:
        s = l.strip()
        if not s:
            continue
        core = s
        m = re.match(r'^\*(.+)\*$', core)
        if m: core = m.group(1).strip()
        if has_quran_marks(core) or (is_arabic(core) and quran):
            rows.append(('quran-ar', core))
        elif is_arabic(core):
            rows.append(('hadith-ar', core))
            if box_kind is None: box_kind = 'hadith'
        elif re.match(r'^\[.*\]$', core):
            rows.append(('ref', core))
        else:
            rows.append(('trans', core))
    if box_kind is None:
        box_kind = 'scenario'
    out = ['<div class="quote-box %s">' % box_kind]
    for cls, txt in rows:
        if cls == 'quran-ar':
            out.append('  <p class="q-ar">%s</p>' % html.escape(txt))
        elif cls == 'hadith-ar':
            out.append('  <p class="h-ar">%s</p>' % html.escape(txt))
        elif cls == 'ref':
            out.append('  <p class="q-ref">%s</p>' % inline(txt))
        else:
            out.append('  <p class="q-trans">%s</p>' % inline(txt))
    out.append('</div>')
    return '\n'.join(out)

def render_table(rows):
    out = ['<table>']
    cells = [c.strip() for c in rows[0].strip().strip('|').split('|')]
    out.append('<thead><tr>' + ''.join('<th>%s</th>' % inline(c) for c in cells) + '</tr></thead>')
    out.append('<tbody>')
    for r in rows[2:]:
        cells = [c.strip() for c in r.strip().strip('|').split('|')]
        out.append('<tr>' + ''.join('<td>%s</td>' % inline(c) for c in cells) + '</tr>')
    out.append('</tbody></table>')
    return '\n'.join(out)

def convert(md):
    lines = md.split('\n')
    body = []
    i, n = 0, len(lines)
    list_stack = []
    def close_lists():
        while list_stack:
            body.append('</%s>' % list_stack.pop())
    while i < n:
        line = lines[i]
        if line.strip().startswith('```'):
            close_lists(); i += 1; buf = []
            while i < n and not lines[i].strip().startswith('```'):
                buf.append(lines[i]); i += 1
            i += 1
            body.append('<div class="diagram"><pre>' + html.escape('\n'.join(buf)) + '</pre></div>')
            continue
        if line.startswith('>'):
            close_lists(); buf = []
            while i < n and lines[i].startswith('>'):
                buf.append(re.sub(r'^>\s?', '', lines[i])); i += 1
            body.append(render_blockquote(buf)); continue
        if line.strip().startswith('|') and i+1 < n and re.match(r'^\s*\|[\s:|-]+\|\s*$', lines[i+1]):
            close_lists(); buf = []
            while i < n and lines[i].strip().startswith('|'):
                buf.append(lines[i]); i += 1
            body.append(render_table(buf)); continue
        m = re.match(r'^(#{1,6})\s+(.*)$', line)
        if m:
            close_lists()
            level = len(m.group(1)); text = m.group(2)
            idm = re.search(r'\{#([^}]+)\}', text)
            hid = idm.group(1) if idm else None
            text = re.sub(r'\s*\{#[^}]+\}', '', text)
            idattr = ' id="%s"' % hid if hid else ''
            body.append('<h%d%s>%s</h%d>' % (level, idattr, inline(text), level))
            i += 1; continue
        if re.match(r'^---+\s*$', line):
            close_lists(); body.append('<div class="ornament">۞</div>'); i += 1; continue
        mu = re.match(r'^(\s*)([-*])\s+(.*)$', line)
        mo = re.match(r'^(\s*)(\d+)\.\s+(.*)$', line)
        if mu or mo:
            mm = mu or mo; tag = 'ul' if mu else 'ol'
            if not list_stack or list_stack[-1] != tag:
                close_lists(); body.append('<%s>' % tag); list_stack.append(tag)
            body.append('<li>%s</li>' % inline(mm.group(3))); i += 1; continue
        if not line.strip():
            close_lists(); i += 1; continue
        close_lists(); buf = [line]; i += 1
        while i < n and lines[i].strip() and not re.match(r'^(#{1,6}\s|>|```|\||\s*[-*]\s|\s*\d+\.\s|---+\s*$)', lines[i]):
            buf.append(lines[i]); i += 1
        # question paragraphs get a wrapper class if they start with a bold number
        para = ' '.join(b.strip() for b in buf)
        h = inline(para)
        if re.match(r'^<strong>\d+\.</strong>', h):
            body.append('<p class="q">%s</p>' % h)
        else:
            body.append('<p>%s</p>' % h)
    close_lists()
    return '\n'.join(body)

def build_css():
    base = open(BASE_CSS, encoding='utf-8').read()
    add = r'''

/* =========================================================================
   PRÜFUNG (EXAM) — zusätzliche Komponenten, gleiche Farbwelt wie das Buch
   ========================================================================= */
@page {
  @top-center {
    content: "ʿAqīdah-Prüfung · IGCSE · Wichtige Lektionen für die allgemeine Ummah";
    font-family: 'Liberation Serif','DejaVu Serif',serif;
    color: #9a7c2a; font-size: 8.5pt;
  }
}

/* Exam cover */
.exam-sub-ar { font-family:'Amiri',serif; direction:rtl; color:var(--gold-pale);
  font-size:15pt; margin-top:2mm; }
.exam-badge {
  display:inline-block; margin:6mm auto 0; padding:2.5mm 7mm;
  border:1.5px solid var(--gold); border-radius:4px;
  color:var(--gold-pale); letter-spacing:3px; font-size:11pt; text-transform:uppercase;
}

/* Name / Datum / Zeit bar */
.exam-meta {
  width:100%; border-collapse:collapse; margin:0 0 6mm;
  font-size:11pt; page-break-inside:avoid;
}
.exam-meta td {
  border:1px solid var(--gold-pale); padding:4mm 4mm; vertical-align:bottom;
  background:var(--cream);
}
.exam-meta .lbl { font-weight:700; color:var(--green-dark); }
.exam-meta .fill { color:#b9b09a; }

.info-h {
  color:#fff; background:linear-gradient(135deg,var(--green) 0%,var(--green-mid) 100%);
  font-size:13.5pt; padding:5px 14px; margin:8mm 0 4mm; border-left:5px solid var(--gold);
  border-radius:2px; page-break-after:avoid;
}
.rules-box {
  background:var(--beige); border:1px solid var(--gold-pale);
  border-left:4px solid var(--gold); border-radius:4px;
  padding:4mm 6mm; margin:0 0 6mm; page-break-inside:avoid;
}
.rules-box ul, .info-note ul { margin:1mm 0 0; padding-left:6mm; }
.rules-box li, .info-note li { margin:1.6mm 0; }
.info-note {
  background:#f7faf6; border:1px solid #cfe0cb; border-left:4px solid var(--green-mid);
  border-radius:4px; padding:4mm 6mm; margin:0 0 6mm; page-break-inside:avoid;
}
.info-note .k { color:var(--green-dark); font-weight:700; }

/* opening Hadith reuse hadith box but center */
.exam-hadith { margin:0 0 6mm; }

/* grading */
.scale-note { font-weight:700; color:var(--green-dark); text-align:center;
  font-size:12.5pt; margin:2mm 0 4mm; }
.pass-pill { color:#fff; background:var(--green); padding:1px 8px; border-radius:10px; }
.fail-pill { color:#fff; background:#8a3b2a; padding:1px 8px; border-radius:10px; }

/* point badge on questions */
.pts {
  display:inline-block; float:right; margin:0 0 0 4mm;
  background:linear-gradient(135deg,var(--gold) 0%,var(--gold-light) 100%);
  color:#3a2c05; font-weight:700; font-size:9.5pt;
  padding:0.4mm 3mm; border-radius:10px; border:1px solid #a6851d;
  font-family:'Liberation Serif','DejaVu Serif',serif;
}
.hint { color:var(--ink-soft); font-style:italic; font-size:.92em; }

/* question paragraph spacing */
p.q { margin:0 0 4.5mm; padding-top:1mm; page-break-inside:avoid; }
p.q > strong:first-child { color:var(--gold); }

/* scenario (dialogue) boxes for the situational-analysis part */
.quote-box.scenario {
  background:linear-gradient(180deg,#fbfaf4,var(--beige));
  border:1px solid var(--gold-pale); border-left:4px solid var(--green-mid);
  border-radius:4px;
}
.quote-box.scenario .q-trans { text-align:left; font-style:normal; font-size:11pt;
  color:var(--ink); margin:1.5mm 2mm; }
.quote-box.scenario .q-trans strong { color:var(--green-dark); }

.teil-intro { font-style:italic; color:var(--ink-soft); margin:0 0 4mm; }
'''
    open(EXAM_CSS, 'w', encoding='utf-8').write(base + add)

def main():
    global TOTAL
    md = open(SRC, encoding='utf-8').read()
    pts = [int(x) for x in re.findall(r'【(\d+)\s*P】', md)]
    TOTAL = sum(pts)
    pass_pts = -(-TOTAL * 95 // 100)  # ceil(95%)

    build_css()
    body_html = convert(md)

    cover = '''
<section class="cover">
  <div class="cover-frame">
    <div class="cover-corner tl"></div><div class="cover-corner tr"></div>
    <div class="cover-corner bl"></div><div class="cover-corner br"></div>
    <div class="cover-inner">
      <div class="bismillah">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>
      <div class="cover-star">۞</div>
      <h1 class="cover-title-ar">اختبار في العقيدة</h1>
      <div class="cover-rule"></div>
      <h1 class="cover-title-de">Prüfung in der ʿAqīdah</h1>
      <p class="cover-author">zum Werk „Wichtige Lektionen für die allgemeine Ummah in der ʿAqīdah"<br>von Šaykh Aḥmad an-Naǧǧār</p>
      <div class="exam-badge">IGCSE-Prüfung</div>
      <p class="cover-sub" style="margin-top:8mm">Bearbeitungszeit: 2 Stunden &nbsp;·&nbsp; %d Punkte</p>
    </div>
  </div>
</section>
''' % TOTAL

    info_tpl = '''
<section class="content" style="page-break-after:always">
  <h2 style="margin-top:0">Deckblatt &amp; Prüfungsordnung</h2>

  <table class="exam-meta">
    <tr>
      <td style="width:55%"><span class="lbl">Name:</span> <span class="fill">______________________________</span></td>
      <td style="width:20%"><span class="lbl">Datum:</span> <span class="fill">______________</span></td>
      <td style="width:25%"><span class="lbl">Zeit:</span> 2 Stunden</td>
    </tr>
    <tr>
      <td><span class="lbl">Kurs / Gruppe:</span> <span class="fill">__________________</span></td>
      <td><span class="lbl">Erreichte Punkte:</span> <span class="fill">______</span> / @TOTAL@</td>
      <td><span class="lbl">Ergebnis:</span> <span class="fill">__________</span></td>
    </tr>
  </table>

  <div class="exam-hadith">
    <div class="quote-box hadith">
      <p class="h-ar">مَنْ غَشَّنَا فَلَيْسَ مِنَّا</p>
      <p class="q-trans">„Wer uns betrügt, gehört nicht zu uns."</p>
      <p class="q-ref">[Überliefert von Muslim]</p>
    </div>
  </div>

  <div class="info-h">Prüfungsordnung — bitte vor Beginn lesen</div>
  <div class="rules-box">
    <ul>
      <li><strong>Die Nutzung von KI (ChatGPT o. Ä.) ist verboten.</strong></li>
      <li><strong>Spicken, Abschreiben und Schummeln in jeder Form sind verboten.</strong></li>
      <li>Handy, Smartwatch und weitere Hilfsmittel sind ausgeschaltet und weggelegt.</li>
      <li>Es wird eigenständig und in Stille gearbeitet; kein Austausch mit anderen.</li>
      <li>Wer gegen diese Ordnung verstößt, dessen Prüfung gilt als nicht bestanden — denn der Prophet ﷺ sagte: „Wer uns betrügt, gehört nicht zu uns."</li>
    </ul>
  </div>

  <div class="info-h">Hinweise zur Bearbeitung</div>
  <div class="info-note">
    <ul>
      <li><span class="k">Antwortform:</span> Die Prüfung enthält nur Fragen (Angaben) — <strong>keine</strong> Lückentexte. Schreibe alle Antworten auf ein separates Blatt oder tippe sie leserlich auf iPad/PC ab (mit der jeweiligen Fragenummer).</li>
      <li><span class="k">Punkte:</span> Hinter jeder Frage steht die erreichbare Punktzahl <span class="pts" style="float:none">z. B. 3&nbsp;P</span>.</li>
      <li><span class="k">Qurʾān &amp; Ḥadīṯ:</span> Es müssen <strong>keine</strong> Āyāt wörtlich und <strong>keine</strong> Ḥadīṯ-Nummern auswendig angegeben werden. Auch die Beweise, die der Scheich im Text anführt, müssen nicht wörtlich zitiert werden — der <strong>grobe Inhalt</strong> (was geschah, was der Vers/Ḥadīṯ sinngemäß aussagt) genügt und ist erwünscht.</li>
      <li><span class="k">Was gewusst werden muss:</span> die konkreten Inhalte <strong>aus diesem Text</strong> — Definitionen, Listen (z. B. die Vernichter / Nawāqiḍ), Beispiele, Einteilungen und Prinzipien, so wie sie im Unterricht behandelt wurden. Es wird gezielt <strong>der Text</strong> geprüft, nicht allgemeines ʿAqīdah-Wissen von anderswo.</li>
    </ul>
  </div>

  <div class="info-h">Bewertungsschlüssel</div>
  <p class="scale-note">Gesamtpunktzahl: @TOTAL@ Punkte &nbsp;·&nbsp; Bestanden ab <span class="pass-pill">95&nbsp;%</span> (mindestens @PASS@ Punkte)</p>
  <table>
    <thead><tr><th>Prozent</th><th>Punkte (von @TOTAL@)</th><th>Bewertung</th><th>Ergebnis</th></tr></thead>
    <tbody>
      <tr><td>98–100&nbsp;%</td><td>@P98@–@TOTAL@</td><td>ausgezeichnet</td><td>bestanden</td></tr>
      <tr><td>95–97&nbsp;%</td><td>@PASS@–@P97@</td><td>sehr gut</td><td>bestanden</td></tr>
      <tr><td>unter 95&nbsp;%</td><td>0–@FAIL@</td><td>—</td><td>nicht bestanden (Wiederholung)</td></tr>
    </tbody>
  </table>
  <p class="teil-intro">Diese Prüfung folgt dem Aufbau des Werkes: von der Einleitung und den Quellen über die sechs Säulen des Īmān (Tor 1) hin zur Definition des Glaubens, den Ṣaḥābah und dem Imamat (Tor 2), und schließt mit einem angewandten Teil (Situationsanalyse). Beginne mit den Teilen, die dir leichtfallen. Möge Allah dir Gelingen schenken.</p>
</section>
'''
    repl = {
        '@TOTAL@': str(TOTAL),
        '@PASS@': str(pass_pts),
        '@P98@': str(-(-TOTAL * 98 // 100)),
        '@P97@': str((TOTAL * 97) // 100),
        '@FAIL@': str(pass_pts - 1),
    }
    info = info_tpl
    for k, v in repl.items():
        info = info.replace(k, v)

    doc = ('<!DOCTYPE html>\n<html lang="de" dir="ltr">\n<head>\n'
           '<meta charset="utf-8">\n'
           '<title>ʿAqīdah-Prüfung (IGCSE)</title>\n'
           '<link rel="stylesheet" href="aqidah_pruefung_igcse.css">\n'
           '</head>\n<body>\n'
           + cover + info +
           '\n<main class="content">\n' + body_html + '\n</main>\n</body>\n</html>')

    open(OUT, 'w', encoding='utf-8').write(doc)
    print("Wrote", OUT, "(%d bytes)" % len(doc), "| total=%d pass>=%d" % (TOTAL, pass_pts))

if __name__ == '__main__':
    main()
