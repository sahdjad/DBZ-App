import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Search, RotateCcw, Bookmark, BookmarkCheck, Trash2, BookOpenText, StickyNote, ScrollText, Palette, FileText, Gauge, ChevronLeft, ChevronRight, X, SlidersHorizontal, ChevronDown, ZoomIn, ZoomOut } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Spinner, useToast } from '../components/ui.jsx';
import { cleanQuran, toArabicNum } from '../lib/quranText.js';
import { ensurePageFont, isPageFontLoaded, useMushafAutoFit } from '../lib/mushafFont.js';
import PageScrubber from '../components/PageScrubber.jsx';
import HifzRecitationMode from './HifzRecitationMode.jsx';
import { HifzContent } from './Hifz.jsx';

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

// Tadschwid je WORT (Seitenansicht): quran.com liefert die Auszeichnung als
// <rule class=…>…</rule>. Nur echte Regel-Klassen bekommen eine Farbe; reine
// Darstellungs-Klassen (custom-…) bleiben ohne Farbe. Nur eigene <span>.
function tajweedWordToHtml(html) {
  return (html || '')
    .replace(/[۟۠]/g, '')
    .replace(/<rule class=["']?([a-z_-]+)["']?>/g, (m, cls) => {
      const c = TAJWEED_COLORS[cls];
      return c ? `<span style="color:${c}">` : '<span>';
    })
    .replace(/<\/rule>/g, '</span>')
    .replace(/<(?!\/?span)[^>]*>/g, '');
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

const QURAN_TABS = [
  ['lesen', 'Lesen'],
  ['auswendig', 'Auswendig rezitieren'],
  ['lernstand', 'Lernstand'],
];

export default function QuranReader() {
  const [tab, setTab] = useState('lesen');
  const [surahs, setSurahs] = useState(null);
  const [marks, setMarks] = useState(null);
  const [selected, setSelected] = useState(null); // { n, ayah }
  const [pageView, setPageView] = useState(null); // { page } | { surah } -> Mushaf-Seitenansicht

  const loadMarks = () => api.get('/quran/me').then(setMarks).catch(() => setMarks({ lastRead: null, bookmarks: [] }));
  useEffect(() => { api.get('/quran/surahs').then((d) => setSurahs(d.surahs)); loadMarks(); }, []);

  const openPages = (opts) => setPageView(opts || { page: null });

  return (
    <AppLayout title="Qur'an">
      <div className="flex items-center gap-2 mb-4 flex-wrap" role="tablist" aria-label="Qur'an-Bereich">
        {QURAN_TABS.map(([k, label]) => (
          <Button key={k} role="tab" aria-selected={tab === k} variant={tab === k ? 'primary' : 'outline'} size="sm" onClick={() => setTab(k)}>
            {label}
          </Button>
        ))}
      </div>

      {tab === 'lesen' && (
        pageView ? (
          <MushafReader initialSurah={pageView.surah || null} initialPage={pageView.page || null} initialTajweed={!!pageView.tajweed}
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

      {tab === 'auswendig' && <HifzRecitationMode surahs={surahs} />}
      {tab === 'lernstand' && <HifzContent />}
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
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
          <Card className="p-5 mb-4 text-center">
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
                  <p className="text-[11px] text-sage-muted max-w-xs text-center">
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
const clampPage = (p) => Math.max(1, Math.min(604, p | 0));

function MushafReader({ initialSurah, initialPage, initialTajweed, onBack, onMarksChanged }) {
  const toast = useToast();
  const [page, setPage] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reciter, setReciter] = useState('ar.alafasy');
  const [reciters, setReciters] = useState([]);
  const [speed, setSpeed] = useState(1);
  const [playingKey, setPlayingKey] = useState(null); // "surah:ayah"
  const [playingWord, setPlayingWord] = useState(null); // "surah:ayah#wortNr" (Mitlesen)
  const [sheetKey, setSheetKey] = useState(null); // ausgewählte Ayah (Aktionsleiste)
  const sheetRef = useRef(null);
  // Aktionsleiste sichtbar ins Bild scrollen -- auf dem Handy sonst hinter
  // der unteren Navigationsleiste "versteckt" (Nutzer muss sonst erst
  // erraten, dass darunter noch etwas ist).
  useEffect(() => { if (sheetKey && sheetRef.current) sheetRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }); }, [sheetKey]);
  const [marked, setMarked] = useState(new Set()); // "s:a"
  const [tafsirEd, setTafsirEd] = useState('de');
  const [tafsir, setTafsir] = useState({}); // `${ed}:${s:a}` -> {…}
  const [showTafsir, setShowTafsir] = useState(false);
  const [jump, setJump] = useState('');
  const [elPaused, setElPaused] = useState(false);
  const [tajweed, setTajweed] = useState(!!initialTajweed); // farbige Tadschwid-Seitenansicht
  const [fontReady, setFontReady] = useState(true); // Seitenschrift geladen?
  const [zoom, setZoom] = useState(() => { const z = Number(localStorage.getItem('dbz-mushaf-zoom')); return z >= 0.7 && z <= 3 ? z : 1; });
  useEffect(() => { try { localStorage.setItem('dbz-mushaf-zoom', String(zoom)); } catch { /* egal */ } }, [zoom]);
  const changeZoom = (d) => setZoom((z) => Math.max(0.7, Math.min(3, Math.round((z + d) * 100) / 100)));
  const [vvScale, setVvScale] = useState(1); // Finger-Zoom (Pinch) des Browsers
  useEffect(() => {
    const vv = window.visualViewport; if (!vv) return;
    const on = () => setVvScale(vv.scale || 1);
    vv.addEventListener('resize', on); vv.addEventListener('scroll', on); on();
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); };
  }, []);
  // Beim (Button- ODER Finger-)Zoomen wird geschoben/gescrollt statt geblättert.
  const zoomed = zoom > 1.001;
  const gestureZoom = zoomed || vvScale > 1.01;

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

  // Jedem echten Wort seine Wort-Nummer innerhalb der Ayah geben (für das
  // Mitlesen: Abgleich mit den Wort-Zeitmarken der Audiodatei). Endzeichen zählen nicht.
  const annotatedLines = useMemo(() => {
    if (!data) return [];
    const counter = {};
    return data.lines.map((line) => ({
      n: line.n,
      words: line.words.map((w) => {
        let wi = null;
        if (!w.e) { counter[w.v] = (counter[w.v] || 0) + 1; wi = counter[w.v]; }
        return { ...w, wi };
      }),
    }));
  }, [data]);

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

  // Audio der Sure(n) auf der Seite im Voraus laden -> beim Antippen kann play()
  // synchron im Klick laufen (wichtig für iOS/Safari), ohne Warten.
  const prefetchPageAudio = (sarr) => (sarr || []).forEach((su) => { ensureAudio(su).catch(() => {}); });

  const fontPageRef = useRef(null); // aktuell benötigte Seitenschrift (gegen Wettläufe)
  const pageDataCache = useRef(new Map()); // Seiten-Daten für flüssiges Blättern
  const fetchPageData = (p) => api.get(`/quran/page/${p}`).then((d) => { pageDataCache.current.set(p, d.page); return d.page; });
  // Nur eine Seite vorausladen (vorwärts, die häufigste Leserichtung) statt
  // beide Nachbarn, und ohne deren Audio gleich mitzuladen (das holt applyPage
  // nach, sobald diese Seite wirklich angezeigt wird). Rückmeldung nach
  // echtem Gerätetest: die ersten ein/zwei Seiten laden, danach bricht es ab
  // -- passt zu einem knappen Anfragelimit bei der kostenlosen, anonymen
  // quran.com-Anbindung, wenn mehrere Seiten gleichzeitig vorausgeladen
  // werden. Weniger gleichzeitige Anfragen senken das Risiko spürbar.
  const prefetchNeighbors = (p) => {
    const q = p + 1;
    if (q >= 1 && q <= 604 && !pageDataCache.current.has(q)) fetchPageData(q).catch(() => {});
  };
  const applyPage = (pg) => {
    setData(pg);
    prefetchPageAudio(pg?.surahs);
    if (pg?.font === 'v1') {
      fontPageRef.current = pg.fontPage;
      ensurePageFont(pg.fontPage); ensurePageFont(pg.fontPage - 1); ensurePageFont(pg.fontPage + 1); // (Nachbarn) vorladen
      // In der Tadschwid-Ansicht wird die farbige Schrift genutzt (keine
      // Glyphenschrift) -> kein Warten. Sonst erst zeigen, wenn Schrift da ist.
      if (tajweed || isPageFontLoaded(pg.fontPage)) setFontReady(true);
      else { setFontReady(false); ensurePageFont(pg.fontPage).then(() => { if (fontPageRef.current === pg.fontPage) setFontReady(true); }); }
    } else { fontPageRef.current = null; setFontReady(true); }
    if (pg?.surahs?.[0]) api.post('/quran/last-read', { surah: pg.surahs[0] }).then(onMarksChanged).catch(() => {});
  };
  // Schnelles Blättern/Springen: eine spät eintreffende Antwort für eine
  // bereits verlassene Seite darf die inzwischen angezeigte Seite nicht ersetzen.
  const pageReq = useRef(0);
  const loadPage = (p) => {
    setError(null);
    const cached = pageDataCache.current.get(p);
    if (cached) { applyPage(cached); prefetchNeighbors(p); return; }
    setData(null);
    const req = ++pageReq.current;
    fetchPageData(p)
      .then((pg) => { if (req === pageReq.current) { applyPage(pg); prefetchNeighbors(p); } })
      .catch((e) => { if (req === pageReq.current) setError(e.message); });
  };
  useEffect(() => { if (page != null) { stopAudio(); setSheetKey(null); setShowTafsir(false); loadPage(page); localStorage.setItem('dbz-mushaf-page', String(page)); window.scrollTo?.({ top: 0 }); } /* eslint-disable-next-line */ }, [page]);
  useEffect(() => () => { const a = elRef.current; if (a) { a.pause(); } }, []);
  // Rezitatorwechsel: Cache leeren, Wiedergabe stoppen, Quelle zurücksetzen,
  // Audio der aktuellen Seite erneut vorladen.
  useEffect(() => { audioCache.current.clear(); ayahAudioCache.current.clear(); stopAudio(); if (elRef.current) elRef.current.__surah = null; if (data && reciterMode === 'chapter') prefetchPageAudio(data.surahs); /* eslint-disable-next-line */ }, [reciter]);

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
  // Gut sichtbarer Abspiel-Knopf oben (statt nur über das Antippen eines
  // Wortes erreichbar -- auf dem Handy sonst schwer zu finden). Startet ab
  // der ersten Ayah dieser Seite bzw. pausiert/setzt fort, was schon läuft.
  const topPlay = () => {
    if (playingKey && !winRef.current.stopped) {
      const el = elRef.current;
      if (el) { if (elPaused) el.play().catch(() => {}); else el.pause(); }
      return;
    }
    if (data?.firstVerse) playFrom(data.firstVerse);
  };

  const tapWord = (verseKey) => { setSheetKey(verseKey); setShowTafsir(false); };
  const onPlaySheet = (verseKey) => {
    const el = elRef.current;
    if (playingKey === verseKey && !winRef.current.stopped) { if (el && !el.paused) el.pause(); else el?.play().catch(() => {}); return; }
    playFrom(verseKey);
  };

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

  // ---- Natürliches Umblättern per Wisch/Ziehen (wie ein Buch) --------------
  const pageElRef = useRef(null);

  // Passende Schriftgröße je Seite (Auto-Fit, geteilt mit dem Auswendig-Modus
  // -- siehe useMushafAutoFit): die breiteste Zeile soll die volle Breite
  // exakt ausfüllen (ohne Umbruch). So nutzt jede Seite die ganze Breite aus und
  // sieht auf jedem Gerät wie eine echte Mushaf-Seite aus.
  const canFit = !!(data && (tajweed || (data.font === 'v1' && isPageFontLoaded(data.fontPage))));
  const { fs: glyphFs, width: glyphW } = useMushafAutoFit(pageElRef, {
    active: canFit,
    numLines: data?.lines.length || 0,
    resetKey: data ? `${data.page}:${tajweed}:${fontReady}` : null,
  });

  const dragRef = useRef({ active: false, x0: 0, y0: 0, dx: 0, horiz: false });
  const flipDirRef = useRef(null); // 'next' | 'prev' – für die Einblend-Animation
  const reduceRef = useRef(false);
  useEffect(() => { reduceRef.current = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }, []);

  const pageWidth = () => pageElRef.current?.offsetWidth || 320;
  function setFlip(dx, animate) {
    const el = pageElRef.current; if (!el) return;
    el.style.transition = animate && !reduceRef.current ? 'transform .32s cubic-bezier(.22,.61,.36,1), box-shadow .32s' : 'none';
    const frac = Math.max(-1, Math.min(1, dx / pageWidth()));
    el.style.transformOrigin = dx < 0 ? 'left center' : 'right center';
    el.style.transform = `translateX(${dx}px) rotateY(${frac * -16}deg)`;
    el.style.boxShadow = Math.abs(frac) > 0.02 ? `0 24px 60px rgba(0,0,0,${0.12 + 0.3 * Math.abs(frac)})` : '';
  }
  function commitFlip(dir) {
    const el = pageElRef.current; const w = pageWidth();
    flipDirRef.current = dir;
    if (reduceRef.current) { goto(dir === 'next' ? page + 1 : page - 1); return; }
    el.style.transition = 'transform .28s ease-in, box-shadow .28s';
    // Arabisch (RTL): die nächste Seite blättert nach RECHTS hinaus.
    el.style.transformOrigin = dir === 'next' ? 'right center' : 'left center';
    el.style.transform = `translateX(${dir === 'next' ? w * 1.15 : -w * 1.15}px) rotateY(${dir === 'next' ? 24 : -24}deg)`;
    el.style.boxShadow = '0 24px 60px rgba(0,0,0,0.42)';
    setTimeout(() => goto(dir === 'next' ? page + 1 : page - 1), 230);
  }
  // Nach dem Seitenwechsel: neue Seite hereinziehen (Gegenrichtung).
  useEffect(() => {
    const el = pageElRef.current; if (!el || !data) return;
    const dir = flipDirRef.current; flipDirRef.current = null;
    if (!dir || reduceRef.current) { el.style.transition = 'none'; el.style.transform = ''; el.style.boxShadow = ''; return; }
    const w = el.offsetWidth || 320;
    el.style.transition = 'none';
    // RTL: die neue (nächste) Seite kommt von LINKS herein.
    el.style.transformOrigin = dir === 'next' ? 'left center' : 'right center';
    el.style.transform = `translateX(${dir === 'next' ? -w * 0.5 : w * 0.5}px) rotateY(${dir === 'next' ? -14 : 14}deg)`;
    el.style.boxShadow = '0 24px 60px rgba(0,0,0,0.28)';
    requestAnimationFrame(() => {
      el.style.transition = 'transform .3s cubic-bezier(.22,.61,.36,1), box-shadow .3s';
      el.style.transform = 'translateX(0) rotateY(0)'; el.style.boxShadow = '';
    });
  }, [data]);

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (gestureZoom) return; // beim (Finger-/Button-)Zoomen wird geschoben, nicht geblättert
    dragRef.current = { active: true, x0: e.clientX, y0: e.clientY, dx: 0, horiz: false, id: e.pointerId, t0: Date.now() };
    // Zeiger einfangen, damit die Wischgeste nicht an den Wort-Elementen verloren geht.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* egal */ }
  }
  function onPointerMove(e) {
    const d = dragRef.current; if (!d.active) return;
    const dx = e.clientX - d.x0; const dy = e.clientY - d.y0;
    if (!d.horiz) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.horiz = Math.abs(dx) > Math.abs(dy);
      if (!d.horiz) { d.active = false; return; } // vertikal -> normales Scrollen
    }
    let ddx = dx;
    // RTL: erste Seite -> Wischen nach links (prev) zäh; letzte Seite -> nach rechts (next) zäh.
    if ((page <= 1 && dx < 0) || (page >= 604 && dx > 0)) ddx = dx * 0.25;
    d.dx = ddx; setFlip(ddx, false);
  }
  function onPointerUp(e) {
    const d = dragRef.current; if (!d.active) return; d.active = false;
    try { if (e && d.id != null) e.currentTarget.releasePointerCapture(d.id); } catch { /* egal */ }
    if (!d.horiz) return;
    // Leichter auslösbar: kurze, schnelle Wischer (Flick) zählen auch.
    const fast = Date.now() - (d.t0 || 0) < 300 && Math.abs(d.dx) > 24;
    const threshold = Math.min(70, pageWidth() * 0.14);
    // Arabisch (RTL): nach RECHTS wischen -> nächste Seite; nach LINKS -> vorige.
    if ((d.dx >= threshold || (fast && d.dx > 0)) && page < 604) commitFlip('next');
    else if ((d.dx <= -threshold || (fast && d.dx < 0)) && page > 1) commitFlip('prev');
    else setFlip(0, true); // zurückfedern
  }

  // Glyphen nur nutzen, wenn die Seitenschrift wirklich geladen ist (sonst
  // würden wirre Ersatzzeichen erscheinen) – sonst lesbarer Text-Fallback.
  // In der Tadschwid-Ansicht wird stattdessen der farbige Text gezeigt.
  const glyph = !!(data && data.font === 'v1' && !tajweed && isPageFontLoaded(data.fontPage));
  const pageLayout = glyph || tajweed; // volle Seiten-Layout (Blocksatz, Auto-Fit, Zoom)
  const fontLoading = !!(data && data.font === 'v1' && !tajweed && !fontReady);

  return (
    <div>
      {/* Echtes <audio> im DOM (iOS/Safari-tauglich). */}
      <audio ref={elRef} preload="auto" playsInline className="hidden"
        onTimeUpdate={onTimeUpdate}
        onPlay={() => setElPaused(false)}
        onPause={() => { if (!winRef.current.stopped) setElPaused(true); }}
        onEnded={onAudioEnded}
        onError={() => { const a = elRef.current; if (a && a.getAttribute('src') && a.error) { toast.push('Audio-Fehler (Code ' + a.error.code + ')', 'error'); stopAudio(); } }} />
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
        <div className="mt-3 flex justify-center">
          <Button onClick={topPlay} disabled={!data}>
            {playingKey && !winRef.current.stopped && !elPaused ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Abspielen</>}
          </Button>
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
          {data?.font === 'v1' && (
            <div className="inline-flex items-center gap-1" title="Zoom">
              <button onClick={() => changeZoom(-0.15)} className="p-1.5 rounded-lg border border-line text-sage hover:bg-hover disabled:opacity-40" disabled={zoom <= 0.7} aria-label="Kleiner"><ZoomOut size={15} /></button>
              <button onClick={() => setZoom(1)} className="text-[11px] text-sage-muted tabular-nums w-11 text-center hover:text-ivory" title="Auf Bildschirmgröße zurücksetzen">{Math.round(zoom * 100)}%</button>
              <button onClick={() => changeZoom(0.15)} className="p-1.5 rounded-lg border border-line text-sage hover:bg-hover disabled:opacity-40" disabled={zoom >= 3} aria-label="Größer"><ZoomIn size={15} /></button>
            </div>
          )}
          <button onClick={() => setTajweed((t) => !t)}
            className={['inline-flex items-center gap-1 px-2.5 py-1 rounded-md border', tajweed ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage'].join(' ')}
            title="Tadschwid-Farben ein/aus">
            <Palette size={14} /> Tadschwid
          </button>
          <label className="flex items-center gap-1">
            <span className="text-sage-muted">Rezitator</span>
            <select className="input py-1 w-auto text-sm" value={reciter} onChange={(e) => setReciter(e.target.value)}>
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
          </label>
        </div>
      </Card>

      {tajweed && (
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mb-3 text-[11px]">
          {TAJWEED_LEGEND.map(([c, l]) => (
            <span key={l} className="inline-flex items-center gap-1 text-sage-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} /> {l}
            </span>
          ))}
        </div>
      )}

      {error ? (
        <Card className="p-8 text-center">
          <p className="text-status-absent mb-4">{error}</p>
          <Button variant="outline" onClick={() => loadPage(page)}><RotateCcw size={16} /> Erneut versuchen</Button>
        </Card>
      ) : !data || fontLoading ? (
        <Spinner label="Mushaf-Seite wird geladen …" />
      ) : (
        <div style={{ perspective: '1600px', touchAction: gestureZoom ? 'pan-x pan-y pinch-zoom' : 'pan-y pinch-zoom', overflowX: zoomed ? 'auto' : 'hidden', direction: zoomed ? 'rtl' : undefined }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <div ref={pageElRef} className={`mushaf-page rounded-2xl px-3 py-4 sm:px-7 sm:py-6 font-mushaf mx-auto ${pageLayout ? 'is-glyph' : ''}`}
          style={{
            fontSize: pageLayout ? (glyphFs ? `${glyphFs * zoom}px` : 'clamp(1.1rem, 4.2vw, 1.7rem)') : 'clamp(1.35rem, 4.6vw, 1.9rem)',
            width: pageLayout && glyphW ? `${glyphW * zoom}px` : undefined,
            maxWidth: pageLayout ? (zoomed ? 'none' : '100%') : '44rem',
            willChange: 'transform',
          }}>
          <div className="mushaf-lines">
            {annotatedLines.map((line) => (
              <div key={line.n} className="mushaf-line-wrap">
                {(headerByLine[line.n] || []).map((h) => (
                  <div key={h.surah} className="mushaf-surah-head">
                    <div className="text-mint" style={{ fontSize: '1.1em' }} dir="rtl">سُورَةُ {h.name}</div>
                    {h.bismillah && <div dir="rtl" className="mt-1" style={{ fontSize: '0.92em' }}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>}
                  </div>
                ))}
                <p className={`mushaf-line ${line.words.length <= 6 ? 'is-short' : ''}`}>
                  {line.words.map((w, i) => {
                    const cls = `mushaf-word ${playingWord === `${w.v}#${w.wi}` ? 'is-word-active' : playingKey === w.v ? 'is-active' : ''} ${w.e ? 'mushaf-end' : ''} ${marked.has(w.v) && w.e ? 'underline decoration-mint/60' : ''}`;
                    if (tajweed) {
                      return w.e
                        ? <span key={i} onClick={() => tapWord(w.v)} className={cls}>﴿{cleanQuran(w.t)}﴾</span>
                        : <span key={i} onClick={() => tapWord(w.v)} className={cls} dangerouslySetInnerHTML={{ __html: tajweedWordToHtml(w.tj) }} />;
                    }
                    return (
                      <span key={i} onClick={() => tapWord(w.v)}
                        style={glyph && w.g ? { fontFamily: `qcf-p${data.fontPage}` } : undefined}
                        className={cls}>
                        {glyph && w.g ? w.g : cleanQuran(w.t)}{glyph ? '' : ' '}
                      </span>
                    );
                  })}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-sage-muted mt-4 text-center font-sans">Zum Blättern wischen · tippe auf ein Wort für Wiedergabe, Übersetzung, Tafsir &amp; Lesezeichen.</p>
        </div>
        </div>
      )}

      {/* Aktionsleiste zur ausgewählten Ayah */}
      {sheetKey && (
        <div ref={sheetRef}>
        <Card className="p-4 mt-4 border-mint/40">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-ivory">Sure {sheetKey.split(':')[0]} · Ayah {sheetKey.split(':')[1]}</div>
            <button onClick={() => { setSheetKey(null); setShowTafsir(false); }} className="text-sage-muted hover:text-ivory" aria-label="Schließen"><X size={18} /></button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => onPlaySheet(sheetKey)}>
              {playingKey === sheetKey && !winRef.current.stopped
                ? (elPaused ? <><Play size={14} /> Weiter</> : <><Pause size={14} /> Pause</>)
                : <><Play size={14} /> Abspielen</>}
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
        </div>
      )}

      {/* Platz für die feste untere Seiten-Leiste (+ mobile Tab-Leiste darunter),
          damit sie den letzten Zeilen der Seite nichts verdeckt. Gemessen:
          Leiste 67px + mobile Tab-Leiste 65.5px = ~147px, mit Puffer h-40 (160px). */}
      {data && <div className="h-40 lg:h-20" aria-hidden="true" />}
      {data && <PageScrubber page={page} onNavigate={goto} />}
    </div>
  );
}
