// Vollbild-Leser für den Mushaf -- gemeinsam für „Lesen" und „Auswendig
// rezitieren" (Vorbild: gängige Qur'an-Apps auf dem iPhone).
//  - Die Seite füllt den Bildschirm. Einmal tippen blendet die Leisten ein/aus:
//    oben Zurück, Inhalt, Suche, Seite, Einstellungen; unten die Steuerung des
//    Aufrufers (Wiedergabe bzw. Mikrofon) und der Seitenregler.
//  - Blättern waagerecht (wischen, Pfeiltasten) oder senkrecht (alle Seiten
//    untereinander scrollen) -- Einstellung.
//  - Ansicht Mushaf (Medina-Seite) oder Text (Schriftgröße einstellbar).
//  - Lange drücken auf ein Wort (Rechtsklick am Mac) -> onLongPressWord.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, List, Search, Hash, Settings2, X, Minus, Plus, Rows3, Columns3, BookOpen, Type, Trash2,
} from 'lucide-react';
import MushafPage from './MushafPage.jsx';
import { Segmented, Button, useBackToClose } from '../ui.jsx';
import { api } from '../../lib/api.js';
import { clampPage, cachedPage, pageError, preparePage, prefetchPage, useMushafPrefs, TEXT_SIZES, MARK_COLORS, markColor } from '../../lib/mushafPages.js';
import { pinPageFonts } from '../../lib/mushafFont.js';
import { getThemePref, setThemePref } from '../../lib/theme.js';
import { normalize, strictlyMatchesWord } from '../../lib/hifzEngine.js';

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function MushafShell({
  onClose, page, onPageChange, index, surahs,
  renderWord, version, forceTextLayout = false,
  focusG = null, onLongPressWord, bottom, status, overlay, settingsExtra,
  chrome: chromeProp, onChromeChange, onMarksChanged, closeLabel = 'Zurück', onEscape,
}) {
  const [prefs, setPrefs] = useMushafPrefs();
  const [chromeOwn, setChromeOwn] = useState(true);
  const chrome = chromeProp ?? chromeOwn;
  const setChrome = (v) => { const n = typeof v === 'function' ? v(chrome) : v; setChromeOwn(n); onChromeChange?.(n); };
  const [sheet, setSheet] = useState(null); // 'settings' | 'contents' | 'search' | 'jump'
  const surahName = useCallback((n) => surahs?.find((s) => s.n === n)?.name || `Sure ${n}`, [surahs]);
  useBackToClose(true, onClose, { escape: false });

  // Seite des Dokuments nicht mitscrollen, solange der Leser offen ist.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const vertical = prefs.scroll === 'vertical';
  const scrollRef = useRef(null);
  const programmatic = useRef(0);
  const reported = useRef(page);

  // ---- Seiten laden --------------------------------------------------------
  const [, setLoaded] = useState(0);
  const want = useRef(new Set());
  const ensure = useCallback((p) => {
    if (p < 1 || p > 604 || cachedPage(p) || want.current.has(p)) return;
    want.current.add(p);
    preparePage(p).catch(() => {}).finally(() => { want.current.delete(p); setLoaded((x) => x + 1); });
  }, []);
  const retry = (p) => { preparePage(p).catch(() => {}).finally(() => setLoaded((x) => x + 1)); setLoaded((x) => x + 1); };

  // ---- waagerecht: Blättern wie in Muṣḥaf-Apps ----------------------------
  // Drei Seiten nebeneinander (links die nächste, Mitte die aktuelle, rechts
  // die vorige -- Leserichtung des Muṣḥaf). Beim Wischen folgt die Seite dem
  // Finger; losgelassen gleitet sie weiter oder zurück. Die Verschiebung wird
  // direkt am Element gesetzt (kein Neuzeichnen der Seiten je Fingerbewegung).
  const trackRef = useRef(null);
  const flipping = useRef(false);
  const setTrack = useCallback((dx, animate) => {
    const t = trackRef.current;
    if (!t) return;
    t.style.transition = animate && !reduceMotion() ? 'transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1)' : 'none';
    t.style.transform = `translate3d(calc(-100% / 3 + ${dx}px), 0, 0)`;
  }, []);
  useLayoutEffect(() => { if (!vertical) { setTrack(0, false); flipping.current = false; } }, [page, vertical, setTrack]);
  useEffect(() => {
    if (vertical) return;
    ensure(page);
    scrollRef.current?.scrollTo({ top: 0 });
    // Nachbarseiten vorladen (in Leserichtung zwei, zurück eine).
    prefetchPage(page + 1); prefetchPage(page - 1); prefetchPage(page + 2);
    ensure(page + 1); ensure(page - 1);
  }, [page, vertical, ensure]);
  // dir +1 = nächste Seite (gleitet nach rechts), -1 = vorige.
  const flip = (dir, source) => {
    const target = clampPage(page + dir);
    if (target === page || flipping.current) { setTrack(0, true); return; }
    flipping.current = true;
    const w = scrollRef.current?.clientWidth || window.innerWidth;
    setTrack(dir > 0 ? w : -w, true);
    setTimeout(() => onPageChange(target, source), reduceMotion() ? 0 : 280);
  };

  // ---- senkrecht: Fenster aus Seiten, das beim Scrollen mitwandert ---------
  // Positionshaltung selbst gemacht (auch für iPhone/Safari, das kein
  // „scroll anchoring" kennt): gemerkt wird die sichtbare Seite und der Abstand
  // zu ihrem Anfang. Kommen oben Seiten dazu oder ändert sich eine Seitenhöhe
  // (Schrift geladen, Auto-Fit), wird genau diese Stelle wiederhergestellt.
  const [win, setWin] = useState(() => [Math.max(1, page - 1), Math.min(604, page + 2)]);
  const keep = useRef({ p: page, delta: -8 }); // sichtbare Seite + Abstand
  const smoothUntil = useRef(0); // läuft gerade ein weiches Mitscrollen (Rezitation)?
  useEffect(() => { if (vertical) for (let p = win[0]; p <= win[1]; p++) ensure(p); }, [vertical, win, ensure]);
  const pageEl = (p) => scrollRef.current?.querySelector(`[data-page="${p}"]`);
  const visiblePage = () => {
    const el = scrollRef.current;
    const mid = el.scrollTop + el.clientHeight * 0.35;
    for (const a of el.querySelectorAll('[data-page]')) {
      if (a.offsetTop <= mid && a.offsetTop + a.offsetHeight > mid) return a;
    }
    return null;
  };
  const restore = useCallback(() => {
    const el = scrollRef.current;
    if (!el || Date.now() < smoothUntil.current) return;
    const t = pageEl(keep.current.p);
    if (!t) return;
    const want = t.offsetTop + keep.current.delta;
    if (Math.abs(el.scrollTop - want) > 1) {
      programmatic.current = Math.max(programmatic.current, Date.now() + 200);
      el.scrollTop = want;
    }
  }, []);
  // Sprung von außen (Inhalt, Regler, Rezitation folgt) -> hinscrollen.
  useEffect(() => {
    if (!vertical || page === reported.current) return;
    reported.current = page;
    if (Date.now() < smoothUntil.current && pageEl(page)) return; // Rezitation scrollt schon weich dorthin
    keep.current = { p: page, delta: -8 };
    if (!pageEl(page)) setWin([Math.max(1, page - 1), Math.min(604, page + 2)]);
    else restore();
  }, [page, vertical, restore]);
  useLayoutEffect(() => { if (vertical) restore(); });
  useEffect(() => {
    if (!vertical || !scrollRef.current || typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(() => restore());
    const inner = scrollRef.current.firstElementChild;
    if (inner) ro.observe(inner);
    return () => ro.disconnect();
  }, [vertical, restore]);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || !vertical) return;
    const t = visiblePage();
    if (!t) return;
    const cur = Number(t.dataset.page);
    if (Date.now() >= programmatic.current || Date.now() < smoothUntil.current) keep.current = { p: cur, delta: el.scrollTop - t.offsetTop };
    if (cur !== reported.current) {
      reported.current = cur;
      onPageChange(cur, Date.now() < programmatic.current ? 'auto' : 'scroll');
    }
    const [lo, hi] = win;
    if (cur - lo < 2 && lo > 1) setWin([Math.max(1, lo - 3), Math.min(hi, cur + 4)]);
    else if (hi - cur < 2 && hi < 604) setWin([Math.max(lo, cur - 3), Math.min(604, hi + 3)]);
  };

  // ---- Wort im Blick behalten (Rezitation/Wiedergabe folgt) ----------------
  useEffect(() => {
    if (focusG == null) return;
    const el = scrollRef.current;
    const w = el?.querySelector(`[data-g="${focusG}"]`);
    if (!w) return;
    const r = w.getBoundingClientRect();
    const c = el.getBoundingClientRect();
    if (r.top >= c.top + c.height * 0.12 && r.bottom <= c.top + c.height * 0.72) return;
    const smooth = !reduceMotion();
    programmatic.current = Date.now() + (smooth ? 900 : 200);
    smoothUntil.current = smooth ? Date.now() + 700 : 0;
    el.scrollTo({ top: el.scrollTop + (r.top - c.top) - c.height * 0.35, behavior: smooth ? 'smooth' : 'auto' });
  }, [focusG, page]);

  // ---- Gesten: Tippen = Leisten, Wischen = Blättern, lange drücken = Wort --
  const g = useRef(null);
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const wordEl = e.target.closest?.('[data-v]');
    g.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(), axis: null, long: false, timer: null, lx: e.clientX, lt: Date.now(), v: 0 };
    if (wordEl && onLongPressWord) {
      const cur = g.current;
      cur.timer = setTimeout(() => { cur.long = true; navigator.vibrate?.(8); onLongPressWord({ v: wordEl.dataset.v, g: wordEl.dataset.g != null ? Number(wordEl.dataset.g) : null }); }, 520);
    }
  };
  const onPointerMove = (e) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x; const dy = e.clientY - s.y;
    if (s.timer && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) { clearTimeout(s.timer); s.timer = null; }
    if (!s.axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      s.axis = !vertical && !s.long && Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (s.axis === 'x') { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* egal */ } }
    }
    if (s.axis !== 'x') return;
    const now = Date.now();
    s.v = (e.clientX - s.lx) / Math.max(1, now - s.lt);
    s.lx = e.clientX; s.lt = now;
    // Am Anfang/Ende des Muṣḥaf federt die Seite nur leicht.
    const edge = (dx > 0 && page >= 604) || (dx < 0 && page <= 1);
    setTrack(edge ? dx * 0.25 : dx, false);
  };
  const onPointerUp = (e) => {
    const s = g.current; g.current = null;
    if (!s) return;
    clearTimeout(s.timer);
    if (s.long) return;
    const dx = e.clientX - s.x; const dy = e.clientY - s.y;
    if (s.axis === 'x') {
      const w = scrollRef.current?.clientWidth || window.innerWidth;
      // Weiter, wenn weit genug gezogen oder kurz und schnell gewischt.
      if (Math.abs(dx) > w * 0.22 || (Math.abs(dx) > 24 && Math.abs(s.v) > 0.35)) flip(dx > 0 ? 1 : -1, 'swipe'); // RTL: nach rechts = weiter
      else setTrack(0, true);
      return;
    }
    if (e.target.closest?.('button, a, input, select')) return;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && Date.now() - s.t < 450) setChrome((c) => !c);
  };
  const onPointerCancel = () => {
    const s = g.current; g.current = null;
    if (s?.timer) clearTimeout(s.timer);
    if (s?.axis === 'x') setTrack(0, true);
  };
  const onContextMenu = (e) => {
    const wordEl = e.target.closest?.('[data-v]');
    if (!wordEl || !onLongPressWord) return;
    e.preventDefault();
    onLongPressWord({ v: wordEl.dataset.v, g: wordEl.dataset.g != null ? Number(wordEl.dataset.g) : null });
  };

  // ---- Tastatur ------------------------------------------------------------
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || sheet || document.querySelector('.dbz-sheet')) return;
    if (e.key === 'Escape') { if (!onEscape?.()) onClose(); return; }
    if (['input', 'select', 'textarea'].includes((e.target?.tagName || '').toLowerCase())) return;
    if (!vertical && e.key === 'ArrowLeft') { e.preventDefault(); flip(1, 'key'); }
    else if (!vertical && e.key === 'ArrowRight') { e.preventDefault(); flip(-1, 'key'); }
  };
  useEffect(() => {
    const on = (e) => keyRef.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const jump = (p) => { setSheet(null); onPageChange(clampPage(p), 'jump'); };
  // Angezeigte Seiten behalten ihre Schrift (der Rest darf ausgelagert werden).
  useEffect(() => {
    pinPageFonts(vertical ? Array.from({ length: win[1] - win[0] + 1 }, (_, i) => win[0] + i) : [page - 1, page, page + 1]);
  }, [vertical, win, page]);
  const placeholder = (p, full) => {
    const err = pageError(p);
    return (
      <div key={p} data-page={p} className={`mushaf-placeholder ${full ? 'h-full' : ''}`} aria-busy={err ? undefined : 'true'} role={err ? 'alert' : undefined}>
        <span>{p}</span>
        {err && (
          <>
            <span className="text-footnote max-w-xs">Seite {p} konnte nicht geladen werden. {err}</span>
            <button type="button" onClick={() => retry(p)} className="text-footnote font-semibold text-mint-light dark:text-mint underline underline-offset-4">Erneut versuchen</button>
          </>
        )}
      </div>
    );
  };
  const info = index ? index.pageInfo(page) : null;
  const pageProps = { index, surahName, prefs, forceTextLayout, renderWord, version };

  return createPortal(
    <div className="mushaf-immersive fixed inset-0 z-[70] flex flex-col" role="dialog" aria-modal="true" aria-label="Mushaf">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={onContextMenu}
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain select-none"
        style={{ touchAction: vertical ? 'pan-y pinch-zoom' : 'pan-y pinch-zoom', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        data-testid="mushaf-scroll"
      >
        {vertical ? (
          <div className="mushaf-vertical">
            {Array.from({ length: win[1] - win[0] + 1 }, (_, i) => win[0] + i).map((p) => {
              const d = cachedPage(p);
              return d ? <MushafPage key={p} data={d} {...pageProps} /> : placeholder(p, false);
            })}
          </div>
        ) : (
          <div ref={trackRef} className="mushaf-track" style={{ transform: 'translate3d(calc(-100% / 3), 0, 0)' }}>
            {[page + 1, page, page - 1].map((p) => (
              <div key={p} className="mushaf-pane" aria-hidden={p !== page || undefined}>
                {p >= 1 && p <= 604 && (cachedPage(p) ? <MushafPage data={cachedPage(p)} {...pageProps} /> : placeholder(p, true))}
              </div>
            ))}
          </div>
        )}
      </div>

      {overlay}

      {/* Obere Leiste */}
      <div className={`mushaf-bar top-0 ${chrome ? '' : 'is-hidden -translate-y-full'}`} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-1 px-2 h-12 mx-auto max-w-3xl">
          <BarIcon onClick={onClose} label={closeLabel} icon={ChevronLeft} />
          <BarIcon onClick={() => setSheet('contents')} label="Inhalt" icon={List} />
          <BarIcon onClick={() => setSheet('search')} label="Suche" icon={Search} />
          <div className="flex-1 min-w-0 text-center">
            <div className="text-footnote font-semibold text-ivory truncate">{info ? surahName(info.surah) : ''}</div>
            <div className="text-caption text-sage-muted tabular-nums">{info ? `Juzʼ ${info.juz} · Seite ${page}` : `Seite ${page}`}</div>
          </div>
          <BarIcon onClick={() => setSheet('jump')} label="Seite wählen" icon={Hash} />
          <BarIcon onClick={() => setSheet('settings')} label="Einstellungen" icon={Settings2} />
        </div>
        {status && <div className="px-3 pb-2 mx-auto max-w-3xl">{status}</div>}
      </div>

      {/* Untere Leiste */}
      <div className={`mushaf-bar bottom-0 ${chrome ? '' : 'is-hidden translate-y-full'}`} style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto max-w-2xl">
          {bottom && <div className="px-3 pt-2">{bottom}</div>}
          <PageSlider page={page} onChange={(p) => onPageChange(p, 'jump')} />
        </div>
      </div>

      {sheet === 'settings' && (
        <Sheet title="Seiteneinstellungen" onClose={() => setSheet(null)}>
          <SettingsPanel prefs={prefs} setPrefs={setPrefs} extra={settingsExtra} />
        </Sheet>
      )}
      {sheet === 'contents' && (
        <Sheet title="Inhalt" onClose={() => setSheet(null)} tall>
          <Contents index={index} surahs={surahs} surahName={surahName} page={page} onJump={jump} onMarksChanged={onMarksChanged} />
        </Sheet>
      )}
      {sheet === 'search' && (
        <Sheet title="Suche" onClose={() => setSheet(null)} tall>
          <SearchPanel index={index} surahs={surahs} surahName={surahName} onJump={jump} />
        </Sheet>
      )}
      {sheet === 'jump' && (
        <Sheet title="Seite wählen" onClose={() => setSheet(null)}>
          <JumpPanel page={page} index={index} onJump={jump} />
        </Sheet>
      )}
    </div>,
    document.body,
  );
}

function BarIcon({ onClick, label, icon: Icon }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="grid place-items-center h-10 w-10 rounded-full text-mint-light hover:bg-hover active:bg-hover">
      <Icon size={21} aria-hidden="true" />
    </button>
  );
}

function PageSlider({ page, onChange }) {
  const [drag, setDrag] = useState(null);
  const v = drag ?? page;
  const commit = (x) => { setDrag(null); const p = clampPage(x); if (p !== page) onChange(p); };
  return (
    <div className="flex items-center gap-3 px-4 pt-2" data-testid="page-scrubber">
      <input type="range" min={1} max={604} value={v} dir="ltr"
        onChange={(e) => setDrag(Number(e.target.value))}
        onMouseUp={(e) => commit(e.target.value)} onTouchEnd={(e) => commit(e.target.value)} onKeyUp={(e) => commit(e.target.value)}
        className="flex-1 accent-mint h-6" style={{ transform: 'scaleX(-1)' }}
        aria-label="Seite wählen (1 bis 604)" aria-valuetext={`Seite ${v}`} />
      <span className="min-w-[2.75rem] text-center rounded-full bg-mint text-onaccent text-footnote font-semibold tabular-nums px-2 py-0.5">{v}</span>
    </div>
  );
}

export function Sheet({ title, onClose, children, tall = false }) {
  useBackToClose(true, onClose); // schließt auch per Escape/Zurück -- nur das oberste Fenster
  // Nach langem Drücken (Ayah-Menü) löst das Loslassen des Fingers noch einen
  // Klick an derselben Stelle aus -- der darf das gerade geöffnete Blatt nicht
  // sofort wieder schließen.
  const opened = useRef(Date.now());
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center sm:p-3" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dbz-backdrop absolute inset-0 bg-black/40" onClick={() => { if (Date.now() - opened.current > 450) onClose(); }} />
      <div className={`dbz-sheet relative w-full sm:max-w-md ${tall ? 'h-[88dvh] sm:h-[80vh]' : 'max-h-[88dvh]'} flex flex-col rounded-t-3xl sm:rounded-3xl bg-card dark:bg-elevated shadow-float`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
          <h3 className="text-title3 text-ivory">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full text-sage-muted hover:bg-hover" aria-label="Schließen"><X size={18} /></button>
        </div>
        <div className="px-5 pb-5 overflow-y-auto min-h-0 flex-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// ---- Einstellungen -----------------------------------------------------------
function SettingsPanel({ prefs, setPrefs, extra }) {
  const [theme, setTheme] = useState(getThemePref);
  const label = (t) => <h4 className="text-footnote font-semibold text-sage-muted uppercase tracking-wide mb-2">{t}</h4>;
  return (
    <div className="space-y-5">
      <section>
        {label('Ansicht')}
        <div className="grid grid-cols-2 gap-2">
          {[['mushaf', 'Mushaf', 'Medina-Seite', BookOpen], ['text', 'Text', 'Schrift anpassbar', Type]].map(([v, t, s, Icon]) => (
            <button key={v} onClick={() => setPrefs({ view: v })} aria-pressed={prefs.view === v}
              className={`text-left rounded-2xl border p-3 ${prefs.view === v ? 'border-mint bg-mint/10' : 'border-line'}`}>
              <Icon size={18} className="text-mint-light mb-1" aria-hidden="true" />
              <div className="text-subhead font-semibold text-ivory">{t}</div>
              <div className="text-caption text-sage-muted">{s}</div>
            </button>
          ))}
        </div>
      </section>
      {prefs.view === 'mushaf' ? (
        <section>
          {label('Seitengröße')}
          <Segmented className="w-full" options={[['tight', 'Ganze Seite'], ['wide', 'Große Schrift']]} value={prefs.layout} onChange={(v) => setPrefs({ layout: v })} />
        </section>
      ) : (
        <section>
          {label('Textgröße')}
          <div className="flex items-center gap-2">
            <button onClick={() => setPrefs({ textSize: Math.max(0, prefs.textSize - 1) })} disabled={prefs.textSize <= 0} aria-label="Kleiner"
              className="h-11 w-14 rounded-xl border border-line text-ivory disabled:opacity-40 grid place-items-center"><Minus size={18} /></button>
            <div className="flex-1 text-center text-subhead text-sage tabular-nums">{Math.round(TEXT_SIZES[prefs.textSize] * 16)} pt</div>
            <button onClick={() => setPrefs({ textSize: Math.min(TEXT_SIZES.length - 1, prefs.textSize + 1) })} disabled={prefs.textSize >= TEXT_SIZES.length - 1} aria-label="Größer"
              className="h-11 w-14 rounded-xl border border-line text-ivory disabled:opacity-40 grid place-items-center"><Plus size={18} /></button>
          </div>
        </section>
      )}
      <section>
        {label('Blättern')}
        <div className="grid grid-cols-2 gap-2">
          {[['horizontal', 'Waagerecht', Columns3], ['vertical', 'Senkrecht', Rows3]].map(([v, t, Icon]) => (
            <button key={v} onClick={() => setPrefs({ scroll: v })} aria-pressed={prefs.scroll === v}
              className={`flex items-center justify-center gap-2 rounded-2xl border h-12 text-subhead ${prefs.scroll === v ? 'border-mint bg-mint/10 text-ivory font-semibold' : 'border-line text-sage'}`}>
              <Icon size={18} aria-hidden="true" /> {t}
            </button>
          ))}
        </div>
      </section>
      <section>
        {label('Erscheinungsbild')}
        <Segmented className="w-full" options={[['system', 'Auto'], ['light', 'Hell'], ['dark', 'Dunkel']]} value={theme} onChange={(v) => { setTheme(v); setThemePref(v); }} />
      </section>
      {extra}
    </div>
  );
}

// ---- Seite wählen -------------------------------------------------------------
function JumpPanel({ page, index, onJump }) {
  const [v, setV] = useState(String(page));
  const juzPages = index ? Array.from({ length: 30 }, (_, i) => index.juzStartPage(i + 1)) : [];
  return (
    <div className="space-y-4">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const p = Number(v); if (p >= 1 && p <= 604) onJump(p); }}>
        <input className="input" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} aria-label="Seite (1–604)" autoFocus />
        <Button type="submit">Öffnen</Button>
      </form>
      {index && (
        <div>
          <h4 className="text-footnote font-semibold text-sage-muted uppercase tracking-wide mb-2">Juzʼ</h4>
          <div className="grid grid-cols-6 gap-1.5">
            {juzPages.map((p, i) => (
              <button key={i} onClick={() => onJump(p)} className="h-10 rounded-xl border border-line text-subhead text-ivory tabular-nums hover:bg-hover">{i + 1}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
// ---- Inhalt: Suren, Viertel, Lesezeichen, Markierungen ----------------------
function Contents({ index, surahs, surahName, page, onJump, onMarksChanged }) {
  const [tab, setTab] = useState('surahs');
  const [marks, setMarks] = useState(null);
  const listRef = useRef(null);
  const load = () => api.get('/quran/me').then(setMarks).catch(() => setMarks({ bookmarks: [], highlights: [] }));
  useEffect(() => { load(); }, []);
  const toJuz = (j) => listRef.current?.querySelector(`[data-juz="${j}"]`)?.scrollIntoView({ block: 'start' });
  const pageOf = (s, a) => (index ? index.pageOfAyah(s, a) : null);
  const removeBookmark = async (id) => { await api.del(`/quran/bookmarks/${id}`); load(); onMarksChanged?.(); };
  const removeHighlight = async (h) => { await api.post('/quran/highlights', { surah: h.surah, ayah: h.ayah, color: null }); load(); onMarksChanged?.(); };

  const surahRows = useMemo(() => {
    if (!index || !surahs) return [];
    let lastJuz = 0;
    return surahs.map((s) => {
      const p = index.surahStartPage(s.n);
      const j = index.pageInfo(p).juz;
      const head = j !== lastJuz ? j : null;
      lastJuz = j;
      return { ...s, page: p, juzHead: head };
    });
  }, [index, surahs]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <Segmented className="w-full mb-3 shrink-0" size="sm" options={[['surahs', 'Suren'], ['quarters', 'Viertel'], ['bookmarks', 'Lesezeichen'], ['highlights', 'Markierungen']]} value={tab} onChange={setTab} />
      <div className="flex gap-2 min-h-0 flex-1">
        <div ref={listRef} className="flex-1 min-w-0 overflow-y-auto">
          {tab === 'surahs' && surahRows.map((s) => (
            <div key={s.n}>
              {s.juzHead && <div data-juz={s.juzHead} className="text-caption font-semibold text-sage-muted uppercase tracking-wide pt-3 pb-1">{`Juzʼ ${s.juzHead}`}</div>}
              <button onClick={() => onJump(s.page)} className={`w-full flex items-center gap-3 py-2.5 text-left border-b border-line/60 ${s.page <= page && page < (surahRows[s.n]?.page ?? 605) ? 'bg-mint/5' : ''}`}>
                <span className="grid place-items-center h-8 w-8 shrink-0 rounded-full bg-subtle text-caption text-sage tabular-nums">{s.n}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-subhead text-ivory truncate">{s.name}</span>
                  <span className="block text-caption text-sage-muted">{`Seite ${s.page} · ${s.ayat} Ayat · ${index.meccan[s.n - 1] ? 'mekkanisch' : 'medinensisch'}`}</span>
                </span>
                <span className="font-arabic-ui text-body text-ivory shrink-0" dir="rtl" lang="ar">{s.ar}</span>
              </button>
            </div>
          ))}
          {tab === 'quarters' && index && index.quarters.map((q) => (
            <div key={q.n}>
              {q.quarter === 1 && q.hizb % 2 === 1 && <div data-juz={q.juz} className="text-caption font-semibold text-sage-muted uppercase tracking-wide pt-3 pb-1">{`Juzʼ ${q.juz}`}</div>}
              <button onClick={() => onJump(q.page)} className="w-full flex items-center gap-3 py-2.5 text-left border-b border-line/60">
                <QuarterIcon q={q.quarter} />
                <span className="flex-1 min-w-0">
                  <span className="block font-mushaf text-[1.15rem] leading-relaxed text-ivory truncate" dir="rtl" lang="ar">{q.preview}</span>
                  <span className="block text-caption text-sage-muted">{`${surahName(q.surah)} ${q.ayah} · Seite ${q.page} · Hizb ${q.hizb}`}</span>
                </span>
              </button>
            </div>
          ))}
          {tab === 'bookmarks' && (!marks ? <p className="text-footnote text-sage-muted py-4">Lädt …</p> : (
            MARK_COLORS.map(([c, name]) => {
              const list = (marks.bookmarks || []).filter((b) => (b.color || 'green') === c);
              return (
                <div key={c} className="mb-2">
                  <div className="flex items-center gap-2 pt-3 pb-1 text-caption font-semibold text-sage-muted uppercase tracking-wide">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: markColor(c) }} /> {name}
                  </div>
                  {list.length === 0 ? <p className="text-caption text-sage-muted pb-2">–</p> : list.map((b) => (
                    <div key={b.id} className="flex items-center gap-2 border-b border-line/60">
                      <button onClick={() => onJump(pageOf(b.surah, b.ayah))} className="flex-1 min-w-0 text-left py-2.5">
                        <span className="block text-subhead text-ivory">{`${surahName(b.surah)} ${b.ayah}`}</span>
                        <span className="block text-caption text-sage-muted">{`${new Date(b.createdAt).toLocaleDateString('de-DE')} · Seite ${pageOf(b.surah, b.ayah) ?? '–'}`}</span>
                      </button>
                      <button onClick={() => removeBookmark(b.id)} className="p-2 text-sage-muted hover:text-status-absent" aria-label="Lesezeichen entfernen"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              );
            })
          ))}
          {tab === 'highlights' && (!marks ? <p className="text-footnote text-sage-muted py-4">Lädt …</p> : (marks.highlights || []).length === 0 ? (
            <div className="text-center py-10">
              <p className="text-body font-semibold text-ivory">Keine Markierungen</p>
              <p className="text-footnote text-sage-muted mt-1">Eine Ayah lange drücken und eine Farbe wählen.</p>
            </div>
          ) : [...marks.highlights].sort((a, b) => a.surah - b.surah || a.ayah - b.ayah).map((h) => (
            <div key={`${h.surah}:${h.ayah}`} className="flex items-center gap-2 border-b border-line/60">
              <span className="h-3 w-3 rounded-full shrink-0" style={{ background: markColor(h.color) }} />
              <button onClick={() => onJump(pageOf(h.surah, h.ayah))} className="flex-1 min-w-0 text-left py-2.5">
                <span className="block text-subhead text-ivory">{`${surahName(h.surah)} ${h.ayah}`}</span>
                <span className="block text-caption text-sage-muted">{`Seite ${pageOf(h.surah, h.ayah) ?? '–'}`}</span>
              </button>
              <button onClick={() => removeHighlight(h)} className="p-2 text-sage-muted hover:text-status-absent" aria-label="Markierung entfernen"><Trash2 size={16} /></button>
            </div>
          )))}
        </div>
        {(tab === 'surahs' || tab === 'quarters') && (
          <div className="flex flex-col justify-between py-1 text-[0.625rem] leading-none text-mint-light font-semibold tabular-nums shrink-0" aria-label="Juzʼ">
            {Array.from({ length: 30 }, (_, i) => (
              <button key={i} onClick={() => toJuz(i + 1)} className="px-1 py-[1px] hover:text-ivory" aria-label={`Juzʼ ${i + 1}`}>{i + 1}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QuarterIcon({ q }) {
  // Kreis wie am Mushaf-Rand: ¼, ½, ¾ oder ganzes Hizb
  const deg = q * 90;
  return (
    <span className="h-7 w-7 rounded-full shrink-0 border border-mint/50" aria-hidden="true"
      style={{ background: `conic-gradient(rgb(var(--c-mint)) 0deg ${deg}deg, transparent ${deg}deg 360deg)` }} />
  );
}

// ---- Suche: Seite, Sure, Sure:Ayah oder arabischer Text ----------------------
function SearchPanel({ index, surahs, surahName, onJump }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const t = q.trim();
    if (!t) return [];
    const out = [];
    const num = /^\d{1,3}$/.test(t) ? Number(t) : null;
    if (num && num >= 1 && num <= 604) out.push({ key: `p${num}`, title: `Seite ${num}`, page: num });
    const ref = /^(\d{1,3})\s*[:.,]\s*(\d{1,3})$/.exec(t);
    if (ref && index) {
      const s = Number(ref[1]); const a = Number(ref[2]);
      if (s >= 1 && s <= 114 && a >= 1 && a <= index.surahAyat[s - 1]) out.push({ key: `r${s}:${a}`, title: `${surahName(s)} ${a}`, sub: `Seite ${index.pageOfAyah(s, a)}`, page: index.pageOfAyah(s, a) });
    }
    const lower = t.toLowerCase();
    for (const s of surahs || []) {
      const latin = lower.replace(/[^a-z]/g, '');
      const byName = latin.length >= 2 && s.name.toLowerCase().replace(/[^a-z]/g, '').includes(latin);
      if (byName || s.ar.includes(t) || (num && s.n === num)) {
        if (index) out.push({ key: `s${s.n}`, title: `${s.n}. ${s.name}`, sub: `Sure · Seite ${index.surahStartPage(s.n)}`, page: index.surahStartPage(s.n), ar: s.ar });
      }
    }
    // Arabischer Text: Wortfolge im ganzen Qur'an (gleiche Vergleichsregeln wie die Rezitation)
    if (index && /[ء-يٱ]/.test(t)) {
      const toks = normalize(t).split(' ').filter(Boolean);
      if (toks.length) {
        const seen = new Set();
        for (let i = 0; i < index.total && out.length < 60; i++) {
          let ok = true;
          for (let k = 0; k < toks.length && ok; k++) ok = i + k < index.total && strictlyMatchesWord(toks[k], { token: index.token[i + k], alt: index.alt[i + k] });
          if (!ok) continue;
          const vk = index.verseKey(i);
          if (seen.has(vk)) continue;
          seen.add(vk);
          out.push({ key: `t${vk}`, title: `${surahName(index.surah[i])} ${index.ayah[i]}`, sub: `Seite ${index.pageOf(i)}`, page: index.pageOf(i) });
        }
      }
    }
    return out.slice(0, 60);
  }, [q, index, surahs, surahName]);
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-sage-muted" aria-hidden="true" />
        <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Seite, Sure, 2:255 oder arabischer Text" autoFocus />
      </div>
      {q.trim() && !results.length && <p className="text-footnote text-sage-muted">Nichts gefunden.</p>}
      <ul className="divide-y divide-line/60">
        {results.map((r) => (
          <li key={r.key}>
            <button onClick={() => onJump(r.page)} className="w-full flex items-center gap-3 py-2.5 text-left">
              <span className="flex-1 min-w-0">
                <span className="block text-subhead text-ivory truncate">{r.title}</span>
                {r.sub && <span className="block text-caption text-sage-muted">{r.sub}</span>}
              </span>
              {r.ar && <span className="font-arabic-ui text-body text-ivory" dir="rtl" lang="ar">{r.ar}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
