// „Auswendig rezitieren" – KI-Rezitation auf der echten Mushaf-Seite.
//
// Zwei Anzeigen, EINE Sitzung (lib/recitation/tracker.js):
//  - Text versteckt: noch nicht rezitierte Wörter sind verdeckt (die Wort-
//    breite bleibt, die Seite springt nicht) und erscheinen, sobald die
//    Erkennung sie bestätigt.
//  - Text sichtbar: die ganze Seite bleibt lesbar, die App folgt der
//    Rezitation (dezente Markierung des aktuellen Wortes).
// Das Augen-Symbol wechselt jederzeit -- ohne das Mikrofon neu zu starten,
// ohne Stand/Position zu verlieren und ohne Ladebildschirm.
//
// Zwei Übungsumfänge: frei (einfach anfangen, die App findet die Stelle im
// ganzen Qur'an -- locator.js) oder gezielt (Sure/Ayat, Seiten, Juzʼ).
// Die Sitzung läuft über Seiten- und Surengrenzen weiter; die Seite blättert
// mit. Wer selbst blättert, kann jederzeit „Zurück zur Rezitation".
//
// Spracherkennung: NVIDIA FastConformer (Qur'an-Feinabstimmung) direkt auf dem
// Gerät (lib/asr/). Audio verlässt das Gerät nie. KEIN simulierter
// Fortschritt. Gespeichert wird nur die Übungsstatistik (Server, sichtbar für
// die Person und die Lehrkräfte ihrer Klasse) -- keine Bewertung.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Mic, Pause, Eye, EyeOff, Lightbulb, Target, History, Square, AlertTriangle, X, ChevronLeft, ChevronRight,
  Undo2, Search, Loader2,
} from 'lucide-react';
import { Card, Button, Segmented, Spinner, useBackToClose } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { NvidiaSpeech } from '../lib/asr/nvidiaSpeech.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { ensurePageFont, isPageFontLoaded, useMushafAutoFit, loadMushafLayout } from '../lib/mushafFont.js';
import { loadQuranIndex } from '../lib/recitation/quranIndex.js';
import { RecitationTracker, KIND } from '../lib/recitation/tracker.js';
import { RecitationSessionList, fmtDuration, fmtRange } from '../components/RecitationSessions.jsx';

