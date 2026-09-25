// „Auswendig rezitieren" – sprachgesteuerter Hifz-Übungsmodus, 1:1 an der
// Bedienung von Tarteel orientiert (Seiten wie in Tarteel-Referenzvideos,
// keine übernommenen Logos/Assets): Sure wählen -> die ECHTE Mushaf-Seite
// wird zunächst voll sichtbar angezeigt (dieselbe Quelle wie die
// Mushaf-Lese-Ansicht, reale Zeilen/Seitenumbrüche) -> "Los" verbirgt die
// Seite -> Wörter werden Schritt für Schritt wieder sichtbar, während man
// frei rezitiert. Nächste Seite schließt nahtlos an.
//
// Nutzt die echte Browser-Spracherkennung (Web Speech API über
// client/src/lib/hifzSpeech.js) und die reine, getestete Vergleichslogik in
// client/src/lib/hifzEngine.js. KEIN simulierter Fortschritt: Wörter werden
// ausschließlich anhand tatsächlicher, endgültiger Erkennungsergebnisse
// aufgedeckt. Übungswerkzeug für die rezitierende Person – keine
// Lehrerbewertung, keine dauerhafte Speicherung.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Square, Lightbulb, RotateCcw, X, AlertTriangle, Eye, ArrowLeft, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { Card, Button, Spinner } from '../components/ui.jsx';
import PageScrubber from '../components/PageScrubber.jsx';
import { api } from '../lib/api.js';
import { HifzEngine } from '../lib/hifzEngine.js';
import { BrowserSpeech } from '../lib/hifzSpeech.js';
import { pageToHifzPassage } from '../lib/hifzPassage.js';
import { ensurePageFont, isPageFontLoaded, useMushafAutoFit } from '../lib/mushafFont.js';

// Bewusst zurückhaltend formuliert: ein einzelner unsicherer Treffer (Status
// "uncertain") ist normal (ASR-Rauschen, kurze Pause) und soll nicht wie ein
// Fehler wirken. Erst bei einer BESTÄTIGTEN, wiederholten Abweichung
// ("suspected") wird konkret um Wiederholung gebeten.
const STATUS_TEXT = {
  ready: 'Bereit. Mikrofon starten und ab dem ersten Wort rezitieren.',
  waiting: 'Bitte an der aktuellen Stelle wiederholen.',
  following: 'Weiter rezitieren.',
  uncertain: 'Ich höre zu …',
  suspected: 'Mögliche Wortabweichung. Bitte wiederholen – das Mikrofon hört weiter zu.',
  complete: 'Seite durchlaufen. Das ist keine bestätigte Rezitationsbewertung.',
};
const ERROR_TEXT = {
  'not-allowed': 'Mikrofonzugriff wurde nicht erlaubt.',
  'service-not-allowed': 'Der Browser erlaubt diesen Erkennungsdienst nicht.',
  'audio-capture': 'Kein verfügbares Mikrofon gefunden.',
  network: 'Verbindungsfehler. Bitte erneut starten.',
  'language-not-supported': 'Arabische Erkennung ist in diesem Dienst nicht verfügbar.',
};

const CONSENT_KEY = 'dbz-hifz-voice-consent';
const loadConsent = () => { try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; } };
const saveConsent = (v) => { try { v ? localStorage.setItem(CONSENT_KEY, '1') : localStorage.removeItem(CONSENT_KEY); } catch { /* egal */ } };

