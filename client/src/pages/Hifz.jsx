import { useEffect, useRef, useState } from 'react';
import { BookOpen, Plus, Mic, Square, Paperclip, Award, Send, Trash2 } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, StatusBadge, Ring, Spinner, useToast } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';
import { useRecorder, mmss } from '../lib/recorder.js';

const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];
const GOAL_TYPES = { new_hifz: 'Neu auswendig', murajaah: "Muraja'ah", consolidation: 'Festigung', test: 'Prüfung' };
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' }) : 'offen');

export default function Hifz() {
  const { user } = useAuth();
  const [surahs, setSurahs] = useState([]);
  useEffect(() => { api.get('/surahs').then((d) => setSurahs(d.surahs)); }, []);
  return (
    <AppLayout title="Hifz & Muraja'ah">
      {MANAGER.includes(user.role) ? <ManagerView surahs={surahs} /> : <ReadView role={user.role} surahs={surahs} />}
    </AppLayout>
  );
}

// Bereichs-Text: bei einer einzelnen Sure nur der Name, sonst „von – bis".
function rangeLabel(g) {
  if (g.surahFrom === g.surahTo) {
    const whole = g.ayahFrom === 1 && g.ayahTo - g.ayahFrom + 1 === g.ayatCount;
    return whole ? g.surahFromName : `${g.surahFromName} ${g.ayahFrom}–${g.ayahTo}`;
  }
  return `${g.surahFromName} – ${g.surahToName}`;
}

// Audio-Abgabe des Schülers – abspielbar für Schüler, Lehrkraft und Eltern.
function RecordingPlayer({ goalId, recording }) {
  if (!recording) return null;
  return (
    <div className="mt-3 rounded-lg border border-mint/25 bg-mint/[0.04] p-2.5">
      <div className="text-[11px] text-sage-muted mb-1">🎤 Audio-Abgabe · {fmt(recording.submittedAt)}</div>
      <audio controls preload="none" className="w-full" src={`/api/quran-goals/${goalId}/recording`} />
    </div>
  );
}

function GoalCard({ g, onAttempt, canGrade }) {
  const [open, setOpen] = useState(false);
  const last = g.lastAttempt;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-ivory">{rangeLabel(g)}</div>
          <div className="text-xs text-sage-muted">{GOAL_TYPES[g.goalType]} · {g.ayatCount} Ayat · fällig {fmt(g.dueAt)}</div>
        </div>
        <StatusBadge status={g.status === 'passed' ? 'passed' : 'open'} />
      </div>

      <RecordingPlayer goalId={g.id} recording={g.recording} />

      {last && (
        <div className="mt-2 text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
          {last.points != null && <span className="text-mint-light font-medium">{last.points}/10 Punkte</span>}
          {last.bonus ? <span className="inline-flex items-center gap-1 text-mint-light"><Award size={12} /> +{last.bonus}</span> : null}
          {last.feedback && <span className="text-sage">„{last.feedback}"</span>}
          {last.teacherName && <span className="text-sage-muted">· {last.teacherName}</span>}
        </div>
      )}

      {canGrade && (
        <div className="mt-3">
          {open ? (
            <AttemptForm onSubmit={async (payload) => { await onAttempt(g.id, payload); setOpen(false); }} onCancel={() => setOpen(false)} />
          ) : (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Rezitation bewerten</Button>
          )}
        </div>
      )}
    </Card>
  );
}

// Einfaches Bewertungsschema: Punkte, Extra-Punkte für Fleiß, Kritik, bestanden.
function AttemptForm({ onSubmit, onCancel }) {
  const [f, setF] = useState({ points: '', bonus: '', feedback: '', passed: true });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await onSubmit(f); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-lg border border-line p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] text-sage-muted">Punkte (0–10)</span>
          <input type="number" min={0} max={10} className="input py-1.5" value={f.points} onChange={(e) => setF({ ...f, points: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-[11px] text-sage-muted">Extra-Punkte (Fleiß, 0–5)</span>
          <input type="number" min={0} max={5} className="input py-1.5" value={f.bonus} onChange={(e) => setF({ ...f, bonus: e.target.value })} />
        </label>
      </div>
      <label className="block">
        <span className="text-sm text-sage">Kritik / Rückmeldung</span>
        <textarea rows={2} className="input mt-1" value={f.feedback} onChange={(e) => setF({ ...f, feedback: e.target.value })}
          placeholder="z. B. schöne Aussprache, achte auf das Madd bei …" />
      </label>
      <label className="flex items-center gap-2 text-sm text-sage">
        <input type="checkbox" checked={f.passed} onChange={(e) => setF({ ...f, passed: e.target.checked })} /> Bestanden
      </label>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy}>Speichern</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Abbrechen</Button>
      </div>
    </div>
  );
}

