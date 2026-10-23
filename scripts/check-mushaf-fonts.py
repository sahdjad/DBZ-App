# Prüft die eingebauten Muṣḥaf-Seiten (client/public/mushaf/qpc-v2) gegen die
# Seitenschriften des King Fahd Complex: jedes Zeichen jeder Seite muss in der
# Zeichentabelle GENAU DIESER Seitenschrift stehen (sonst würde der Browser ein
# anderes Wort oder ein Ersatzzeichen zeigen). Basmala gegen QCF2BSML.
#
#   python3 scripts/check-mushaf-fonts.py      (benötigt fonttools + brotli)
import json
import os
import sys

from fontTools.ttLib import TTFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'client', 'public', 'mushaf', 'qpc-v2')
errors = []
notes = []
used_total = 0

bsml = TTFont(os.path.join(ROOT, 'fonts', 'QPC2BSML.ttf')).getBestCmap()
for page in range(1, 605):
    with open(os.path.join(ROOT, 'pages', f'{page:03d}.json'), encoding='utf-8') as fh:
        data = json.load(fh)
    font = TTFont(os.path.join(ROOT, 'fonts', f'p{page:03d}.woff2'))
    cmap = font.getBestCmap()
    used = set()
    for line in data['lines']:
        if line['type'] == 'basmala':
            for ch in line['g']:
                if ord(ch) not in bsml:
                    errors.append(f'Seite {page} Basmala: U+{ord(ch):04X} fehlt in QCF2BSML')
        for word in line.get('words', []):
            for ch in word['g']:
                if ch.isspace():
                    continue
                used.add(ord(ch))
                if ord(ch) not in cmap:
                    errors.append(f"Seite {page} {word['v']}: U+{ord(ch):04X} fehlt in p{page:03d}")
    # Lückenlos: Die Wort-Glyphen einer Seite sind fortlaufend nummeriert -- eine
    # Lücke hieße, ein Wort der Seite fehlt.
    gaps = [c for c in range(min(used), max(used) + 1) if c not in used]
    if gaps:
        errors.append(f'Seite {page}: Lücke in der Glyphfolge bei U+{gaps[0]:04X} ({len(gaps)})')
    # Zusatzglyphen hinter dem letzten Wort (Varianten der letzten Zeile, Zierzeichen)
    # sind kein Fehler -- nur zur Information.
    extra = {c for c in cmap if c >= 0xF000} - used
    if extra:
        notes.append(f'S. {page}: {len(extra)}')
    used_total += len(used)

if errors:
    print('\n'.join(errors[:50]))
    print(f'FEHLER: {len(errors)}')
    sys.exit(1)
print(f"Zusatzglyphen ohne Verwendung (Varianten/Zierzeichen): {', '.join(notes) or 'keine'}")
print(f'OK: 604 Seiten, {used_total} Glyphen, alle in der passenden Seitenschrift; Basmala vollständig')
