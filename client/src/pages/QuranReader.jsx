import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Search, RotateCcw, Bookmark, BookmarkCheck, Trash2, BookOpenText, StickyNote, ScrollText, Palette, FileText, Gauge, ChevronLeft, ChevronRight, X, SlidersHorizontal, ChevronDown } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Spinner, useToast } from '../components/ui.jsx';

const toArabicNum = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

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
            className={['text-[11px] px-2 py-0.5 rounded-md border', edition === k ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage-muted'].join(' ')}>{l}</button>
        ))}
      </div>
      {isTrans && (
        <p className="text-[11px] text-sage-muted mb-2 italic">
          Deutsche Sinn-Übersetzung (Bubenheim) – Wiedergabe der Bedeutung, kein wörtlicher Tafsir.
        </p>
      )}
      {!data || data.loading ? (
        <p className="text-sm text-sage-muted">Wird geladen …</p>
      ) : data.error ? (
        <p className="text-sm text-status-absent">{data.error}</p>
      ) : (
        <div dir={data.dir || 'ltr'} className={`text-sm whitespace-pre-line ${data.dir === 'rtl' ? 'font-arabic text-lg leading-loose text-ivory' : 'text-sage'}`}>
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

export default function QuranReader() {
  const [surahs, setSurahs] = useState(null);
  const [marks, setMarks] = useState(null);
  const [selected, setSelected] = useState(null); // { n, ayah }
  const [pageView, setPageView] = useState(null); // { page } | { surah } -> Mushaf-Seitenansicht

  const loadMarks = () => api.get('/quran/me').then(setMarks).catch(() => setMarks({ lastRead: null, bookmarks: [] }));
  useEffect(() => { api.get('/quran/surahs').then((d) => setSurahs(d.surahs)); loadMarks(); }, []);

  const openPages = (opts) => setPageView(opts || { page: null });

  return (
    <AppLayout title="Qur'an">
      {pageView ? (
        <MushafReader initialSurah={pageView.surah || null} initialPage={pageView.page || null}
          onBack={() => { setPageView(null); loadMarks(); }} onMarksChanged={loadMarks} />
      ) : selected ? (
        <SurahView n={selected.n} targetAyah={selected.ayah} onBack={() => { setSelected(null); loadMarks(); }}
          onMarksChanged={loadMarks} onOpenPages={(surah) => openPages({ surah })} />
      ) : (
        <SurahList surahs={surahs} marks={marks} onSelect={(n, ayah) => setSelected({ n, ayah: ayah || null })}
          onOpenPages={() => openPages()} onMarksChanged={loadMarks} />
      )}
    </AppLayout>
  );
}

function SurahList({ surahs, marks, onSelect, onOpenPages, onMarksChanged }) {
  const [q, setQ] = useState('');
  if (!surahs) return <Spinner />;
  const filtered = surahs.filter((s) => `${s.n} ${s.name}`.toLowerCase().includes(q.toLowerCase()));

  const delBookmark = async (id) => { await api.del(`/quran/bookmarks/${id}`); onMarksChanged(); };

  return (
    <div className="space-y-4">
      {/* Klassische Mushaf-Seitenansicht (Medina-Layout) */}
      <button onClick={() => onOpenPages()}
        className="w-full flex items-center gap-3 rounded-xl border border-mint/30 bg-mint/[0.06] p-4 hover:bg-mint/10 transition text-left">
        <span className="grid place-items-center h-11 w-11 rounded-lg bg-mint/15 text-mint shrink-0"><ScrollText size={22} /></span>
        <div className="min-w-0">
          <div className="text-ivory font-medium">Mushaf-Ansicht</div>
          <div className="text-xs text-sage-muted">Klassische Seiten wie im gedruckten Qur'an – blättern, Juzʼ, tippen zum Anhören</div>
        </div>
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
        <Card className="p-5">
          <CardHeader title="Lesezeichen" icon={Bookmark} />
          <div className="divide-y divide-line">
            {marks.bookmarks.map((b) => (
              <div key={b.id} className="py-2.5 flex items-center justify-between gap-3">
                <button onClick={() => onSelect(b.surah, b.ayah)} className="text-left min-w-0">
                  <div className="text-ivory text-sm">{b.surahName} · Ayah {b.ayah}</div>
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
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-sage-muted" />
          <input className="input pl-9" placeholder="Sure suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Link to="/tadschwid" className="shrink-0 inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-line text-sage hover:bg-hover">
          <Palette size={16} /> Tadschwid
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {filtered.map((s) => (
          <button key={s.n} onClick={() => onSelect(s.n)}
            className="flex items-center gap-3 rounded-xl border border-line bg-card p-3 hover:bg-hover transition text-left">
            <span className="grid place-items-center h-9 w-9 rounded-lg bg-mint/15 text-mint font-mono text-sm shrink-0">{s.n}</span>
            <div className="min-w-0">
              <div className="text-ivory truncate">{s.name}</div>
              <div className="text-xs text-sage-muted">{s.ayat} Ayat</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

const REPEATS = [1, 3, 5, 10, 'inf'];
const repLabel = (r) => (r === 'inf' ? '∞' : `${r}×`);
const placeLabel = (t) => (t === 'Meccan' ? 'Mekkanisch' : t === 'Medinan' ? 'Medinensisch' : null);

// Startseiten der 30 Juzʼ im Madina-Mushaf (604 Seiten) – für die Schnellnavigation.
const JUZ_START_PAGE = [1, 22, 42, 62, 82, 102, 121, 142, 162, 182, 201, 222, 242, 262, 282, 302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582];

// Abspielgeschwindigkeiten (Standard 1×). Tonhöhe bleibt dank preservesPitch
// natürlich. Deutsche Schreibweise mit Komma.
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const spLabel = (s) => `${String(s).replace('.', ',')}×`;

function SurahView({ n, targetAyah, onBack, onMarksChanged, onOpenPages }) {
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
  const audioRef = useRef(null); // einziges <audio>-Element
  const winRef = useRef({ stopped: true, startMs: 0, endMs: 0, repsLeft: 1 });
  const speedRef = useRef(1);
  const playingIdxRef = useRef(null);
  const didMountReciter = useRef(false);
  useEffect(() => { playingIdxRef.current = playingIdx; }, [playingIdx]);
  useEffect(() => { speedRef.current = speed; if (audioRef.current) audioRef.current.playbackRate = speed; }, [speed]);

  useEffect(() => { api.get('/quran/reciters').then((d) => setReciters(d.reciters)).catch(() => {}); }, []);

  const load = () => {
    setError(null); setData(null);
    api.get(`/quran/surah/${n}`)
      .then((d) => { setData(d.surah); setRange({ from: 1, to: d.surah.ayahCount }); })
      .catch((e) => setError(e.message));
  };
  const loadAudio = (rec) => {
    setAudioErr(null); setAudio(null);
    api.get(`/quran/audio/${n}?reciter=${rec || reciter}`)
      .then((d) => setAudio(d.audio))
      .catch((e) => setAudioErr(e.message));
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
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [data, targetAyah]);

  // EIN Audio-Element über die gesamte Lebensdauer wiederverwenden. Beim
  // Wechsel der Sure/Rezitators nur die Quelle (src) tauschen – NICHT das
  // Element neu aufbauen und NICHT src='' setzen (das würde fälschlich einen
  // Fehler auslösen). Der Fehler-Handler greift nur bei echten Medienfehlern.
  useEffect(() => {
    if (!audio?.url) return;
    let a = audioRef.current;
    if (!a) {
      a = new Audio();
      audioRef.current = a;
      a.preload = 'auto';
      a.ontimeupdate = onTimeUpdate;
      a.onerror = () => { if (a.src && a.error) { setAudioErr('Audio konnte nicht geladen werden.'); stop(); } };
    }
    try { a.preservesPitch = true; a.mozPreservesPitch = true; a.webkitPreservesPitch = true; } catch { /* egal */ }
    a.playbackRate = speedRef.current;
    if (a.src !== audio.url) a.src = audio.url;
    setAudioErr(null);
    // eslint-disable-next-line
  }, [audio?.url]);
  // Nur beim endgültigen Verlassen aufräumen (Handler vorher lösen).
  useEffect(() => () => { const a = audioRef.current; if (a) { a.onerror = null; a.ontimeupdate = null; a.pause(); a.src = ''; audioRef.current = null; } }, []);

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
      if (win.repsLeft === Infinity || win.repsLeft > 1) {
        if (win.repsLeft !== Infinity) win.repsLeft -= 1;
        a.currentTime = win.startMs / 1000; // Segment erneut ab Start
      } else {
        stop();
      }
    }
  }

  function stop() {
    winRef.current.stopped = true;
    const a = audioRef.current; if (a) a.pause();
    playingIdxRef.current = null;
    setPlayingIdx(null);
  }

  const ayTiming = (nn) => audio?.ayahs?.find((x) => x.n === nn);

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
    winRef.current = { stopped: false, startMs: s.from, endMs: e.to, repsLeft: repeat === 'inf' ? Infinity : repeat };
    a.playbackRate = speedRef.current;
    try { a.currentTime = s.from / 1000; } catch { /* wird beim Laden erneut gesetzt */ }
    playingIdxRef.current = startN - 1;
    setPlayingIdx(startN - 1);
    a.play().catch(() => stop());
  }
  const onAyahPlay = (idx) => {
    if (playingIdx === idx && !winRef.current.stopped) { stop(); return; }
    startFrom(idx);
  };
  // Ein Hauptknopf: startet die Wiedergabe (fortlaufend im Standardmodus) bzw.
  // stoppt sie. Im Bereichsmodus ab dem eingestellten Start.
  const primaryPlay = () => {
    if (playingIdx !== null && !winRef.current.stopped) { stop(); return; }
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
          <Card className="p-5 mb-4 text-center hero-atmosphere">
            <div className="font-arabic text-3xl text-ivory">{data.name}</div>
            <div className="text-xs text-sage-muted mt-2">
              Sure {data.number} · {data.ayahCount} Ayat{placeLabel(data.revelationType) ? ` · ${placeLabel(data.revelationType)}` : ''} · {data.translationName}
            </div>

            <div className="mt-4 flex flex-col gap-3 items-center text-xs text-sage">
              {/* Ansicht: Lernen (mit Übersetzung) / Mushaf (Seiten) / Tadschwid (farbig) */}
              <div className="inline-flex items-center gap-1 flex-wrap justify-center">
                <span className="text-sage-muted mr-1">Ansicht</span>
                {[['study', 'Lernen', BookOpenText], ['mushaf', 'Mushaf', ScrollText], ['tajweed', 'Tadschwid', Palette]].map(([v, l, Icon]) => (
                  <button key={v} onClick={() => (v === 'mushaf' ? onOpenPages(Number(n)) : chooseView(v))}
                    className={['px-2.5 py-1 rounded-md border inline-flex items-center gap-1', readMode === v ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage-muted'].join(' ')}>
                    <Icon size={13} />{l}
                  </button>
                ))}
              </div>

              {/* Primäre Wiedergabe: EIN klarer Abspiel-Knopf (läuft standardmäßig
                  fortlaufend weiter) + EIN Menü für alle weiteren Einstellungen. */}
              <div className="inline-flex items-center gap-2 flex-wrap justify-center">
                <Button size="sm" onClick={primaryPlay} disabled={!audio}>
                  {playingIdx !== null && !winRef.current.stopped ? <><Pause size={15} /> Stopp</> : <><Play size={15} /> Abspielen</>}
                </Button>
                <button onClick={() => setSettingsOpen((o) => !o)}
                  className={['inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border', settingsOpen ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage'].join(' ')}>
                  <SlidersHorizontal size={14} /> Wiedergabe <ChevronDown size={13} className={settingsOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                </button>
              </div>
              {audioErr ? (
                <button onClick={() => loadAudio(reciter)} className="text-[11px] text-status-absent inline-flex items-center gap-1">
                  <RotateCcw size={12} /> Audio erneut laden
                </button>
              ) : !audio ? (
                <p className="text-[11px] text-sage-muted">Rezitation wird vorbereitet …</p>
              ) : null}

              {/* Eingeklapptes Menü: Rezitator, Modus, Wiederholung, Tempo, Bereich */}
              {settingsOpen && (
                <div className="w-full max-w-md mt-1 rounded-xl border border-line bg-card/60 p-4 flex flex-col gap-3 items-center">
                  <label className="flex items-center gap-2">
                    <span className="text-sage-muted">Rezitator</span>
                    <select className="input py-1.5 w-auto text-sm" value={reciter} onChange={(e) => setReciter(e.target.value)}>
                      {(reciters.length ? reciters : [{ id: reciter, name: data.reciterName }]).map((r) => (
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
                  <p className="text-[11px] text-sage-muted max-w-xs text-center">
                    {mode === 'continuous' && 'Standard: läuft ab der getippten Ayah automatisch weiter bis zum Ende.'}
                    {mode === 'single' && 'Spielt nur die getippte Ayah.'}
                    {mode === 'range' && 'Spielt den eingestellten Bereich in Schleife – ideal zum Auswendiglernen.'}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {readMode === 'tajweed' ? (
            <Card className="p-5 sm:p-7">
              {/* Farb-Legende */}
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mb-5 text-[11px]">
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
                  <p dir="rtl" className="font-arabic text-ivory text-justify" style={{ fontSize: '1.95rem', lineHeight: 2.5 }}>
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
                  <p className="text-[11px] text-sage-muted mt-4 text-center">
                    Farben zeigen die Tadschwid-Regeln. Tippe auf eine Ayah zum Abspielen · <Link to="/tadschwid" className="text-mint-light hover:underline">Regeln erklärt</Link>
                  </p>
                </>
              )}
            </Card>
          ) : readMode === 'mushaf' ? (
            <Card className="p-5 sm:p-7">
              {data.bismillah && (
                <p dir="rtl" className="font-arabic text-2xl text-center text-sage mb-4">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
              )}
              <p dir="rtl" className="font-arabic text-ivory text-justify" style={{ fontSize: '1.9rem', lineHeight: 2.4 }}>
                {data.ayahs.map((a, idx) => (
                  <span
                    key={a.n}
                    id={`ayah-${a.n}`}
                    onClick={() => onAyahPlay(idx)}
                    className={`cursor-pointer rounded ${playingIdx === idx ? 'bg-mint/20' : ''}`}
                  >
                    {a.arabic}
                    <span className="text-mint mx-1 select-none" style={{ fontSize: '1.4rem' }}>﴿{toArabicNum(a.n)}﴾</span>{' '}
                  </span>
                ))}
              </p>
              <p className="text-[11px] text-sage-muted mt-4 text-center">Tippe auf eine Ayah, um sie abzuspielen. Für Übersetzung, Lesezeichen &amp; Notizen die Ansicht „Studieren" wählen.</p>
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
                  <p dir="rtl" className="font-arabic text-2xl leading-loose text-ivory mt-2">{a.arabic}</p>
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
const clampPage = (p) => Math.max(1, Math.min(604, p | 0));

function MushafReader({ initialSurah, initialPage, onBack, onMarksChanged }) {
  const toast = useToast();
  const [page, setPage] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reciter, setReciter] = useState('ar.alafasy');
  const [reciters, setReciters] = useState([]);
  const [speed, setSpeed] = useState(1);
  const [playingKey, setPlayingKey] = useState(null); // "surah:ayah"
  const [sheetKey, setSheetKey] = useState(null); // ausgewählte Ayah (Aktionsleiste)
  const [marked, setMarked] = useState(new Set()); // "s:a"
  const [tafsirEd, setTafsirEd] = useState('de');
  const [tafsir, setTafsir] = useState({}); // `${ed}:${s:a}` -> {…}
  const [showTafsir, setShowTafsir] = useState(false);
  const [jump, setJump] = useState('');

  const elRef = useRef(null); // einziges <audio>
  const audioCache = useRef(new Map()); // surah -> {url,ayahs}
  const winRef = useRef({ stopped: true });
  const speedRef = useRef(1);
  const playingKeyRef = useRef(null);
  useEffect(() => { playingKeyRef.current = playingKey; }, [playingKey]);
  useEffect(() => { speedRef.current = speed; if (elRef.current) elRef.current.playbackRate = speed; }, [speed]);

  useEffect(() => { api.get('/quran/reciters').then((d) => setReciters(d.reciters)).catch(() => {}); }, []);

  // Startseite bestimmen: explizite Seite -> Sure -> zuletzt -> 1.
  useEffect(() => {
    let cancel = false;
    (async () => {
      let p = initialPage ? clampPage(initialPage) : null;
      if (!p && initialSurah) {
        try { const r = await api.get(`/quran/surah-page/${initialSurah}`); p = clampPage(r.page); } catch { /* egal */ }
      }
      if (!p) { const saved = Number(localStorage.getItem('dbz-mushaf-page')); p = saved ? clampPage(saved) : 1; }
      if (!cancel) setPage(p);
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line
  }, []);

  // Lesezeichen laden (als Schlüssel-Set).
  useEffect(() => {
    api.get('/quran/me').then((m) => setMarked(new Set((m.bookmarks || []).map((b) => `${b.surah}:${b.ayah}`)))).catch(() => {});
  }, []);

  const loadPage = (p) => {
    setError(null); setData(null);
    api.get(`/quran/page/${p}`).then((d) => {
      setData(d.page);
      if (d.page?.surahs?.[0]) api.post('/quran/last-read', { surah: d.page.surahs[0] }).then(onMarksChanged).catch(() => {});
    }).catch((e) => setError(e.message));
  };
  useEffect(() => { if (page != null) { stopAudio(); setSheetKey(null); setShowTafsir(false); loadPage(page); localStorage.setItem('dbz-mushaf-page', String(page)); window.scrollTo?.({ top: 0 }); } /* eslint-disable-next-line */ }, [page]);
  useEffect(() => () => { const a = elRef.current; if (a) { a.onerror = null; a.ontimeupdate = null; a.pause(); a.src = ''; } }, []);
  // Rezitatorwechsel: Cache leeren, laufende Wiedergabe stoppen, Audioquelle
  // zurücksetzen (sonst behielte das Element die alte Rezitator-Datei).
  useEffect(() => { audioCache.current.clear(); stopAudio(); if (elRef.current) elRef.current.__surah = null; /* eslint-disable-next-line */ }, [reciter]);

  function stopAudio() { winRef.current.stopped = true; const a = elRef.current; if (a) a.pause(); playingKeyRef.current = null; setPlayingKey(null); }

  async function ensureAudio(surah) {
    if (audioCache.current.has(surah)) return audioCache.current.get(surah);
    const r = await api.get(`/quran/audio/${surah}?reciter=${reciter}`);
    audioCache.current.set(surah, r.audio);
    return r.audio;
  }

  function onTimeUpdate() {
    const a = elRef.current; const win = winRef.current;
    if (!a || win.stopped) return;
    const t = a.currentTime * 1000;
    const ay = win.ayahs; if (!ay) return;
    let cur = null;
    for (let k = 0; k < ay.length; k++) if (t >= ay[k].from && t < ay[k].to) { cur = ay[k].n; break; }
    if (cur == null && t >= ay[ay.length - 1].from) cur = ay[ay.length - 1].n;
    if (cur != null) { const key = `${win.surah}:${cur}`; if (key !== playingKeyRef.current) { playingKeyRef.current = key; setPlayingKey(key); } }
    if (t >= win.endMs - 15) stopAudio();
  }

  async function playFrom(verseKey) {
    const [s, a] = verseKey.split(':').map(Number);
    let ad;
    try { ad = await ensureAudio(s); } catch { toast.push('Audio konnte nicht geladen werden', 'error'); return; }
    const st = ad.ayahs.find((x) => x.n === a); const last = ad.ayahs[ad.ayahs.length - 1];
    if (!st || !last) { toast.push('Keine Audio-Zeitmarken für diese Ayah'); return; }
    let el = elRef.current;
    if (!el) { el = new Audio(); elRef.current = el; el.ontimeupdate = onTimeUpdate; el.onerror = () => stopAudio(); }
    if (el.__surah !== s) {
      el.__surah = s; el.src = ad.url;
      try { el.preservesPitch = true; el.mozPreservesPitch = true; el.webkitPreservesPitch = true; } catch { /* egal */ }
    }
    el.playbackRate = speedRef.current;
    winRef.current = { stopped: false, surah: s, ayahs: ad.ayahs, endMs: last.to };
    try { el.currentTime = st.from / 1000; } catch { /* egal */ }
    playingKeyRef.current = verseKey; setPlayingKey(verseKey);
    el.play().catch(() => stopAudio());
  }

  const tapWord = (verseKey) => { setSheetKey(verseKey); setShowTafsir(false); };
  const onPlaySheet = (verseKey) => { if (playingKey === verseKey && !winRef.current.stopped) stopAudio(); else playFrom(verseKey); };

  const toggleBookmark = async (verseKey) => {
    const [s, a] = verseKey.split(':').map(Number);
    try {
      await api.post('/quran/bookmarks', { surah: s, ayah: a });
      setMarked((prev) => { const n = new Set(prev); n.has(verseKey) ? n.delete(verseKey) : n.add(verseKey); return n; });
      onMarksChanged();
    } catch (err) { toast.push(err.message, 'error'); }
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

  // Sure-Kopf pro Zeile (erste Zeile, in der eine neue Sure beginnt).
  const headerByLine = {};
  if (data) {
    const placed = new Set();
    for (const line of data.lines) for (const w of line.words) {
      if (data.starts[w.v] && !placed.has(w.v)) { placed.add(w.v); (headerByLine[line.n] ||= []).push(data.starts[w.v]); }
    }
  }
  const goto = (p) => setPage(clampPage(p));
  const doJump = () => { const p = Number(jump); if (p >= 1 && p <= 604) { goto(p); setJump(''); } else toast.push('Seite 1–604 eingeben'); };

  return (
    <div>
      <button onClick={() => { stopAudio(); onBack(); }} className="inline-flex items-center gap-2 text-sm text-sage-muted hover:text-ivory mb-4">
        <ArrowLeft size={16} /> Zur Übersicht
      </button>

      {/* Navigationsleiste */}
      <Card className="p-3 mb-4">
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant="outline" onClick={() => goto(page - 1)} disabled={!page || page <= 1}><ChevronRight size={16} /> Zurück</Button>
          <div className="text-center">
            <div className="text-ivory text-sm font-medium">Seite {page || '…'}<span className="text-sage-muted"> / 604</span></div>
            {data?.juz && <div className="text-[11px] text-sage-muted">Juzʼ {data.juz}</div>}
          </div>
          <Button size="sm" variant="outline" onClick={() => goto(page + 1)} disabled={!page || page >= 604}>Weiter <ChevronLeft size={16} /></Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            <span className="text-sage-muted">Juzʼ</span>
            <select className="input py-1 w-auto text-sm" value="" onChange={(e) => e.target.value && goto(Number(e.target.value))}>
              <option value="">wählen</option>
              {JUZ_START_PAGE.map((p, i) => <option key={i} value={p}>{i + 1}</option>)}
            </select>
          </label>
          <div className="inline-flex items-center gap-1">
            <input value={jump} onChange={(e) => setJump(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doJump()}
              inputMode="numeric" placeholder="Seite" className="input py-1 w-20 text-center text-sm" />
            <Button size="sm" variant="ghost" onClick={doJump}>Los</Button>
          </div>
          <label className="flex items-center gap-1">
            <span className="text-sage-muted">Rezitator</span>
            <select className="input py-1 w-auto text-sm" value={reciter} onChange={(e) => setReciter(e.target.value)}>
              {(reciters.length ? reciters : [{ id: reciter, name: 'Mishary Al-Afasy' }]).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        </div>
      </Card>

      {error ? (
        <Card className="p-8 text-center">
          <p className="text-status-absent mb-4">{error}</p>
          <Button variant="outline" onClick={() => loadPage(page)}><RotateCcw size={16} /> Erneut versuchen</Button>
        </Card>
      ) : !data ? (
        <Spinner label="Mushaf-Seite wird geladen …" />
      ) : (
        <div className="mushaf-page rounded-2xl p-5 sm:p-8 font-mushaf" style={{ fontSize: 'clamp(1.35rem, 4.6vw, 1.9rem)' }}>
          {data.lines.map((line) => (
            <div key={line.n}>
              {(headerByLine[line.n] || []).map((h) => (
                <div key={h.surah} className="mushaf-surah-head">
                  <div className="text-mint" style={{ fontSize: '1.1em' }} dir="rtl">سُورَةُ {h.name}</div>
                  {h.bismillah && <div dir="rtl" className="mt-1" style={{ fontSize: '0.92em' }}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>}
                </div>
              ))}
              <p className={`mushaf-line ${line.words.length <= 4 || data.page === 1 ? 'is-short' : ''}`}>
                {line.words.map((w, i) => (
                  <span key={i} onClick={() => tapWord(w.v)}
                    className={`mushaf-word ${playingKey === w.v ? 'is-active' : ''} ${w.e ? 'mushaf-end' : ''} ${marked.has(w.v) && w.e ? 'underline decoration-mint/60' : ''}`}>
                    {w.t}{' '}
                  </span>
                ))}
              </p>
            </div>
          ))}
          <p className="text-[11px] text-sage-muted mt-6 text-center font-sans">Tippe auf ein Wort für Wiedergabe, Übersetzung, Tafsir &amp; Lesezeichen.</p>
        </div>
      )}

      {/* Aktionsleiste zur ausgewählten Ayah */}
      {sheetKey && (
        <Card className="p-4 mt-4 border-mint/40">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-ivory">Sure {sheetKey.split(':')[0]} · Ayah {sheetKey.split(':')[1]}</div>
            <button onClick={() => { setSheetKey(null); setShowTafsir(false); }} className="text-sage-muted hover:text-ivory" aria-label="Schließen"><X size={18} /></button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => onPlaySheet(sheetKey)}>
              {playingKey === sheetKey && !winRef.current.stopped ? <><Pause size={14} /> Stopp</> : <><Play size={14} /> Abspielen</>}
            </Button>
            <Button size="sm" variant={showTafsir ? 'primary' : 'outline'} onClick={() => (showTafsir ? setShowTafsir(false) : openTafsir(sheetKey))}>
              <FileText size={14} /> Tafsir &amp; Übersetzung
            </Button>
            <Button size="sm" variant="outline" onClick={() => toggleBookmark(sheetKey)}>
              {marked.has(sheetKey) ? <><BookmarkCheck size={14} /> Gemerkt</> : <><Bookmark size={14} /> Merken</>}
            </Button>
            <div className="inline-flex items-center gap-1 text-xs">
              <Gauge size={13} className="text-sage-muted" />
              {SPEEDS.map((s) => (
                <button key={s} onClick={() => setSpeed(s)}
                  className={['px-1.5 py-0.5 rounded border tabular-nums', speed === s ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage-muted'].join(' ')}>{spLabel(s)}</button>
              ))}
            </div>
          </div>
          {showTafsir && <TafsirPanel data={tafsir[`${tafsirEd}:${sheetKey}`]} edition={tafsirEd} onEdition={changeEd} />}
        </Card>
      )}
    </div>
  );
}
