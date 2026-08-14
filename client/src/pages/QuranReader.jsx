import { useEffect, useRef, useState } from 'react';
import { Book, ArrowLeft, Play, Pause, Search, RotateCcw, Bookmark, BookmarkCheck, Trash2, BookOpenText } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Spinner, useToast } from '../components/ui.jsx';

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
          <div className="divide-y divide-black/5">
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

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-sage-muted" />
        <input className="input pl-9" placeholder="Sure suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {filtered.map((s) => (
          <button key={s.n} onClick={() => onSelect(s.n)}
            className="flex items-center gap-3 rounded-xl border border-black/10 bg-card p-3 hover:bg-hover transition text-left">
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

function SurahView({ n, targetAyah, onBack, onMarksChanged }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [repeat, setRepeat] = useState(1);
  const [playing, setPlaying] = useState(null);
  const [marked, setMarked] = useState(new Set()); // Ayah-Nummern mit Lesezeichen
  const audioRef = useRef(null);
  const remainingRef = useRef(0);

  const load = () => {
    setError(null); setData(null);
    api.get(`/quran/surah/${n}`).then((d) => setData(d.surah)).catch((e) => setError(e.message));
  };
  useEffect(() => {
    load();
    stop();
    api.post('/quran/last-read', { surah: n }).then(onMarksChanged).catch(() => {});
    api.get('/quran/me').then((m) => setMarked(new Set(m.bookmarks.filter((b) => b.surah === Number(n)).map((b) => b.ayah)))).catch(() => {});
    // eslint-disable-next-line
  }, [n]);

  // Zu gemerkter Ayah springen
  useEffect(() => {
    if (data && targetAyah) {
      const el = document.getElementById(`ayah-${targetAyah}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [data, targetAyah]);

  function stop() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    remainingRef.current = 0; setPlaying(null);
  }
  const play = (idx, url) => {
    if (!url) return;
    if (playing === idx) { stop(); return; }
    stop();
    const audio = new Audio(url);
    audioRef.current = audio; remainingRef.current = repeat;
    audio.onended = () => {
      remainingRef.current -= 1;
      if (remainingRef.current > 0 && audioRef.current === audio) { audio.currentTime = 0; audio.play(); }
      else setPlaying(null);
    };
    audio.onerror = () => { toast.push('Audio konnte nicht geladen werden', 'error'); setPlaying(null); };
    audio.play().then(() => setPlaying(idx)).catch(() => setPlaying(null));
  };
  useEffect(() => () => stop(), []);

  const toggleBookmark = async (ayah) => {
    try {
      await api.post('/quran/bookmarks', { surah: Number(n), ayah });
      setMarked((prev) => { const s = new Set(prev); s.has(ayah) ? s.delete(ayah) : s.add(ayah); return s; });
      onMarksChanged();
    } catch (err) { toast.push(err.message, 'error'); }
  };

  return (
    <div>
      <button onClick={() => { stop(); onBack(); }} className="inline-flex items-center gap-2 text-sm text-sage-muted hover:text-ivory mb-4">
        <ArrowLeft size={16} /> Alle Suren
      </button>

      {error ? (
        <Card className="p-8 text-center">
          <p className="text-status-absent mb-4">{error}</p>
          <Button variant="outline" onClick={load}><RotateCcw size={16} /> Erneut versuchen</Button>
        </Card>
      ) : !data ? (
        <Spinner label="Sure wird geladen …" />
      ) : (
        <>
          <Card className="p-5 mb-4 text-center hero-atmosphere">
            <div className="font-arabic text-3xl text-ivory">{data.name}</div>
            <div className="text-xs text-sage-muted mt-2">{data.ayahCount} Ayat · {data.translationName} · Rezitation: {data.reciterName}</div>
            <div className="mt-3 inline-flex items-center gap-2 text-xs text-sage">
              Wiederholung:
              {[1, 3, 5, 10].map((r) => (
                <button key={r} onClick={() => setRepeat(r)}
                  className={['px-2 py-1 rounded-md border', repeat === r ? 'border-mint bg-mint/10 text-mint-light' : 'border-white/15 text-sage-muted'].join(' ')}>{r}×</button>
              ))}
            </div>
          </Card>

          <div className="space-y-3">
            {data.ayahs.map((a, idx) => (
              <Card key={a.n} id={`ayah-${a.n}`} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid place-items-center h-7 w-7 rounded-full bg-mint/15 text-mint font-mono text-xs shrink-0">{a.n}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => toggleBookmark(a.n)} className={marked.has(a.n) ? 'text-mint-light' : 'text-sage-muted hover:text-ivory'} aria-label="Lesezeichen">
                      {marked.has(a.n) ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
                    </button>
                    {a.audio && (
                      <button onClick={() => play(idx, a.audio)} className="text-mint hover:text-mint-light" aria-label="Abspielen">
                        {playing === idx ? <Pause size={20} /> : <Play size={20} />}
                      </button>
                    )}
                  </div>
                </div>
                <p dir="rtl" className="font-arabic text-2xl leading-loose text-ivory mt-2">{a.arabic}</p>
                {a.translation && <p className="text-sage text-sm mt-3">{a.translation}</p>}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
