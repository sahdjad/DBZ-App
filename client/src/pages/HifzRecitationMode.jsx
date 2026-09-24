// „Auswendig rezitieren" – sprachgesteuerter Hifz-Übungsmodus.
//
// Nutzt die echte Browser-Spracherkennung (Web Speech API über
// client/src/lib/hifzSpeech.js) und die reine, bereits mit 21 Tests
// geprüfte Vergleichslogik in client/src/lib/hifzEngine.js. KEIN simulierter
// Fortschritt: Wörter werden ausschließlich anhand tatsächlicher, endgültiger
// Erkennungsergebnisse aufgedeckt. Diese Funktion ist ein Übungswerkzeug für
// die Person, die gerade rezitiert – keine Lehrerbewertung und keine
// dauerhafte Speicherung (siehe README des integrierten Moduls).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Square, Lightbulb, RotateCcw, X, AlertTriangle, Eye, ArrowLeft } from 'lucide-react';
import { Card, CardHeader, Button, Spinner, useToast } from '../components/ui.jsx';
import { HifzEngine } from '../lib/hifzEngine.js';
import { BrowserSpeech } from '../lib/hifzSpeech.js';
import { buildHifzPassage, PassageTooLargeError, EmptyPassageError } from '../lib/hifzPassage.js';

const STATUS_TEXT = {
  ready: 'Bereit. Mikrofon starten und ab dem ersten Wort rezitieren.',
  waiting: 'Bitte an der aktuellen Stelle wiederholen.',
  following: 'Textfolge erkannt. Weiter rezitieren.',
  uncertain: 'Nicht eindeutig erkannt. Bitte ab der aktuellen Stelle wiederholen.',
  suspected: 'Mögliche Wortabweichung. Bitte wiederholen – das Mikrofon hört weiter zu.',
  complete: 'Abschnitt durchlaufen. Das ist keine bestätigte Rezitationsbewertung.',
};
const ERROR_TEXT = {
  'not-allowed': 'Mikrofonzugriff wurde nicht erlaubt.',
  'service-not-allowed': 'Der Browser erlaubt diesen Erkennungsdienst nicht.',
  'audio-capture': 'Kein verfügbares Mikrofon gefunden.',
  network: 'Verbindungsfehler. Bitte erneut starten.',
  'language-not-supported': 'Arabische Erkennung ist in diesem Dienst nicht verfügbar.',
};

