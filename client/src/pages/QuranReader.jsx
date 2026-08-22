import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Search, RotateCcw, Bookmark, BookmarkCheck, Trash2, BookOpenText, StickyNote, ScrollText, Palette, FileText, Gauge } from 'lucide-react';
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
  const EDS = [['saadi', 'as-Saʿdī · عربي'], ['ibnkathir', 'Ibn Kathīr · EN']];
  return (
    <div className="mt-3 rounded-lg border border-mint/25 bg-mint/[0.04] p-3">
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        <span className="text-xs text-sage-muted mr-1 inline-flex items-center gap-1"><FileText size={13} /> Tafsir</span>
        {EDS.map(([k, l]) => (
          <button key={k} onClick={() => onEdition(k)}
            className={['text-[11px] px-2 py-0.5 rounded-md border', edition === k ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage-muted'].join(' ')}>{l}</button>
        ))}
      </div>
      {!data || data.loading ? (
        <p className="text-sm text-sage-muted">Wird geladen …</p>
      ) : data.error ? (
        <p className="text-sm text-status-absent">{data.error}</p>
      ) : (
        <div dir={data.dir || 'ltr'} className={`text-sm whitespace-pre-line ${data.dir === 'rtl' ? 'font-arabic text-lg leading-loose text-ivory' : 'text-sage'}`}>
          {data.text || 'Kein Tafsir zu dieser Ayah.'}
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

  const loadMarks = () => api.get('/quran/me').then(setMarks).catch(() => setMarks({ lastRead: null, bookmarks: [] }));
  useEffect(() => { api.get('/quran/surahs').then((d) => setSurahs(d.surahs)); loadMarks(); }, []);

  return (
    <AppLayout title="Qur'an">
      {selected ? (
        <SurahView n={selected.n} targetAyah={selected.ayah} onBack={() => { setSelected(null); loadMarks(); }} onMarksChanged={loadMarks} />
      ) : (
        <SurahList surahs={surahs} marks={marks} onSelect={(n, ayah) => setSelected({ n, ayah: ayah || null })} onMarksChanged={loadMarks} />
      )}
    </AppLayout>
  );
}

function SurahList({ surahs, marks, onSelect, onMarksChanged }) {
  const [q, setQ] = useState('');
  if (!surahs) return <Spinner />;
  const filtered = surahs.filter((s) => `${s.n} ${s.name}`.toLowerCase().includes(q.toLowerCase()));

  const delBookmark = async (id) => { await api.del(`/quran/bookmarks/${id}`); onMarksChanged(); };

  return (
    <div className="space-y-4">
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

// Abspielgeschwindigkeiten (Standard 1×). Tonhöhe bleibt dank preservesPitch
// natürlich. Deutsche Schreibweise mit Komma.
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const spLabel = (s) => `${String(s).replace('.', ',')}×`;

function SurahView({ n, targetAyah, onBack, onMarksChanged }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reciters, setReciters] = useState([]);
  const [reciter, setReciter] = useState('ar.alafasy');
  const [audio, setAudio] = useState(null); // { url, ayahs:[{n,from,to}] }
  const [audioErr, setAudioErr] = useState(null);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState('single'); // single | continuous | range
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
  // Rezitator gewechselt -> nur Audio neu laden (Text bleibt).
  useEffect(() => { stop(); loadAudio(reciter); /* eslint-disable-next-line */ }, [reciter]);

  useEffect(() => {
    if (data && targetAyah) {
      const el = document.getElementById(`ayah-${targetAyah}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [data, targetAyah]);

  // Audio-Element aufbauen, sobald die Sure-Datei bekannt ist. Ein einziges
  // Element wird über die gesamte Sure wiederverwendet.
  useEffect(() => {
    if (!audio?.url) return undefined;
    const a = new Audio();
    a.preload = 'auto';
    try { a.preservesPitch = true; a.mozPreservesPitch = true; a.webkitPreservesPitch = true; } catch { /* egal */ }
    a.playbackRate = speedRef.current;
    a.src = audio.url;
    a.ontimeupdate = onTimeUpdate;
    a.onerror = () => { setAudioErr('Audio konnte nicht geladen werden.'); stop(); };
    audioRef.current = a;
    return () => { a.pause(); a.ontimeupdate = null; a.src = ''; if (audioRef.current === a) audioRef.current = null; };
    // eslint-disable-next-line
  }, [audio?.url]);
  useEffect(() => () => { const a = audioRef.current; if (a) { a.pause(); a.src = ''; } }, []);

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
      .then(({ tafsir: d }) => setTafsir((t) => ({ ...t, [k]: { text: stripHtml(d.text), dir: d.dir, name: d.editionName } })))
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
              {/* Rezitator */}
              <label className="flex items-center gap-2">
                <span className="text-sage-muted">Rezitator</span>
                <select className="input py-1.5 w-auto text-sm" value={reciter} onChange={(e) => setReciter(e.target.value)}>
                  {(reciters.length ? reciters : [{ id: reciter, name: data.reciterName }]).map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </label>

              {/* Ansicht: Lernen (mit Übersetzung) / Mushaf (Lesen) / Tadschwid (farbig) */}
              <div className="inline-flex items-center gap-1 flex-wrap justify-center">
                <span className="text-sage-muted mr-1">Ansicht</span>
                {[['study', 'Lernen', BookOpenText], ['mushaf', 'Mushaf', ScrollText], ['tajweed', 'Tadschwid', Palette]].map(([v, l, Icon]) => (
                  <button key={v} onClick={() => chooseView(v)}
                    className={['px-2.5 py-1 rounded-md border inline-flex items-center gap-1', readMode === v ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage-muted'].join(' ')}>
                    <Icon size={13} />{l}
                  </button>
                ))}
              </div>

              {/* Modus */}
              <div className="inline-flex items-center gap-1">
                {MODES.map(([v, l]) => (
                  <button key={v} onClick={() => setMode(v)}
                    className={['px-2.5 py-1 rounded-md border', mode === v ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage-muted'].join(' ')}>{l}</button>
                ))}
              </div>

              {/* Wiederholung */}
              <div className="inline-flex items-center gap-1">
                <span className="text-sage-muted mr-1">Wiederholung</span>
                {REPEATS.map((r) => (
                  <button key={r} onClick={() => setRepeat(r)}
                    className={['px-2 py-1 rounded-md border', repeat === r ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage-muted'].join(' ')}>{repLabel(r)}</button>
                ))}
              </div>

              {/* Geschwindigkeit (Tonhöhe bleibt natürlich) */}
              <div className="inline-flex items-center gap-1 flex-wrap justify-center">
                <span className="text-sage-muted mr-1 inline-flex items-center gap-1"><Gauge size={13} /> Tempo</span>
                {SPEEDS.map((s) => (
                  <button key={s} onClick={() => setSpeed(s)}
                    className={['px-2 py-1 rounded-md border tabular-nums', speed === s ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage-muted'].join(' ')}>{spLabel(s)}</button>
                ))}
              </div>

              {/* Bereich */}
              {mode === 'range' && (
                <div className="inline-flex items-center gap-2 flex-wrap justify-center">
                  <span className="text-sage-muted">von</span>
                  <input type="number" min={1} max={data.ayahCount} className="input py-1 w-16 text-center" value={range.from}
                    onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
                  <span className="text-sage-muted">bis</span>
                  <input type="number" min={1} max={data.ayahCount} className="input py-1 w-16 text-center" value={range.to}
                    onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
                  <Button size="sm" onClick={() => startFrom((Math.max(1, Number(range.from) || 1)) - 1)}>
                    {playingIdx !== null ? <><Pause size={14} /> Läuft…</> : <><Play size={14} /> Abspielen</>}
                  </Button>
                </div>
              )}
              {mode !== 'range' && (
                <div className="inline-flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => startFrom(0)}><Play size={14} /> Ab Anfang</Button>
                  {playingIdx !== null && <Button size="sm" variant="ghost" onClick={stop}><Pause size={14} /> Stopp</Button>}
                </div>
              )}
              <p className="text-[11px] text-sage-muted max-w-xs">
                {mode === 'single' && 'Spielt nur die getippte Ayah.'}
                {mode === 'continuous' && 'Läuft ab der getippten Ayah automatisch weiter bis zum Ende.'}
                {mode === 'range' && 'Spielt den Bereich in Schleife – ideal zum Auswendiglernen.'}
              </p>
              {audioErr ? (
                <button onClick={() => loadAudio(reciter)} className="text-[11px] text-status-absent inline-flex items-center gap-1">
                  <RotateCcw size={12} /> Audio erneut laden
                </button>
              ) : !audio ? (
                <p className="text-[11px] text-sage-muted">Rezitation wird vorbereitet …</p>
              ) : null}
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