function StartPicker({ surahs, onOpenSurah, onOpenPage, busy, error }) {
  const [surah, setSurah] = useState(surahs?.[0]?.n || 1);
  const [pageInput, setPageInput] = useState('');
  return (
    <Card className="p-5">
      <div className="p-1 mb-3">
        <div className="text-ivory font-medium">Seite wählen</div>
        <div className="text-xs text-sage-muted mt-0.5">Sure wählen -- die Seite öffnet sich sofort. Dann auf „Los" drücken.</div>
      </div>
      {error && (
        <div className="rounded-lg border border-status-absent/40 bg-status-absent/10 p-3 text-sm text-status-absent flex items-start gap-2 mb-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}
      <div className="p-1 space-y-4">
        <label className="block">
          <span className="text-sm text-sage">Sure</span>
          <div className="flex gap-2 mt-1">
            <select
              className="input"
              value={surah}
              onChange={(e) => { setSurah(e.target.value); onOpenSurah(Number(e.target.value)); }}
            >
              {(surahs || []).map((s) => <option key={s.n} value={s.n}>{s.n}. {s.name}</option>)}
            </select>
            <Button loading={busy} onClick={() => onOpenSurah(Number(surah))}>Seite öffnen</Button>
          </div>
        </label>
        <label className="block">
          <span className="text-sm text-sage">oder Seite direkt (1–604)</span>
          <div className="flex gap-2 mt-1">
            <input
              inputMode="numeric"
              className="input"
              placeholder="z. B. 1"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const p = Number(pageInput);
                if (p >= 1 && p <= 604) onOpenPage(p);
              }}
            />
            <Button variant="outline" disabled={busy} onClick={() => { const p = Number(pageInput); if (p >= 1 && p <= 604) onOpenPage(p); }}>Öffnen</Button>
          </div>
        </label>
      </div>
    </Card>
  );
}

