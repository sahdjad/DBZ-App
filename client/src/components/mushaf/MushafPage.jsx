// Eine Mushaf-Seite für den Vollbild-Leser -- gemeinsam für „Lesen" und
// „Auswendig rezitieren".
//  - Ansicht „Mushaf": echte Medina-Seite (offizielle Seitenschrift, Zeilen
//    wie gedruckt, Auto-Fit auf die Bildschirmgröße).
//  - Ansicht „Text": dieselbe Seite als Fließtext mit einstellbarer Schriftgröße.
// Am Rand wie im gedruckten Mushaf: Sure und Juzʼ oben, Hizb und Seitenzahl unten.
//
// Was mit einem Wort passiert (Markierung, aktuelles Wort, versteckt …),
// entscheidet der Aufrufer über renderWord(w) -> { className, style, html }.
// Jedes Wort trägt data-v (Sure:Ayah) und data-g (Nummer im Qur'an-Index).
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ensurePageFont, isPageFontLoaded, useMushafAutoFit } from '../../lib/mushafFont.js';
import { TEXT_SIZES } from '../../lib/mushafPages.js';
import { cleanQuran } from '../../lib/quranText.js';

const QUARTER = ['', '¼', '½', '¾'];

function MushafPage({ data, index, surahName, prefs, forceTextLayout = false, renderWord, reserve = 88, version }) {
  const [fontTick, setFontTick] = useState(0);
  const wantsFont = prefs.view === 'mushaf' && !forceTextLayout && data.font === 'v1';
  useEffect(() => {
    if (!wantsFont || isPageFontLoaded(data.fontPage)) return undefined;
    let alive = true;
    ensurePageFont(data.fontPage).then(() => { if (alive) setFontTick((t) => t + 1); });
    return () => { alive = false; };
  }, [wantsFont, data.fontPage]);
  const glyph = wantsFont && isPageFontLoaded(data.fontPage);
  const textView = prefs.view === 'text';
  const fitted = !textView && (glyph || forceTextLayout);

  const elRef = useRef(null);
  const { fs, width, shortLines } = useMushafAutoFit(elRef, {
    active: fitted,
    numLines: data.lines.length,
    resetKey: `${data.page}:${glyph}:${forceTextLayout}:${fontTick}`,
    layout: prefs.layout,
    reserve,
  });

  // Wortnummer in der Ayah (p vom Server, sonst gezählt) + Index-Nummer g.
  const lines = useMemo(() => {
    const counter = {};
    return data.lines.map((line) => ({
      n: line.n,
      words: line.words.map((w) => {
        if (w.e) return { ...w, g: null, wi: null };
        counter[w.v] = (counter[w.v] || 0) + 1;
        const wi = Number.isInteger(w.p) ? w.p : counter[w.v];
        const [s, a] = w.v.split(':').map(Number);
        return { ...w, wi, g: index ? index.wordOf(s, a, wi) : null };
      }),
    }));
  }, [data, index]);
  const heads = useMemo(() => {
    const placed = new Set();
    const out = {};
    for (const line of data.lines) for (const w of line.words) {
      if (data.starts?.[w.v] && !placed.has(w.v)) { placed.add(w.v); (out[line.n] ||= []).push(data.starts[w.v]); }
    }
    return out;
  }, [data]);

  const info = index ? index.pageInfo(data.page) : null;
  // Beginnt auf dieser Seite ein neues Viertel? (¼, ½, ¾ Hizb wie am Mushaf-Rand)
  const quarterHere = index ? index.quarters.find((q) => q.page === data.page) : null;
  const firstSurah = info?.surah || data.surahs?.[0];

  const word = (w, key) => {
    const r = renderWord ? renderWord(w, data) : {};
    const glyphStyle = glyph && w.g && !r.html ? { fontFamily: `qcf-p${data.fontPage}` } : undefined;
    const common = {
      key,
      'data-v': w.v,
      ...(w.g != null ? { 'data-g': w.g } : {}),
      className: `mushaf-word ${w.e ? 'mushaf-end' : ''} ${r.className || ''}`,
      style: r.style ? { ...glyphStyle, ...r.style } : glyphStyle,
      'aria-hidden': r.hidden || w.e ? true : undefined,
    };
    if (r.html) return <span {...common} dangerouslySetInnerHTML={{ __html: r.html }} />;
    if (w.e) return <span {...common}>{glyph && w.g ? w.g : `﴿${cleanQuran(w.t)}﴾`}{!glyph ? ' ' : ''}</span>;
    return <span {...common}>{glyph && w.g ? w.g : cleanQuran(w.t)}{glyph ? '' : ' '}</span>;
  };

  const head = (h) => (
    <div key={h.surah} className="mushaf-surah-head">
      <div className="text-mint" style={{ fontSize: '1.05em' }} dir="rtl">سُورَةُ {h.name}</div>
      {h.bismillah && <div dir="rtl" className="mt-1" style={{ fontSize: '0.9em' }}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>}
    </div>
  );

  let body;
  if (textView) {
    // Fließtext: Absatz je Sure-Abschnitt, Zeilenfall des Bildschirms.
    const blocks = [];
    let cur = [];
    lines.forEach((line) => {
      if (heads[line.n]) {
        if (cur.length) blocks.push(<p key={`p${blocks.length}`} className="mushaf-flow" dir="rtl">{cur}</p>);
        cur = [];
        heads[line.n].forEach((h) => blocks.push(head(h)));
      }
      line.words.forEach((w, i) => cur.push(word(w, `${line.n}-${i}`)));
    });
    if (cur.length) blocks.push(<p key={`p${blocks.length}`} className="mushaf-flow" dir="rtl">{cur}</p>);
    body = <div className="mushaf-text-body" style={{ fontSize: `${TEXT_SIZES[prefs.textSize]}rem` }}>{blocks}</div>;
  } else {
    body = (
      <div className="mushaf-lines">
        {lines.map((line) => (
          <div key={line.n} className="mushaf-line-wrap">
            {(heads[line.n] || []).map(head)}
            <p data-line={line.n} className={`mushaf-line ${(fitted ? shortLines.has(String(line.n)) : line.words.length <= 6) ? 'is-short' : ''}`}>
              {line.words.map((w, i) => word(w, i))}
            </p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <article className="mushaf-sheet" data-page={data.page} aria-label={`Seite ${data.page}`}>
      <header className="mushaf-margin">
        <span>{firstSurah ? surahName(firstSurah) : ''}</span>
        <span>{info ? `Juzʼ ${info.juz}` : data.juz ? `Juzʼ ${data.juz}` : ''}</span>
      </header>
      <div
        ref={elRef}
        className={`mushaf-page font-mushaf mx-auto ${fitted ? 'is-glyph' : ''} ${textView ? 'is-text' : ''}`}
        style={textView ? undefined : {
          fontSize: fitted ? (fs ? `${fs}px` : 'clamp(1.1rem, 4.2vw, 1.7rem)') : 'clamp(1.3rem, 4.4vw, 1.85rem)',
          width: fitted && width ? `${width}px` : undefined,
          maxWidth: fitted ? '100%' : '44rem',
        }}
      >
        {body}
      </div>
      <footer className="mushaf-margin">
        <span>{info ? `${quarterHere && quarterHere.quarter > 1 ? `${QUARTER[quarterHere.quarter - 1]} ` : ''}Hizb ${quarterHere ? quarterHere.hizb : info.hizb}` : ''}</span>
        <span className="mushaf-pageno">{data.page}</span>
        <span />
      </footer>
    </article>
  );
}

// Neu zeichnen nur, wenn sich Seite, Ansicht oder der Stand des Aufrufers (version) ändert.
export default memo(MushafPage, (a, b) => a.data === b.data && a.index === b.index && a.prefs === b.prefs
  && a.forceTextLayout === b.forceTextLayout && a.version === b.version && a.reserve === b.reserve);
