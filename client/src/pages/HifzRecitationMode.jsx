// „Auswendig rezitieren" – sprachgesteuerter Hifz-Übungsmodus.
//
// Nutzt die echte Browser-Spracherkennung (Web Speech API über
// client/src/lib/hifzSpeech.js) und die reine, bereits mit Tests
// geprüfte Vergleichslogik in client/src/lib/hifzEngine.js. KEIN simulierter
// Fortschritt: Wörter werden ausschließlich anhand tatsächlicher, endgültiger
// Erkennungsergebnisse aufgedeckt. Diese Funktion ist ein Übungswerkzeug für
// die Person, die gerade rezitiert – keine Lehrerbewertung und keine
// dauerhafte Speicherung (siehe README des integrierten Moduls).
//
// Freies Lesen (wie Tarteel): Standardmäßig wird eine GANZE Sure geladen,
// ohne dass ein Ayah-Bereich verpflichtend gewählt werden muss – man liest
// frei, von wo man will, so weit man will. Ein enger Bereich bleibt als
// optionale Zusatzfunktion wählbar.
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Lightbulb, RotateCcw, X, AlertTriangle, Eye, ArrowLeft } from 'lucide-react';
import { Card, CardHeader, Button, Spinner, useToast } from '../components/ui.jsx';
import { HifzEngine } from '../lib/hifzEngine.js';
import { BrowserSpeech } from '../lib/hifzSpeech.js';
import { buildHifzPassage, PassageTooLargeError, EmptyPassageError } from '../lib/hifzPassage.js';
import { toArabicNum } from '../lib/quranText.js';

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

const CONSENT_KEY = 'dbz-hifz-voice-consent';
const loadConsent = () => { try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; } };
const saveConsent = (v) => { try { v ? localStorage.setItem(CONSENT_KEY, '1') : localStorage.removeItem(CONSENT_KEY); } catch { /* egal */ } };