function ProgressCard({ memorizedAyat }) {
  const pct = Math.min(100, Math.round((memorizedAyat / 6236) * 100));
  return (
    <Card className="p-5 flex items-center gap-4">
      <Ring value={pct} size={84} stroke={8} label={`${pct}%`} sublabel="vom Qur'an" />
      <div>
        <div className="font-mono text-2xl text-mint-light">{memorizedAyat}</div>
        <div className="text-sm text-sage-muted">auswendige Ayat (bestätigt)</div>
      </div>
    </Card>
  );
}

// Mitarbeit (Rezitation): Punkte + Extra-Punkte – fließt in die Mitarbeitsnote.
function MitarbeitCard({ m }) {
  if (!m) return null;
  return (
    <Card className="p-5 flex items-center gap-4">
      <span className="grid place-items-center h-16 w-16 rounded-xl bg-mint/15 text-mint shrink-0"><Award size={26} /></span>
      <div>
        <div className="font-mono text-2xl text-mint-light">{m.total}<span className="text-base text-sage-muted"> Punkte</span></div>
        <div className="text-sm text-sage-muted">Mitarbeit (Rezitation) · {m.points} + {m.bonus} Extra · {m.count} Bewertungen</div>
      </div>
    </Card>
  );
}

// --- Schüler: Audio zu Hause aufnehmen/hochladen -----------------------------
function AudioSubmit({ goalId, onDone }) {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const rec = useRecorder((f, err) => { if (err) return toast.push(err.message, 'error'); if (f) setFile(f); });

  const send = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.upload(`/quran-goals/${goalId}/recording`, fd);
      toast.push('Audio abgegeben', 'success');
      setFile(null);
      onDone();
    } catch (err) { toast.push(err.message, 'error'); } finally { setBusy(false); }
  };

  if (rec.recording) {
    return (
      <div className="mt-3 flex items-center gap-3">
        <span className="flex items-center gap-2 text-status-absent text-sm"><span className="w-2.5 h-2.5 rounded-full bg-status-absent animate-pulse" /> Aufnahme … {mmss(rec.seconds)}</span>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={rec.cancel}>Abbrechen</Button>
        <Button size="sm" onClick={rec.stop}><Square size={15} /> Fertig</Button>
      </div>
    );
  }
  return (
    <div className="mt-3">
      <input ref={inputRef} type="file" accept="audio/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ''; }} />
      {file ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-sage inline-flex items-center gap-1">🎤 Aufnahme bereit</span>
          <Button size="sm" onClick={send} disabled={busy}><Send size={15} /> Abgeben</Button>
          <button className="text-sage-muted hover:text-status-absent" onClick={() => setFile(null)} aria-label="Verwerfen"><Trash2 size={16} /></button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={rec.start}><Mic size={15} /> Aufnehmen</Button>
          <Button size="sm" variant="ghost" onClick={() => inputRef.current?.click()}><Paperclip size={15} /> Datei</Button>
          <span className="text-[11px] text-sage-muted">Rezitation aufnehmen und abgeben – die Lehrkraft hört sie an.</span>
        </div>
      )}
    </div>
  );
}