const DISPLAY_KEY = 'dbz-hifz-display';
const PAGE_KEY = 'dbz-mushaf-page';
const clampPage = (p) => Math.max(1, Math.min(604, Number(p) || 1));
const fmtMb = (b) => `${(b / 1048576).toFixed(0)} MB`;
const ERROR_TEXT = {
  'not-allowed': 'Mikrofonzugriff wurde nicht erlaubt. Bitte in den Browser-Einstellungen erlauben.',
  'audio-capture': 'Kein Mikrofon gefunden.',
};
const newSessionId = () => `rs_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

// ---- Seiten-Daten (Speicher über Tab-Wechsel hinweg) ------------------------
const pageCache = new Map();
const pageRequests = new Map();
function fetchPage(p) {
  if (pageCache.has(p)) return Promise.resolve(pageCache.get(p));
  if (!pageRequests.has(p)) {
    pageRequests.set(p, api.get(`/quran/page/${p}`)
      .then((r) => { pageCache.set(p, r.page); return r.page; })
      .finally(() => pageRequests.delete(p)));
  }
  return pageRequests.get(p);
}
// Seite + Seitenschrift vorbereiten. Die Schrift wartet höchstens kurz, sonst
// erscheint die Seite in der lesbaren Ersatzschrift (nie ein Ladebildschirm).
async function preparePage(p) {
  const d = await fetchPage(p);
  if (d.font === 'v1' && !isPageFontLoaded(d.fontPage)) {
    await Promise.race([ensurePageFont(d.fontPage), new Promise((r) => setTimeout(r, 2500))]);
  }
  return d;
}
const prefetchPage = (p) => { if (p >= 1 && p <= 604) fetchPage(p).then((d) => { if (d.font === 'v1') ensurePageFont(d.fontPage); }).catch(() => {}); };

function useModelCached() {
  const [cached, setCached] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const c = await caches.open('dbz-asr-v1');
        if (alive) setCached(Boolean(await c.match('/api/asr/model')));
      } catch { /* kein Cache-Zugriff */ }
    })();
    return () => { alive = false; };
  }, []);
  return cached;
}

export default function HifzRecitationMode({ surahs }) {
  const { user } = useAuth();
  const consent = Boolean(user?.consentAt);
  const modelCached = useModelCached();

  // ---- Qur'an-Index -------------------------------------------------------
  const [index, setIndex] = useState(null);
  const [indexError, setIndexError] = useState(null);
  useEffect(() => {
    let alive = true;
    loadQuranIndex().then((ix) => { if (alive) setIndex(ix); }).catch((e) => { if (alive) setIndexError(e.message); });
    return () => { alive = false; };
  }, []);

  // ---- Seite --------------------------------------------------------------
  const [page, setPage] = useState(() => { try { return clampPage(localStorage.getItem(PAGE_KEY) || 1); } catch { return 1; } });
  const [pageData, setPageData] = useState(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState(null);
  const pageReq = useRef(0);
  useEffect(() => {
    const req = ++pageReq.current;
    setPageLoading(true); setPageError(null);
    preparePage(page)
      .then((d) => {
        if (req !== pageReq.current) return;
        setPageData(d);
        try { localStorage.setItem(PAGE_KEY, String(page)); } catch { /* egal */ }
        prefetchPage(page + 1);
      })
      .catch((e) => { if (req === pageReq.current) setPageError(e.message || 'Seite konnte nicht geladen werden.'); })
      .finally(() => { if (req === pageReq.current) setPageLoading(false); });
  }, [page]);

  // ---- Sitzung --------------------------------------------------------------
  const trackerRef = useRef(null);
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);
  const tracker = trackerRef.current;
  const [display, setDisplay] = useState(() => { try { return localStorage.getItem(DISPLAY_KEY) === 'visible' ? 'visible' : 'hidden'; } catch { return 'hidden'; } });
  const [peek, setPeek] = useState(false);
  const [capture, setCapture] = useState('idle');
  const [captureError, setCaptureError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [slowDevice, setSlowDevice] = useState(false);
  const [noAudio, setNoAudio] = useState(false);
  const [interim, setInterim] = useState('');
  const previewRef = useRef({ cursor: null, n: 0 });
  const [following, setFollowing] = useState(true);
  const [chrome, setChrome] = useState(true);
  const [ended, setEnded] = useState(false);
  const [sheet, setSheet] = useState(null); // 'range' | 'history' | 'help'
  const [saveState, setSaveState] = useState('idle');
  const metaRef = useRef(null); // { id, startedAt, activeSec, hiddenSec, visibleSec }
  const heardRef = useRef(false);

  const readingNow = display === 'visible' || peek;
  useEffect(() => { trackerRef.current?.setReading(readingNow); }, [readingNow]);

  const handlersRef = useRef(null);
  handlersRef.current = {
    onSegment: (seg) => {
      heardRef.current = true; setNoAudio(false);
      const tr = trackerRef.current;
      if (!tr) return;
      const before = previewRef.current;
      tr.accept(seg);
      // Diagnose (nur wenn ein Test/Entwickler es ausdrücklich einschaltet): erkannte Segmente mitschreiben.
      if (Array.isArray(globalThis.__dbzAsrLog)) globalThis.__dbzAsrLog.push({ text: seg.text, phase: tr.phase, cursor: tr.cursor, mismatch: tr.mismatch });
      // Schon vorab Aufgedecktes bleibt stehen (kein Flackern), bis das nächste
      // Zwischenergebnis die Vorschau neu setzt.
      const shown = before.cursor != null ? before.cursor + before.n : 0;
      previewRef.current = { cursor: tr.cursor, n: tr.mismatch || tr.cursor == null ? 0 : Math.max(0, shown - tr.cursor) };
      if (tr.phase === 'complete') finish();
      rerender();
    },
    onInterim: (text) => {
      if (text) { heardRef.current = true; setNoAudio(false); }
      setInterim(text);
      const tr = trackerRef.current;
      if (!tr) return;
      const prev = previewRef.current;
      const n = tr.mismatch ? 0 : tr.preview(text);
      previewRef.current = { cursor: tr.cursor, n: prev.cursor === tr.cursor && !tr.mismatch ? Math.max(prev.n, n) : n };
    },
    onState: (state, err) => {
      setCapture(state); setCaptureError(err || null);
      if (state !== 'listening') { setInterim(''); previewRef.current = { cursor: trackerRef.current?.cursor ?? null, n: 0 }; }
    },
    onProgress: (p) => setProgress(p),
    onPerf: (p) => { if (p.windowSec >= 2) setSlowDevice(p.rtf > 1.1); },
  };
  const speechRef = useRef(null);
  if (!speechRef.current) {
    speechRef.current = new NvidiaSpeech({
      onSegment: (x) => handlersRef.current.onSegment(x),
      onState: (a, b) => handlersRef.current.onState(a, b),
      onInterim: (x) => handlersRef.current.onInterim(x),
      onProgress: (x) => handlersRef.current.onProgress(x),
      onPerf: (x) => handlersRef.current.onPerf(x),
    });
  }
  const speech = speechRef.current;
  const supported = speech.supported;
  const listening = capture === 'listening';
  const micBusy = capture === 'loading' || capture === 'requesting';

  // Übungszeit mitzählen (nur während das Mikrofon wirklich zuhört).
  const readingRef = useRef(readingNow);
  readingRef.current = readingNow;
  useEffect(() => {
    if (!listening) return undefined;
    const t = setInterval(() => {
      const m = metaRef.current;
      if (!m) return;
      m.activeSec++;
      if (readingRef.current) m.visibleSec++; else m.hiddenSec++;
    }, 1000);
    return () => clearInterval(t);
  }, [listening]);

  // Ehrlicher Hinweis, wenn das Mikrofon an ist, aber nichts ankommt.
  useEffect(() => {
    if (!listening) { setNoAudio(false); return undefined; }
    heardRef.current = false;
    const t = setTimeout(() => { if (!heardRef.current) setNoAudio(true); }, 7000);
    return () => clearTimeout(t);
  }, [listening]);

  // ---- Speichern (nur Zahlen/Stellen, nie Audio) -------------------------
  const save = useCallback((keepalive = false) => {
    const tr = trackerRef.current;
    const m = metaRef.current;
    if (!tr || !m) return;
    const s = tr.summary();
    const c = s.counts;
    if (!(c.memory + c.read + c.assisted + c.missed) && !s.hints && !s.ayahHints) return;
    const body = { id: m.id, startedAt: m.startedAt, endedAt: new Date().toISOString(), activeSec: m.activeSec, hiddenSec: m.hiddenSec, visibleSec: m.visibleSec, ...s };
    if (keepalive) {
      try { fetch('/api/recitation-sessions', { method: 'POST', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch { /* egal */ }
      return;
    }
    setSaveState('saving');
    api.post('/recitation-sessions', body).then(() => setSaveState('saved')).catch(() => setSaveState('error'));
  }, []);

  // Mikrofon zuverlässig stoppen (Tab verlassen/verstecken, Ansicht verlassen) und Stand sichern.
  const hiddenRef = useRef(null);
  hiddenRef.current = () => { if (speech.audio) { speech.stop(); setCapture('paused'); save(true); } };
  useEffect(() => {
    const onHide = () => { if (document.hidden) hiddenRef.current(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      speech.stop(); speech.dispose?.();
      save(true);
    };
  }, [speech, save]);

  const resetPreview = () => { previewRef.current = { cursor: trackerRef.current?.cursor ?? null, n: 0 }; };

  const begin = (scope) => {
    if (!index || !consent || !supported) return;
    if (!globalThis.isSecureContext) { setCapture('error'); setCaptureError('Bitte HTTPS oder localhost verwenden.'); return; }
    if (trackerRef.current && metaRef.current) save();
    const tr = new RecitationTracker(index, { scope, reading: readingNow });
    trackerRef.current = tr;
    metaRef.current = { id: newSessionId(), startedAt: new Date().toISOString(), activeSec: 0, hiddenSec: 0, visibleSec: 0 };
    setEnded(false); setSaveState('idle'); setFollowing(true); setPeek(false); setSheet(null);
    resetPreview();
    if (tr.phase === 'tracking') setPage(index.pageOf(tr.cursor));
    speech.start(metaRef.current.id);
    rerender();
  };
  const resume = () => { if (trackerRef.current && !ended) { setCaptureError(null); speech.start(metaRef.current.id); } };
  const pause = () => { speech.stop(); setCapture('paused'); save(); };
  function finish() {
    speech.stop();
    setCapture('idle');
    setEnded(true); setPeek(false); setSheet(null);
    save();
  }
  const closeSession = () => { speech.stop(); trackerRef.current = null; metaRef.current = null; setEnded(false); setCapture('idle'); setPeek(false); rerender(); };

  const onMic = () => {
    if (micBusy) return;
    if (!trackerRef.current || ended) { begin({ kind: 'free' }); return; }
    if (listening) pause(); else resume();
  };
  const toggleDisplay = () => {
    const next = display === 'hidden' ? 'visible' : 'hidden';
    setDisplay(next); setPeek(false);
    try { localStorage.setItem(DISPLAY_KEY, next); } catch { /* egal */ }
  };
  const togglePeek = () => {
    setPeek((p) => { if (!p) trackerRef.current?.notePeek(); return !p; });
    setSheet(null);
  };
  const help = (what) => {
    const tr = trackerRef.current;
    if (!tr) return;
    if (what === 'word') tr.hintNext();
    else if (what === 'ayah') tr.hintAyah();
    else if (what === 'dismiss') tr.dismissMismatch();
    else if (what === 'search') { tr.searchAgain(); resetPreview(); }
    setSheet(null);
    rerender();
  };
  const choose = (i) => { trackerRef.current?.choose(i); setFollowing(true); resetPreview(); rerender(); };

  // ---- Seite folgt der Rezitation -----------------------------------------
  const active = !!tracker && !ended;
  const trackPage = tracker && index && tracker.phase === 'tracking' && tracker.cursor != null ? index.pageOf(Math.min(tracker.cursor, index.total - 1)) : null;
  useEffect(() => {
    if (!active || !following || trackPage == null || trackPage === page) return;
    setPage(trackPage);
  }, [active, following, trackPage, page]);
  // Nächste Seite rechtzeitig vorladen (kein Warten beim Umblättern).
  useEffect(() => { if (trackPage) prefetchPage(trackPage + 1); }, [trackPage]);

  const goPage = (p, manual = true) => {
    const q = clampPage(p);
    if (manual && active && trackPage != null) setFollowing(q === trackPage);
    setPage(q);
  };
  const backToRecitation = () => { setFollowing(true); if (trackPage) setPage(trackPage); };

  // ---- Tastatur (Mac/iPad mit Tastatur) ------------------------------------
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || sheet) return;
    const tag = (e.target?.tagName || '').toLowerCase();
    if (['input', 'select', 'textarea'].includes(tag)) return;
    // Leertaste auf einem fokussierten Knopf löst diesen Knopf aus (Standard) -- nicht zusätzlich das Mikrofon.
    if (tag === 'button' && e.key === ' ') return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); goPage(page + 1); } // RTL: links = weiter
    else if (e.key === 'ArrowRight') { e.preventDefault(); goPage(page - 1); }
    else if (e.key === ' ') { e.preventDefault(); onMic(); }
    else if ((e.key === 'v' || e.key === 'V') && active) toggleDisplay();
    else if (e.key === 'Escape' && active && !following) backToRecitation();
  };
  useEffect(() => {
    const on = (e) => keyRef.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  // ---- Wischen = Blättern, Tippen = Bedienelemente ein/aus -----------------
  const gesture = useRef(null);
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gesture.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const onPointerUp = (e) => {
    const g = gesture.current; gesture.current = null;
    if (!g) return;
    const dx = e.clientX - g.x; const dy = e.clientY - g.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { goPage(dx > 0 ? page + 1 : page - 1); return; } // RTL: nach rechts = weiter
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && Date.now() - g.t < 500) setChrome((c) => !c);
  };

  // ---- Darstellung der Seite ------------------------------------------------
  const glyph = !!(pageData?.font === 'v1' && isPageFontLoaded(pageData.fontPage));
  const pageElRef = useRef(null);
  const { fs: glyphFs, width: glyphW, shortLines } = useMushafAutoFit(pageElRef, {
    active: glyph,
    numLines: pageData?.lines.length || 0,
    resetKey: pageData ? `${pageData.page}:${glyph}` : null,
    layout: loadMushafLayout(),
  });
  // Jedem Wort der Seite seine Nummer im Qur'an-Index zuordnen (s:a:p).
  const lines = useMemo(() => {
    if (!pageData) return [];
    const counter = {};
    return pageData.lines.map((line) => ({
      n: line.n,
      words: line.words.map((w) => {
        if (w.e) return { ...w, g: null };
        counter[w.v] = (counter[w.v] || 0) + 1;
        const [s, a] = w.v.split(':').map(Number);
        const p = Number.isInteger(w.p) ? w.p : counter[w.v];
        return { ...w, g: index ? index.wordOf(s, a, p) : null };
      }),
    }));
  }, [pageData, index]);
  const headerByLine = useMemo(() => {
    if (!pageData) return {};
    const placed = new Set();
    const out = {};
    for (const line of pageData.lines) for (const w of line.words) {
      if (pageData.starts?.[w.v] && !placed.has(w.v)) { placed.add(w.v); (out[line.n] ||= []).push(pageData.starts[w.v]); }
    }
    return out;
  }, [pageData]);

  const tracking = active && tracker.phase === 'tracking';
  const pv = previewRef.current;
  const previewN = listening && tracking && pv.cursor === tracker.cursor ? pv.n : 0;
  const current = tracking ? tracker.cursor + previewN : null;
  const hideMode = !!tracker && display === 'hidden' && !peek && !ended;
  const range = tracker?.range;
  const wordClass = (g) => {
    if (g == null || !tracker) return 'mushaf-word';
    const kind = tracker.marks.get(g);
    const outside = g < range[0] || g >= range[1];
    const known = !!kind || tracker.hints.has(g) || (tracking && g >= tracker.cursor && g < tracker.cursor + previewN);
    const cls = ['mushaf-word'];
    if (outside) { cls.push('opacity-40'); return cls.join(' '); }
    if (hideMode && !known) cls.push('mushaf-word-hidden');
    if (kind === KIND.MISSED) cls.push('mushaf-word-missed');
    else if (!hideMode && kind === KIND.ASSISTED) cls.push('text-sage-muted');
    if (tracker.mismatch?.suspected && tracker.mismatch.g === g) cls.push('ring-1 ring-status-absent/60 rounded');
    if (g === current && !ended) cls.push(hideMode ? 'is-recite-next' : 'is-recite-current');
    return cls.join(' ');
  };

  // ---- Statuszeile -----------------------------------------------------------
  const surahName = (n) => surahs?.find((s) => s.n === n)?.name || `Sure ${n}`;
  const where = tracking && index ? `${surahName(index.surah[Math.min(tracker.cursor, index.total - 1)])}, Ayah ${index.ayah[Math.min(tracker.cursor, index.total - 1)]}` : null;
  let status;
  if (!tracker) status = index ? 'Mikrofon antippen und einfach losrezitieren – die App findet die Stelle selbst.' : 'Qur\'an-Index wird geladen …';
  else if (ended) status = 'Übung beendet.';
  else if (capture === 'loading') status = progress?.phase === 'init' || !progress?.total ? 'Spracherkennung wird vorbereitet …' : `Spracherkennung wird einmalig geladen … ${fmtMb(progress.loaded)} / ${fmtMb(progress.total)}`;
  else if (capture === 'requesting') status = 'Warte auf Mikrofonfreigabe …';
  else if (capture === 'error') status = ERROR_TEXT[captureError] || 'Die Spracherkennung konnte nicht starten. Bitte erneut auf das Mikrofon tippen.';
  else if (capture === 'unsupported') status = 'Dieser Browser unterstützt die Spracherkennung nicht.';
  else if (capture === 'paused' || capture === 'idle') status = `Pausiert${where ? ` · ${where}` : ''}. Der Stand bleibt erhalten.`;
  else if (tracker.phase === 'searching') status = tracker.candidates.length ? 'Mehrere Stellen passen – weiter rezitieren oder unten wählen.' : 'Hört zu · sucht die Stelle …';
  else if (tracker.mismatch?.suspected) status = 'Mögliche Abweichung – bitte die Stelle wiederholen.';
  else status = `Hört zu · ${where}`;
  const micState = !tracker || ended ? 'off' : capture === 'listening' ? (tracker.phase === 'searching' ? 'search' : 'on') : micBusy ? 'busy' : capture === 'error' ? 'error' : 'paused';

  const counts = tracker?.counts();
  const showReturn = active && !following && trackPage != null && trackPage !== page;

  return (
    <div className="pb-28 md:pb-24">
      {/* Kopf: Seite + Bereich (blendet beim Antippen der Seite aus, ohne Platz zu ändern) */}
      <div className={`flex items-center justify-between gap-2 mb-3 transition-opacity ${chrome ? '' : 'opacity-0 pointer-events-none'}`} aria-hidden={!chrome}>
        <div className="flex items-center gap-1">
          <button onClick={() => goPage(page - 1)} disabled={page <= 1} aria-label="Vorige Seite" className="p-2 rounded-lg border border-line text-sage hover:bg-hover disabled:opacity-40"><ChevronRight size={16} /></button>
          <button onClick={() => goPage(page + 1)} disabled={page >= 604} aria-label="Nächste Seite" className="p-2 rounded-lg border border-line text-sage hover:bg-hover disabled:opacity-40"><ChevronLeft size={16} /></button>
        </div>
        <div className="text-center min-w-0">
          <div className="text-ivory text-sm font-medium tabular-nums inline-flex items-center gap-1.5">
            Seite {page} <span className="text-sage-muted font-normal">/ 604</span>
            {pageLoading && pageData && <Loader2 size={13} className="animate-spin text-sage-muted" aria-label="Seite lädt" />}
          </div>
          <div className="text-caption text-sage-muted truncate">
            {tracker?.scope.kind === 'focused' ? `Gezielt: ${tracker.scope.label}` : pageData?.juz ? `Juzʼ ${pageData.juz}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setSheet('range')} className="p-2 rounded-lg border border-line text-sage hover:bg-hover" aria-label="Gezielt üben" title="Gezielt üben"><Target size={16} /></button>
          <button onClick={() => setSheet('history')} className="p-2 rounded-lg border border-line text-sage hover:bg-hover" aria-label="Verlauf" title="Verlauf"><History size={16} /></button>
        </div>
      </div>

      {/* Status (live, für Screenreader) */}
      <div className={`min-h-[1.5rem] mb-2 transition-opacity ${chrome ? '' : 'opacity-0'}`}>
        <p className="flex items-center gap-2 text-subhead" role="status" aria-live="polite">
          {micState === 'on' || micState === 'search' ? <span className="h-2 w-2 rounded-full bg-status-present animate-pulse motion-reduce:animate-none shrink-0" aria-hidden="true" /> : null}
          {capture === 'error' && <AlertTriangle size={15} className="text-status-absent shrink-0" />}
          <span className={capture === 'error' ? 'text-status-absent' : 'text-sage'}>{status}</span>
        </p>
        {listening && interim && <p className="text-caption text-sage-muted truncate" aria-live="off">Gehört: <span dir="rtl" lang="ar" className="font-arabic-ui">{interim}</span></p>}
        {slowDevice && listening && <p className="text-caption text-status-late">Dieses Gerät kommt kurz nicht hinterher – Wörter erscheinen etwas verzögert.</p>}
        {noAudio && listening && <p className="text-caption text-status-late">Das Mikrofon scheint nichts zu empfangen. Bitte Mikrofonberechtigung prüfen.</p>}
      </div>

      {/* Mehrdeutige Stelle: selbst wählen */}
      {active && tracker.candidates.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-caption text-sage-muted">Welche Stelle?</span>
          {tracker.candidates.slice(0, 5).map((c, i) => (
            <button key={c.end} onClick={() => choose(i)} className="px-3 py-1.5 rounded-full border border-line bg-card text-footnote text-ivory hover:bg-hover">
              {surahName(index.surah[c.start])} {index.ayah[c.start]}
            </button>
          ))}
        </div>
      )}

      {!consent && <Notice>Für die Spracherkennung fehlt noch deine Einwilligung (Konto → Datenschutz).</Notice>}
      {!supported && <Notice>Die Spracherkennung läuft in diesem Browser nicht. Bitte Safari oder Chrome aktualisieren.</Notice>}
      {indexError && <Notice>{indexError}</Notice>}
      {pageError && !pageData && <Notice>{pageError} <button className="underline ml-1" onClick={() => goPage(page, false)}>Erneut versuchen</button></Notice>}

      {/* Mushaf-Seite */}
      {!pageData ? (pageError ? null : <Spinner label="Mushaf-Seite wird geladen …" />) : (
        <div className="relative select-none" onPointerDown={onPointerDown} onPointerUp={onPointerUp} style={{ touchAction: 'pan-y pinch-zoom' }} data-testid="hifz-page">
          <Card className="p-0 overflow-hidden">
            <div
              ref={pageElRef}
              className={`mushaf-page px-4 py-5 sm:px-8 sm:py-7 font-mushaf mx-auto ${glyph ? 'is-glyph' : ''} ${hideMode ? 'is-hidden-mode' : ''}`}
              style={{
                fontSize: glyph ? (glyphFs ? `${glyphFs}px` : 'clamp(1.1rem, 4.2vw, 1.7rem)') : 'clamp(1.3rem, 4.4vw, 1.85rem)',
                width: glyph && glyphW ? `${glyphW}px` : undefined,
                maxWidth: glyph ? '100%' : '44rem',
              }}
            >
              <div className="mushaf-lines">
                {lines.map((line) => (
                  <div key={line.n} className="mushaf-line-wrap">
                    {(headerByLine[line.n] || []).map((h) => (
                      <div key={h.surah} className="mushaf-surah-head">
                        <div className="text-mint" style={{ fontSize: '1.05em' }} dir="rtl">سُورَةُ {h.name}</div>
                        {h.bismillah && <div dir="rtl" className="mt-1" style={{ fontSize: '0.9em' }}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>}
                      </div>
                    ))}
                    <p data-line={line.n} className={`mushaf-line ${(glyph ? shortLines.has(String(line.n)) : line.words.length <= 6) ? 'is-short' : ''}`}>
                      {line.words.map((w, wi) => {
                        if (w.e) return <span key={wi} className="mushaf-word mushaf-end" aria-hidden="true" style={glyph && w.g ? { fontFamily: `qcf-p${pageData.fontPage}` } : undefined}>{glyph && w.g ? w.g : `﴿${w.t}﴾`}</span>;
                        const cls = wordClass(w.g);
                        const hidden = cls.includes('mushaf-word-hidden');
                        return (
                          <span key={wi} data-g={w.g ?? undefined} aria-hidden={hidden || undefined}
                            style={glyph && w.g ? { fontFamily: `qcf-p${pageData.fontPage}` } : undefined}
                            className={cls}>
                            {glyph && w.g ? w.g : w.t}{glyph ? '' : ' '}
                          </span>
                        );
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          {showReturn && (
            <button onClick={backToRecitation} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}
              className="absolute left-1/2 -translate-x-1/2 top-3 z-10 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-mint text-onaccent px-4 py-2 text-footnote font-semibold shadow-float">
              <Undo2 size={15} /> Zurück zur Rezitation · Seite {trackPage}
            </button>
          )}
          {!chrome && (micState === 'on' || micState === 'search') && (
            <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-status-present animate-pulse motion-reduce:animate-none" aria-label="Mikrofon an" />
          )}
        </div>
      )}

      {/* Ergebnis nach dem Beenden */}
      {ended && tracker && (
        <Card className="p-4 sm:p-5 mt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-body font-semibold text-ivory">Übung beendet</h3>
            <span className="text-caption text-sage-muted">
              {saveState === 'saving' ? 'Wird gespeichert …' : saveState === 'saved' ? 'Gespeichert' : saveState === 'error' ? 'Nicht gespeichert (offline?)' : ''}
            </span>
          </div>
          <SummaryStats counts={counts} summary={tracker.summary()} meta={metaRef.current} surahName={surahName} />
          <p className="text-caption text-sage-muted">Übungshilfe der Spracherkennung – keine Bewertung von Aussprache oder Tadschwid. Deine Lehrkraft sieht diese Übersicht.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => begin(tracker.scope)}><Mic size={16} /> Neue Übung</Button>
            <Button variant="outline" onClick={closeSession}>Schließen</Button>
            {saveState === 'error' && <Button variant="ghost" onClick={() => save()}>Erneut speichern</Button>}
          </div>
        </Card>
      )}

      {!tracker && !modelCached && supported && (
        <p className="text-caption text-sage-muted text-center mt-3">Beim ersten Mal lädt die Spracherkennung einmalig (ca. 85 MB) – am besten im WLAN. Audio bleibt auf dem Gerät.</p>
      )}

      {/* Bedienleiste */}
      <ControlBar hidden={!chrome}>
        {active && (
          <BarButton onClick={() => setSheet('help')} disabled={!tracking} label="Hilfe" icon={Lightbulb} />
        )}
        {active && (
          <BarButton onClick={toggleDisplay} pressed={display === 'visible'} label={display === 'hidden' ? 'Text zeigen' : 'Text verbergen'}
            icon={display === 'hidden' ? Eye : EyeOff} title="Text versteckt / sichtbar (Taste V)" testid="eye-toggle" />
        )}
        <button
          onClick={onMic}
          disabled={!index || !consent || !supported || micBusy}
          data-testid="mic-button"
          aria-label={micState === 'on' || micState === 'search' ? 'Mikrofon pausieren' : 'Mikrofon starten'}
          className={[
            'relative grid place-items-center h-14 w-14 rounded-full shadow-float transition-colors disabled:opacity-50',
            micState === 'on' || micState === 'search' ? 'bg-status-absent text-white' : 'bg-mint text-onaccent',
          ].join(' ')}
        >
          {micBusy ? <Loader2 size={24} className="animate-spin" /> : micState === 'on' || micState === 'search' ? <Pause size={24} fill="currentColor" /> : <Mic size={24} />}
          {micState === 'search' && <Search size={13} className="absolute bottom-2 right-2" aria-hidden="true" />}
        </button>
        {active && <BarButton onClick={finish} label="Beenden" icon={Square} />}
        {!active && <BarButton onClick={() => setSheet('range')} label="Gezielt" icon={Target} />}
      </ControlBar>

      {sheet === 'help' && tracker && (
        <Sheet title="Hilfe" onClose={() => setSheet(null)}>
          <div className="grid gap-2">
            <Button variant="outline" onClick={() => help('word')}>Nächstes Wort zeigen</Button>
            <Button variant="outline" onClick={() => help('ayah')}>Ganze Ayah zeigen</Button>
            {display === 'hidden' && <Button variant="outline" onClick={togglePeek}>{peek ? 'Wieder verbergen' : 'Seite kurz zeigen'}</Button>}
            {tracker.mismatch && <Button variant="ghost" onClick={() => help('dismiss')}><X size={16} /> Markierung verwerfen (falsch erkannt)</Button>}
            {tracker.scope.kind === 'free' && <Button variant="ghost" onClick={() => help('search')}><Search size={16} /> Stelle neu suchen</Button>}
          </div>
          <p className="text-caption text-sage-muted mt-3">Hilfen decken auf, zählen aber nicht als auswendig rezitiert.</p>
        </Sheet>
      )}
      {sheet === 'range' && index && (
        <Sheet title="Gezielt üben" onClose={() => setSheet(null)}>
          <RangePicker index={index} surahs={surahs} page={page} onStart={(scope) => begin(scope)} />
        </Sheet>
      )}
      {sheet === 'history' && (
        <Sheet title="Meine Übungen" onClose={() => setSheet(null)}>
          <HistoryList surahName={surahName} />
        </Sheet>
      )}
      {peek && active && (
        <button onClick={togglePeek} className="fixed left-1/2 -translate-x-1/2 z-40 top-[calc(env(safe-area-inset-top)+4.5rem)] rounded-full bg-elevated border border-line px-4 py-2 text-footnote text-ivory shadow-float inline-flex items-center gap-1.5">
          <EyeOff size={15} /> Wieder verbergen
        </button>
      )}
    </div>
  );
}

function Notice({ children }) {
  return (
    <div className="rounded-xl border border-status-late/40 bg-status-late/10 p-3 text-footnote text-status-late flex items-start gap-2 mb-3">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span>{children}</span>
    </div>
  );
}

function ControlBar({ hidden, children }) {
  return createPortal(
    <div className={`fixed inset-x-0 z-30 px-3 bottom-[calc(var(--dbz-tabbar-h,0px)+0.75rem)] md:bottom-5 md:left-[5.5rem] lg:left-[17rem] pointer-events-none transition-opacity ${hidden ? 'opacity-0' : ''}`}>
      <div className={`mx-auto w-fit flex items-center gap-3 sm:gap-4 rounded-full border border-line/70 bg-card/95 dark:bg-elevated/95 backdrop-blur px-3 py-2 shadow-float ${hidden ? '' : 'pointer-events-auto'}`} data-testid="hifz-controls">
        {children}
      </div>
    </div>,
    document.body,
  );
}

function BarButton({ onClick, label, icon: Icon, pressed, disabled, title, testid }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-pressed={pressed} title={title || label} data-testid={testid}
      className={`flex flex-col items-center gap-0.5 min-w-[3.25rem] rounded-xl px-1.5 py-1 text-[0.6875rem] font-medium disabled:opacity-40 ${pressed ? 'text-mint-light' : 'text-sage'} hover:bg-hover`}>
      <Icon size={20} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

function Sheet({ title, onClose, children }) {
  useBackToClose(true, onClose);
  useEffect(() => {
    const on = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dbz-backdrop absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="dbz-sheet relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-3xl bg-card dark:bg-elevated p-5 shadow-float" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-title3 text-ivory">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full text-sage-muted hover:bg-hover" aria-label="Schließen"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function SummaryStats({ counts, summary, meta, surahName }) {
  const rows = [
    ['Auswendig erkannt', counts.memory],
    ['Mitgelesen (Text sichtbar)', counts.read],
    ['Nach Hilfe', counts.assisted],
    ['Ausgelassen', counts.missed],
  ];
  return (
    <div className="space-y-2">
      <p className="text-subhead text-sage flex flex-wrap gap-x-2">
        <span>{fmtRange(summary.from, summary.to, surahName) || 'Keine Stelle erkannt.'}</span>
        {meta && <span className="text-sage-muted">{fmtDuration(meta.activeSec)}</span>}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {rows.map(([l, v]) => (
          <div key={l} className="rounded-xl bg-subtle px-3 py-2">
            <div className="text-title3 text-ivory tabular-nums">{v}</div>
            <div className="text-caption text-sage-muted">{l}</div>
          </div>
        ))}
      </div>
      {(summary.hints + summary.ayahHints + summary.peeks) > 0 && (
        <p className="text-caption text-sage-muted">{`Hilfen: ${summary.hints}× Wort, ${summary.ayahHints}× Ayah, ${summary.peeks}× Seite gezeigt`}</p>
      )}
    </div>
  );
}

// ---- Gezielt üben: Sure/Ayat, Seiten oder Juzʼ ------------------------------
function RangePicker({ index, surahs, page, onStart }) {
  const [kind, setKind] = useState('surah');
  const firstSurah = index.surah[index.pageRange(page)[0]];
  const [surah, setSurah] = useState(firstSurah);
  const ayat = index.surahAyat[surah - 1];
  const [a1, setA1] = useState(1);
  const [a2, setA2] = useState(ayat);
  useEffect(() => { setA1(1); setA2(index.surahAyat[surah - 1]); }, [surah, index]);
  const [p1, setP1] = useState(page);
  const [p2, setP2] = useState(page);
  const [juz, setJuz] = useState(1);
  const name = (n) => surahs?.find((s) => s.n === n)?.name || `Sure ${n}`;

  const start = () => {
    let from, to, label;
    if (kind === 'surah') {
      const x = Math.max(1, Math.min(ayat, Number(a1) || 1));
      const y = Math.max(x, Math.min(ayat, Number(a2) || ayat));
      [from, to] = index.ayahRange(surah, x, y);
      label = x === 1 && y === ayat ? name(surah) : `${name(surah)} ${x}–${y}`;
    } else if (kind === 'pages') {
      const x = clampPage(p1); const y = Math.max(x, clampPage(p2));
      from = index.pageRange(x)[0]; to = index.pageRange(y)[1];
      label = x === y ? `Seite ${x}` : `Seiten ${x}–${y}`;
    } else {
      [from, to] = index.juzRange(Number(juz));
      label = `Juzʼ ${juz}`;
    }
    onStart({ kind: 'focused', from, to, label });
  };

  return (
    <div className="space-y-4">
      <Segmented className="w-full" options={[['surah', 'Sure'], ['pages', 'Seiten'], ['juz', 'Juzʼ']]} value={kind} onChange={setKind} />
      {kind === 'surah' && (
        <div className="space-y-3">
          <select className="input" value={surah} onChange={(e) => setSurah(Number(e.target.value))} aria-label="Sure">
            {(surahs || []).map((s) => <option key={s.n} value={s.n}>{s.n}. {s.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-footnote text-sage">Ayah von</span>
              <input className="input mt-1" inputMode="numeric" value={a1} onChange={(e) => setA1(e.target.value)} /></label>
            <label className="block"><span className="text-footnote text-sage">bis (max. {ayat})</span>
              <input className="input mt-1" inputMode="numeric" value={a2} onChange={(e) => setA2(e.target.value)} /></label>
          </div>
        </div>
      )}
      {kind === 'pages' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="text-footnote text-sage">Seite von</span>
            <input className="input mt-1" inputMode="numeric" value={p1} onChange={(e) => setP1(e.target.value)} /></label>
          <label className="block"><span className="text-footnote text-sage">bis</span>
            <input className="input mt-1" inputMode="numeric" value={p2} onChange={(e) => setP2(e.target.value)} /></label>
        </div>
      )}
      {kind === 'juz' && (
        <select className="input" value={juz} onChange={(e) => setJuz(Number(e.target.value))} aria-label="Juzʼ">
          {Array.from({ length: 30 }, (_, i) => <option key={i + 1} value={i + 1}>Juzʼ {i + 1}</option>)}
        </select>
      )}
      <Button className="w-full" onClick={start}><Mic size={16} /> Starten</Button>
      <p className="text-caption text-sage-muted">Ohne Auswahl einfach das Mikrofon antippen: dann findet die App die Stelle im ganzen Qur'an selbst.</p>
    </div>
  );
}

function HistoryList({ surahName }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.get('/recitation-sessions?limit=30').then((d) => setList(d.sessions)).catch((e) => setError(e.message)); }, []);
  if (error) return <p className="text-footnote text-status-absent">{error}</p>;
  if (!list) return <Spinner label="" />;
  if (!list.length) return <p className="text-footnote text-sage-muted">Noch keine Übungen gespeichert.</p>;
  return <RecitationSessionList sessions={list} surahName={surahName} />;
}
