// PDF direkt in der App ansehen (pdf.js), mit "Zurück", Zoom und
// "Speichern / Teilen" (iOS: "In Dateien sichern", andere Apps ...).
//
// Optional (wie OneNote): Lehrkräfte schreiben/markieren direkt auf dem PDF.
// Die Striche liegen GETRENNT über dem Original (das bleibt unverändert);
// Schüler sehen neue Striche nach ~1–2 s automatisch ("Live"). Beim Speichern
// kann man das Original oder eine Fassung "mit Notizen" wählen.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Share2, Download, ZoomIn, ZoomOut, PenLine, Highlighter, Eraser, Undo2, Trash2,
  Eye, EyeOff, X, Check, RefreshCw, Hand,
} from 'lucide-react';
import { useBackToClose } from './ui.jsx';
import { api } from '../lib/api.js';
import { loadPdfjs, PDF_OPTIONS, fetchBytes, canShareFile, shareFile, downloadFile, downloadIsSafe } from '../lib/pdf.js';
import { NOTE_SCALE, MARKER_OPACITY, strokePath, newStrokeId, thinPoints, distanceToStroke, exportAnnotatedPdf } from '../lib/pdfAnnotate.js';

const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3];
const PEN_COLORS = ['#e11d48', '#2563eb', '#111827', '#16a34a'];
const MARKER_COLORS = ['#facc15', '#4ade80', '#f472b6'];
const PEN_WIDTH = 4; // Promille der Seitenbreite
const MARKER_WIDTH = 16;
const PAGE_GAP = 12;
const MAX_CANVAS_PX = 12e6; // iOS-Grenze für Canvas-Fläche beachten

