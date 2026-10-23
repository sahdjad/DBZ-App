// Eine Muṣḥaf-Seite für den Vollbild-Leser -- gemeinsam für „Lesen" und
// „Auswendig rezitieren".
//  - Ansicht „Mushaf": die gedruckte Seite des Muṣḥaf al-Madīnah (1421H):
//    15 feste Zeilen, jedes Wort als Glyph der Seitenschrift des King Fahd
//    Complex, Sure-Köpfe und Basmala an ihrer gedruckten Zeile. Die Seite
//    skaliert nur als Ganzes (gleiches Seitenverhältnis auf jedem Gerät) --
//    kein Wort wandert je in eine andere Zeile oder auf eine andere Seite.
//  - Ansicht „Text": dieselbe Seite als Fließtext mit einstellbarer Schriftgröße.
//  - Tadschwid (forceTextLayout): die 15 Zeilen der Seite mit farbigem
//    Unicode-Text (Tadschwid-Farben gibt es für die Seitenschrift nicht).
// Am Rand wie im gedruckten Mushaf: Sure und Juzʼ oben, Hizb und Seitenzahl unten.
//
// Was mit einem Wort passiert (Markierung, aktuelles Wort, versteckt …),
// entscheidet der Aufrufer über renderWord(w) -> { className, style, html }.
// Jedes Wort trägt data-v (Sure:Ayah) und data-g (Nummer im Qur'an-Index).
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { pageFontFamily, BASMALA_FONT } from '../../lib/mushafFont.js';
import { TEXT_SIZES } from '../../lib/mushafPages.js';
import { cleanQuran } from '../../lib/quranText.js';

// Geometrie der gedruckten Seite in em der Seitenschrift (gemessen über alle
// 8.790 Zeilen, scripts/check-mushaf-widths.mjs): längste Zeile 16,22 em,
// typische 15,6 em. Zeilenabstand so, dass 15 Zeilen das Seitenverhältnis des
// Drucks ergeben.
const PAGE_EM = 16.4;
const SLOT_EM = 1.72;
const LINES = 15;
const BASMALA_TEXT = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
const QUARTER = ['', '¼', '½', '¾'];