function SectionPicker({ surahs, onLoad, busy }) {
  const [surah, setSurah] = useState(surahs?.[0]?.n || 1);
  const [advanced, setAdvanced] = useState(false);
  const meta = (surahs || []).find((s) => Number(s.n) === Number(surah));
  const [range, setRange] = useState({ ayahFrom: 1, ayahTo: meta?.ayat || 1 });
  useEffect(() => { if (meta) setRange({ ayahFrom: 1, ayahTo: meta.ayat }); }, [surah]); // eslint-disable-line

  const submit = (e) => {
    e.preventDefault();
    const ayahFrom = advanced ? Math.max(1, Number(range.ayahFrom) || 1) : 1;
    const ayahTo = advanced ? Math.max(ayahFrom, Number(range.ayahTo) || ayahFrom) : (meta?.ayat || 1);
    onLoad({ surahFrom: Number(surah), ayahFrom, surahTo: Number(surah), ayahTo, title: meta?.name });
  };

  return (
    <Card className="p-5">
      <CardHeader title="Sure wählen" subtitle="Die ganze Sure wird geladen – frei lesen, von wo du willst, so weit du willst." />
      <form onSubmit={submit} className="p-4 space-y-3">
        <label className="block">
          <span className="text-sm text-sage">Sure</span>
          <select className="input mt-1" value={surah} onChange={(e) => setSurah(e.target.value)}>
            {(surahs || []).map((s) => <option key={s.n} value={s.n}>{s.n}. {s.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setAdvanced((a) => !a)} className="text-xs text-mint-light hover:underline underline-offset-2">
          {advanced ? 'Ganze Sure statt Bereich üben' : 'Stattdessen nur einen bestimmten Ayah-Bereich üben?'}
        </button>
        {advanced && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-sage">ab Ayah</span>
              <input type="number" min={1} max={meta?.ayat || 999} className="input mt-1" value={range.ayahFrom}
                onChange={(e) => setRange((r) => ({ ...r, ayahFrom: e.target.value }))} />
            </label>
            <label className="block">
              <span className="text-sm text-sage">bis Ayah</span>
              <input type="number" min={1} max={meta?.ayat || 999} className="input mt-1" value={range.ayahTo}
                onChange={(e) => setRange((r) => ({ ...r, ayahTo: e.target.value }))} />
            </label>
          </div>
        )}
        <Button type="submit" loading={busy} className="w-full">{advanced ? 'Abschnitt laden' : 'Sure laden'}</Button>
      </form>
    </Card>
  );
}

export default function HifzRecitationMode({ surahs }) {
  const toast = useToast();
  const [passage, setPassage] = useState(null); // Hifz-Engine-Abschnitt (unvalidiertes Metadatenobjekt)
  const [passageError, setPassageError] = useState(null);
  const [loadingPassage, setLoadingPassage] = useState(false);
  const [engineState, setEngineState] = useState(null); // engine.snapshot()
  const [capture, setCapture] = useState('idle'); // requesting|listening|paused|error|ended|unsupported
  const [captureError, setCaptureError] = useState(null);
  const [consent, setConsent] = useState(loadConsent);
  const [readMode, setReadMode] = useState(false); // Lesen statt Auswendig (alle Wörter sichtbar, Mikro aus)
  const [interim, setInterim] = useState(''); // rein informativ: was das Mikrofon GERADE hört (unsicher, kein Fortschritt)

  const engineRef = useRef(null);
  const speechRef = useRef(null);
  const readModeRef = useRef(false);
  useEffect(() => { readModeRef.current = readMode; }, [readMode]);

  if (!speechRef.current) {
    speechRef.current = new BrowserSpeech({
      onSegment: (segment) => {
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
      onInterim: (text) => { if (!readModeRef.current) setInterim(text); },
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
      setCapture('idle'); setCaptureError(null); setReadMode(false); setInterim('');
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
    setCapture('idle'); setCaptureError(null); setReadMode(false); setInterim('');
  };
  const toggleConsent = (checked) => { setConsent(checked); saveConsent(checked); };
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
          Wähle eine Sure zum Auswendig-Üben. Der Text wird verborgen; erkannte Wörter werden
          Schritt für Schritt wieder sichtbar, während du frei rezitierst.
        </p>
        {passageError && (
          <div className="rounded-lg border border-status-absent/40 bg-status-absent/10 p-3 text-sm text-status-absent flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {passageError}
          </div>
        )}
        <SectionPicker surahs={surahs} onLoad={loadPassage} busy={loadingPassage} />
      </div>
    );
  }

  const words = engineRef.current.passage.words;
  // Letztes Wort jeder Ayah markieren, um die Endmarke ﴿n﴾ im durchgehenden
  // Textfluss zu setzen – wie in der Mushaf-Ansicht der Lese-Seite.
  const ayahEndAt = new Set();
  for (let i = 0; i < words.length; i++) if (!words[i + 1] || words[i + 1].ayah !== words[i].ayah || words[i + 1].surah !== words[i].surah) ayahEndAt.add(i);

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
            <ArrowLeft size={15} /> Andere Sure
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

      {/* Ruhige Qur'an-Fläche: durchgehender Textfluss wie eine echte Mushaf-Seite,
          kein Muster hinter dem Text. */}
      <Card className="p-5 sm:p-7">
        {passage.bismillah && (
          <p dir="rtl" className="font-arabic text-xl text-center text-sage-muted mb-3 select-none">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
        )}
        <p dir="rtl" className="font-arabic text-ivory text-right" style={{ fontSize: '1.7rem', lineHeight: 2.3 }}>
          {words.map((w, idx) => {
            const visible = readMode || idx < engineState.index || engineState.hints.includes(idx);
            const isCurrent = !readMode && idx === engineState.index;
            const isSuspected = !readMode && engineState.mismatch?.index === idx && engineState.mismatch.suspected;
            const wasHinted = engineState.hints.includes(idx);
            return (
              <span key={w.id}>
                <span
                  aria-hidden={!visible}
                  className={[
                    'inline-block rounded transition-colors motion-reduce:transition-none',
                    isCurrent && 'bg-mint/15 ring-1 ring-mint/40',
                    isSuspected && 'bg-status-absent/15 ring-1 ring-status-absent/50 text-status-absent',
                    visible && !isCurrent && !isSuspected && wasHinted && 'text-sage-muted',
                    visible && !isCurrent && !isSuspected && !wasHinted && 'text-ivory',
                  ].filter(Boolean).join(' ')}
                  style={!visible ? { display: 'inline-block', width: `${Math.max(1.3, w.text.length * 0.62)}em`, borderBottom: '2px dotted rgba(190,201,192,0.35)', height: '1em' } : undefined}
                >
                  {visible ? w.text : ' '}
                </span>
                {ayahEndAt.has(idx) ? <span className="text-mint mx-1 select-none" style={{ fontSize: '1.15rem' }}>﴿{toArabicNum(w.ayah)}﴾</span> : ' '}
              </span>
            );
          })}
        </p>
      </Card>

      {/* Status + Live-Zwischenergebnis (unsicher, nur zur Orientierung – zählt
          nie als Fortschritt, siehe hifzSpeech.js/onInterim). */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
          {busy && <span className="h-2 w-2 rounded-full bg-status-present animate-pulse motion-reduce:animate-none shrink-0" aria-hidden="true" />}
          {capture === 'error' && <AlertTriangle size={15} className="text-status-absent shrink-0" />}
          <span className={capture === 'error' ? 'text-status-absent' : 'text-sage'}>{statusLine}</span>
        </div>
        {capture === 'listening' && interim && (
          <p dir="rtl" className="text-xs text-sage-muted font-arabic" aria-live="off">
            Gehört: {interim}
          </p>
        )}
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
          <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => toggleConsent(e.target.checked)} disabled={busy} />
          <span>
            Ich bin einverstanden, dass meine Stimme bei aktivem Mikrofon vom Spracherkennungsdienst meines
            Browsers verarbeitet wird (z. B. Google bei Chrome). Es wird nichts dauerhaft gespeichert – weder
            Audio noch Text noch Fortschritt. Diese Einwilligung wird nur auf diesem Gerät gemerkt und gilt,
            bis du sie hier wieder abwählst.
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
