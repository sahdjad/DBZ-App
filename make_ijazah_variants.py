#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Parse the canonical Ijazah-exam markdown into sections/questions and emit
two variants: Hauptpruefung (canonical order) and Vorbereitung (questions
reshuffled within each section, deterministic seed), both renumbered 1..N."""
import re, random

SRC = "/home/user/DBZ-App/aqidah_ijazah_pruefung.md"
OUT_MAIN = "/home/user/DBZ-App/aqidah_ijazah_pruefung_hauptpruefung.md"
OUT_PREP = "/home/user/DBZ-App/aqidah_ijazah_pruefung_vorbereitung.md"

text = open(SRC, encoding="utf-8").read()

# Split into sections by "## " headers, keep the header line with each section
parts = re.split(r'(?m)^(?=## )', text)
header_block = ""
sections = []
for p in parts:
    if not p.strip():
        continue
    if p.startswith("## "):
        sections.append(p)
    else:
        header_block += p

def split_questions(section_text):
    """Return (preamble, [question_blocks]) where preamble is the header +
    intro italics line, and each question_block starts at '**N.**' and runs
    until the next '**N.**' or end/trailing '---'."""
    # strip trailing --- separator (keep it out, we re-add)
    body = section_text.rstrip()
    trailing_sep = ""
    m = re.search(r'\n---\s*$', body)
    if m:
        trailing_sep = "\n\n---\n"
        body = body[:m.start()]
    # find first question marker
    qm = re.search(r'(?m)^\*\*\d+\.\*\*', body)
    if not qm:
        return body + trailing_sep, []
    preamble = body[:qm.start()].rstrip()
    qtext = body[qm.start():]
    # split on lines that start a new question
    pieces = re.split(r'(?m)(?=^\*\*\d+\.\*\*)', qtext)
    pieces = [pc.rstrip() for pc in pieces if pc.strip()]
    return preamble, pieces, trailing_sep

parsed = []
for sec in sections:
    preamble, qs, trailing_sep = split_questions(sec)
    parsed.append((preamble, qs, trailing_sep))

total_q = sum(len(qs) for _, qs, _ in parsed)
print("Sections:", len(parsed), "Total questions:", total_q)

def renumber_and_join(preamble, qs, trailing_sep, counter):
    out = [preamble]
    for q in qs:
        counter[0] += 1
        q2 = re.sub(r'^\*\*\d+\.\*\*', '**%d.**' % counter[0], q, count=1)
        out.append(q2)
    return "\n\n".join(out) + trailing_sep

# --- Hauptpruefung: canonical order ---
counter = [0]
main_out = header_block + "\n\n".join(
    renumber_and_join(pre, qs, sep, counter) for pre, qs, sep in parsed
)
open(OUT_MAIN, "w", encoding="utf-8").write(main_out.rstrip() + "\n")
print("Hauptpruefung total questions:", counter[0])

# --- Vorbereitung: shuffle within each section (seeded) ---
random.seed(42)
counter2 = [0]
prep_chunks = []
for pre, qs, sep in parsed:
    qs2 = qs[:]
    random.shuffle(qs2)
    prep_chunks.append(renumber_and_join(pre, qs2, sep, counter2))
prep_out = header_block + "\n\n".join(prep_chunks)
open(OUT_PREP, "w", encoding="utf-8").write(prep_out.rstrip() + "\n")
print("Vorbereitung total questions:", counter2[0])

# sanity: same point totals
def point_total(s):
    return sum(int(x) for x in re.findall(r'【(\d+)\s*P】', s))

print("Points main:", point_total(main_out), "prep:", point_total(prep_out))