export default function PdfViewer({ url, name, onClose, notesPath = null, canAnnotate = false }) {
  useBackToClose(true, onClose);
  const fileName = /\.pdf$/i.test(name || '') ? name : `${name || 'Dokument'}.pdf`;

  // --- Laden ----------------------------------------------------------------
  const [status, setStatus] = useState({ s: 'loading', progress: 0, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const bytesRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [sizes, setSizes] = useState([]); // [{w,h}] je Seite bei Maßstab 1

  useEffect(() => {
    let cancelled = false;
    let task = null;
    let doc = null;
    setStatus({ s: 'loading', progress: 0, error: null });
    (async () => {
      try {
        const [bytes, pdfjs] = await Promise.all([
          fetchBytes(url, (p) => !cancelled && setStatus((st) => ({ ...st, progress: p }))),
          loadPdfjs(),
        ]);
        if (cancelled) return;
        bytesRef.current = bytes;
        task = pdfjs.getDocument({ ...PDF_OPTIONS, data: bytes.slice() });
        doc = await task.promise;
        if (cancelled) { doc.destroy(); return; }
        const first = await doc.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        setSizes(Array.from({ length: doc.numPages }, () => ({ w: vp.width, h: vp.height })));
        setPdf(doc);
        setStatus({ s: 'ready', progress: 1, error: null });
        // Abweichende Seitengrößen im Hintergrund nachtragen
        for (let i = 2; i <= doc.numPages && !cancelled; i++) {
          const p = await doc.getPage(i);
          const v = p.getViewport({ scale: 1 });
          if (Math.abs(v.width - vp.width) > 0.5 || Math.abs(v.height - vp.height) > 0.5) {
            setSizes((prev) => { const n = prev.slice(); n[i - 1] = { w: v.width, h: v.height }; return n; });
          }
        }
      } catch (err) {
        if (!cancelled) setStatus({ s: 'error', progress: 0, error: err?.message || 'PDF konnte nicht geöffnet werden' });
      }
    })();
    return () => {
      cancelled = true;
      try { task?.destroy(); } catch { /* egal */ }
      try { doc?.destroy(); } catch { /* egal */ }
      setPdf(null);
    };
  }, [url, reloadKey]);

  // --- Layout / Zoom ----------------------------------------------------------
  const scrollRef = useRef(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const update = () => setBoxWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [status.s]);

  const baseWidth = Math.max(200, Math.min(boxWidth - 16, 960));
  const pageWidth = Math.round(baseWidth * zoom);

  // Beim Zoomen die Leseposition halten
  const zoomAnchor = useRef(null);
  const changeZoom = (dir) => {
    const el = scrollRef.current;
    const i = ZOOMS.indexOf(zoom);
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + dir))];
    if (next === zoom) return;
    if (el) zoomAnchor.current = { top: (el.scrollTop + el.clientHeight / 2) / Math.max(1, el.scrollHeight), left: (el.scrollLeft + el.clientWidth / 2) / Math.max(1, el.scrollWidth) };
    setZoom(next);
  };
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = zoomAnchor.current;
    if (!el || !a) return;
    zoomAnchor.current = null;
    el.scrollTop = a.top * el.scrollHeight - el.clientHeight / 2;
    el.scrollLeft = a.left * el.scrollWidth - el.clientWidth / 2;
  }, [zoom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || !sizes.length) return;
    const mid = el.scrollTop + el.clientHeight / 3;
    let y = 8;
    for (let i = 0; i < sizes.length; i++) {
      const h = (pageWidth * sizes[i].h) / sizes[i].w;
      if (mid < y + h + PAGE_GAP) { setCurrentPage(i + 1); return; }
      y += h + PAGE_GAP;
    }
    setCurrentPage(sizes.length);
  };

  // --- Notizen (Striche) ------------------------------------------------------
  const [strokes, setStrokes] = useState([]);
  const [showNotes, setShowNotes] = useState(true);
  const [drawMode, setDrawMode] = useState(false);
  const [tool, setTool] = useState('pen'); // pen | marker | eraser
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [markerColor, setMarkerColor] = useState(MARKER_COLORS[0]);
  const [penOnly, setPenOnly] = useState(false); // Stift erkannt -> Finger scrollt
  const [saveState, setSaveState] = useState('idle'); // idle | saving | error
  const [liveFlash, setLiveFlash] = useState(false);
  const versionRef = useRef(-1);
  const queueRef = useRef([]);
  const flushingRef = useRef(false);
  const flushTimer = useRef(null);
  const activeRef = useRef(null); // laufender Strich / Radiervorgang
  const undoRef = useRef([]);
  const [undoCount, setUndoCount] = useState(0);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const flush = useCallback(async () => {
    if (!notesPath || flushingRef.current || !queueRef.current.length) return;
    flushingRef.current = true;
    const ops = queueRef.current.splice(0, 200);
    setSaveState('saving');
    try {
      const r = await api.post(notesPath, { ops });
      const expected = versionRef.current + 1;
      versionRef.current = r.version;
      // Jemand anderes hat parallel geschrieben -> beim nächsten Abgleich alles neu holen
      if (r.version !== expected) versionRef.current = -1;
      setSaveState(queueRef.current.length ? 'saving' : 'idle');
    } catch {
      queueRef.current.unshift(...ops);
      setSaveState('error');
      clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(() => { flushingRef.current = false; flush(); }, 3000);
      return;
    }
    flushingRef.current = false;
    if (queueRef.current.length) flush();
  }, [notesPath]);

  const enqueue = useCallback((ops) => {
    queueRef.current.push(...ops);
    clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flush, 200);
  }, [flush]);

  // Abgleich mit dem Server: Schüler alle 1,5 s ("Live"), Lehrkraft seltener.
  useEffect(() => {
    if (!notesPath) return undefined;
    let stop = false;
    let timer = null;
    const tick = async () => {
      if (stop) return;
      const busy = queueRef.current.length || flushingRef.current || activeRef.current;
      if (!busy && document.visibilityState === 'visible') {
        try {
          const r = await api.get(`${notesPath}?since=${versionRef.current}`);
          const stillIdle = !queueRef.current.length && !flushingRef.current && !activeRef.current;
          if (!stop && !r.unchanged && stillIdle) {
            const hadVersion = versionRef.current > 0;
            versionRef.current = r.version;
            setStrokes(r.strokes || []);
            if (hadVersion && !canAnnotate) { setLiveFlash(true); setTimeout(() => setLiveFlash(false), 1500); }
          }
        } catch { /* nächster Versuch */ }
      }
      if (!stop) timer = setTimeout(tick, canAnnotate ? 4000 : 1500);
    };
    tick();
    const onVis = () => { if (document.visibilityState === 'visible') { clearTimeout(timer); tick(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [notesPath, canAnnotate]);

  // Beim Schließen noch Ungespeichertes senden
  useEffect(() => () => { clearTimeout(flushTimer.current); if (queueRef.current.length && notesPath) api.post(notesPath, { ops: queueRef.current.splice(0) }).catch(() => {}); }, [notesPath]);

  const pushUndo = (entry) => { undoRef.current.push(entry); if (undoRef.current.length > 100) undoRef.current.shift(); setUndoCount(undoRef.current.length); };

  const addStroke = (s) => {
    setStrokes((prev) => [...prev, s]);
    enqueue([{ op: 'add', stroke: s }]);
    pushUndo({ kind: 'add', strokes: [s] });
  };
  const removeStrokes = (list, record = true) => {
    if (!list.length) return;
    const ids = new Set(list.map((s) => s.id));
    setStrokes((prev) => prev.filter((s) => !ids.has(s.id)));
    enqueue(list.map((s) => ({ op: 'remove', id: s.id })));
    if (record) pushUndo({ kind: 'remove', strokes: list });
  };
  const undo = () => {
    const e = undoRef.current.pop();
    setUndoCount(undoRef.current.length);
    if (!e) return;
    if (e.kind === 'add') removeStrokes(e.strokes, false);
    else {
      setStrokes((prev) => [...prev, ...e.strokes]);
      enqueue(e.strokes.map((s) => ({ op: 'add', stroke: s })));
    }
  };
  const clearPage = () => {
    const list = strokesRef.current.filter((s) => s.page === currentPage);
    if (!list.length) return;
    if (!window.confirm(`Alle Notizen auf Seite ${currentPage} löschen?`)) return;
    removeStrokes(list);
  };

  // Zeichnen: Ereignisse am gemeinsamen Seiten-Container. Ein Finger/Stift
  // zeichnet, zwei Finger scrollen. Wird ein Stift erkannt (iPad + Pencil),
  // scrollt der Finger normal und nur der Stift zeichnet (Handballen-Schutz).
  const contentRef = useRef(null);
  const livePaths = useRef({});
  const touches = useRef(new Map());

  const pagePoint = (rect, e) => [
    Math.round(((e.clientX - rect.left) / rect.width) * NOTE_SCALE),
    Math.round(((e.clientY - rect.top) / rect.height) * NOTE_SCALE),
  ];

  const eraseAt = (a, x, y) => {
    const aspect = a.rect.height / a.rect.width;
    const hits = strokesRef.current.filter((s) => s.page === a.page && distanceToStroke(s, x, y, aspect) < 140 + s.width * 5);
    const fresh = hits.filter((s) => !a.erased.has(s.id));
    if (!fresh.length) return;
    fresh.forEach((s) => a.erased.add(s.id));
    removeStrokes(fresh);
  };

  const cancelActive = () => {
    const a = activeRef.current;
    if (a?.mode === 'draw') livePaths.current[a.page]?.setAttribute('d', '');
    activeRef.current = null;
  };

  const onPointerDown = (e) => {
    if (!drawMode) return;
    if (e.pointerType === 'pen' && !penOnly) setPenOnly(true);
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (penOnly) return; // Finger scrollt
      if (touches.current.size >= 2) { cancelActive(); return; } // zwei Finger: scrollen
    }
    if (e.button && e.button !== 0) return;
    const pageEl = e.target.closest?.('[data-page]');
    if (!pageEl) return;
    const page = Number(pageEl.dataset.page);
    const rect = pageEl.getBoundingClientRect();
    const [x, y] = pagePoint(rect, e);
    try { contentRef.current.setPointerCapture(e.pointerId); } catch { /* egal */ }
    e.preventDefault();
    if (tool === 'eraser') {
      activeRef.current = { mode: 'erase', pointerId: e.pointerId, page, rect, erased: new Set() };
      eraseAt(activeRef.current, x, y);
      return;
    }
    const isMarker = tool === 'marker';
    const a = { mode: 'draw', pointerId: e.pointerId, page, rect, pts: [x, y], tool, color: isMarker ? markerColor : penColor, width: isMarker ? MARKER_WIDTH : PEN_WIDTH };
    activeRef.current = a;
    const live = livePaths.current[page];
    if (live) {
      const ratio = rect.height / rect.width;
      live.setAttribute('stroke', a.color);
      live.setAttribute('stroke-width', String(a.width * 10));
      live.setAttribute('opacity', isMarker ? String(MARKER_OPACITY) : '1');
      live.setAttribute('d', strokePath(a.pts, NOTE_SCALE, NOTE_SCALE * ratio));
    }
  };

  const onPointerMove = (e) => {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      const prev = touches.current.get(e.pointerId);
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (drawMode && !penOnly && touches.current.size >= 2 && scrollRef.current) {
        const n = touches.current.size;
        scrollRef.current.scrollTop -= (e.clientY - prev.y) / n;
        scrollRef.current.scrollLeft -= (e.clientX - prev.x) / n;
        return;
      }
    }
    const a = activeRef.current;
    if (!a || a.pointerId !== e.pointerId) return;
    const events = e.nativeEvent.getCoalescedEvents ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
    for (const ev of (events.length ? events : [e.nativeEvent])) {
      const [x, y] = pagePoint(a.rect, ev);
      if (a.mode === 'erase') { eraseAt(a, x, y); continue; }
      const lx = a.pts[a.pts.length - 2];
      const ly = a.pts[a.pts.length - 1];
      if (Math.hypot(x - lx, y - ly) >= 6 && a.pts.length < 5800) a.pts.push(x, y);
    }
    if (a.mode === 'draw') {
      const ratio = a.rect.height / a.rect.width;
      livePaths.current[a.page]?.setAttribute('d', strokePath(a.pts, NOTE_SCALE, NOTE_SCALE * ratio));
    }
  };

  const onPointerEnd = (e) => {
    touches.current.delete(e.pointerId);
    const a = activeRef.current;
    if (!a || a.pointerId !== e.pointerId) return;
    activeRef.current = null;
    if (a.mode !== 'draw') return;
    livePaths.current[a.page]?.setAttribute('d', '');
    if (e.type === 'pointercancel') return;
    const pts = thinPoints(a.pts, 8);
    addStroke({ id: newStrokeId(), page: a.page, tool: a.tool, color: a.color, width: a.width, pts });
  };

  // iOS: Apple Pencil soll nicht scrollen, der Finger aber schon.
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !drawMode || !penOnly) return undefined;
    const stop = (ev) => { if ([...ev.touches].some((t) => t.touchType === 'stylus')) ev.preventDefault(); };
    el.addEventListener('touchstart', stop, { passive: false });
    el.addEventListener('touchmove', stop, { passive: false });
    return () => { el.removeEventListener('touchstart', stop); el.removeEventListener('touchmove', stop); };
  }, [drawMode, penOnly, status.s]);

  const startDrawing = () => { setDrawMode(true); setShowNotes(true); };

  const byPage = useMemo(() => {
    const m = new Map();
    for (const s of strokes) {
      if (!m.has(s.page)) m.set(s.page, []);
      m.get(s.page).push(s);
    }
    return m;
  }, [strokes]);

  // --- Speichern / Teilen ----------------------------------------------------
  const [shareOpen, setShareOpen] = useState(false);

  const hasNotes = strokes.length > 0;
  const fingerDraws = drawMode && !penOnly;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-neutral-800 text-white" role="dialog" aria-modal="true" aria-label={name || 'PDF'}>
      {/* Kopfleiste */}
      <div className="flex items-center gap-2 bg-black/60 px-2" style={{ paddingTop: 'max(env(safe-area-inset-top), 0.6rem)', paddingBottom: '0.5rem' }}>
        <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-sm hover:bg-white/25">
          <ArrowLeft size={18} /> Zurück
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-sm text-white/85">{name}</span>
        <button
          onClick={() => setShareOpen(true)}
          disabled={status.s !== 'ready'}
          className="inline-flex items-center gap-1.5 rounded-full bg-mint px-3 py-2 text-sm text-onaccent disabled:opacity-40"
        >
          <Share2 size={16} /> Speichern
        </button>
      </div>

      {/* Notiz-Leiste */}
      {notesPath && status.s === 'ready' && (canAnnotate || hasNotes) && (
        <div className="flex items-center gap-1.5 overflow-x-auto bg-black/40 px-2 py-1.5 text-xs">
          {hasNotes && (
            <button onClick={() => setShowNotes((v) => !v)} className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 ${showNotes ? 'bg-white/20' : 'bg-white/5 text-white/70'}`}>
              {showNotes ? <Eye size={14} /> : <EyeOff size={14} />} {showNotes ? 'Mit Notizen' : 'Original'}
            </button>
          )}
          {!canAnnotate && (
            <span className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 transition ${liveFlash ? 'bg-mint/40' : 'bg-white/5'} text-white/80`}>
              <span className="h-2 w-2 rounded-full bg-status-absent animate-pulse" /> Live
            </span>
          )}
          {canAnnotate && !drawMode && (
            <button onClick={startDrawing} className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-mint px-3 py-1.5 text-onaccent">
              <PenLine size={14} /> Notizen schreiben
            </button>
          )}
          {canAnnotate && drawMode && (
            <>
              <ToolBtn active={tool === 'pen'} onClick={() => setTool('pen')} label="Stift"><PenLine size={15} /></ToolBtn>
              <ToolBtn active={tool === 'marker'} onClick={() => setTool('marker')} label="Marker"><Highlighter size={15} /></ToolBtn>
              <ToolBtn active={tool === 'eraser'} onClick={() => setTool('eraser')} label="Radierer"><Eraser size={15} /></ToolBtn>
              <span className="mx-0.5 h-5 w-px shrink-0 bg-white/20" />
              {(tool === 'marker' ? MARKER_COLORS : PEN_COLORS).map((c) => {
                const active = (tool === 'marker' ? markerColor : penColor) === c;
                return (
                  <button
                    key={c}
                    aria-label={`Farbe ${c}`}
                    onClick={() => { if (tool === 'marker') setMarkerColor(c); else { setPenColor(c); if (tool === 'eraser') setTool('pen'); } }}
                    className={`h-6 w-6 shrink-0 rounded-full border-2 ${active && tool !== 'eraser' ? 'border-white' : 'border-transparent'}`}
                    style={{ background: c }}
                  />
                );
              })}
              <span className="mx-0.5 h-5 w-px shrink-0 bg-white/20" />
              <ToolBtn onClick={undo} disabled={!undoCount} label="Rückgängig"><Undo2 size={15} /></ToolBtn>
              <ToolBtn onClick={clearPage} disabled={!byPage.get(currentPage)?.length} label="Seite leeren"><Trash2 size={15} /></ToolBtn>
              <ToolBtn active={penOnly} onClick={() => setPenOnly((v) => !v)} label={penOnly ? 'Nur Stift zeichnet' : 'Finger zeichnet'}><Hand size={15} /></ToolBtn>
              <span className="ml-auto shrink-0 pl-1 text-white/60">{saveState === 'saving' ? 'speichert …' : saveState === 'error' ? 'offline – wird nachgesendet' : 'gespeichert'}</span>
              <button onClick={() => setDrawMode(false)} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-3 py-1.5">
                <Check size={14} /> Fertig
              </button>
            </>
          )}
        </div>
      )}
      {canAnnotate && drawMode && (
        <div className="bg-black/30 px-3 py-1 text-center text-[11px] text-white/60">
          {penOnly ? 'Stift schreibt, Finger scrollt' : 'Ein Finger schreibt · zwei Finger scrollen'} · Schüler sehen es sofort, das Original bleibt unverändert
        </div>
      )}

      {/* Inhalt */}
      <div className="relative min-h-0 flex-1">
        {status.s === 'loading' && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="w-56 text-center">
              <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-mint" />
              <p className="text-sm text-white/80">PDF wird geöffnet …</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full bg-mint transition-all" style={{ width: `${Math.round((status.progress || 0.05) * 100)}%` }} />
              </div>
            </div>
          </div>
        )}
        {status.s === 'error' && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <p className="mb-4 text-sm text-white/85">{status.error}</p>
              <button onClick={() => setReloadKey((k) => k + 1)} className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm">
                <RefreshCw size={16} /> Erneut versuchen
              </button>
            </div>
          </div>
        )}
        {status.s === 'ready' && pdf && (
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="absolute inset-0 overflow-auto overscroll-contain"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div
              ref={contentRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
              className="mx-auto py-2"
              style={{
                width: pageWidth + 16,
                paddingLeft: 8,
                paddingRight: 8,
                touchAction: fingerDraws ? 'none' : 'auto',
                userSelect: drawMode ? 'none' : undefined,
                WebkitUserSelect: drawMode ? 'none' : undefined,
                WebkitTouchCallout: 'none',
                cursor: drawMode ? (tool === 'eraser' ? 'cell' : 'crosshair') : undefined,
              }}
            >
              {sizes.map((sz, i) => (
                <PdfPage
                  key={i}
                  pdf={pdf}
                  pageNo={i + 1}
                  size={sz}
                  width={pageWidth}
                  root={scrollRef}
                  strokes={showNotes ? byPage.get(i + 1) : null}
                  liveRef={(el) => { livePaths.current[i + 1] = el; }}
                />
              ))}
            </div>
          </div>
        )}

        {status.s === 'ready' && (
          <>
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1.5 text-xs" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
              Seite {currentPage} / {sizes.length}
            </div>
            <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/60 p-1" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
              <button onClick={() => changeZoom(-1)} disabled={zoom === ZOOMS[0]} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15 disabled:opacity-30" aria-label="Verkleinern"><ZoomOut size={18} /></button>
              <span className="w-11 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
              <button onClick={() => changeZoom(1)} disabled={zoom === ZOOMS[ZOOMS.length - 1]} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15 disabled:opacity-30" aria-label="Vergrößern"><ZoomIn size={18} /></button>
            </div>
          </>
        )}
      </div>

      {shareOpen && (
        <ShareSheet
          fileName={fileName}
          bytes={bytesRef.current}
          strokes={strokes}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>,
    document.body,
  );
}

function ToolBtn({ active, disabled, onClick, label, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${active ? 'bg-white text-neutral-900' : 'bg-white/10 hover:bg-white/20'} disabled:opacity-30`}
    >
      {children}
    </button>
  );
}

// Eine Seite: Canvas (pdf.js) + darüber die Notizen als SVG. Gerendert wird nur,
// was in der Nähe des sichtbaren Bereichs ist (spart Speicher bei langen PDFs).
function PdfPage({ pdf, pageNo, size, width, root, strokes, liveRef }) {
  const holder = useRef(null);
  const canvasRef = useRef(null);
  const [near, setNear] = useState(pageNo <= 2);
  const [rendered, setRendered] = useState(false);
  const height = Math.round((width * size.h) / size.w);
  const ratio = size.h / size.w;

  useEffect(() => {
    const el = holder.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { root: root.current, rootMargin: '1500px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    if (!near) {
      // Speicher freigeben
      canvas.width = 0;
      canvas.height = 0;
      setRendered(false);
      return undefined;
    }
    let cancelled = false;
    let task = null;
    const t = setTimeout(async () => {
      try {
        const page = await pdf.getPage(pageNo);
        if (cancelled) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let scale = (width * dpr) / size.w;
        if (size.w * size.h * scale * scale > MAX_CANVAS_PX) scale = Math.sqrt(MAX_CANVAS_PX / (size.w * size.h));
        const viewport = page.getViewport({ scale });
        const off = document.createElement('canvas');
        off.width = Math.floor(viewport.width);
        off.height = Math.floor(viewport.height);
        task = page.render({ canvasContext: off.getContext('2d'), canvas: off, viewport });
        await task.promise;
        if (cancelled) return;
        canvas.width = off.width;
        canvas.height = off.height;
        canvas.getContext('2d').drawImage(off, 0, 0);
        off.width = 0;
        off.height = 0;
        setRendered(true);
      } catch { /* abgebrochen */ }
    }, rendered ? 220 : 0);
    return () => { cancelled = true; clearTimeout(t); try { task?.cancel(); } catch { /* egal */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, width, pdf, pageNo, size.w, size.h]);

  return (
    <div ref={holder} data-page={pageNo} className="relative mx-auto bg-white shadow-lg" style={{ width, height, marginBottom: PAGE_GAP }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {!rendered && <div className="absolute inset-0 grid place-items-center text-xs text-neutral-400">Seite {pageNo}</div>}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${NOTE_SCALE} ${NOTE_SCALE * ratio}`} preserveAspectRatio="none">
        {strokes?.map((s) => (
          <path
            key={s.id}
            d={strokePath(s.pts, NOTE_SCALE, NOTE_SCALE * ratio)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width * 10}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={s.tool === 'marker' ? MARKER_OPACITY : 1}
          />
        ))}
        <path ref={liveRef} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// "Speichern": Original oder mit Notizen; Teilen-Menü des Systems
// (In Dateien sichern, WhatsApp, Mail ...) oder Herunterladen.
function ShareSheet({ fileName, bytes, strokes, onClose }) {
  useBackToClose(true, onClose);
  const hasNotes = strokes.length > 0;
  const [variant, setVariant] = useState(hasNotes ? 'notes' : 'original');
  const [files, setFiles] = useState({ original: null, notes: null });
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const original = new File([bytes], fileName, { type: 'application/pdf' });
    setFiles((f) => ({ ...f, original }));
    if (hasNotes) {
      // Vorab erzeugen: das Teilen-Menü muss direkt beim Tippen aufgehen (iOS)
      exportAnnotatedPdf(bytes.slice(), strokes)
        .then((out) => { if (!cancelled) setFiles((f) => ({ ...f, notes: new File([out], fileName.replace(/\.pdf$/i, '') + ' (mit Notizen).pdf', { type: 'application/pdf' }) })); })
        .catch(() => { if (!cancelled) setError('Die Fassung mit Notizen konnte nicht erstellt werden – das Original geht immer.'); });
    }
    return () => { cancelled = true; };
  }, [bytes, strokes, fileName, hasNotes]);

  const file = variant === 'notes' ? files.notes : files.original;
  const canShare = file ? canShareFile(file) : false;
  const allowDownload = downloadIsSafe() || !canShare;

  const share = async () => {
    if (!file) return;
    try {
      const ok = await shareFile(file);
      if (!ok) downloadFile(file);
      else onClose();
    } catch {
      downloadFile(file);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/50 sm:items-center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-t-2xl bg-card p-4 text-ivory shadow-2xl sm:rounded-2xl" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium">Speichern oder teilen</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-subtle" aria-label="Schließen"><X size={18} /></button>
        </div>
        {hasNotes && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            {[['notes', 'Mit Notizen'], ['original', 'Original']].map(([k, label]) => (
              <button key={k} onClick={() => setVariant(k)} className={`rounded-xl border px-3 py-2.5 text-sm ${variant === k ? 'border-mint bg-mint/10' : 'border-line'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
        {error && variant === 'notes' && <p className="mb-3 text-xs text-status-absent">{error}</p>}
        <p className="mb-3 truncate text-xs text-sage-muted">{file ? file.name : 'Wird vorbereitet …'}</p>
        <div className="space-y-2">
          {(canShare || !file) && (
            <button onClick={share} disabled={!file} className="flex w-full items-center justify-center gap-2 rounded-xl bg-mint px-4 py-3 text-onaccent disabled:opacity-50">
              <Share2 size={18} /> Speichern unter / Teilen …
            </button>
          )}
          {allowDownload && file && (
            <button onClick={() => { downloadFile(file); onClose(); }} className="flex w-full items-center justify-center gap-2 rounded-xl border border-line px-4 py-3">
              <Download size={18} /> Herunterladen
            </button>
          )}
        </div>
        {canShare && <p className="mt-3 text-center text-[11px] text-sage-muted">Im Teilen-Menü: „In Dateien sichern“ oder eine andere App wählen.</p>}
      </div>
    </div>
  );
}