// Schriftgröße so, dass die ganze Seite auf den Bildschirm passt ('tight') bzw.
// die Breite füllt ('wide', „Große Schrift": dann wird gescrollt).
function useFit(ref, { layout, reserve, measure, key }) {
  const [fit, setFit] = useState(null);
  useLayoutEffect(() => {
    const run = () => {
      const el = ref.current;
      if (!el) return;
      const availW = Math.min(el.parentElement?.clientWidth || document.documentElement.clientWidth, 900) - 20;
      const availH = Math.max(320, window.innerHeight - reserve);
      let em = PAGE_EM;
      if (measure) {
        // Unicode-Zeilen (Tadschwid): natürliche Breite der längsten Zeile messen.
        const REF = 100;
        const prev = el.style.fontSize;
        el.style.fontSize = `${REF}px`;
        let max = 0;
        el.querySelectorAll('.mushaf-line').forEach((l) => {
          const gap = parseFloat(getComputedStyle(l).columnGap) || 0;
          const kids = [...l.children];
          const w = kids.reduce((sum, k) => sum + k.getBoundingClientRect().width, 0) + gap * Math.max(0, kids.length - 1);
          max = Math.max(max, w);
        });
        el.style.fontSize = prev;
        if (max > 0) em = (max / REF) * 1.02;
      }
      const byW = availW / em;
      const byH = availH / (LINES * SLOT_EM);
      const fs = layout === 'wide' ? Math.min(byW, 46) : Math.min(byW, byH);
      // Hochformat (Handy): die 15 Zeilen über die verfügbare Höhe verteilen,
      // wie in Muṣḥaf-Apps -- nur der Zeilenabstand wächst, Zeileninhalt und
      // Breite bleiben exakt gleich.
      const slot = layout === 'wide' ? SLOT_EM : Math.max(SLOT_EM, Math.min(availH / LINES / fs, SLOT_EM * 1.45));
      setFit((f) => (f && Math.abs(f.fs - fs) < 0.05 && f.em === em && Math.abs(f.slot - slot) < 0.01 ? f : { fs, em, slot }));
    };
    run();
    window.addEventListener('resize', run);
    return () => window.removeEventListener('resize', run);
  }, [layout, reserve, measure, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return fit;
}

function SurahHead({ name }) {
  return (
    <div className="mushaf-surah-frame" dir="rtl"><span>سُورَةُ {name}</span></div>
  );
}

function MushafPage({ data, index, surahName, prefs, forceTextLayout = false, renderWord, reserve = 72, version }) {
  const textView = prefs.view === 'text';
  const unicodeLines = !textView && forceTextLayout;
  const elRef = useRef(null);
  // Neu messen nur bei Unicode-Zeilen (Tadschwid-Farben ändern die Breite);
  // die Glyph-Seite hat feste Maße.
  const fit = useFit(elRef, { layout: prefs.layout, reserve, measure: unicodeLines, key: `${data.page}:${unicodeLines ? version : ''}` });

  // Wortnummer im Qur'an-Index (g; bei 37:130 „إِلْ يَاسِينَ" zwei Index-Wörter).
  const lines = useMemo(() => data.lines.map((line) => (line.type !== 'text' ? line : {
    ...line,
    words: line.words.map((w) => {
      if (w.e) return { ...w, glyph: w.g, g: null, wi: null };
      const [s, a] = w.v.split(':').map(Number);
      const g = index ? index.wordOf(s, a, w.x ?? w.p) : null;
      return { ...w, glyph: w.g, wi: w.p, g, gEnd: g != null && w.xn > 1 ? g + w.xn - 1 : null };
    }),
  })), [data, index]);

  const info = index ? index.pageInfo(data.page) : null;
  const quarterHere = index ? index.quarters.find((q) => q.page === data.page) : null;
  const firstSurah = info?.surah || data.surahs?.[0];

  const word = (w, key) => {
    const r = renderWord ? renderWord(w, data) : {};
    const props = {
      key,
      'data-v': w.v,
      ...(w.g != null ? { 'data-g': w.g } : {}),
      className: `mushaf-word ${w.e ? 'mushaf-end' : ''} ${r.className || ''}`,
      style: r.style,
      'aria-hidden': r.hidden || w.e ? true : undefined,
    };
    if (textView || unicodeLines) {
      if (r.html && !w.e) return <span {...props} dangerouslySetInnerHTML={{ __html: r.html }} />;
      return <span {...props}>{w.e ? `﴿${cleanQuran(w.t)}﴾` : cleanQuran(w.t)}</span>;
    }
    return <span {...props}>{w.glyph}</span>;
  };

  let body;
  if (textView) {
    // Fließtext: Absatz je Sure-Abschnitt, Zeilenfall des Bildschirms.
    const blocks = [];
    let cur = [];
    const flush = () => { if (cur.length) blocks.push(<p key={`p${blocks.length}`} className="mushaf-flow" dir="rtl">{cur}</p>); cur = []; };
    lines.forEach((line) => {
      if (line.type === 'surah') { flush(); blocks.push(<SurahHead key={`h${line.n}`} name={line.name} />); return; }
      if (line.type === 'basmala') { flush(); blocks.push(<p key={`b${line.n}`} className="mushaf-flow text-center" dir="rtl">{BASMALA_TEXT}</p>); return; }
      line.words.forEach((w, i) => { cur.push(word(w, `${line.n}-${i}`)); cur.push(' '); });
    });
    flush();
    body = <div className="mushaf-text-body" style={{ fontSize: `${TEXT_SIZES[prefs.textSize]}rem` }}>{blocks}</div>;
  } else {
    const opening = data.page <= 2; // Seiten 1–2: 8 Zeilen, mittig im Rahmen wie gedruckt
    body = (
      <div className={`mushaf-lines ${opening ? 'is-opening' : ''}`} style={unicodeLines ? undefined : { fontFamily: `'${pageFontFamily(data.page)}'` }}>
        {lines.map((line) => (
          <div key={line.n} className="mushaf-slot" data-line={line.n}>
            {line.type === 'surah' && <SurahHead name={line.name} />}
            {line.type === 'basmala' && (
              unicodeLines
                ? <p className="mushaf-line is-center" dir="rtl">{BASMALA_TEXT}</p>
                : <p className="mushaf-line is-center mushaf-basmala" style={{ fontFamily: `'${BASMALA_FONT}'` }} aria-label={BASMALA_TEXT}>{line.g}</p>
            )}
            {line.type === 'text' && (
              <p className={`mushaf-line ${line.c || opening ? 'is-center' : ''}`} dir="rtl">
                {line.words.map((w, i) => word(w, i))}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  }

  const pageW = fit && !textView ? `${fit.em * fit.fs}px` : undefined;
  return (
    <article className="mushaf-sheet" data-page={data.page} aria-label={`Seite ${data.page}`}>
      <header className="mushaf-margin" style={{ maxWidth: pageW }}>
        <span>{firstSurah ? surahName(firstSurah) : ''}</span>
        <span>{info ? `Juzʼ ${info.juz}` : ''}</span>
      </header>
      <div
        ref={elRef}
        className={`mushaf-page mx-auto ${textView ? 'is-text font-mushaf' : 'is-paged'} ${unicodeLines ? 'font-mushaf' : ''}`}
        style={textView ? undefined : {
          fontSize: fit ? `${fit.fs}px` : '22px',
          width: pageW,
          visibility: fit ? undefined : 'hidden',
          '--slot': `${fit?.slot || SLOT_EM}em`,
        }}
      >
        {body}
      </div>
      <footer className="mushaf-margin" style={{ maxWidth: pageW }}>
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