// --- Lehrer ------------------------------------------------------------------
function ManagerView({ surahs }) {
  const toast = useToast();
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [data, setData] = useState(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { api.get('/classes').then((d) => { setClasses(d.classes); setClassId(d.classes[0]?.id || ''); }); }, []);
  useEffect(() => {
    if (classId) api.get(`/classes/${classId}/students`).then((d) => { setStudents(d.students); setStudentId(d.students[0]?.id || ''); });
  }, [classId]);
  const load = () => studentId && api.get(`/quran-goals?studentId=${studentId}`).then(setData);
  useEffect(() => { setData(null); load(); }, [studentId]);

  const assign = async (goal) => {
    try { await api.post('/quran-goals', { ...goal, studentId }); toast.push('Ziel zugewiesen', 'success'); setShowForm(false); load(); }
    catch (err) { toast.push(err.message, 'error'); }
  };
  const attempt = async (goalId, payload) => {
    try { await api.post(`/quran-goals/${goalId}/attempt`, payload); toast.push('Bewertung gespeichert', 'success'); load(); }
    catch (err) { toast.push(err.message, 'error'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {classes.length > 1 && (
          <select className="input w-auto" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <select className="input w-auto" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ProgressCard memorizedAyat={data.summary.memorizedAyat} />
          <MitarbeitCard m={data.summary.mitarbeit} />
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={() => setShowForm((s) => !s)}><Plus size={18} /> Neue Aufgabe</Button>
      </div>
      {showForm && <GoalForm surahs={surahs} onSubmit={assign} onCancel={() => setShowForm(false)} />}

      {!data ? <Spinner /> : data.goals.length === 0 ? (
        <Card className="p-6 text-sage-muted">Noch keine Aufgaben für diesen Schüler.</Card>
      ) : data.goals.map((g) => <GoalCard key={g.id} g={g} onAttempt={attempt} canGrade />)}
    </div>
  );
}

// Einfaches Formular: Art + Von/Bis (nur Sure) + Fälligkeit (optional).
function GoalForm({ surahs, onSubmit, onCancel }) {
  const [f, setF] = useState({ goalType: 'murajaah', surahFrom: 114, surahTo: 114, ayahFrom: '', ayahTo: '', dueAt: '' });
  const submit = () => {
    // Ayat optional: leer = ganze Sure (Ayah 1 bis letzte Ayah der Ziel-Sure).
    const toS = surahs.find((x) => x.n === Number(f.surahTo));
    onSubmit({
      goalType: f.goalType,
      surahFrom: Number(f.surahFrom),
      ayahFrom: f.ayahFrom ? Math.max(1, Number(f.ayahFrom)) : 1,
      surahTo: Number(f.surahTo),
      ayahTo: f.ayahTo ? Math.max(1, Number(f.ayahTo)) : (toS?.ayat || 1),
      dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : null,
    });
  };
  return (
    <Card className="p-5">
      <CardHeader title="Neue Aufgabe" subtitle="z. B. Sure An-Nas bis Al-Aʻla wiederholen" icon={BookOpen} />
      <div className="p-4 space-y-3">
        <label className="block">
          <span className="text-sm text-sage">Art</span>
          <select className="input mt-1" value={f.goalType} onChange={(e) => setF({ ...f, goalType: e.target.value })}>
            {Object.entries(GOAL_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-sage">Von (Sure)</span>
            <select className="input mt-1" value={f.surahFrom} onChange={(e) => setF({ ...f, surahFrom: Number(e.target.value) })}>
              {surahs.map((x) => <option key={x.n} value={x.n}>{x.n}. {x.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-sage">Bis (Sure)</span>
            <select className="input mt-1" value={f.surahTo} onChange={(e) => setF({ ...f, surahTo: Number(e.target.value) })}>
              {surahs.map((x) => <option key={x.n} value={x.n}>{x.n}. {x.name}</option>)}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-sage">ab Ayah (optional)</span>
            <input type="number" min={1} className="input mt-1" placeholder="ganze Sure" value={f.ayahFrom} onChange={(e) => setF({ ...f, ayahFrom: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm text-sage">bis Ayah (optional)</span>
            <input type="number" min={1} className="input mt-1" placeholder="ganze Sure" value={f.ayahTo} onChange={(e) => setF({ ...f, ayahTo: e.target.value })} />
          </label>
        </div>
        <label className="block">
          <span className="text-sm text-sage">Fällig bis (optional)</span>
          <input type="date" className="input mt-1" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} />
        </label>
        <div className="flex gap-2">
          <Button onClick={submit}>Zuweisen</Button>
          <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
        </div>
      </div>
    </Card>
  );
}

// --- Schüler / Eltern --------------------------------------------------------
function ReadView({ role }) {
  const [data, setData] = useState(null);
  const [children, setChildren] = useState([]);
  const [childId, setChildId] = useState('');
  const isStudent = role === 'schueler';

  const loadSelf = () => api.get('/quran-goals').then(setData);
  useEffect(() => {
    if (role === 'eltern') api.get('/dashboard').then((d) => { setChildren(d.children || []); setChildId(d.children?.[0]?.id || ''); });
    else loadSelf();
  }, []);
  useEffect(() => {
    if (role === 'eltern' && childId) { setData(null); api.get(`/quran-goals?studentId=${childId}`).then(setData); }
  }, [childId]);

  return (
    <div className="space-y-4">
      {role === 'eltern' && children.length > 0 && (
        <select className="input w-auto" value={childId} onChange={(e) => setChildId(e.target.value)}>
          {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      {!data ? <Spinner /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ProgressCard memorizedAyat={data.summary.memorizedAyat} />
            <MitarbeitCard m={data.summary.mitarbeit} />
          </div>
          {data.goals.length === 0 ? (
            <Card className="p-6 text-sage-muted">Noch keine Aufgaben.</Card>
          ) : data.goals.map((g) => (
            <div key={g.id}>
              <GoalCard g={g} />
              {isStudent && <div className="px-4 -mt-2 pb-1"><AudioSubmit goalId={g.id} onDone={loadSelf} /></div>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