export default function HifzRecitationMode({ surahs }) {
  const [page, setPage] = useState(null);
  const [pageData, setPageData] = useState(null);
  const [pageError, setPageError] = useState(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [fontReady, setFontReady] = useState(true);
  const [started, setStarted] = useState(false);
  const [engineState, setEngineState] = useState(null);
  const [capture, setCapture] = useState('idle');
  const [captureError, setCaptureError] = useState(null);
  const [consent, setConsent] = useState(loadConsent);
  const [readMode, setReadMode] = useState(false);
  const [interim, setInterim] = useState('');
  const [noAudioHint, setNoAudioHint] = useState(false);

  const engineRef = useRef(null);
  const speechRef = useRef(null);
  const readModeRef = useRef(false);
  const heardRef = useRef(false);
  useEffect(() => { readModeRef.current = readMode; }, [readMode]);

  // fontReady löst nur den Re-Render nach dem Ladeversuch aus; isPageFontLoaded
  // ist die tatsächliche Quelle der Wahrheit (kann false bleiben, wenn das
  // Laden fehlschlug) -- sonst würden bei Fehlschlag Ersatzzeichen erscheinen.
  const glyph = !!(pageData?.font === 'v1' && fontReady && isPageFontLoaded(pageData.fontPage));
  // Echte Seitenschrift + Auto-Fit-Layout (dieselbe Logik wie die
  // Mushaf-Lese-Ansicht -- siehe useMushafAutoFit): die Seite füllt Breite UND
  // Höhe des verfügbaren Platzes, statt einer festen, viewport-breitenbasierten
  // Schriftgröße, die den tatsächlichen Kartenrahmen ignoriert (führte dazu,
  // dass Zeilen nur die rechte Kartenhälfte füllten, links blieb es leer).
  const pageElRef = useRef(null);
  const { fs: glyphFs, width: glyphW } = useMushafAutoFit(pageElRef, {
    active: glyph,
    numLines: pageData?.lines.length || 0,
    resetKey: pageData ? `${pageData.page}:${fontReady}` : null,
  });

  if (!speechRef.current) {
    speechRef.current = new BrowserSpeech({
      onSegment: (segment) => {
        heardRef.current = true; setNoAudioHint(false);
        const engine = engineRef.current;
        if (!engine || readModeRef.current) return;
        try {
          const s = engine.accept(segment);
          setEngineState(s);
          if (s.status === 'complete') { speechRef.current.stop(); setCapture('ended'); }
        } catch (err) {
          speechRef.current.stop(); setCapture('error'); setCaptureError(err.message);
        }
      },
      onState: (state, err) => { setCapture(state); setCaptureError(err || null); if (state !== 'listening') setInterim(''); },
      onInterim: (text) => {
        if (text) { heardRef.current = true; setNoAudioHint(false); }
        if (!readModeRef.current) setInterim(text);
      },
    });
  }

  // Mikrofon zuverlässig stoppen: Tab verlassen/verstecken, Komponente verlassen.
  useEffect(() => {
    const onHide = () => { if (document.hidden) speechRef.current.stop(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); speechRef.current.stop(); };
  }, []);

  // Ehrlicher Hinweis, falls das Mikrofon länger "aktiv" ist, aber weder ein
  // Zwischen- noch ein Endergebnis eintrifft -- typischer Hinweis auf ein
  // Berechtigungs-/Geräteproblem statt eines Vergleichsfehlers.
  useEffect(() => {
    if (capture !== 'listening') { setNoAudioHint(false); return undefined; }
    heardRef.current = false; setNoAudioHint(false);
    const t = setTimeout(() => { if (!heardRef.current) setNoAudioHint(true); }, 6000);
    return () => clearTimeout(t);
  }, [capture]);

  const pageReq = useRef(0);
  const loadPage = async (p) => {
    const target = Math.max(1, Math.min(604, Number(p) || 1));
    setLoadingPage(true); setPageError(null);
    const req = ++pageReq.current;
    speechRef.current.stop();
    try {
      const d = await api.get(`/quran/page/${target}`).then((r) => r.page);
      if (req !== pageReq.current) return;
      try { localStorage.setItem('dbz-mushaf-page', String(target)); } catch { /* egal */ }
      setPageData(d); setPage(target); setStarted(false);
      engineRef.current = null; setEngineState(null);
      setCapture('idle'); setCaptureError(null); setInterim(''); setReadMode(false);
      if (d.font === 'v1') {
        setFontReady(isPageFontLoaded(d.fontPage));
        ensurePageFont(d.fontPage).then(() => { if (pageReq.current === req) setFontReady(true); });
      } else setFontReady(true);
    } catch (err) {
      if (req === pageReq.current) setPageError(err.message || 'Seite konnte nicht geladen werden.');
    } finally {
      if (req === pageReq.current) setLoadingPage(false);
    }
  };
  const openSurah = async (n) => {
    setLoadingPage(true); setPageError(null);
    try { const { page: p } = await api.get(`/quran/surah-page/${n}`); await loadPage(p); }
    catch { setPageError('Seite konnte nicht ermittelt werden.'); setLoadingPage(false); }
  };
  const goPage = (delta) => { if (page != null) loadPage(page + delta); };

  // Direkt wie in "Lesen" starten: sofort eine Seite zeigen (zuletzt
  // angesehene Seite -- derselbe Schlüssel wie die Mushaf-Lese-Ansicht, damit
  // beide Tabs auf derselben Seite bleiben -- sonst Seite 1), statt erst eine
  // Sure aus einer Liste wählen zu müssen. Die Sure-Auswahl bleibt über
  // "Andere Seite" weiterhin erreichbar.
  useEffect(() => {
    let saved = 1;
    try { const n = Number(localStorage.getItem('dbz-mushaf-page')); if (n >= 1 && n <= 604) saved = n; } catch { /* egal */ }
    loadPage(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = () => {
    if (!pageData || !consent) return;
    if (!globalThis.isSecureContext) { setCaptureError('Bitte HTTPS oder localhost verwenden.'); setCapture('error'); return; }
    let p;
    try { p = pageToHifzPassage(pageData); }
    catch (err) { setPageError(err.message); return; }
    engineRef.current = new HifzEngine(p);
    setEngineState(engineRef.current.snapshot());
    setStarted(true); setCaptureError(null); setReadMode(false);
    speechRef.current.start(engineRef.current.session);
  };
  const pause = () => { speechRef.current.stop(); setCapture('paused'); };
  const finish = () => { speechRef.current.stop(); setCapture('ended'); };
  const hint = () => { if (engineRef.current) setEngineState(engineRef.current.hint()); };
  const dismiss = () => { if (engineRef.current) setEngineState(engineRef.current.dismissMismatch()); };
  const reset = () => {
    if (!engineRef.current || !window.confirm('Diese Seite zurücksetzen und alle Wörter erneut verbergen?')) return;
    speechRef.current.stop();
    setEngineState(engineRef.current.reset());
    setCapture('idle'); setCaptureError(null); setReadMode(false);
  };
  const toggleConsent = (checked) => { setConsent(checked); saveConsent(checked); };
  const toggleReadMode = () => {
    if (!engineRef.current) return;
    speechRef.current.stop();
    if (!readMode) {
      for (let i = engineRef.current.index; i < engineRef.current.passage.words.length; i++) engineRef.current.hints.add(i);
      setEngineState(engineRef.current.snapshot());
    } else {
      setEngineState(engineRef.current.reset());
    }
    setCapture('idle'); setReadMode((r) => !r);
  };
  const backToBrowse = () => {
    speechRef.current.stop();
    setStarted(false); engineRef.current = null; setEngineState(null);
    setCapture('idle'); setCaptureError(null); setReadMode(false); setInterim('');
  };

  const busy = capture === 'requesting' || capture === 'listening';
  const supported = speechRef.current.supported;

  // Trackbare Wörter (ohne Ayah-Endzeichen) auf ihre laufende Engine-Position
  // abbilden -- so bleiben die echten Endmarken (﴿n﴾) an ihrer echten Stelle
  // im Seitenlayout sichtbar, ohne selbst erkannt werden zu müssen.
  const trackableIndex = useMemo(() => {
    if (!pageData) return null;
    let idx = 0;
    return pageData.lines.map((line) => line.words.map((w) => (w.e ? null : idx++)));
  }, [pageData]);

  const headerByLine = useMemo(() => {
    if (!pageData) return {};
    const placed = new Set();
    const out = {};
    for (const line of pageData.lines) for (const w of line.words) {
      if (pageData.starts?.[w.v] && !placed.has(w.v)) { placed.add(w.v); (out[line.n] ||= []).push(pageData.starts[w.v]); }
    }
    return out;
  }, [pageData]);

  const statusLine = readMode
    ? 'Lesemodus. Mikrofon ausgeschaltet.'
    : !engineState ? ''
    : engineState.status === 'complete' ? STATUS_TEXT.complete
    : capture === 'requesting' ? 'Warte auf Mikrofonfreigabe …'
    : capture === 'paused' ? 'Pausiert. Der bisherige Stand bleibt erhalten.'
    : capture === 'ended' ? 'Sitzung beendet. Der Stand bleibt bis zum Neuladen erhalten.'
    : capture === 'error' ? (ERROR_TEXT[captureError] || 'Die Spracherkennung wurde unterbrochen. Bitte erneut starten.')
    : capture === 'unsupported' ? 'Dieser Browser bietet keine unterstützte Spracherkennung. Lesen und Hinweise funktionieren weiterhin.'
    : (capture === 'listening' ? 'Mikrofon aktiv · ' : '') + (STATUS_TEXT[engineState.status] || '');

  const matches = engineState?.history.filter((e) => e.kind === 'transcript-match').length || 0;
  const assisted = engineState?.history.filter((e) => e.kind === 'assisted-match').length || 0;

  // ---- Vor der Seitenwahl ----
  if (!pageData) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-sage-muted">
          Wähle eine Seite zum Auswendig-Üben – wie bei Tarteel: erst die Seite ansehen, dann auf
          „Los" drücken. Der Text wird verborgen; erkannte Wörter werden Schritt für Schritt wieder
          sichtbar, während du frei rezitierst.
        </p>
        <StartPicker surahs={surahs} onOpenSurah={openSurah} onOpenPage={loadPage} busy={loadingPage} error={pageError} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Kopfbereich: Seite + Navigation/Moduswechsel */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button size="sm" variant="outline" onClick={() => { speechRef.current.stop(); setPageData(null); setPage(null); }}>
          <ArrowLeft size={15} /> Andere Seite
        </Button>
        <div className="text-center">
          <div className="text-ivory text-sm font-medium">Seite {page} <span className="text-sage-muted">/ 604</span></div>
          {pageData.juz && <div className="text-[11px] text-sage-muted">Juzʼ {pageData.juz}</div>}
        </div>
        {started ? (
          <Button size="sm" variant={readMode ? 'primary' : 'outline'} onClick={toggleReadMode} aria-pressed={readMode}>
            <Eye size={15} /> {readMode ? 'Zurück zum Üben' : 'Lesen'}
          </Button>
        ) : (
          <div className="flex items-center gap-1">
            <button onClick={() => goPage(-1)} disabled={page <= 1 || loadingPage} aria-label="Vorige Seite"
              className="p-2 rounded-lg border border-line text-sage hover:bg-hover disabled:opacity-40"><ChevronRight size={16} /></button>
            <button onClick={() => goPage(1)} disabled={page >= 604 || loadingPage} aria-label="Nächste Seite"
              className="p-2 rounded-lg border border-line text-sage hover:bg-hover disabled:opacity-40"><ChevronLeft size={16} /></button>
          </div>
        )}
      </div>

      {pageError && (
        <div className="rounded-lg border border-status-absent/40 bg-status-absent/10 p-3 text-sm text-status-absent flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {pageError}
        </div>
      )}

      {!supported && (
        <div className="rounded-lg border border-status-late/40 bg-status-late/10 p-3 text-sm text-status-late flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          Dieser Browser bietet keine unterstützte Spracherkennung (am zuverlässigsten: Chrome/Edge auf Desktop
          oder Android). Lesen und Hinweise funktionieren weiterhin, das automatische Aufdecken per Stimme nicht.
        </div>
      )}

      {/* Echte Mushaf-Seite: ruhige Fläche, reale Zeilen/Seitenumbrüche, kein
          Muster hinter dem Text. Vor "Los" voll sichtbar (wie bei Tarteel). */}
      {loadingPage && !pageData ? <Spinner label="Seite wird geladen …" /> : (
        <Card className="p-0 overflow-hidden">
          <div
            ref={pageElRef}
            className={`mushaf-page px-4 py-5 sm:px-8 sm:py-7 font-mushaf mx-auto ${glyph ? 'is-glyph' : ''}`}
            style={{
              fontSize: glyph ? (glyphFs ? `${glyphFs}px` : 'clamp(1.1rem, 4.2vw, 1.7rem)') : 'clamp(1.3rem, 4.4vw, 1.85rem)',
              width: glyph && glyphW ? `${glyphW}px` : undefined,
              maxWidth: glyph ? '100%' : '44rem',
            }}
          >
            <div className="mushaf-lines">
            {pageData.lines.map((line, li) => (
              <div key={line.n} className="mushaf-line-wrap">
                {(headerByLine[line.n] || []).map((h) => (
                  <div key={h.surah} className="mushaf-surah-head">
                    <div className="text-mint" style={{ fontSize: '1.05em' }} dir="rtl">سُورَةُ {h.name}</div>
                    {h.bismillah && <div dir="rtl" className="mt-1" style={{ fontSize: '0.9em' }}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>}
                  </div>
                ))}
                <p className={`mushaf-line ${line.words.length <= 6 ? 'is-short' : ''}`}>
                  {line.words.map((w, wi) => {
                    const idx = trackableIndex[li][wi];
                    if (idx == null) {
                      return <span key={wi} className="mushaf-word mushaf-end" aria-hidden="true">﴿{w.t}﴾</span>;
                    }
                    const visible = !started || readMode || idx < engineState.index || engineState.hints.includes(idx);
                    const isCurrent = started && !readMode && idx === engineState.index;
                    const isSuspected = started && !readMode && engineState.mismatch?.index === idx && engineState.mismatch.suspected;
                    const wasHinted = engineState?.hints.includes(idx);
                    return (
                      <span
                        key={wi}
                        aria-hidden={!visible}
                        style={glyph && visible ? { fontFamily: `qcf-p${pageData.fontPage}` } : undefined}
                        className={[
                          'mushaf-word',
                          isCurrent && 'is-word-active',
                          isSuspected && 'ring-1 ring-status-absent/60 text-status-absent',
                          visible && !isCurrent && !isSuspected && wasHinted && 'text-sage-muted',
                          !visible && 'invisible',
                        ].filter(Boolean).join(' ')}
                      >
                        {visible ? (glyph ? w.g || w.t : w.t) : '   '}{glyph && visible ? '' : ' '}
                      </span>
                    );
                  })}
                </p>
              </div>
            ))}
            </div>
          </div>
        </Card>
      )}

      {/* Status + Live-Zwischenergebnis (unsicher, nur zur Orientierung – zählt
          nie als Fortschritt, siehe hifzSpeech.js/onInterim). */}
      {started && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
            {busy && <span className="h-2 w-2 rounded-full bg-status-present animate-pulse motion-reduce:animate-none shrink-0" aria-hidden="true" />}
            {capture === 'error' && <AlertTriangle size={15} className="text-status-absent shrink-0" />}
            <span className={capture === 'error' ? 'text-status-absent' : 'text-sage'}>{statusLine}</span>
          </div>
          {capture === 'listening' && interim && (
            <p dir="rtl" className="text-xs text-sage-muted font-arabic" aria-live="off">Gehört: {interim}</p>
          )}
          {noAudioHint && capture === 'listening' && (
            <p className="text-xs text-status-late flex items-start gap-1.5">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              Das Mikrofon scheint nichts zu empfangen. Prüfe die Mikrofonberechtigung deines Browsers/Geräts
              für diese Seite und dass kein anderes Programm das Mikrofon blockiert.
            </p>
          )}
        </div>
      )}

      {/* Vor "Los": Einwilligung + großer Start-Knopf (wie bei Tarteel: erst
          ansehen, dann Seite verbergen & losrezitieren). */}
      {!started && (
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-xs text-sage-muted">
            <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => toggleConsent(e.target.checked)} />
            <span>
              Ich bin einverstanden, dass meine Stimme bei aktivem Mikrofon vom Spracherkennungsdienst meines
              Browsers verarbeitet wird (z. B. Google bei Chrome). Es wird nichts dauerhaft gespeichert – weder
              Audio noch Text noch Fortschritt. Diese Einwilligung wird nur auf diesem Gerät gemerkt.
            </span>
          </label>
          <Button size="lg" className="w-full" onClick={start} disabled={!consent || !supported}>
            <Mic size={18} /> Los – Seite verbergen &amp; rezitieren
          </Button>
        </div>
      )}

      {/* Bedienleiste während der Übung */}
      {started && !readMode && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={pause} disabled={!busy}><Square size={16} /> Pause</Button>
          <Button
            onClick={() => { setCaptureError(null); speechRef.current.start(engineRef.current.session); }}
            loading={capture === 'requesting'}
            disabled={busy || engineState.status === 'complete' || !supported}
          >
            <Mic size={16} /> Weiter rezitieren
          </Button>
          <Button variant="ghost" onClick={hint} disabled={!engineState || engineState.index >= (engineRef.current?.passage.words.length || 0) || engineState.hints.includes(engineState.index)}>
            <Lightbulb size={16} /> Hinweis
          </Button>
          {engineState?.mismatch && (
            <Button variant="ghost" onClick={dismiss}><X size={16} /> Markierung verwerfen</Button>
          )}
          <Button variant="ghost" onClick={finish}>Beenden</Button>
          <Button variant="ghost" onClick={reset}><RotateCcw size={16} /> Neu beginnen</Button>
          <Button variant="ghost" onClick={backToBrowse}>Seite wieder ansehen</Button>
        </div>
      )}

      {started && !readMode && (
        <label className="flex items-start gap-2 text-xs text-sage-muted">
          <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => toggleConsent(e.target.checked)} disabled={busy} />
          <span>Einwilligung zur Spracherkennung (siehe oben) – hier jederzeit widerrufbar.</span>
        </label>
      )}

      {(engineState?.status === 'complete' || capture === 'ended') && started && !readMode && (
        <Card className="p-4 text-sm text-sage space-y-3">
          <p>
            {matches} Wörter mit passendem Erkennungstext ohne Hinweis, {assisted} weitere Wörter nach Hilfestellung;{' '}
            {engineState.hints.length} Hinweise insgesamt. Keine Aussage über Aussprache oder Taǧwīd. Nicht gespeichert.
          </p>
          {page < 604 && (
            <Button onClick={() => goPage(1)}>Nächste Seite <ArrowRight size={16} /></Button>
          )}
        </Card>
      )}

      {/* Beim Durchsuchen (vor "Los"): Seiten-Leiste zum Wischen/Ziehen direkt
          zu einer Seite -- wie in der Lese-Ansicht. Während der laufenden
          Übung ausgeblendet, damit man nicht versehentlich die Seite
          wechselt und den Übungsstand verliert. */}
      {!started && (
        <>
          <div className="h-40 lg:h-20" aria-hidden="true" />
          <PageScrubber page={page} onNavigate={loadPage} />
        </>
      )}
    </div>
  );
}
