import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Search, RotateCcw, Bookmark, BookmarkCheck, Trash2, BookOpenText, StickyNote, ScrollText, Palette, FileText } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Spinner, useToast } from '../components/ui.jsx';

const toArabicNum = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

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

function SurahView({ n, targetAyah, onBack, onMarksChanged }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reciters, setReciters] = useState([]);
  const [reciter, setReciter] = useState('ar.alafasy');
  const [mode, setMode] = useState('single'); // single | continuous | range
  const [repeat, setRepeat] = useState(1);
  const [range, setRange] = useState({ from: 1, to: 7 });
  const [playingIdx, setPlayingIdx] = useState(null);
  const [marked, setMarked] = useState(new Set());
  const [notes, setNotes] = useState({}); // ayah -> Notiztext
  const [readMode, setReadMode] = useState('study'); // study | mushaf
  const [tafsirOpen, setTafsirOpen] = useState(null); // Ayah-Nummer
  const [tafsirEd, setTafsirEd] = useState('saadi'); // saadi | ibnkathir
  const [tafsir, setTafsir] = useState({}); // `${ed}:${ayah}` -> {loading|text|error}
  const audioRef = useRef(null);
  const stateRef = useRef({ stopped: true, start: 0, end: 0, left: 0 });

  useEffect(() => { api.get('/quran/reciters').then((d) => setReciters(d.reciters)).catch(() => {}); }, []);

  const load = (rec) => {
    setError(null); setData(null);
    api.get(`/quran/surah/${n}?reciter=${rec || reciter}`)
      .then((d) => { setData(d.surah); setRange({ from: 1, to: d.surah.ayahCount }); })
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    stop(); load(reciter);
    api.post('/quran/last-read', { surah: n }).then(onMarksChanged).catch(() => {});
    api.get('/quran/me').then((m) => {
      const mine = m.bookmarks.filter((b) => b.surah === Number(n));
      setMarked(new Set(mine.map((b) => b.ayah)));
      setNotes(Object.fromEntries(mine.filter((b) => b.note).map((b) => [b.ayah, b.note])));
    }).catch(() => {});
    // eslint-disable-next-line
  }, [n]);
  // Rezitator gewechselt -> neu laden
  useEffect(() => { if (data) { stop(); load(reciter); } /* eslint-disable-next-line */ }, [reciter]);

  useEffect(() => {
    if (data && targetAyah) {
      const el = document.getElementById(`ayah-${targetAyah}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [data, targetAyah]);

  function stop() {
    stateRef.current.stopped = true;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.onended = null; audioRef.current = null; }
    setPlayingIdx(null);
  }
  useEffect(() => () => stop(), []);

  function playIdx(i) {
    const st = stateRef.current;
    const ay = data.ayahs[i];
    if (!ay?.audio) { // fehlende Audio überspringen
      if (i < st.end) return playIdx(i + 1);
      return afterRun();
    }
    const audio = new Audio(ay.audio);
    audioRef.current = audio;
    setPlayingIdx(i);
    audio.onended = () => {
      if (st.stopped || audioRef.current !== audio) return;
      if (i < st.end) playIdx(i + 1);
      else afterRun();
    };
    audio.onerror = () => { toast.push('Audio konnte nicht geladen werden', 'error'); stop(); };
    audio.play().catch(() => stop());
  }
  function afterRun() {
    const st = stateRef.current;
    if (st.left === Infinity || st.left > 1) { if (st.left !== Infinity) st.left -= 1; playIdx(st.start); }
    else stop();
  }
  function startFrom(idx) {
    stop();
    let start = idx, end = idx;
    if (mode === 'continuous') { start = idx; end = data.ayahs.length - 1; }
    else if (mode === 'range') {
      const f = Math.max(1, Math.min(Number(range.from) || 1, data.ayahCount));
      const t = Math.max(f, Math.min(Number(range.to) || f, data.ayahCount));
      start = f - 1; end = t - 1;
    }
    stateRef.current = { stopped: false, start, end, left: repeat === 'inf' ? Infinity : repeat };
    playIdx(start);
  }
  const onAyahPlay = (idx) => {
    if (playingIdx === idx && !stateRef.current.stopped) { stop(); return; }
    startFrom(mode === 'range' ? (Math.max(1, Number(range.from) || 1) - 1) : idx);
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

  const MODES = [['single', 'Einzeln'], ['continuous', 'Weiterlaufen'], ['range', 'Bereich']];

  return (
    <div>
      <button onClick={() => { stop(); onBack(); }} className="inline-flex items-center gap-2 text-sm text-sage-muted hover:text-ivory mb-4">
        <ArrowLeft size={16} /> Alle Suren
      </button>

      {error ? (
        <Card className="p-8 text-center">
          <p className="text-status-absent mb-4">{error}</p>
          <Button variant="outline" onClick={() => load(reciter)}><RotateCcw size={16} /> Erneut versuchen</Button>
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

              {/* Ansicht: Studieren (mit Übersetzung) / Mushaf (nur Arabisch) */}
              <div className="inline-flex items-center gap-1">
                <span className="text-sage-muted mr-1">Ansicht</span>
                {[['study', 'Studieren'], ['mushaf', 'Mushaf']].map(([v, l]) => (
                  <button key={v} onClick={() => setReadMode(v)}
                    className={['px-2.5 py-1 rounded-md border inline-flex items-center gap-1', readMode === v ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage-muted'].join(' ')}>
                    {v === 'mushaf' ? <ScrollText size={13} /> : <BookOpenText size={13} />}{l}
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
            </div>
          </Card>

          {readMode === 'mushaf' ? (
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
                      {a.audio && (
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