function RangePicker({ surahs, onLoad, busy }) {
  const [f, setF] = useState({ surahFrom: 114, ayahFrom: 1, surahTo: 114, ayahTo: 6 });
  const surahMeta = (n) => surahs?.find((s) => s.n === Number(n));
  const submit = (e) => {
    e.preventDefault();
    onLoad({
      surahFrom: Number(f.surahFrom), ayahFrom: Number(f.ayahFrom),
      surahTo: Number(f.surahTo), ayahTo: Number(f.ayahTo),
      title: surahMeta(f.surahFrom)?.name,
    });
  };
  return (
    <Card className="p-5">
      <CardHeader title="Abschnitt wählen" subtitle="Sure und Ayah-Bereich zum Auswendig-Üben" />
      <form onSubmit={submit} className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-sage">Von (Sure)</span>
            <select className="input mt-1" value={f.surahFrom} onChange={(e) => setF({ ...f, surahFrom: e.target.value })}>
              {(surahs || []).map((s) => <option key={s.n} value={s.n}>{s.n}. {s.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-sage">ab Ayah</span>
            <input type="number" min={1} className="input mt-1" value={f.ayahFrom} onChange={(e) => setF({ ...f, ayahFrom: e.target.value })} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-sage">Bis (Sure)</span>
            <select className="input mt-1" value={f.surahTo} onChange={(e) => setF({ ...f, surahTo: e.target.value })}>
              {(surahs || []).map((s) => <option key={s.n} value={s.n}>{s.n}. {s.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-sage">bis Ayah</span>
            <input type="number" min={1} className="input mt-1" value={f.ayahTo} onChange={(e) => setF({ ...f, ayahTo: e.target.value })} />
          </label>
        </div>
        <Button type="submit" loading={busy} className="w-full">Abschnitt laden</Button>
      </form>
    </Card>
  );
}

export default function HifzRecitationMode({ surahs }) {
  const toast = useToast();
  const [passage, setPassage] = useState(null); // Hifz-Engine-Abschnitt
  const [passageError, setPassageError] = useState(null);
  const [loadingPassage, setLoadingPassage] = useState(false);
  const [engineState, setEngineState] = useState(null); // engine.snapshot()
  const [capture, setCapture] = useState('idle'); // requesting|listening|paused|error|ended|unsupported
  const [captureError, setCaptureError] = useState(null);
  const [consent, setConsent] = useState(false);
  const [readMode, setReadMode] = useState(false); // Lesen statt Auswendig (alle Wörter sichtbar, Mikro aus)

  const engineRef = useRef(null);
  const speechRef = useRef(null);
  if (!speechRef.current) {
    speechRef.current = new BrowserSpeech({
      onSegment: (segment) => {
        const engine = engineRef.current;
        if (!engine || readMode) return;
        try {
          const s = engine.accept(segment);
          setEngineState(s);
          if (s.status === 'complete') { speechRef.current.stop(); setCapture('ended'); }
        } catch (err) {
          speechRef.current.stop(); setCapture('error'); setCaptureError(err.message);
        }
      },
      onState: (state, err) => { setCapture(state); setCaptureError(err || null); },
    });
  }

  // Mikrofon zuverlässig stoppen: Tab verlassen/verstecken, Komponente verlassen.
  useEffect(() => {
    const onHide = () => { if (document.hidden) speechRef.current.stop(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); speechRef.current.stop(); };
  }, []);

  const loadPassage = async (range) => {
    setLoadingPassage(true); setPassageError(null);
    try {
      const p = await buildHifzPassage(range);
      speechRef.current.stop();
      engineRef.current = new HifzEngine(p);
      setPassage(p);
      setEngineState(engineRef.current.snapshot());
      setCapture('idle'); setCaptureError(null); setReadMode(false);
    } catch (err) {
      if (err instanceof PassageTooLargeError || err instanceof EmptyPassageError) setPassageError(err.message);
      else setPassageError('Abschnitt konnte nicht geladen werden. Bitte erneut versuchen.');
    } finally {
      setLoadingPassage(false);
    }
  };

  const start = () => {
    if (!engineRef.current || !consent || readMode) return;
    if (!globalThis.isSecureContext) { setCaptureError('Bitte HTTPS oder localhost verwenden.'); setCapture('error'); return; }
    setCaptureError(null);
    speechRef.current.start(engineRef.current.session);
  };
  const pause = () => { speechRef.current.stop(); setCapture('paused'); };
  const finish = () => { speechRef.current.stop(); setCapture('ended'); };
  const hint = () => { if (engineRef.current) setEngineState(engineRef.current.hint()); };
  const dismiss = () => { if (engineRef.current) setEngineState(engineRef.current.dismissMismatch()); };
  const reset = () => {
    if (!engineRef.current || !window.confirm('Diesen Übungsstand zurücksetzen und alle Wörter erneut verbergen?')) return;
    speechRef.current.stop();
    setEngineState(engineRef.current.reset());
    setCapture('idle'); setCaptureError(null); setReadMode(false);
  };
  const toggleReadMode = () => {
    if (!engineRef.current) return;
    speechRef.current.stop();
    if (!readMode) {
      // Alle noch nicht erreichten Wörter als Hinweis markieren – Lesen zählt
      // als Hilfe, nicht als selbstständig erkanntes Wort.
      for (let i = engineRef.current.index; i < engineRef.current.passage.words.length; i++) engineRef.current.hints.add(i);
      setEngineState(engineRef.current.snapshot());
    } else {
      setEngineState(engineRef.current.reset());
    }
    setCapture('idle'); setReadMode((r) => !r);
  };

  const busy = capture === 'requesting' || capture === 'listening';
  const supported = speechRef.current.supported;

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

  // ---- Vor der Abschnittswahl ----
  if (!passage) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-sage-muted">
          Wähle einen Abschnitt zum Auswendig-Üben. Der Text wird verborgen; erkannte Wörter werden
          Schritt für Schritt wieder sichtbar, während du rezitierst.
        </p>
        {passageError && (
          <div className="rounded-lg border border-status-absent/40 bg-status-absent/10 p-3 text-sm text-status-absent flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {passageError}
          </div>
        )}
        <RangePicker surahs={surahs} onLoad={loadPassage} busy={loadingPassage} />
      </div>
    );
  }

  const words = engineRef.current.passage.words;
  const lines = [];
  { let cur = null; for (const w of words) { if (!cur || cur.line !== w.line) { cur = { line: w.line, words: [] }; lines.push(cur); } cur.words.push(w); } }

  return (
    <div className="space-y-4">
      {/* Kopfbereich: Abschnitt + Moduswechsel */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-ivory font-medium">{passage.title}</div>
          <div className="text-xs text-sage-muted">{passage.edition} · {passage.riwaya}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => { speechRef.current.stop(); setPassage(null); }}>
            <ArrowLeft size={15} /> Anderer Abschnitt
          </Button>
          <Button size="sm" variant={readMode ? 'primary' : 'outline'} onClick={toggleReadMode} aria-pressed={readMode}>
            <Eye size={15} /> {readMode ? 'Zurück zum Üben' : 'Lesen'}
          </Button>
        </div>
      </div>

      {!supported && (
        <div className="rounded-lg border border-status-late/40 bg-status-late/10 p-3 text-sm text-status-late flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          Dieser Browser bietet keine unterstützte Spracherkennung (am zuverlässigsten: Chrome/Edge auf Desktop
          oder Android). Lesen und Hinweise funktionieren weiterhin, das automatische Aufdecken per Stimme nicht.
        </div>
      )}

      {/* Ruhige Qur'an-Fläche */}
      <Card className="p-5 sm:p-7">
        <div dir="rtl" className="leading-loose" style={{ fontSize: '1.7rem' }}>
          {lines.map((ln) => (
            <div key={ln.line} className="mb-1">
              {ln.words.map((w) => {
                const idx = words.indexOf(w);
                const visible = readMode || idx < engineState.index || engineState.hints.includes(idx);
                const isCurrent = !readMode && idx === engineState.index;
                const isSuspected = !readMode && engineState.mismatch?.index === idx && engineState.mismatch.suspected;
                const wasHinted = engineState.hints.includes(idx);
                return (
                  <span
                    key={w.id}
                    aria-hidden={!visible}
                    className={[
                      'font-arabic inline-block mx-0.5 rounded transition-colors motion-reduce:transition-none',
                      !visible && 'invisible',
                      isCurrent && 'bg-mint/15 ring-1 ring-mint/40',
                      isSuspected && 'bg-status-absent/15 ring-1 ring-status-absent/50 text-status-absent',
                      visible && !isCurrent && !isSuspected && wasHinted && 'text-sage-muted',
                      visible && !isCurrent && !isSuspected && !wasHinted && 'text-ivory',
                    ].filter(Boolean).join(' ')}
                  >
                    {visible ? w.text : '    '}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </Card>

      {/* Status */}
      <div className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
        {busy && <span className="h-2 w-2 rounded-full bg-status-present animate-pulse motion-reduce:animate-none shrink-0" aria-hidden="true" />}
        {capture === 'error' && <AlertTriangle size={15} className="text-status-absent shrink-0" />}
        <span className={capture === 'error' ? 'text-status-absent' : 'text-sage'}>{statusLine}</span>
      </div>

      {/* Bedienleiste */}
      {!readMode && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={start}
            loading={capture === 'requesting'}
            disabled={busy || engineState.status === 'complete' || !consent || !supported}
          >
            <Mic size={18} /> {engineState.index > 0 ? 'Weiter rezitieren' : 'Rezitation starten'}
          </Button>
          <Button variant="outline" onClick={pause} disabled={!busy}><Square size={16} /> Pause</Button>
          <Button variant="ghost" onClick={hint} disabled={engineState.index >= words.length || engineState.hints.includes(engineState.index)}>
            <Lightbulb size={16} /> Hinweis
          </Button>
          {engineState.mismatch && (
            <Button variant="ghost" onClick={dismiss}><X size={16} /> Markierung verwerfen</Button>
          )}
          <Button variant="ghost" onClick={finish}>Beenden</Button>
          <Button variant="ghost" onClick={reset}><RotateCcw size={16} /> Neu beginnen</Button>
        </div>
      )}

      {!readMode && (
        <label className="flex items-start gap-2 text-xs text-sage-muted">
          <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} />
          <span>
            Ich bin einverstanden, dass meine Stimme bei aktivem Mikrofon vom Spracherkennungsdienst meines
            Browsers verarbeitet wird (z. B. Google bei Chrome). Es wird nichts dauerhaft gespeichert – weder
            Audio noch Text noch Fortschritt.
          </span>
        </label>
      )}

      {(engineState.status === 'complete' || capture === 'ended') && !readMode && (
        <Card className="p-4 text-sm text-sage">
          {matches} Wörter mit passendem Erkennungstext ohne Hinweis, {assisted} weitere Wörter nach Hilfestellung;{' '}
          {engineState.hints.length} Hinweise insgesamt. Keine Aussage über Aussprache oder Taǧwīd. Nicht gespeichert.
        </Card>
      )}
    </div>
  );
}
