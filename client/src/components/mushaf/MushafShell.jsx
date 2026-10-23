// Vollbild-Leser für den Mushaf -- gemeinsam für „Lesen" und „Auswendig
// rezitieren" (Vorbild: gängige Qur'an-Apps auf dem iPhone).
//  - Die Seite füllt den Bildschirm. Einmal tippen blendet die Leisten ein/aus:
//    oben Zurück, Inhalt, Suche, Seite, Einstellungen; unten die Steuerung des
//    Aufrufers (Wiedergabe bzw. Mikrofon) und der Seitenregler.
//  - Blättern waagerecht (wischen, Trackpad, Pfeiltasten, Pfeilknöpfe) oder
//    senkrecht (alle Seiten untereinander scrollen) -- Einstellung.
//  - iPad quer und Mac: Doppelseite wie im aufgeschlagenen Muṣḥaf (umschaltbar).
//  - Ansicht Mushaf (Medina-Seite) oder Text (Schriftgröße einstellbar).
//  - Lange drücken auf ein Wort (Rechtsklick am Mac) -> onLongPressWord.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, ChevronRight, List, Search, Hash, Settings2, X, Minus, Plus, Rows3, Columns3, BookOpen, Type, Trash2, RectangleVertical,
} from 'lucide-react';
import MushafPage from './MushafPage.jsx';
import { Segmented, Button, useBackToClose } from '../ui.jsx';
import { api } from '../../lib/api.js';
import { clampPage, cachedPage, pageError, preparePage, prefetchPage, useMushafPrefs, TEXT_SIZES, MARK_COLORS, markColor } from '../../lib/mushafPages.js';
import { pinPageFonts } from '../../lib/mushafFont.js';
import { getThemePref, setThemePref } from '../../lib/theme.js';
import { haptic } from '../../lib/haptics.js';
import {
  PANE_GAP, RESERVE, RESERVE_FRAMED, autoSpread, unitOf, unitCount, unitPages, pageOfUnit,
  OMEGA, noOvershoot, springAt, springDone, rubber, velocity, releaseDir,
} from '../../lib/mushafPager.js';
import { normalize, strictlyMatchesWord } from '../../lib/hifzEngine.js';

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// Zeit eines Ereignisses (wann der Finger dort war, nicht wann es verarbeitet
// wurde) -- das Fingertempo bleibt richtig, auch wenn gerade gezeichnet wird.
const evTime = (e) => {
  const now = performance.now();
  const t = e?.timeStamp;
  return t > 0 && Math.abs(now - t) < 5000 ? t : now;
};

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

  // ---- Doppelseite (iPad quer, Mac) ----------------------------------------
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  // Großer Bildschirm, waagerechtes Blättern, Mushaf-Ansicht: Seite im Rahmen,
  // Doppelseite möglich -- automatisch im Querformat, oder fest gewählt.
  const framed = !vertical && prefs.view === 'mushaf' && Math.min(vp.w, vp.h) >= 600;
  const spread = framed && (prefs.spread === 'double' || (prefs.spread === 'auto' && autoSpread(vp.w, vp.h)));
  const unit = unitOf(page, spread); // Seite bzw. Doppelseite
  const units = unitCount(spread);

  // ---- waagerecht: Blättern wie in Muṣḥaf-Apps ----------------------------
  // Drei Einheiten nebeneinander: links die nächste, in der Mitte die aktuelle,
  // rechts die vorige (Leserichtung des Muṣḥaf). Die Lage ist eine Zahl in
  // Einheiten (pos); Finger, Feder, Trackpad und Tasten ändern nur sie, die
  // Verschiebung wird direkt am Element gesetzt -- kein Neuzeichnen der Seiten
  // je Bild. Gemeldet (onPageChange) wird die neue Seite, wenn die Bewegung
  // dort ankommt, oder sofort, wenn vorher schon die nächste Geste beginnt.
  // Alle Teile hier lesen nur Refs (pg, live) -- auch aus älteren Closures richtig.
  const trackRef = useRef(null);
  const pg = useRef({ rendered: unit, spread, pos: unit, expect: null, expectTimer: 0, anim: null, raf: 0, drag: null, wheel: null, S: 0, multi: false });
  const live = useRef(null);
  live.current = { onPageChange, spread, units };
  const stepPx = () => (trackRef.current?.clientWidth || scrollRef.current?.clientWidth || window.innerWidth) + PANE_GAP;
  const baseUnit = () => pg.current.expect ?? pg.current.rendered;
  const paint = () => {
    const st = pg.current;
    const t = trackRef.current;
    if (!t) return;
    const S = st.S || (st.S = stepPx());
    const off = Math.max(-S, Math.min(S, (st.pos - st.rendered) * S));
    t.style.transform = `translate3d(calc(-100% - ${PANE_GAP}px + ${off.toFixed(2)}px), 0, 0)`;
  };
  const stopAnim = () => {
    const st = pg.current;
    st.anim = null;
    if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; }
  };
  const commit = (u, source) => {
    const st = pg.current;
    const { spread: sp, onPageChange: report } = live.current;
    const dir = Math.sign(u - baseUnit()) || 1;
    st.expect = u;
    clearTimeout(st.expectTimer);
    // Kommt die gemeldete Seite nicht an, zurück zur angezeigten (Sicherheitsnetz).
    st.expectTimer = setTimeout(() => { if (st.expect === u && st.rendered !== u) { st.expect = null; animateTo(st.rendered); } }, 1500);
    report(pageOfUnit(u, sp, dir), source, unitPages(u, sp));
  };
  const tick = (now) => {
    const st = pg.current;
    st.raf = 0;
    const a = st.anim;
    if (!a) return;
    const f = springAt(a.x0, a.v0, Math.max(0, now - a.t0));
    if (springDone(f)) {
      st.anim = null;
      st.pos = a.target;
      paint();
      if (a.target !== baseUnit()) commit(a.target, a.source);
      return;
    }
    st.pos = a.target + f.x / a.S;
    paint();
    st.raf = requestAnimationFrame(tick);
  };
  // Feder zur Einheit target; v0 = Fingertempo (px/ms, + = Richtung nächste Seite).
  const animateTo = (target, v0 = 0, source = 'swipe') => {
    const st = pg.current;
    const S = st.S || (st.S = stepPx());
    const x0 = (st.pos - target) * S;
    if (reduceMotion() || Math.abs(x0) < 0.5) {
      stopAnim();
      st.pos = target;
      paint();
      if (target !== baseUnit()) commit(target, source);
      return;
    }
    st.anim = { target, x0, v0: noOvershoot(x0, v0, OMEGA), t0: performance.now(), S, source };
    if (!st.raf) st.raf = requestAnimationFrame(tick);
  };
  // Laufende Bewegung anhalten; war sie unterwegs zu einer anderen Seite, diese
  // sofort melden (die Seite bleibt, wo sie gerade ist).
  const catchMotion = () => {
    const a = pg.current.anim;
    stopAnim();
    if (a && a.target !== baseUnit()) commit(a.target, a.source);
    return !!a;
  };
  // dir +1 = nächste Seite/Doppelseite, -1 = vorige (Tasten, Knöpfe, Mausrad).
  const flip = (dir, source) => {
    const st = pg.current;
    if (vertical || st.drag) return;
    catchMotion();
    st.S = stepPx();
    const base = baseUnit();
    const to = base + dir;
    if (to < 1 || to > live.current.units) { // Anfang/Ende des Muṣḥaf: nur kurz anstoßen
      if (!reduceMotion()) { st.pos = base + dir * 0.04; paint(); animateTo(base); }
      return;
    }
    animateTo(to, 0, source);
  };

  // Die Seite liegt nie mehr als eine Einheit neben der angezeigten -- sonst
  // stünde sie (bei sehr schnellem Weiterblättern) auf einer Seite, die gerade
  // nicht mehr gezeichnet ist.
  const clampLag = () => {
    const st = pg.current;
    const np = Math.max(st.rendered - 1, Math.min(st.rendered + 1, st.pos));
    const delta = np - st.pos;
    if (!delta) return;
    st.pos = np;
    if (st.drag) st.drag.startPos += delta;
    if (st.wheel) st.wheel.startPos += delta;
    const a = st.anim;
    if (a) { const f = springAt(a.x0, a.v0, Math.max(0, performance.now() - a.t0)); st.anim = null; animateTo(a.target, f.v, a.source); }
  };
  // Neue Einheit angezeigt: eigene Meldung angekommen (Lage bleibt), oder ein
  // Sprung von außen (Inhalt, Regler, Rezitation folgt) -- eine Seite weiter
  // gleitet hinüber, weiter weg erscheint sofort.
  useLayoutEffect(() => {
    const st = pg.current;
    const prev = st.rendered;
    const modeChanged = st.spread !== spread;
    st.rendered = unit;
    st.spread = spread;
    st.S = 0;
    if (vertical || modeChanged) {
      stopAnim();
      st.expect = null;
      st.pos = unit;
      if (st.drag) st.drag.startPos = unit;
      paint();
      return;
    }
    if (prev === unit) return;
    if (st.expect === unit) { st.expect = null; clearTimeout(st.expectTimer); clampLag(); paint(); return; }
    st.expect = null;
    if (st.drag) { st.drag.startPos += unit - prev; st.pos += unit - prev; paint(); return; }
    if (Math.abs(unit - prev) === 1 && !st.anim && Math.abs(st.pos - prev) < 0.001 && !reduceMotion()) { paint(); animateTo(unit, 0, 'auto'); return; }
    stopAnim();
    st.pos = unit;
    paint();
  }, [unit, spread, vertical]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const on = () => {
      setVp((o) => (o.w === window.innerWidth && o.h === window.innerHeight ? o : { w: window.innerWidth, h: window.innerHeight }));
      pg.current.S = 0;
      paint();
    };
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('resize', on);
      const st = pg.current;
      cancelAnimationFrame(st.raf);
      clearTimeout(st.expectTimer);
      clearTimeout(st.wheel?.timer);
      clearTimeout(st.drag?.timer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!vertical) scrollRef.current?.scrollTo({ top: 0 }); }, [unit, spread, vertical]);
  useEffect(() => {
    if (vertical) return;
    // Angezeigte und benachbarte Einheiten laden, in Leserichtung eine weitere vorladen.
    for (const u of [unit, unit + 1, unit - 1]) if (u >= 1 && u <= units) unitPages(u, spread).forEach(ensure);
    if (unit + 2 <= units) unitPages(unit + 2, spread).forEach(prefetchPage);
  }, [unit, units, spread, vertical, ensure]);

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
  // Finger über Touch-Ereignisse (nicht Pointer-Ereignisse): Safari bricht eine
  // Pointer-Geste ab, sobald die Bewegung etwas schräg ist und es selbst scrollen
  // will -- dann blieb die Seite stehen und federte zurück. Touch-Ereignisse
  // kommen weiter. Erst wenn die Geste als waagerecht erkannt ist, wird dem
  // Browser das Scrollen untersagt (preventDefault) -- senkrecht bleibt frei.
  const SLOP = 8;
  const begin = (x, y, target, kind, now) => {
    const st = pg.current;
    const el = scrollRef.current;
    st.S = stepPx();
    const caught = !vertical && catchMotion();
    const d = {
      x, y, x0: x, t: now, kind, axis: null, startPos: st.pos, samples: [{ t: now, x }], long: false, timer: null, caught,
      // Passt die Seite ganz auf den Bildschirm, gibt es senkrecht nichts zu
      // scrollen -- dann blättert auch ein deutlich schräger Wisch.
      canScrollY: !!el && el.scrollHeight > el.clientHeight + 2,
    };
    st.drag = d;
    const wordEl = target?.closest?.('[data-v]');
    if (wordEl && onLongPressWord && !caught) {
      d.timer = setTimeout(() => {
        d.long = true;
        haptic();
        onLongPressWord({ v: wordEl.dataset.v, g: wordEl.dataset.g != null ? Number(wordEl.dataset.g) : null });
      }, 520);
    }
  };
  const move = (x, y, ev) => {
    const st = pg.current;
    const d = st.drag;
    if (!d) return;
    const dx = x - d.x;
    const dy = y - d.y;
    if (d.timer && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) { clearTimeout(d.timer); d.timer = null; }
    if (d.long) return;
    const loose = d.kind === 'touch' && !d.canScrollY;
    if (!d.axis) {
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (Math.max(ax, ay) < SLOP) {
        // Noch unentschieden, aber eher waagerecht: der Browser darf die Geste nicht übernehmen.
        if (loose && !vertical && ax > ay && ev.cancelable) ev.preventDefault();
        return;
      }
      const horizontal = !vertical && ax > ay * (loose ? 0.5 : 1);
      // Scrollt der Browser schon senkrecht (nicht mehr abbrechbar), bleibt es dabei.
      d.axis = horizontal && !(d.kind === 'touch' && d.canScrollY && !ev.cancelable) ? 'x' : 'y';
      if (d.axis !== 'x') return;
      // Ab hier folgt die Seite dem Finger -- ohne Sprung um die Schwelle.
      if (d.timer) { clearTimeout(d.timer); d.timer = null; }
      d.x = x;
      d.startPos = st.pos;
      d.samples = [{ t: evTime(ev), x }];
      d.min = 0;
      d.max = 0;
    }
    if (d.axis !== 'x') return;
    if (ev.cancelable) ev.preventDefault();
    const S = st.S;
    const base = baseUnit();
    const lo = Math.max(1, base - 1);
    const hi = Math.min(live.current.units, base + 1);
    // Nach rechts ziehen = nächste Seite (sie liegt links); nie mehr als eine
    // Einheit, am Anfang/Ende des Muṣḥaf mit Widerstand.
    let p = d.startPos + (x - d.x) / S;
    if (p > hi) p = hi + rubber((p - hi) * S, S) / S;
    else if (p < lo) p = lo + rubber((p - lo) * S, S) / S;
    st.pos = p;
    d.min = Math.min(d.min, x - d.x);
    d.max = Math.max(d.max, x - d.x);
    d.samples.push({ t: evTime(ev), x });
    if (d.samples.length > 16) d.samples.shift();
    paint();
  };
  const end = (x, y, target, now) => {
    const st = pg.current;
    const d = st.drag;
    st.drag = null;
    if (!d) return;
    clearTimeout(d.timer);
    if (!vertical) {
      const base = baseUnit();
      if (d.axis === 'x') {
        const v = velocity(d.samples, now);
        const finger = { moved: Math.abs(x - d.x), against: v > 0 ? -d.min : d.max };
        const dir = releaseDir((st.pos - base) * st.S, v, st.S, { canNext: base < live.current.units, canPrev: base > 1, finger });
        if (dir && d.kind === 'touch') haptic();
        animateTo(base + dir, v, 'swipe');
        return;
      }
      if (Math.abs(st.pos - base) > 0.001) animateTo(base); // angehaltene Bewegung zu Ende führen
    }
    if (d.long || d.caught || d.axis) return;
    if (target?.closest?.('button, a, input, select')) return;
    if (Math.abs(x - d.x0) < 10 && Math.abs(y - d.y) < 10 && now - d.t < 450) setChrome((c) => !c);
  };
  const cancel = () => {
    const st = pg.current;
    const d = st.drag;
    st.drag = null;
    if (!d) return;
    clearTimeout(d.timer);
    if (!vertical && Math.abs(st.pos - baseUnit()) > 0.001) animateTo(baseUnit());
  };

  // Trackpad (zwei Finger waagerecht) und waagerechtes Mausrad: die Seite folgt
  // den Fingern; nach einem Stück Weg oder bei schnellem Wisch blättert sie
  // genau eine Einheit weiter. Der Nachlauf des Trackpads blättert nicht ein
  // zweites Mal: bis zu einer kurzen Pause ist das Rad danach gesperrt.
  const onWheel = (e) => {
    const st = pg.current;
    if (vertical || e.ctrlKey || st.drag) return; // ctrl = Zoomen (Trackpad)
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? (st.S || stepPx()) : 1;
    const dx = e.deltaX * k;
    const dy = e.deltaY * k;
    const now = evTime(e);
    let w = st.wheel;
    if (w && now - w.last > 180) { clearTimeout(w.timer); w = st.wheel = null; }
    if (w?.locked) {
      w.last = now;
      if (Math.abs(dx) > Math.abs(dy)) e.preventDefault();
      return;
    }
    if (!w) {
      if (Math.abs(dx) < 2 || Math.abs(dx) <= Math.abs(dy) * 1.2) return; // senkrecht: normal scrollen
      catchMotion();
      st.S = stepPx();
      w = st.wheel = { acc: 0, startPos: st.pos, samples: [], last: now, locked: false, timer: 0 };
      if (Math.abs(dx) >= 50) { // Raste eines Mausrads
        e.preventDefault();
        w.locked = true;
        flip(dx < 0 ? 1 : -1, 'wheel');
        return;
      }
    }
    e.preventDefault(); // auch kein „Zurück" des Browsers per Wischen
    w.last = now;
    w.acc -= dx; // Finger nach rechts = nächste Seite, wie beim Wischen
    const S = st.S;
    const base = baseUnit();
    const { units: n } = live.current;
    const lo = Math.max(1, base - 1);
    const hi = Math.min(n, base + 1);
    let p = w.startPos + w.acc / S;
    if (p > hi) p = hi + rubber((p - hi) * S, S) / S;
    else if (p < lo) p = lo + rubber((p - lo) * S, S) / S;
    st.pos = p;
    paint();
    w.samples.push({ t: now, x: w.acc });
    if (w.samples.length > 16) w.samples.shift();
    const v = velocity(w.samples, now);
    const off = (p - base) * S;
    const dir = Math.sign(off);
    const can = dir > 0 ? base < n : base > 1;
    clearTimeout(w.timer);
    if (dir && can && (Math.abs(off) > Math.min(S * 0.3, 140) || (Math.abs(off) > 24 && Math.abs(v) > 0.6 && Math.sign(v) === dir))) {
      w.locked = true;
      animateTo(base + dir, v, 'wheel');
      return;
    }
    // Finger ruhen, ohne genug Weg: zurückfedern.
    w.timer = setTimeout(() => { if (st.wheel === w && !w.locked) { st.wheel = null; animateTo(baseUnit()); } }, 140);
  };

  // Touch und Rad als eigene Ereignisse (touchmove/wheel nicht passiv, damit
  // nur eine erkannte waagerechte Geste dem Browser das Scrollen untersagt).
  // Bewegung und Ende einer Berührung gehen immer an das Element, auf dem sie
  // begann -- auch wenn es beim Blättern inzwischen aus der Seite genommen
  // wurde. Deshalb wird dort zugehört, nicht nur am Leser.
  const gest = useRef(null);
  gest.current = { begin, move, end, cancel, onWheel };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const st = pg.current;
    let held = null; // Element der laufenden Berührung
    const release = () => {
      if (!held) return;
      held.removeEventListener('touchmove', tm);
      held.removeEventListener('touchend', te);
      held.removeEventListener('touchcancel', tc);
      held = null;
    };
    function tm(e) {
      if (st.multi || e.touches.length !== 1) return;
      gest.current.move(e.touches[0].clientX, e.touches[0].clientY, e);
    }
    function te(e) {
      if (st.multi) { if (!e.touches.length) { st.multi = false; release(); } return; }
      if (e.touches.length) return;
      release();
      const t = e.changedTouches[0];
      gest.current.end(t.clientX, t.clientY, e.target, evTime(e));
    }
    function tc() { release(); st.multi = false; gest.current.cancel(); }
    const ts = (e) => {
      if (e.touches.length > 1) { st.multi = true; gest.current.cancel(); return; } // zwei Finger: zoomen, nicht blättern
      st.multi = false;
      release();
      held = e.target;
      held.addEventListener('touchmove', tm, { passive: false });
      held.addEventListener('touchend', te);
      held.addEventListener('touchcancel', tc);
      gest.current.begin(e.touches[0].clientX, e.touches[0].clientY, e.target, 'touch', evTime(e));
    };
    const wh = (e) => gest.current.onWheel(e);
    el.addEventListener('touchstart', ts, { passive: true });
    el.addEventListener('wheel', wh, { passive: false });
    return () => {
      release();
      el.removeEventListener('touchstart', ts);
      el.removeEventListener('wheel', wh);
    };
  }, []);
  // Maus (Mac/PC): ziehen blättert ebenfalls, Klick blendet die Leisten ein/aus.
  // Touch und Stift laufen über die Touch-Ereignisse oben.
  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    begin(e.clientX, e.clientY, e.target, 'mouse', evTime(e));
  };
  const onPointerMove = (e) => {
    const d = pg.current.drag;
    if (e.pointerType !== 'mouse' || !d || d.kind !== 'mouse') return;
    const had = d.axis;
    move(e.clientX, e.clientY, e);
    if (!had && d.axis === 'x') { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* egal */ } }
  };
  const onPointerUp = (e) => { if (e.pointerType === 'mouse' && pg.current.drag?.kind === 'mouse') end(e.clientX, e.clientY, e.target, evTime(e)); };
  const onPointerCancel = (e) => { if (e.pointerType === 'mouse' && pg.current.drag?.kind === 'mouse') cancel(); };
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
    pinPageFonts(vertical
      ? Array.from({ length: win[1] - win[0] + 1 }, (_, i) => win[0] + i)
      : [unit - 1, unit, unit + 1].flatMap((u) => (u >= 1 && u <= units ? unitPages(u, spread) : [])));
  }, [vertical, win, unit, units, spread]);
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
  const pageProps = { index, surahName, prefs, forceTextLayout, renderWord, version, framed, reserve: framed ? RESERVE_FRAMED : RESERVE };
  const pageView = (p, side) => (cachedPage(p) ? <MushafPage data={cachedPage(p)} side={side} {...pageProps} /> : placeholder(p, true));
  const shown = unitPages(unit, spread);

  return createPortal(
    <div className={`mushaf-immersive fixed inset-0 z-[70] flex flex-col ${framed ? 'is-framed' : ''}`} role="dialog" aria-modal="true" aria-label="Mushaf">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={onContextMenu}
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain select-none"
        style={{ touchAction: 'pan-y pinch-zoom', overscrollBehaviorX: 'none', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
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
          <div className="mushaf-clip">
            <div ref={trackRef} className="mushaf-track" data-testid="mushaf-track">
              {[unit + 1, unit, unit - 1].map((u) => (
                <div key={`${spread ? 'd' : 'p'}${u}`} className="mushaf-pane" data-unit={u} aria-hidden={u !== unit || undefined}>
                  {u >= 1 && u <= units && (spread ? (
                    // Doppelseite: gerade Seite links, ungerade rechts (wie gedruckt)
                    <div className="mushaf-spread">
                      <div className="mushaf-half is-left">{pageView(unitPages(u, true)[1], 'left')}</div>
                      <div className="mushaf-half is-right">{pageView(unitPages(u, true)[0], 'right')}</div>
                    </div>
                  ) : pageView(u))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {overlay}

      {/* Mac/PC (Maus, Trackpad): Pfeile am Rand. Links = weiter (Leserichtung). */}
      {!vertical && (
        <>
          <button type="button" onClick={() => flip(1, 'button')} disabled={unit >= units} className={`mushaf-nav is-left ${chrome ? '' : 'is-quiet'}`}
            aria-label={spread ? 'Nächste Doppelseite' : 'Nächste Seite'} title={spread ? 'Nächste Doppelseite' : 'Nächste Seite'}>
            <ChevronLeft size={24} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => flip(-1, 'button')} disabled={unit <= 1} className={`mushaf-nav is-right ${chrome ? '' : 'is-quiet'}`}
            aria-label={spread ? 'Vorige Doppelseite' : 'Vorige Seite'} title={spread ? 'Vorige Doppelseite' : 'Vorige Seite'}>
            <ChevronRight size={24} aria-hidden="true" />
          </button>
        </>
      )}

      {/* Obere Leiste */}
      <div className={`mushaf-bar top-0 ${chrome ? '' : 'is-hidden -translate-y-full'}`} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-1 px-2 h-12 mx-auto max-w-3xl">
          <BarIcon onClick={onClose} label={closeLabel} icon={ChevronLeft} />
          <BarIcon onClick={() => setSheet('contents')} label="Inhalt" icon={List} />
          <BarIcon onClick={() => setSheet('search')} label="Suche" icon={Search} />
          <div className="flex-1 min-w-0 text-center">
            <div className="text-footnote font-semibold text-ivory truncate">{info ? surahName(info.surah) : ''}</div>
            <div className="text-caption text-sage-muted tabular-nums">
              {spread
                ? (info ? `Juzʼ ${info.juz} · Seiten ${shown[0]}–${shown[1]}` : `Seiten ${shown[0]}–${shown[1]}`)
                : (info ? `Juzʼ ${info.juz} · Seite ${page}` : `Seite ${page}`)}
            </div>
          </div>
          {framed && (
            <div className="flex items-center rounded-full bg-subtle p-0.5 mr-1" role="group" aria-label="Seitenansicht">
              <ViewToggle active={!spread} onClick={() => setPrefs({ spread: 'single' })} label="Einzelseite" icon={RectangleVertical} />
              <ViewToggle active={spread} onClick={() => setPrefs({ spread: 'double' })} label="Doppelseite" icon={BookOpen} />
            </div>
          )}
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
          <SettingsPanel prefs={prefs} setPrefs={setPrefs} extra={settingsExtra} spreadPossible={framed} />
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

function ViewToggle({ active, onClick, label, icon: Icon }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} aria-pressed={active}
      className={`grid place-items-center h-8 w-9 rounded-full transition-colors ${active ? 'bg-card dark:bg-elevated text-mint-light shadow-sm' : 'text-sage-muted hover:text-mint-light'}`}>
      <Icon size={17} aria-hidden="true" />
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
function SettingsPanel({ prefs, setPrefs, extra, spreadPossible }) {
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
      {spreadPossible && (
        <section>
          {label('Seitenansicht')}
          <Segmented className="w-full" options={[['auto', 'Automatisch'], ['single', 'Einzelseite'], ['double', 'Doppelseite']]} value={prefs.spread} onChange={(v) => setPrefs({ spread: v })} />
          <p className="text-caption text-sage-muted mt-2">Automatisch: im Querformat zwei Seiten wie im aufgeschlagenen Muṣḥaf, im Hochformat eine.</p>
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
