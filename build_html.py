#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Custom Markdown -> semantic HTML converter for the Aqidah translation.
Professional Islamic-styled document: cover, TOC, Quran/Hadith boxes, diagrams, tables."""
import re, html

SRC = "/home/user/Discipline-/aqidah_lektionen_deutsch_final.md"
OUT = "/home/user/Discipline-/aqidah_lektionen_deutsch_final.html"

# Arabic blocks + presentation forms (incl. U+FDFA salla, U+FD3E/F ornate parens)
ARCLASS = "؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿"
AR_ONE = re.compile("[" + ARCLASS + "]")
QURAN = re.compile("[﴾﴿]")  # ornate parentheses around Quran

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
    # footnote reference marker [^1] -> superscript
    text = re.sub(r'\[\^(\d+)\]', r'<sup class="fn-ref">\1</sup>', text)
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
        box_kind = 'note'
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

def main():
    with open(SRC, encoding='utf-8') as f:
        lines = f.read().split('\n')

    for idx, l in enumerate(lines):
        if l.startswith('## Über den Autor'):
            lines = lines[idx:]
            break

    body = []
    i, n = 0, len(lines)
    list_stack = []

    def close_lists():
        while list_stack:
            body.append('</%s>' % list_stack.pop())

    while i < n:
        line = lines[i]
        if line.strip().startswith('```'):
            lang = line.strip()[3:].strip().lower()
            close_lists(); i += 1; buf = []
            while i < n and not lines[i].strip().startswith('```'):
                buf.append(lines[i]); i += 1
            i += 1
            raw = '\n'.join(buf)
            if lang == 'html':
                # flow-diagram passthrough: emit the raw HTML so it renders
                body.append(raw)
            else:
                body.append('<div class="diagram"><pre>' + html.escape(raw) + '</pre></div>')
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
        mfn = re.match(r'^\[\^(\d+)\]:\s*(.*)$', line)
        if mfn:
            close_lists()
            body.append('<div class="footnote"><span class="fn-num">%s</span> %s</div>'
                        % (mfn.group(1), inline(mfn.group(2))))
            i += 1; continue
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
        body.append('<p>%s</p>' % inline(' '.join(b.strip() for b in buf)))
    close_lists()

    body_html = '\n'.join(body)

    doc = '''<!DOCTYPE html>
<html lang="de" dir="ltr">
<head>
<meta charset="utf-8">
<title>Wichtige Lektionen für die allgemeine Ummah in der ʿAqīdah</title>
<link rel="stylesheet" href="aqidah_lektionen_deutsch_final.css">
</head>
<body>

<section class="cover">
  <div class="cover-frame">
    <div class="cover-corner tl"></div>
    <div class="cover-corner tr"></div>
    <div class="cover-corner bl"></div>
    <div class="cover-corner br"></div>
    <div class="cover-inner">
      <div class="bismillah">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>
      <div class="cover-star">۞</div>
      <h1 class="cover-title-ar">دروس مهمة لعامة الأمة في العقيدة</h1>
      <div class="cover-rule"></div>
      <h1 class="cover-title-de">Wichtige Lektionen<br>für die allgemeine Ummah<br>in der ʿAqīdah</h1>
      <div class="cover-star small">۞</div>
      <p class="cover-author">Šaykh Aḥmad ibn Muḥammad ibn aṣ-Ṣādiq an-Naǧǧār</p>
      <p class="cover-sub">Deutsche Übersetzung</p>
    </div>
  </div>
</section>

<section class="title-page">
  <div class="tp-ornament">۞ ❁ ۞</div>
  <h1 class="tp-title">Wichtige Lektionen für die allgemeine Ummah in der ʿAqīdah</h1>
  <p class="tp-ar">دروس مهمة لعامة الأمة في العقيدة</p>
  <div class="tp-line"></div>
  <p class="tp-author"><strong>Verfasser:</strong><br>Abū Asmā Aḥmad ibn Muḥammad ibn aṣ-Ṣādiq an-Naǧǧār</p>
  <p class="tp-meta">Vollständige deutsche Übersetzung<br>im islamisch-akademischen Stil</p>
  <div class="tp-ornament bottom">۞ ❁ ۞</div>
</section>

<main class="content">
''' + body_html + '''
</main>

</body>
</html>'''

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(doc)
    print("Wrote", OUT, "(%d bytes)" % len(doc))

if __name__ == '__main__':
    main()
