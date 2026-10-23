import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Search, RotateCcw, Bookmark, BookmarkCheck, Trash2, BookOpenText, StickyNote, ScrollText, Palette, FileText, Gauge, ChevronLeft, ChevronRight, X, SlidersHorizontal, ChevronDown, LayoutGrid, List as ListIcon, BookOpen, Highlighter, Check } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api, peek } from '../lib/api.js';
import { Card, CardHeader, Button, Spinner, SkeletonRows, useToast, Segmented, Switch } from '../components/ui.jsx';
import { cleanQuran, toArabicNum } from '../lib/quranText.js';
import MushafShell, { Sheet } from '../components/mushaf/MushafShell.jsx';
import { clampPage, lastPage, rememberPage, fetchPage, cachedPage, MARK_COLORS, markColor } from '../lib/mushafPages.js';
import { loadQuranIndex } from '../lib/recitation/quranIndex.js';
import { splitTajweedAyah } from '../lib/tajweedWords.js';
// KI-Rezitation (Erkennung, Qur'an-weite Suche) erst laden, wenn der Reiter
// „Auswendig rezitieren" geöffnet wird -- „Lesen" bleibt dadurch schlank.
const HifzRecitationMode = lazy(() => import('./HifzRecitationMode.jsx'));
import { HifzContent } from './Hifz.jsx';
import { scrollBehavior } from '../lib/scroll.js';

// Tadschwid-Regel -> Farbe (Konvention wie quran.com). Die Regel-Namen kommen
// ausgeschrieben aus der Datenquelle, daher sind die Farben eindeutig.
const TAJWEED_COLORS = {
  ham_wasl: '#9AA0A6', slnt: '#9AA0A6', laam_shamsiyah: '#9AA0A6',
  madda_normal: '#537FFF', madda_permissible: '#4050FF', madda_necessary: '#000EBC', madda_obligatory: '#2144C1',
  ikhafa: '#9400A8', ikhafa_shafawi: '#D500B7',
  idgham_shafawi: '#58B800', idgham_ghunnah: '#169200', idgham_wo_ghunnah: '#169200',
  idgham_mutajanisayn: '#A1A1A1', idgham_mutaqaribayn: '#A1A1A1',
  iqlab: '#26BFFD', ghunnah: '#FF7E1E', qalqalah: '#DD0008',
};
const TAJWEED_LEGEND = [
  ['#DD0008', 'Qalqala'], ['#FF7E1E', 'Ghunna'], ['#169200', 'Idghām'],
  ['#26BFFD', 'Iqlāb'], ['#9400A8', 'Ikhfāʼ'], ['#537FFF', 'Madd'], ['#9AA0A6', 'Stumm/Verbindung'],
];

