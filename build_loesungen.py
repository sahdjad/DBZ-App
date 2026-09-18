#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the Musterlösung (answer key) markdown/HTML/PDF/DOCX for both
Ijazah-Pruefung variants, matching each variant's own question order via
exact text matching against the canonical source."""
import re, sys
sys.path.insert(0, "/home/user/DBZ-App")
from ijazah_answers import ANSWERS
import build_ijazah as bi

CANON = "/home/user/DBZ-App/aqidah_ijazah_pruefung.md"

def parse_sections(path):
    text = open(path, encoding="utf-8").read()
    parts = re.split(r'(?m)^(?=## )', text)
    sections = [p for p in parts if p.strip().startswith("## ")]
    out = []
    for sec in sections:
        body = sec.rstrip()
        body = re.sub(r'\n---\s*$', '', body)
        header_m = re.match(r'^(## .*\{#[^}]+\})\s*\n', body)
        header = header_m.group(1) if header_m else sec.split("\n")[0]
        qm = re.search(r'(?m)^\*\*\d+\.\*\*', body)
        if not qm:
            out.append((header, []))
            continue
        qtext = body[qm.start():]
        pieces = re.split(r'(?m)(?=^\*\*\d+\.\*\*)', qtext)
        pieces = [pc.strip() for pc in pieces if pc.strip()]
        questions = []
        for pc in pieces:
            m = re.match(r'^\*\*(\d+)\.\*\*\s*(.*)$', pc, flags=re.S)
            num = int(m.group(1))
            rest = m.group(2).strip()
            # normalize: drop point badge for matching purposes
            key = re.sub(r'【\d+\s*P】', '', rest).strip()
            key = re.sub(r'\s+', ' ', key)
            questions.append((num, key))
        out.append((header, questions))
    return out

canon_sections = parse_sections(CANON)
# canonical numbering 1..100 == dict key directly (Hauptpruefung order)
canon_key_to_id = {}
cid = 0
for _, qs in canon_sections:
    for _, key in qs:
        cid += 1
        canon_key_to_id[key] = cid

def build_loesung_md(variant_path, title_suffix):
    sections = parse_sections(variant_path)
    out = []
    for header, qs in sections:
        out.append(header)
        for num, key in qs:
            cid = canon_key_to_id.get(key)
            if cid is None:
                raise SystemExit("No match for question %d in %s: %r" % (num, variant_path, key[:80]))
            answer = ANSWERS[cid]
            out.append("**%d.** %s" % (num, answer))
        out.append("---")
    return "\n\n".join(out) + "\n"

def render(md_text, out_html, out_css, css_link, title):
    bi.build_css(out_css)
    body_html = bi.convert(md_text)
    cover = '''
<section class="cover">
  <div class="cover-frame">
    <div class="cover-corner tl"></div><div class="cover-corner tr"></div>
    <div class="cover-corner bl"></div><div class="cover-corner br"></div>
    <div class="cover-inner">
      <div class="bismillah">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>
      <div class="cover-star">۞</div>
      <h1 class="cover-title-ar">حلول اختبار الإجازة في العقيدة</h1>
      <div class="cover-rule"></div>
      <h1 class="cover-title-de">Musterlösung</h1>
      <p class="cover-author">zur Ijāzah-Prüfung in der ʿAqīdah<br>zum Werk „Wichtige Lektionen für die allgemeine Ummah in der ʿAqīdah"</p>
      <div class="exam-badge">%s</div>
      <p class="cover-sub" style="margin-top:8mm">Nur zur Selbstkontrolle nach der Bearbeitung — ungefähre Lösungen</p>
    </div>
  </div>
</section>
''' % title
    doc = ('<!DOCTYPE html>\n<html lang="de" dir="ltr">\n<head>\n'
           '<meta charset="utf-8">\n'
           '<title>Musterlösung — ʿAqīdah-Ijāzah-Prüfung (%s)</title>\n'
           '<link rel="stylesheet" href="%s">\n'
           '</head>\n<body>\n'
           % (title, css_link)
           + cover +
           '\n<main class="content">\n' + body_html + '\n</main>\n</body>\n</html>')
    open(out_html, 'w', encoding='utf-8').write(doc)
    print("Wrote", out_html)

if __name__ == '__main__':
    main_md = build_loesung_md(
        "/home/user/DBZ-App/aqidah_ijazah_pruefung_hauptpruefung.md", "HAUPTPRÜFUNG")
    open("/home/user/DBZ-App/aqidah_ijazah_loesungen_hauptpruefung.md", "w", encoding="utf-8").write(main_md)
    render(main_md,
           "/home/user/DBZ-App/aqidah_ijazah_loesungen_hauptpruefung.html",
           "/home/user/DBZ-App/aqidah_ijazah_loesungen_hauptpruefung.css",
           "aqidah_ijazah_loesungen_hauptpruefung.css", "HAUPTPRÜFUNG")

    prep_md = build_loesung_md(
        "/home/user/DBZ-App/aqidah_ijazah_pruefung_vorbereitung.md", "VORBEREITUNGSPRÜFUNG")
    open("/home/user/DBZ-App/aqidah_ijazah_loesungen_vorbereitung.md", "w", encoding="utf-8").write(prep_md)
    render(prep_md,
           "/home/user/DBZ-App/aqidah_ijazah_loesungen_vorbereitung.html",
           "/home/user/DBZ-App/aqidah_ijazah_loesungen_vorbereitung.css",
           "aqidah_ijazah_loesungen_vorbereitung.css", "VORBEREITUNGSPRÜFUNG")