// Wandelt den Tadschwid-HTML der Quelle in sichere, eingefärbte Spans um.
// Erlaubt nur eigene <span>-Elemente – kein fremdes HTML.
function tajweedToHtml(html) {
  return (html || '')
    .replace(/[۟۠]/g, '') // überproportionale „Null"-Punkte (stumme Buchstaben) entfernen
    .replace(/<span class=["']?end["']?>(.*?)<\/span>/g, (m, num) => `<span class="qend">﴿${num}﴾</span>`)
    .replace(/<tajweed class=["']?([a-z_]+)["']?>/g, (m, cls) => `<span style="color:${TAJWEED_COLORS[cls] || 'inherit'}">`)
    .replace(/<\/tajweed>/g, '</span>')
    .replace(/<(?!\/?span)[^>]*>/g, ''); // alles andere entfernen
}


function TafsirPanel({ data, edition, onEdition }) {
  const EDS = [['saadi', 'as-Saʿdī · عربي'], ['ibnkathir', 'Ibn Kathīr · EN'], ['de', 'Deutsch']];
  const isTrans = data && data.kind === 'translation';
  return (
    <div className="mt-3 rounded-lg border border-mint/25 bg-mint/[0.04] p-3">
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        <span className="text-xs text-sage-muted mr-1 inline-flex items-center gap-1"><FileText size={13} /> Tafsir</span>
        {EDS.map(([k, l]) => (
          <button key={k} onClick={() => onEdition(k)}
            className={['text-caption px-2 py-0.5 rounded-md border', edition === k ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage-muted'].join(' ')}>{l}</button>
        ))}
      </div>
      {isTrans && (
        <p className="text-caption text-sage-muted mb-2 italic">
          Deutsche Sinn-Übersetzung (Bubenheim) – Wiedergabe der Bedeutung, kein wörtlicher Tafsir.
        </p>
      )}
      {!data || data.loading ? (
        <p className="text-sm text-sage-muted">Wird geladen …</p>
      ) : data.error ? (
        <p className="text-sm text-status-absent">{data.error}</p>
      ) : (
        <div data-noi18n dir={data.dir || 'ltr'} className={`text-sm whitespace-pre-line ${data.dir === 'rtl' ? 'font-arabic text-lg leading-loose text-ivory' : 'text-sage'}`}>
          {data.text || 'Kein Eintrag zu dieser Ayah.'}
        </div>
      )}
    </div>
  );
}

// Tafsir-Text (kommt als HTML) sicher zu Klartext mit Absätzen.
const stripHtml = (html) =>
  (html || '')
    .replace(/<\/(p|h[1-6]|div|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const QURAN_TABS = [
  ['lesen', 'Lesen'],
  ['auswendig', 'Auswendig rezitieren'],
  ['lernstand', 'Lernstand'],
];

export default function QuranReader() {
  const [tab, setTab] = useState('lesen');
  const [surahs, setSurahs] = useState(() => peek('/quran/surahs')?.surahs ?? null);
  const [marks, setMarks] = useState(() => peek('/quran/me'));
  const [selected, setSelected] = useState(null); // { n, ayah }
  const [pageView, setPageView] = useState(null); // { page } | { surah } -> Mushaf-Seitenansicht

  const loadMarks = () => api.get('/quran/me').then(setMarks).catch(() => setMarks({ lastRead: null, bookmarks: [] }));
  useEffect(() => { api.get('/quran/surahs').then((d) => setSurahs(d.surahs)); loadMarks(); }, []);

  const openPages = (opts) => setPageView(opts || { page: null });

  return (
    <AppLayout title="Qur'an">
      <Segmented className="w-full sm:w-auto mb-5" options={QURAN_TABS.map(([k, label]) => [k, label])} value={tab} onChange={setTab} />

      {tab === 'lesen' && (
        pageView ? (
          <MushafReader surahs={surahs} initialSurah={pageView.surah || null} initialPage={pageView.page || null} initialTajweed={!!pageView.tajweed}
            onBack={() => { setPageView(null); loadMarks(); }} onMarksChanged={loadMarks} />
        ) : selected ? (
          <SurahView n={selected.n} targetAyah={selected.ayah} surahs={surahs} onBack={() => { setSelected(null); loadMarks(); }}
            onMarksChanged={loadMarks} onOpenPages={(surah, tajweed) => openPages({ surah, tajweed })}
            onChangeSurah={(nn) => setSelected({ n: nn, ayah: null })} />
        ) : (
          <SurahList surahs={surahs} marks={marks} onSelect={(n, ayah) => setSelected({ n, ayah: ayah || null })}
            onOpenPages={() => openPages()} onMarksChanged={loadMarks} />
        )
      )}

      {tab === 'auswendig' && <Suspense fallback={<SkeletonRows rows={3} />}><HifzRecitationMode surahs={surahs} /></Suspense>}
      {tab === 'lernstand' && <HifzContent />}
    </AppLayout>
  );
}

const VIEW_KEY = 'dbz-surah-view';
function SurahList({ surahs, marks, onSelect, onOpenPages, onMarksChanged }) {
  const [q, setQ] = useState('');
  const [view, setViewState] = useState(() => { try { return localStorage.getItem(VIEW_KEY) || 'grid'; } catch { return 'grid'; } });
  const setView = (v) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* egal */ } };
  if (!surahs) return <SkeletonRows rows={6} />;
  const filtered = surahs.filter((s) => `${s.n} ${s.name} ${s.ar || ''}`.toLowerCase().includes(q.toLowerCase()));

  const delBookmark = async (id) => { await api.del(`/quran/bookmarks/${id}`); onMarksChanged(); };

  return (
    <div className="space-y-4">
      {/* Klassische Mushaf-Seitenansicht (Medina-Layout) */}
      <button onClick={() => onOpenPages()}
        className="group w-full flex items-center gap-4 rounded-2xl border border-line/70 bg-card p-4 shadow-card hover:border-mint/40 transition-colors text-left">
        <span className="grid place-items-center h-12 w-12 rounded-full bg-mint/10 text-mint shrink-0"><BookOpen size={22} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-ivory font-medium">Mushaf-Ansicht</div>
          <div className="text-xs text-sage-muted">Klassische Seiten wie im gedruckten Qur'an – blättern oder scrollen, Ayah lange drücken zum Anhören</div>
        </div>
        <ChevronRight size={20} className="text-sage-muted shrink-0 transition group-hover:translate-x-0.5" />
      </button>
      {marks?.lastRead && (
        <Card className="p-4 flex items-center justify-between gap-3 border-mint/30">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center h-10 w-10 rounded-lg bg-mint/15 text-mint"><BookOpenText size={20} /></span>
            <div>
              <div className="text-xs text-sage-muted">Weiterlesen</div>
              <div className="text-ivory">Sure {marks.lastRead.surah} · {marks.lastRead.surahName}</div>
            </div>
          </div>
          <Button size="sm" onClick={() => onSelect(marks.lastRead.surah)}>Öffnen</Button>
        </Card>
      )}

      {marks?.bookmarks?.length > 0 && (
        <Card className="p-4 sm:p-5">
          <CardHeader title="Lesezeichen" icon={Bookmark} />
          <div className="divide-y divide-line">
            {marks.bookmarks.map((b) => (
              <div key={b.id} className="py-2.5 flex items-center justify-between gap-3">
                <button onClick={() => onSelect(b.surah, b.ayah)} className="text-left min-w-0">
                  <div className="text-ivory text-sm flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: markColor(b.color) }} aria-hidden="true" />{b.surahName} · Ayah {b.ayah}</div>
                  {b.note && <div className="text-xs text-sage-muted truncate">{b.note}</div>}
                </button>
                <button onClick={() => delBookmark(b.id)} className="text-status-absent p-1 shrink-0" aria-label="Entfernen"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sage-muted" />
          <input className="input pl-10 rounded-xl" placeholder="Sure suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Link to="/tadschwid" className="shrink-0 inline-flex items-center gap-2 text-sm px-3.5 py-2.5 rounded-xl border border-line bg-card text-ivory hover:bg-hover">
          <Palette size={17} /> <span className="hidden sm:inline">Tadschwid</span>
        </Link>
        <div className="shrink-0 inline-flex rounded-xl border border-line bg-card p-0.5" role="group" aria-label="Ansicht">
          {[['grid', LayoutGrid, 'Kacheln'], ['list', ListIcon, 'Liste']].map(([v, Icon, label]) => (
            <button key={v} onClick={() => setView(v)} aria-label={label} aria-pressed={view === v}
              className={`grid place-items-center h-9 w-10 rounded-lg transition ${view === v ? 'bg-mint text-onaccent' : 'text-sage hover:bg-hover'}`}>
              <Icon size={18} />
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 && <p className="text-sm text-sage-muted px-1">Keine Sure gefunden.</p>}
      <div className={view === 'grid'
        ? 'rounded-2xl border border-line/70 bg-card shadow-card divide-y divide-line/70 overflow-hidden sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none sm:divide-y-0 sm:overflow-visible sm:grid sm:grid-cols-2 sm:gap-2.5'
        : 'rounded-2xl border border-line/70 bg-card shadow-card divide-y divide-line/70 overflow-hidden'}>
        {filtered.map((s) => (
          <button key={s.n} onClick={() => onSelect(s.n)}
            className={view === 'grid'
              ? 'cv-row group w-full flex items-center gap-3 px-4 py-3 active:bg-hover hover:bg-hover/60 transition text-left sm:rounded-2xl sm:border sm:border-line/70 sm:bg-card sm:shadow-card'
              : 'cv-row group w-full flex items-center gap-3 px-4 py-2.5 active:bg-hover hover:bg-hover/60 transition text-left'}>
            <span className="grid place-items-center h-9 w-9 rounded-full bg-subtle text-sage-muted font-mono text-footnote font-semibold shrink-0 group-hover:bg-mint/10 group-hover:text-mint-light transition">{s.n}</span>
            <div className="min-w-0 flex-1">
              <div className="text-body text-ivory font-medium leading-snug break-words">{s.name}</div>
              <div className="text-footnote text-sage-muted">{s.ayat} Ayat</div>
            </div>
            {s.ar && <span dir="rtl" lang="ar" className="font-arabic text-xl text-ivory/90 shrink-0 leading-none">سورة {s.ar}</span>}
            <ChevronRight size={18} className="text-sage-muted/60 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

const REPEATS = [1, 3, 5, 10, 'inf'];
const repLabel = (r) => (r === 'inf' ? '∞' : `${r}×`);
const placeLabel = (t) => (t === 'Meccan' ? 'Mekkanisch' : t === 'Medinan' ? 'Medinensisch' : null);


// Abspielgeschwindigkeiten (Standard 1×). Tonhöhe bleibt dank preservesPitch
// natürlich. Deutsche Schreibweise mit Komma.
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const spLabel = (s) => `${String(s).replace('.', ',')}×`;

function SurahView({ n, targetAyah, surahs, onBack, onMarksChanged, onOpenPages, onChangeSurah }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reciters, setReciters] = useState([]);
  const [reciter, setReciter] = useState('ar.alafasy');
  const [audio, setAudio] = useState(null); // { url, ayahs:[{n,from,to}] }
  const [audioErr, setAudioErr] = useState(null);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState('continuous'); // continuous (Standard) | single | range
  const [settingsOpen, setSettingsOpen] = useState(false); // Wiedergabe-Menü ein/aus
  const [endAction, setEndAction] = useState('stop'); // was nach der Sure passiert: stop | next | repeat
  const [repeat, setRepeat] = useState(1);
  const [range, setRange] = useState({ from: 1, to: 7 });
  const [playingIdx, setPlayingIdx] = useState(null);
  const [marked, setMarked] = useState(new Set());
  const [notes, setNotes] = useState({}); // ayah -> Notiztext
  const [readMode, setReadMode] = useState('study'); // study | mushaf | tajweed
  const [tajweed, setTajweed] = useState(null); // {loading|ayahs|error}
  const [tafsirOpen, setTafsirOpen] = useState(null); // Ayah-Nummer
  const [tafsirEd, setTafsirEd] = useState('saadi'); // saadi | ibnkathir
  const [tafsir, setTafsir] = useState({}); // `${ed}:${ayah}` -> {loading|text|error}

  // EINE durchgehende Audiodatei je Sure + Ayah-Zeitmarken -> echte lückenlose
  // Rezitation. Es wird nur gesprungen (Bereich/Wiederholung/Hervorhebung),
  // nie neu gestartet. Geschwindigkeit über playbackRate (preservesPitch).
  const audioRef = useRef(null); // in-DOM <audio> (siehe JSX unten) – iOS-tauglich
  const winRef = useRef({ stopped: true, startMs: 0, endMs: 0, repsLeft: 1 });
  const speedRef = useRef(1);
  const playingIdxRef = useRef(null);
  const didMountReciter = useRef(false);
  const endActionRef = useRef('stop');
  const autoPlayRef = useRef(false); // beim Sure-Wechsel automatisch weiterspielen
  const [playState, setPlayState] = useState('stopped'); // stopped | playing | paused
  useEffect(() => { playingIdxRef.current = playingIdx; }, [playingIdx]);
  useEffect(() => { endActionRef.current = endAction; }, [endAction]);
  useEffect(() => { speedRef.current = speed; if (audioRef.current) audioRef.current.playbackRate = speed; }, [speed]);

  const goPrevSurah = () => { if (Number(n) > 1) { stop(); onChangeSurah(Number(n) - 1); } };
  const goNextSurah = (autoplay) => {
    if (Number(n) < 114) { if (autoplay) autoPlayRef.current = true; stop(); onChangeSurah(Number(n) + 1); }
    else stop();
  };

  useEffect(() => { api.get('/quran/reciters').then((d) => setReciters(d.reciters)).catch(() => {}); }, []);

  // Schneller Suren-Wechsel: eine spät eintreffende Antwort für eine bereits
  // verlassene Sure darf nicht mehr die aktuell angezeigte Sure überschreiben.
  const loadReq = useRef(0);
  const audioReq = useRef(0);
  const load = () => {
    setError(null); setData(null);
    const req = ++loadReq.current;
    api.get(`/quran/surah/${n}`)
      .then((d) => { if (req === loadReq.current) { setData(d.surah); setRange({ from: 1, to: d.surah.ayahCount }); } })
      .catch((e) => { if (req === loadReq.current) setError(e.message); });
  };
  const loadAudio = (rec) => {
    setAudioErr(null); setAudio(null);
    const req = ++audioReq.current;
    api.get(`/quran/audio/${n}?reciter=${rec || reciter}`)
      .then((d) => { if (req === audioReq.current) setAudio(d.audio); })
      .catch((e) => { if (req === audioReq.current) setAudioErr(e.message); });
  };
  useEffect(() => {
    stop(); load(); loadAudio(reciter); setTajweed(null);
    api.post('/quran/last-read', { surah: n }).then(onMarksChanged).catch(() => {});
    api.get('/quran/me').then((m) => {
      const mine = m.bookmarks.filter((b) => b.surah === Number(n));
      setMarked(new Set(mine.map((b) => b.ayah)));
      setNotes(Object.fromEntries(mine.filter((b) => b.note).map((b) => [b.ayah, b.note])));
    }).catch(() => {});
    // eslint-disable-next-line
  }, [n]);
  // Rezitator gewechselt -> nur Audio neu laden (Text bleibt). Erster Lauf
  // (Mount) wird übersprungen, da der Sure-Effekt das Audio bereits lädt.
  useEffect(() => {
    if (!didMountReciter.current) { didMountReciter.current = true; return; }
    stop(); loadAudio(reciter);
    /* eslint-disable-next-line */
  }, [reciter]);

  useEffect(() => {
    if (data && targetAyah) {
      const el = document.getElementById(`ayah-${targetAyah}`);
      if (el) el.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
    }
  }, [data, targetAyah]);

  // Quelle setzen, sobald die Sure-Audiodatei bekannt ist (Element steht als
  // echtes <audio> im DOM – wichtig für iOS/Safari). Nur src tauschen.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !audio?.url) return;
    try { a.preservesPitch = true; a.mozPreservesPitch = true; a.webkitPreservesPitch = true; } catch { /* egal */ }
    a.playbackRate = speedRef.current;
    if (a.getAttribute('src') !== audio.url) { a.setAttribute('src', audio.url); a.load(); }
    setAudioErr(null);
    // Bei „Nach der Sure -> Weiter": neue Sure automatisch ab Anfang starten.
    if (autoPlayRef.current) { autoPlayRef.current = false; startFrom(0); }
    // eslint-disable-next-line
  }, [audio?.url]);

  function idxByTime(tMs) {
    const ay = audio?.ayahs; if (!ay?.length) return null;
    for (let k = 0; k < ay.length; k++) if (tMs >= ay[k].from && tMs < ay[k].to) return ay[k].n - 1;
    if (tMs >= ay[ay.length - 1].from) return ay[ay.length - 1].n - 1;
    return ay[0].n - 1;
  }

  // Läuft ~4×/s: Hervorhebung nachziehen und am Fensterende stoppen/wiederholen.
  function onTimeUpdate() {
    const a = audioRef.current; const win = winRef.current;
    if (!a || win.stopped) return;
    const t = a.currentTime * 1000;
    const idx = idxByTime(t);
    if (idx != null && idx !== playingIdxRef.current) { playingIdxRef.current = idx; setPlayingIdx(idx); }
    if (t >= win.endMs - 15) {
      // 1) Segment-Wiederholungen (Einzeln/Bereich) zuerst.
      if (win.repsLeft === Infinity || win.repsLeft > 1) {
        if (win.repsLeft !== Infinity) win.repsLeft -= 1;
        a.currentTime = win.startMs / 1000; // Segment erneut ab Start
        return;
      }
      // 2) Wenn die Sure zu Ende gelaufen ist: „Nach der Sure"-Aktion.
      if (win.cont) {
        const act = endActionRef.current;
        if (act === 'repeat') { const first = audio.ayahs[0].from; win.startMs = first; a.currentTime = first / 1000; return; }
        if (act === 'next') { goNextSurah(true); return; }
      }
      stop();
    }
  }

  function stop() {
    winRef.current.stopped = true;
    const a = audioRef.current; if (a) a.pause();
    playingIdxRef.current = null;
    setPlayingIdx(null);
    setPlayState('stopped');
  }
  // Echter Medienfehler (nicht das Zurücksetzen der Quelle).
  function onAudioError() {
    const a = audioRef.current;
    if (a && a.getAttribute('src') && a.error) { setAudioErr(`Audio-Fehler (Code ${a.error.code})`); stop(); }
  }

  const ayTiming = (nn) => audio?.ayahs?.find((x) => x.n === nn);

  // Wiedergabe ab einer Ayah starten. WICHTIG (iOS): play() wird synchron im
  // Klick aufgerufen; die Zeitmarke wird gesetzt, sobald die Metadaten da sind.
  function startFrom(idx) {
    const a = audioRef.current;
    if (!audio) { toast.push('Audio wird noch geladen …'); return; }
    if (!a) return;
    let startN, endN;
    if (mode === 'continuous') { startN = idx + 1; endN = audio.ayahs[audio.ayahs.length - 1].n; }
    else if (mode === 'range') {
      const f = Math.max(1, Math.min(Number(range.from) || 1, data.ayahCount));
      const t = Math.max(f, Math.min(Number(range.to) || f, data.ayahCount));
      startN = f; endN = t;
    } else { startN = idx + 1; endN = idx + 1; }
    const s = ayTiming(startN); const e = ayTiming(endN);
    if (!s || !e) { toast.push('Für diese Ayah liegen keine Audio-Zeitmarken vor.'); return; }
    const cont = mode === 'continuous' && endN === audio.ayahs[audio.ayahs.length - 1].n;
    winRef.current = { stopped: false, startMs: s.from, endMs: e.to, repsLeft: repeat === 'inf' ? Infinity : repeat, cont };
    a.playbackRate = speedRef.current;
    const doSeek = () => { try { a.currentTime = s.from / 1000; } catch { /* egal */ } };
    if (a.readyState >= 1) doSeek(); else a.addEventListener('loadedmetadata', doSeek, { once: true });
    playingIdxRef.current = startN - 1;
    setPlayingIdx(startN - 1);
    const p = a.play();
    if (p && p.catch) p.catch((err) => { setAudioErr('Wiedergabe nicht möglich: ' + (err?.name || err?.message || 'Fehler')); stop(); });
  }
  const onAyahPlay = (idx) => {
    const a = audioRef.current;
    if (playingIdx === idx && !winRef.current.stopped) { // gleiche Ayah -> Pause/Weiter
      if (a && !a.paused) a.pause(); else a?.play().catch(() => {});
      return;
    }
    startFrom(idx);
  };
  // Hauptknopf: startet (fortlaufend im Standardmodus), pausiert und setzt fort.
  const primaryPlay = () => {
    const a = audioRef.current;
    if (a && !winRef.current.stopped) { if (a.paused) a.play().catch(() => {}); else a.pause(); return; }
    startFrom(mode === 'range' ? (Math.max(1, Number(range.from) || 1) - 1) : 0);
  };

  const toggleBookmark = async (ayah) => {
    try {
      await api.post('/quran/bookmarks', { surah: Number(n), ayah });
      setMarked((prev) => { const s = new Set(prev); s.has(ayah) ? s.delete(ayah) : s.add(ayah); return s; });
      onMarksChanged();
    } catch (err) { toast.push(err.message, 'error'); }
  };

  const editNote = async (ayah) => {
    const cur = notes[ayah] || '';
    const val = window.prompt('Notiz zu dieser Ayah (z. B. Tajwid-Fehler):', cur);
    if (val === null) return;
    try {
      await api.post('/quran/notes', { surah: Number(n), ayah, note: val });
      setNotes((prev) => { const c = { ...prev }; if (val.trim()) c[ayah] = val.trim(); else delete c[ayah]; return c; });
      if (val.trim()) setMarked((prev) => new Set(prev).add(ayah));
      onMarksChanged();
    } catch (err) { toast.push(err.message, 'error'); }
  };

  const loadTafsir = (ayah, ed) => {
    const k = `${ed}:${ayah}`;
    if (tafsir[k]) return;
    setTafsir((t) => ({ ...t, [k]: { loading: true } }));
    api.get(`/quran/tafsir/${n}/${ayah}?edition=${ed}`)
      .then(({ tafsir: d }) => setTafsir((t) => ({ ...t, [k]: { text: stripHtml(d.text), dir: d.dir, name: d.editionName, kind: d.kind } })))
      .catch((err) => setTafsir((t) => ({ ...t, [k]: { error: err.message } })));
  };
  const toggleTafsir = (ayah) => {
    const willOpen = tafsirOpen !== ayah;
    setTafsirOpen(willOpen ? ayah : null);
    if (willOpen) loadTafsir(ayah, tafsirEd);
  };
  const changeEdition = (ed) => { setTafsirEd(ed); if (tafsirOpen) loadTafsir(tafsirOpen, ed); };

  const ensureTajweed = () => {
    if (tajweed && !tajweed.error) return;
    setTajweed({ loading: true });
    api.get(`/quran/tajweed/${n}`)
      .then((d) => setTajweed({ ayahs: d.surah.ayahs }))
      .catch((err) => setTajweed({ error: err.message }));
  };
  const chooseView = (v) => { setReadMode(v); if (v === 'tajweed') ensureTajweed(); };

  const MODES = [['single', 'Einzeln'], ['continuous', 'Weiterlaufen'], ['range', 'Bereich']];

  return (
    <div>
      {/* Echtes <audio> im DOM (iOS/Safari-tauglich). Wiedergabe wird per Ref
          gesteuert; play() läuft synchron im Antippen. */}
      <audio ref={audioRef} preload="auto" playsInline className="hidden"
        onTimeUpdate={onTimeUpdate}
        onPlay={() => setPlayState('playing')}
        onPause={() => { if (!winRef.current.stopped) setPlayState('paused'); }}
        onEnded={() => stop()}
        onError={onAudioError} />
      <button onClick={() => { stop(); onBack(); }} className="inline-flex items-center gap-2 text-sm text-sage-muted hover:text-ivory mb-4">
        <ArrowLeft size={16} /> Alle Suren
      </button>

      {error ? (
        <Card className="p-8 text-center">
          <p className="text-status-absent mb-4">{error}</p>
          <Button variant="outline" onClick={() => load()}><RotateCcw size={16} /> Erneut versuchen</Button>
        </Card>
      ) : !data ? (
        <Spinner label="Sure wird geladen …" />
      ) : (
        <>
          <Card className="p-4 sm:p-5 mb-4 text-center">
            {/* Sure-Navigation: vorherige / nächste + Auswahl */}
            <div className="flex items-center justify-center gap-3">
              <button onClick={goPrevSurah} disabled={Number(n) <= 1} aria-label="Vorherige Sure"
                className="p-2 rounded-lg border border-line text-sage hover:bg-hover disabled:opacity-40"><ChevronLeft size={18} /></button>
              <div className="font-arabic text-3xl text-ivory leading-tight">{data.name}</div>
              <button onClick={() => goNextSurah(false)} disabled={Number(n) >= 114} aria-label="Nächste Sure"
                className="p-2 rounded-lg border border-line text-sage hover:bg-hover disabled:opacity-40"><ChevronRight size={18} /></button>
            </div>
            <div className="text-xs text-sage-muted mt-2">
              Sure {data.number} · {data.ayahCount} Ayat{placeLabel(data.revelationType) ? ` · ${placeLabel(data.revelationType)}` : ''} · {data.translationName}
            </div>
            {surahs && (
              <select value={n} onChange={(e) => { stop(); onChangeSurah(Number(e.target.value)); }}
                className="input py-1 w-auto text-sm mt-3 mx-auto">
                {surahs.map((s) => <option key={s.n} value={s.n}>{s.n}. {s.name}</option>)}
              </select>
            )}

            <div className="mt-4 flex flex-col gap-3 items-center text-xs text-sage">
              {/* Ansicht: Lernen (mit Übersetzung) / Mushaf (Seiten) / Tadschwid (farbig) */}
              <div className="inline-flex items-center gap-1 flex-wrap justify-center">
                <span className="text-sage-muted mr-1">Ansicht</span>
                {[['study', 'Lernen', BookOpenText], ['mushaf', 'Mushaf', ScrollText], ['tajweed', 'Tadschwid', Palette]].map(([v, l, Icon]) => (
                  <button key={v} onClick={() => (v === 'mushaf' ? onOpenPages(Number(n)) : v === 'tajweed' ? onOpenPages(Number(n), true) : chooseView(v))}
                    className={['px-2.5 py-1 rounded-md border inline-flex items-center gap-1', readMode === v ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage-muted'].join(' ')}>
                    <Icon size={13} />{l}
                  </button>
                ))}
              </div>

              {/* Primäre Wiedergabe: EIN klarer Abspiel-Knopf (läuft standardmäßig
                  fortlaufend weiter) + EIN Menü für alle weiteren Einstellungen. */}
              <div className="inline-flex items-center gap-2 flex-wrap justify-center">
                <Button size="sm" onClick={primaryPlay} disabled={!audio}>
                  {playState === 'playing' ? <><Pause size={15} /> Pause</> : playState === 'paused' ? <><Play size={15} /> Weiter</> : <><Play size={15} /> Abspielen</>}
                </Button>
                {playState !== 'stopped' && <Button size="sm" variant="ghost" onClick={stop}><X size={14} /> Stopp</Button>}
                <button onClick={() => setSettingsOpen((o) => !o)}
                  className={['inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border', settingsOpen ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage'].join(' ')}>
                  <SlidersHorizontal size={14} /> Wiedergabe <ChevronDown size={13} className={settingsOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                </button>
              </div>
              {audioErr ? (
                <button onClick={() => loadAudio(reciter)} className="text-caption text-status-absent inline-flex items-center gap-1">
                  <RotateCcw size={12} /> Audio erneut laden
                </button>
              ) : !audio ? (
                <p className="text-caption text-sage-muted">Rezitation wird vorbereitet …</p>
              ) : null}

              {/* Eingeklapptes Menü: Rezitator, Modus, Wiederholung, Tempo, Bereich */}
              {settingsOpen && (
                <div className="w-full max-w-md mt-1 rounded-xl border border-line bg-card/60 p-4 flex flex-col gap-3 items-center">
                  <label className="flex items-center gap-2">
                    <span className="text-sage-muted">Rezitator</span>
                    <select className="input py-1.5 w-auto text-sm" value={reciter} onChange={(e) => setReciter(e.target.value)}>
                      {(reciters.length ? reciters.filter((r) => r.mode !== 'ayah') : [{ id: reciter, name: data.reciterName }]).map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </label>

                  <div className="inline-flex items-center gap-1 flex-wrap justify-center">
                    <span className="text-sage-muted mr-1">Modus</span>
                    {MODES.map(([v, l]) => (
                      <button key={v} onClick={() => setMode(v)}
                        className={['px-2.5 py-1 rounded-md border', mode === v ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage-muted'].join(' ')}>{l}</button>
                    ))}
                  </div>

                  {/* Was passiert, wenn die Sure zu Ende rezitiert ist */}
                  <div className="inline-flex items-center gap-1 flex-wrap justify-center">
                    <span className="text-sage-muted mr-1">Nach der Sure</span>
                    {[['stop', 'Stopp'], ['next', 'Nächste Sure'], ['repeat', 'Wiederholen']].map(([v, l]) => (
                      <button key={v} onClick={() => setEndAction(v)}
                        className={['px-2.5 py-1 rounded-md border', endAction === v ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage-muted'].join(' ')}>{l}</button>
                    ))}
                  </div>

                  <div className="inline-flex items-center gap-1 flex-wrap justify-center">
                    <span className="text-sage-muted mr-1">Wiederholung</span>
                    {REPEATS.map((r) => (
                      <button key={r} onClick={() => setRepeat(r)}
                        className={['px-2 py-1 rounded-md border', repeat === r ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage-muted'].join(' ')}>{repLabel(r)}</button>
                    ))}
                  </div>

                  <div className="inline-flex items-center gap-1 flex-wrap justify-center">
                    <span className="text-sage-muted mr-1 inline-flex items-center gap-1"><Gauge size={13} /> Tempo</span>
                    {SPEEDS.map((s) => (
                      <button key={s} onClick={() => setSpeed(s)}
                        className={['px-2 py-1 rounded-md border tabular-nums', speed === s ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage-muted'].join(' ')}>{spLabel(s)}</button>
                    ))}
                  </div>

                  {mode === 'range' && (
                    <div className="inline-flex items-center gap-2 flex-wrap justify-center">
                      <span className="text-sage-muted">von</span>
                      <input type="number" min={1} max={data.ayahCount} className="input py-1 w-16 text-center" value={range.from}
                        onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
                      <span className="text-sage-muted">bis</span>
                      <input type="number" min={1} max={data.ayahCount} className="input py-1 w-16 text-center" value={range.to}
                        onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
                    </div>
                  )}
                  <p className="text-caption text-sage-muted max-w-xs text-center">
                    {mode === 'continuous' && 'Standard: läuft ab der getippten Ayah automatisch weiter bis zum Ende der Sure.'}
                    {mode === 'single' && 'Spielt nur die getippte Ayah.'}
                    {mode === 'range' && 'Spielt den eingestellten Bereich in Schleife – ideal zum Auswendiglernen.'}
                    {mode === 'continuous' && endAction === 'next' && ' Danach geht es automatisch mit der nächsten Sure weiter.'}
                    {mode === 'continuous' && endAction === 'repeat' && ' Danach wird die Sure von vorne wiederholt.'}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {readMode === 'tajweed' ? (
            <Card className="p-4 sm:p-5 sm:p-7">
              {/* Farb-Legende */}
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mb-5 text-caption">
                {TAJWEED_LEGEND.map(([c, l]) => (
                  <span key={l} className="inline-flex items-center gap-1 text-sage-muted">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} /> {l}
                  </span>
                ))}
              </div>
              {!tajweed || tajweed.loading ? (
                <Spinner label="Tadschwid-Text wird geladen …" />
              ) : tajweed.error ? (
                <div className="text-center">
                  <p className="text-status-absent mb-3">{tajweed.error}</p>
                  <Button variant="outline" onClick={ensureTajweed}><RotateCcw size={16} /> Erneut versuchen</Button>
                </div>
              ) : (
                <>
                  {data.bismillah && (
                    <p dir="rtl" className="font-arabic text-2xl text-center text-sage mb-4">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
                  )}
                  <p dir="rtl" className="font-arabic text-ivory text-right" style={{ fontSize: '1.95rem', lineHeight: 2.5 }}>
                    {tajweed.ayahs.map((a, idx) => (
                      <span
                        key={a.n}
                        id={`ayah-${a.n}`}
                        onClick={() => onAyahPlay(idx)}
                        className={`cursor-pointer rounded ${playingIdx === idx ? 'bg-mint/20' : ''}`}
                        dangerouslySetInnerHTML={{ __html: tajweedToHtml(a.html) + ' ' }}
                      />
                    ))}
                  </p>
                  <p className="text-caption text-sage-muted mt-4 text-center">
                    Farben zeigen die Tadschwid-Regeln. Tippe auf eine Ayah zum Abspielen · <Link to="/tadschwid" className="text-mint-light hover:underline">Regeln erklärt</Link>
                  </p>
                </>
              )}
            </Card>
          ) : readMode === 'mushaf' ? (
            <Card className="p-4 sm:p-5 sm:p-7">
              {data.bismillah && (
                <p dir="rtl" className="font-arabic text-2xl text-center text-sage mb-4">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
              )}
              <p dir="rtl" className="font-arabic text-ivory text-right" style={{ fontSize: '1.9rem', lineHeight: 2.4 }}>
                {data.ayahs.map((a, idx) => (
                  <span
                    key={a.n}
                    id={`ayah-${a.n}`}
                    onClick={() => onAyahPlay(idx)}
                    className={`cursor-pointer rounded ${playingIdx === idx ? 'bg-mint/20' : ''}`}
                  >
                    {cleanQuran(a.arabic)}
                    <span className="text-mint mx-1 select-none" style={{ fontSize: '1.4rem' }}>﴿{toArabicNum(a.n)}﴾</span>{' '}
                  </span>
                ))}
              </p>
              <p className="text-caption text-sage-muted mt-4 text-center">Tippe auf eine Ayah, um sie abzuspielen. Für Übersetzung, Lesezeichen &amp; Notizen die Ansicht „Studieren" wählen.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {data.ayahs.map((a, idx) => (
                <Card key={a.n} id={`ayah-${a.n}`} className={`p-4 ${playingIdx === idx ? 'border-mint/50 bg-mint/[0.04]' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid place-items-center h-7 w-7 rounded-full bg-mint/15 text-mint font-mono text-xs shrink-0">{a.n}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={() => toggleTafsir(a.n)} className={tafsirOpen === a.n ? 'text-mint-light' : 'text-sage-muted hover:text-ivory'} aria-label="Tafsir" title="Tafsir">
                        <FileText size={18} />
                      </button>
                      <button onClick={() => editNote(a.n)} className={notes[a.n] ? 'text-mint-light' : 'text-sage-muted hover:text-ivory'} aria-label="Notiz">
                        <StickyNote size={18} />
                      </button>
                      <button onClick={() => toggleBookmark(a.n)} className={marked.has(a.n) ? 'text-mint-light' : 'text-sage-muted hover:text-ivory'} aria-label="Lesezeichen">
                        {marked.has(a.n) ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
                      </button>
                      {audio && (
                        <button onClick={() => onAyahPlay(idx)} className="text-mint hover:text-mint-light" aria-label="Abspielen">
                          {playingIdx === idx ? <Pause size={20} /> : <Play size={20} />}
                        </button>
                      )}
                    </div>
                  </div>
                  <p dir="rtl" className="font-arabic text-2xl leading-loose text-ivory mt-2">{cleanQuran(a.arabic)}</p>
                  {a.translation && <p className="text-sage text-sm mt-3">{a.translation}</p>}
                  {notes[a.n] && (
                    <p className="text-xs text-mint-light bg-mint/10 rounded-lg px-3 py-2 mt-3 flex items-start gap-2">
                      <StickyNote size={13} className="mt-0.5 shrink-0" /> {notes[a.n]}
                    </p>
                  )}
                  {tafsirOpen === a.n && (
                    <TafsirPanel data={tafsir[`${tafsirEd}:${a.n}`]} edition={tafsirEd} onEdition={changeEdition} />
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// =============================================================================
// Mushaf-Seitenansicht (klassisches Medina-Layout, 604 Seiten)
// =============================================================================
// ---- Mushaf-Lese-Ansicht (Vollbild-Leser, components/mushaf/) ---------------
// Tippen blendet die Leisten ein/aus; eine Ayah LANGE drücken (Rechtsklick am
// Mac) öffnet Wiedergabe, Tafsir, Lesezeichen und Markierung.
function MushafReader({ initialSurah, initialPage, initialTajweed, onBack, onMarksChanged, surahs }) {
  const toast = useToast();
  const [index, setIndex] = useState(null);
  useEffect(() => { loadQuranIndex().then(setIndex).catch(() => {}); }, []);
  const [page, setPage] = useState(null);
  const [reciter, setReciter] = useState('ar.alafasy');
  const [reciters, setReciters] = useState([]);
  const [speed, setSpeed] = useState(1);
  const [playingKey, setPlayingKey] = useState(null); // "surah:ayah"
  const [playingWord, setPlayingWord] = useState(null); // "surah:ayah#wortNr" (Mitlesen)
  const [sheetKey, setSheetKey] = useState(null); // lange gedrückte Ayah (Aktionen)
  const [bookmarks, setBookmarks] = useState(new Map()); // "s:a" -> { id, color }
  const [highlights, setHighlights] = useState(new Map()); // "s:a" -> color
  const [tafsirEd, setTafsirEd] = useState('de');
  const [tafsir, setTafsir] = useState({}); // `${ed}:${s:a}` -> {…}
  const [showTafsir, setShowTafsir] = useState(false);
  const [elPaused, setElPaused] = useState(false);
  const [tajweed, setTajweed] = useState(!!initialTajweed);
  // Tadschwid-Farben je Wort ("s:a:k" -> HTML), aus der Ayah-Auszeichnung der
  // Suren auf der Seite. Nur eindeutig zerlegbare Ayat werden gefärbt.
  const [tjMap, setTjMap] = useState(() => new Map());
  const tjSurahs = useRef(new Set());
  const [hint, setHint] = useState(() => { try { return !localStorage.getItem('dbz-mushaf-hint'); } catch { return false; } });
  const closeHint = () => { setHint(false); try { localStorage.setItem('dbz-mushaf-hint', '1'); } catch { /* egal */ } };

  const elRef = useRef(null); // in-DOM <audio> (iOS-tauglich)
  const audioCache = useRef(new Map()); // surah -> {url,ayahs}  (chapter-Rezitatoren)
  const ayahAudioCache = useRef(new Map()); // surah -> [{n,url}] (Ayah-Rezitatoren)
  const winRef = useRef({ stopped: true });
  const speedRef = useRef(1);
  const playingKeyRef = useRef(null);
  const playingWordRef = useRef(null);
  useEffect(() => { playingKeyRef.current = playingKey; }, [playingKey]);
  useEffect(() => { playingWordRef.current = playingWord; }, [playingWord]);
  useEffect(() => { speedRef.current = speed; if (elRef.current) elRef.current.playbackRate = speed; }, [speed]);

  // Modus des gewählten Rezitators: 'chapter' (Sure-Datei + Wort-Mitlesen) oder
  // 'ayah' (Ayah-für-Ayah, nur Ayah-Hervorhebung).
  const reciterMode = reciters.find((r) => r.id === reciter)?.mode || 'chapter';
  const reciterModeRef = useRef('chapter');
  useEffect(() => { reciterModeRef.current = reciterMode; }, [reciterMode]);

  useEffect(() => { api.get('/quran/reciters').then((d) => setReciters(d.reciters)).catch(() => {}); }, []);

  // Startseite bestimmen: explizite Seite -> Sure -> zuletzt -> 1.
  useEffect(() => {
    let cancel = false;
    (async () => {
      let p = initialPage ? clampPage(initialPage) : null;
      if (!p && initialSurah) {
        try { const r = await api.get(`/quran/surah-page/${initialSurah}`); p = clampPage(r.page); } catch { /* egal */ }
      }
      if (!p) p = lastPage();
      if (!cancel) setPage(p);
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (!tajweed || page == null || !index) return undefined;
    let alive = true;
    fetchPage(page).then((d) => {
      for (const su of d.surahs || []) {
        if (tjSurahs.current.has(su)) continue;
        tjSurahs.current.add(su);
        api.get(`/quran/tajweed/${su}`).then(({ surah }) => {
          if (!alive) return;
          setTjMap((prev) => {
            const next = new Map(prev);
            for (const ay of surah.ayahs || []) {
              const words = splitTajweedAyah(ay.html);
              const [from, to] = index.ayahRange(su, ay.n, ay.n);
              // 37:130 „إِلْ يَاسِينَ": im Index zwei Wörter, auf der Seite eines.
              const expected = (to - from) - (su === 37 && ay.n === 130 ? 1 : 0);
              if (!words || words.length !== expected) continue;
              words.forEach((w, i) => next.set(`${su}:${ay.n}:${i + 1}`, tajweedToHtml(w)));
            }
            return next;
          });
        }).catch(() => { tjSurahs.current.delete(su); });
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [tajweed, page, index]);

  // Lesezeichen + Markierungen (je Ayah, mit Farbe).
  const loadMarks = () => api.get('/quran/me').then((m) => {
    setBookmarks(new Map((m.bookmarks || []).map((b) => [`${b.surah}:${b.ayah}`, { id: b.id, color: b.color || 'green' }])));
    setHighlights(new Map((m.highlights || []).map((h) => [`${h.surah}:${h.ayah}`, h.color])));
  }).catch(() => {});
  useEffect(() => { loadMarks(); /* eslint-disable-next-line */ }, []);

  // Audio der Sure(n) auf der Seite im Voraus laden -> beim Antippen kann play()
  // synchron im Klick laufen (wichtig für iOS/Safari), ohne Warten.
  const prefetchPageAudio = (sarr) => (sarr || []).forEach((su) => { ensureAudio(su).catch(() => {}); });
  const lastReadSurah = useRef(null);
  useEffect(() => {
    if (page == null) return;
    rememberPage(page);
    let alive = true;
    fetchPage(page).then((d) => {
      if (!alive) return;
      if (reciterModeRef.current === 'chapter') prefetchPageAudio(d.surahs);
      const su = d.surahs?.[0];
      if (su && su !== lastReadSurah.current) { lastReadSurah.current = su; api.post('/quran/last-read', { surah: su }).then(onMarksChanged).catch(() => {}); }
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [page]);
  useEffect(() => () => { const a = elRef.current; if (a) { a.pause(); } }, []);
  // Rezitatorwechsel: Cache leeren, Wiedergabe stoppen, Quelle zurücksetzen.
  useEffect(() => { audioCache.current.clear(); ayahAudioCache.current.clear(); stopAudio(); if (elRef.current) elRef.current.__surah = null; /* eslint-disable-next-line */ }, [reciter]);

  // Wiedergabe folgt über Seiten hinweg -- aber nur, wenn man gerade bei der
  // laufenden Ayah war (wer selbst woandershin geblättert hat, wird nicht zurückgezogen).
  const prevPlayPage = useRef(null);
  useEffect(() => {
    if (!playingKey || !index) { prevPlayPage.current = null; return; }
    const [s, a] = playingKey.split(':').map(Number);
    const target = index.pageOfAyah(s, a);
    if (target !== page && (prevPlayPage.current == null || prevPlayPage.current === page)) setPage(target);
    prevPlayPage.current = target;
    // eslint-disable-next-line
  }, [playingKey, index]);

  function stopAudio() { winRef.current.stopped = true; const a = elRef.current; if (a) a.pause(); playingKeyRef.current = null; setPlayingKey(null); playingWordRef.current = null; setPlayingWord(null); setElPaused(false); }

  async function ensureAudio(surah) {
    if (audioCache.current.has(surah)) return audioCache.current.get(surah);
    const r = await api.get(`/quran/audio/${surah}?reciter=${reciter}`);
    audioCache.current.set(surah, r.audio);
    return r.audio;
  }

  // --- Ayah-für-Ayah-Wiedergabe (Rezitatoren ohne Sure-Zeitmarken) ----------
  async function ensureAyahAudio(surah) {
    if (ayahAudioCache.current.has(surah)) return ayahAudioCache.current.get(surah);
    const r = await api.get(`/quran/audio-ayahs/${surah}?reciter=${reciter}`);
    ayahAudioCache.current.set(surah, r.audio.ayahs);
    return r.audio.ayahs;
  }
  function loadAyahAt(surah, list, idx) {
    const el = elRef.current;
    if (!el) return;
    if (idx < 0 || idx >= list.length) { stopAudio(); return; }
    winRef.current = { stopped: false, surah, mode: 'ayah', list, idx };
    el.__surah = null;
    el.setAttribute('src', list[idx].url); el.load();
    el.playbackRate = speedRef.current;
    try { el.preservesPitch = true; el.mozPreservesPitch = true; el.webkitPreservesPitch = true; } catch { /* egal */ }
    const key = `${surah}:${list[idx].n}`;
    playingKeyRef.current = key; setPlayingKey(key);
    playingWordRef.current = null; setPlayingWord(null);
    const p = el.play();
    if (p && p.catch) p.catch((err) => { toast.push('Wiedergabe nicht möglich: ' + (err?.name || 'Fehler'), 'error'); stopAudio(); });
  }
  function advanceAyah() {
    const win = winRef.current;
    if (!win || win.stopped || win.mode !== 'ayah') return;
    loadAyahAt(win.surah, win.list, win.idx + 1);
  }
  function playAyahFrom(verseKey) {
    const s = Number(verseKey.split(':')[0]); const a = Number(verseKey.split(':')[1]);
    const at = (list) => loadAyahAt(s, list, Math.max(0, list.findIndex((x) => x.n === a)));
    const cached = ayahAudioCache.current.get(s);
    if (cached) { at(cached); return; }
    ensureAyahAudio(s).then(at).catch(() => toast.push('Audio konnte nicht geladen werden', 'error'));
  }
  // Wird am Ende jeder Audiodatei aufgerufen: im Ayah-Modus zur nächsten Ayah.
  function onAudioEnded() {
    const win = winRef.current;
    if (win && win.mode === 'ayah' && !win.stopped) advanceAyah();
    else stopAudio();
  }

  function onTimeUpdate() {
    const a = elRef.current; const win = winRef.current;
    if (!a || win.stopped) return;
    const t = a.currentTime * 1000;
    const ay = win.ayahs; if (!ay) return;
    let cur = null; let curAy = null;
    for (let k = 0; k < ay.length; k++) if (t >= ay[k].from && t < ay[k].to) { cur = ay[k].n; curAy = ay[k]; break; }
    if (cur == null && t >= ay[ay.length - 1].from) { cur = ay[ay.length - 1].n; curAy = ay[ay.length - 1]; }
    if (cur != null) { const key = `${win.surah}:${cur}`; if (key !== playingKeyRef.current) { playingKeyRef.current = key; setPlayingKey(key); } }
    // Mitlesen: aktuell rezitiertes WORT anhand der Wort-Zeitmarken bestimmen.
    let wkey = null;
    if (curAy && curAy.words && curAy.words.length) {
      let cw = null;
      for (const s of curAy.words) if (t >= s.from && t < s.to) { cw = s.w; break; }
      if (cw == null && t >= curAy.words[curAy.words.length - 1].from) cw = curAy.words[curAy.words.length - 1].w;
      if (cw != null) wkey = `${win.surah}:${cur}#${cw}`;
    }
    if (wkey !== playingWordRef.current) { playingWordRef.current = wkey; setPlayingWord(wkey); }
    if (t >= win.endMs - 15) stopAudio();
  }

  // Startet die Wiedergabe mit bereits vorliegenden Audiodaten (synchron -> iOS).
  function playWith(ad, verseKey) {
    const [s, a] = verseKey.split(':').map(Number);
    const st = ad.ayahs.find((x) => x.n === a); const last = ad.ayahs[ad.ayahs.length - 1];
    if (!st || !last) { toast.push('Keine Audio-Zeitmarken für diese Ayah'); return; }
    const el = elRef.current; if (!el) return;
    if (el.__surah !== s) {
      el.__surah = s; el.setAttribute('src', ad.url); el.load();
      try { el.preservesPitch = true; el.mozPreservesPitch = true; el.webkitPreservesPitch = true; } catch { /* egal */ }
    }
    el.playbackRate = speedRef.current;
    winRef.current = { stopped: false, surah: s, ayahs: ad.ayahs, endMs: last.to };
    const doSeek = () => { try { el.currentTime = st.from / 1000; } catch { /* egal */ } };
    if (el.readyState >= 1) doSeek(); else el.addEventListener('loadedmetadata', doSeek, { once: true });
    playingKeyRef.current = verseKey; setPlayingKey(verseKey);
    const p = el.play();
    if (p && p.catch) p.catch((err) => { toast.push('Wiedergabe nicht möglich: ' + (err?.name || 'Fehler'), 'error'); stopAudio(); });
  }
  function playFrom(verseKey) {
    if (reciterModeRef.current === 'ayah') { playAyahFrom(verseKey); return; }
    const s = Number(verseKey.split(':')[0]);
    const cached = audioCache.current.get(s);
    if (cached) { playWith(cached, verseKey); return; } // Normalfall: bereits vorgeladen
    ensureAudio(s).then((ad) => playWith(ad, verseKey)).catch(() => toast.push('Audio konnte nicht geladen werden', 'error'));
  }
  const playing = playingKey && !winRef.current.stopped;
  // Abspielen ab der ersten Ayah der Seite bzw. Pause/Fortsetzen.
  const topPlay = () => {
    if (playing) {
      const el = elRef.current;
      if (el) { if (elPaused) el.play().catch(() => {}); else el.pause(); }
      return;
    }
    const d = cachedPage(page);
    if (d?.firstVerse) playFrom(d.firstVerse);
  };
  const onPlaySheet = (verseKey) => {
    const el = elRef.current;
    if (playingKey === verseKey && !winRef.current.stopped) { if (el && !el.paused) el.pause(); else el?.play().catch(() => {}); return; }
    playFrom(verseKey);
  };

  const setBookmark = async (verseKey, color) => {
    const [s, a] = verseKey.split(':').map(Number);
    try {
      const cur = bookmarks.get(verseKey);
      if (color == null) { if (cur) await api.del(`/quran/bookmarks/${cur.id}`); }
      else await api.post('/quran/bookmarks', { surah: s, ayah: a, color });
      await loadMarks();
      onMarksChanged();
    } catch (err) { toast.push(err.message, 'error'); }
  };
  const setHighlight = async (verseKey, color) => {
    const [s, a] = verseKey.split(':').map(Number);
    try { await api.post('/quran/highlights', { surah: s, ayah: a, color }); await loadMarks(); } catch (err) { toast.push(err.message, 'error'); }
  };

  const loadTafsir = (verseKey, ed) => {
    const k = `${ed}:${verseKey}`;
    if (tafsir[k]) return;
    const [s, a] = verseKey.split(':');
    setTafsir((t) => ({ ...t, [k]: { loading: true } }));
    api.get(`/quran/tafsir/${s}/${a}?edition=${ed}`)
      .then(({ tafsir: d }) => setTafsir((t) => ({ ...t, [k]: { text: stripHtml(d.text), dir: d.dir, name: d.editionName, kind: d.kind } })))
      .catch((err) => setTafsir((t) => ({ ...t, [k]: { error: err.message } })));
  };
  const openTafsir = (verseKey) => { setShowTafsir(true); loadTafsir(verseKey, tafsirEd); };
  const changeEd = (ed) => { setTafsirEd(ed); if (sheetKey) loadTafsir(sheetKey, ed); };

  // Darstellung je Wort: Mitlesen, Markierung, Auswahl, Tadschwid.
  const hlVersion = useMemo(() => [...highlights].join(',') + '|' + [...bookmarks].map(([k, b]) => k + b.color).join(','), [highlights, bookmarks]);
  const renderWord = useCallback((w) => {
    const cls = [];
    let style;
    if (playingWord && w.wi != null && playingWord === `${w.v}#${w.wi}`) cls.push('is-word-active');
    else if (playingKey === w.v) cls.push('is-active');
    if (sheetKey === w.v) cls.push('is-selected');
    const hl = highlights.get(w.v);
    if (hl && !w.e) { cls.push('is-hl'); style = { '--hl': markColor(hl) }; }
    const bm = w.e ? bookmarks.get(w.v) : null;
    if (bm) { cls.push('underline decoration-2 underline-offset-4'); style = { ...style, textDecorationColor: markColor(bm.color) }; }
    return { className: cls.join(' '), style, html: tajweed && !w.e && !w.part ? tjMap.get(`${w.v}:${w.p}`) : undefined };
  }, [playingWord, playingKey, sheetKey, highlights, bookmarks, tajweed, tjMap]);
  const focusG = useMemo(() => {
    if (!index || !playingWord) return null;
    const [vk, wi] = playingWord.split('#');
    const [s, a] = vk.split(':').map(Number);
    return index.wordOf(s, a, Number(wi));
  }, [index, playingWord]);

  const [sSurah, sAyah] = sheetKey ? sheetKey.split(':').map(Number) : [];
  const surahName = (n) => surahs?.find((x) => x.n === n)?.name || `Sure ${n}`;

  if (page == null) return <Spinner label="Mushaf-Seite wird geladen …" />;
  return (
    <>
      {/* Echtes <audio> im DOM (iOS/Safari-tauglich). */}
      <audio ref={elRef} preload="auto" playsInline className="hidden"
        onTimeUpdate={onTimeUpdate}
        onPlay={() => setElPaused(false)}
        onPause={() => { if (!winRef.current.stopped) setElPaused(true); }}
        onEnded={onAudioEnded}
        onError={() => { const a = elRef.current; if (a && a.getAttribute('src') && a.error) { toast.push('Audio-Fehler (Code ' + a.error.code + ')', 'error'); stopAudio(); } }} />
      <MushafShell
        onClose={() => { stopAudio(); onBack(); }}
        closeLabel="Zur Übersicht"
        page={page}
        // Doppelseite: liegt die gerade abgespielte Seite unter den sichtbaren, bleibt sie die aktuelle.
        onPageChange={(p, how, shown) => setPage(shown && prevPlayPage.current && shown.includes(prevPlayPage.current) ? prevPlayPage.current : p)}
        index={index}
        surahs={surahs}
        renderWord={renderWord}
        version={`${playingWord}|${playingKey}|${sheetKey}|${tajweed}|${hlVersion}|${tjMap.size}`}
        forceTextLayout={tajweed}
        focusG={focusG}
        onLongPressWord={({ v }) => { setSheetKey(v); setShowTafsir(false); closeHint(); }}
        onMarksChanged={() => { loadMarks(); onMarksChanged(); }}
        bottom={(
          <div className="flex items-center gap-2">
            <label className="flex-1 min-w-0 relative">
              <span className="sr-only">Rezitator</span>
              <select className="w-full appearance-none rounded-full bg-mint/10 text-mint-light font-semibold text-footnote pl-4 pr-8 h-10 truncate" value={reciter} onChange={(e) => setReciter(e.target.value)}>
                {reciters.length ? (
                  <>
                    <optgroup label="Mit Wort-Mitlesen">
                      {reciters.filter((r) => r.mode !== 'ayah').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </optgroup>
                    <optgroup label="Ayah-für-Ayah (ohne Mitlesen)">
                      {reciters.filter((r) => r.mode === 'ayah').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </optgroup>
                  </>
                ) : <option value={reciter}>Mishary Al-Afasy</option>}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-mint-light pointer-events-none" aria-hidden="true" />
            </label>
            <label className="relative shrink-0">
              <span className="sr-only">Geschwindigkeit</span>
              <select className="appearance-none rounded-full border border-line bg-card text-footnote text-ivory h-10 pl-3 pr-7 tabular-nums" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                {SPEEDS.map((x) => <option key={x} value={x}>{spLabel(x)}</option>)}
              </select>
              <Gauge size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sage-muted pointer-events-none" aria-hidden="true" />
            </label>
            <button onClick={topPlay} aria-label={playing && !elPaused ? 'Pause' : 'Abspielen'}
              className="grid place-items-center h-11 w-11 shrink-0 rounded-full bg-mint text-onaccent shadow-sm">
              {playing && !elPaused ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
            </button>
          </div>
        )}
        settingsExtra={(
          <section>
            <h4 className="text-footnote font-semibold text-sage-muted uppercase tracking-wide mb-2">Tadschwid</h4>
            <Switch checked={tajweed} onChange={setTajweed} label="Tadschwid-Farben anzeigen" />
            {tajweed && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-caption">
                {TAJWEED_LEGEND.map(([c, l]) => (
                  <span key={l} className="inline-flex items-center gap-1 text-sage-muted"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} /> {l}</span>
                ))}
              </div>
            )}
          </section>
        )}
        overlay={hint ? (
          <div className="absolute inset-x-0 z-[3] flex justify-center px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 8.5rem)' }}>
            <div className="max-w-sm rounded-2xl bg-elevated border border-line shadow-float px-4 py-3 text-footnote text-sage flex items-start gap-3">
              <span>Einmal tippen: Leisten ein/aus. Eine Ayah lange drücken: Abspielen, Tafsir, Lesezeichen, Markieren.</span>
              <button onClick={closeHint} className="text-sage-muted shrink-0" aria-label="Schließen"><X size={16} /></button>
            </div>
          </div>
        ) : null}
      />
      {sheetKey && (
        <Sheet title={`${surahName(sSurah)} · Ayah ${sAyah}`} onClose={() => { setSheetKey(null); setShowTafsir(false); }}>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onPlaySheet(sheetKey)}>
                {playingKey === sheetKey && !winRef.current.stopped
                  ? (elPaused ? <><Play size={14} /> Weiter</> : <><Pause size={14} /> Pause</>)
                  : <><Play size={14} /> Ab hier abspielen</>}
              </Button>
              <Button size="sm" variant={showTafsir ? 'primary' : 'outline'} onClick={() => (showTafsir ? setShowTafsir(false) : openTafsir(sheetKey))}>
                <FileText size={14} /> Tafsir &amp; Übersetzung
              </Button>
            </div>
            <ColorRow label="Lesezeichen" icon={Bookmark} value={bookmarks.get(sheetKey)?.color} onPick={(c) => setBookmark(sheetKey, c)} />
            <ColorRow label="Markieren" icon={Highlighter} value={highlights.get(sheetKey)} onPick={(c) => setHighlight(sheetKey, c)} />
            {showTafsir && <TafsirPanel data={tafsir[`${tafsirEd}:${sheetKey}`]} edition={tafsirEd} onEdition={changeEd} />}
          </div>
        </Sheet>
      )}
    </>
  );
}

// Farbauswahl für Lesezeichen/Markierung (nochmal dieselbe Farbe = entfernen).
function ColorRow({ label, icon: Icon, value, onPick }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-footnote font-semibold text-sage-muted mb-2"><Icon size={14} aria-hidden="true" /> {label}</div>
      <div className="flex items-center gap-2.5">
        {MARK_COLORS.map(([c, name, hex]) => (
          <button key={c} onClick={() => onPick(value === c ? null : c)} aria-pressed={value === c} aria-label={name} title={name}
            className={`h-9 w-9 rounded-full grid place-items-center transition ${value === c ? 'ring-2 ring-offset-2 ring-offset-card ring-ivory/60' : ''}`}
            style={{ background: hex }}>
            {value === c && <Check size={16} className="text-white" aria-hidden="true" />}
          </button>
        ))}
        {value && <button onClick={() => onPick(null)} className="ml-1 text-footnote text-sage-muted underline">Entfernen</button>}
      </div>
    </div>
  );
}
