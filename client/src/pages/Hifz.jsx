import { useEffect, useState } from 'react';
import { BookOpen, Plus, Star } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, StatusBadge, Ring, Spinner, useToast } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

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

function GoalCard({ g, surahs, onAttempt }) {
  const [open, setOpen] = useState(false);
  const last = g.lastAttempt;
  const rangeLabel = `${g.surahFromName} ${g.ayahFrom} – ${g.surahToName} ${g.ayahTo}`;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-ivory">{rangeLabel}</div>
          <div className="text-xs text-sage-muted">{GOAL_TYPES[g.goalType]} · {g.ayatCount} Ayat · fällig {fmt(g.dueAt)}</div>
        </div>
        <StatusBadge status={g.status === 'passed' ? 'passed' : 'open'} />
      </div>
      {last && (
        <div className="mt-2 text-xs text-sage-muted flex flex-wrap gap-3">
          {last.tajwid != null && <span>Tajwid {last.tajwid}</span>}
          {last.pronunciation != null && <span>Aussprache {last.pronunciation}</span>}
          {last.fluency != null && <span>Flüssigkeit {last.fluency}</span>}
          {last.memorization != null && <span>Hifz {last.memorization}</span>}
          {last.errorCount != null && <span>Fehler {last.errorCount}</span>}
          {last.note && <span className="text-sage">„{last.note}“</span>}
        </div>
      )}
      {onAttempt && (
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

function AttemptForm({ onSubmit, onCancel }) {
  const [f, setF] = useState({ tajwid: '', pronunciation: '', fluency: '', memorization: '', errorCount: '', passed: true, note: '' });
  return (
    <div className="rounded-lg border border-line p-3 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[['tajwid', 'Tajwid'], ['pronunciation', 'Aussprache'], ['fluency', 'Flüssigkeit'], ['memorization', 'Hifz'], ['errorCount', 'Fehler']].map(([k, l]) => (
          <label key={k} className="block">
            <span className="text-[11px] text-sage-muted">{l}</span>
            <input type="number" className="input py-1.5" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <label className="block">
        <span className="text-sm text-sage">Notiz</span>
        <input className="input mt-1" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </label>
      <label className="flex items-center gap-2 text-sm text-sage">
        <input type="checkbox" checked={f.passed} onChange={(e) => setF({ ...f, passed: e.target.checked })} /> Bestanden
      </label>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSubmit(f)}>Speichern</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Abbrechen</Button>
      </div>
    </div>
  );
}

function ProgressCard({ memorizedAyat }) {
  // 6236 Ayat im gesamten Qur'an (Hafs)
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

      {data && <ProgressCard memorizedAyat={data.summary.memorizedAyat} />}

      <div className="flex justify-end">
        <Button onClick={() => setShowForm((s) => !s)}><Plus size={18} /> Neues Ziel</Button>
      </div>
      {showForm && <GoalForm surahs={surahs} onSubmit={assign} onCancel={() => setShowForm(false)} />}

      {!data ? <Spinner /> : data.goals.length === 0 ? (
        <Card className="p-6 text-sage-muted">Noch keine Ziele für diesen Schüler.</Card>
      ) : data.goals.map((g) => <GoalCard key={g.id} g={g} surahs={surahs} onAttempt={attempt} />)}
    </div>
  );
}

function GoalForm({ surahs, onSubmit, onCancel }) {
  const [f, setF] = useState({ goalType: 'new_hifz', surahFrom: 114, ayahFrom: 1, surahTo: 114, ayahTo: 6, dueAt: '' });
  const submit = () => onSubmit({ ...f, dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : null });
  return (
    <Card className="p-5">
      <CardHeader title="Neues Qur'an-Ziel" icon={BookOpen} />
      <div className="p-4 space-y-3">
        <label className="block">
          <span className="text-sm text-sage">Art</span>
          <select className="input mt-1" value={f.goalType} onChange={(e) => setF({ ...f, goalType: e.target.value })}>
            {Object.entries(GOAL_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <SurahAyah label="Von" surahs={surahs} surah={f.surahFrom} ayah={f.ayahFrom} onSurah={(v) => setF({ ...f, surahFrom: v })} onAyah={(v) => setF({ ...f, ayahFrom: v })} />
          <SurahAyah label="Bis" surahs={surahs} surah={f.surahTo} ayah={f.ayahTo} onSurah={(v) => setF({ ...f, surahTo: v })} onAyah={(v) => setF({ ...f, ayahTo: v })} />
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

function SurahAyah({ label, surahs, surah, ayah, onSurah, onAyah }) {
  const s = surahs.find((x) => x.n === Number(surah));
  return (
    <div>
      <span className="text-sm text-sage">{label}</span>
      <select className="input mt-1" value={surah} onChange={(e) => onSurah(Number(e.target.value))}>
        {surahs.map((x) => <option key={x.n} value={x.n}>{x.n}. {x.name}</option>)}
      </select>
      <input type="number" min={1} max={s?.ayat || 300} className="input mt-1" value={ayah} onChange={(e) => onAyah(Number(e.target.value))} placeholder="Ayah" />
    </div>
  );
}

// --- Schüler / Eltern --------------------------------------------------------
function ReadView({ role, surahs }) {
  const [data, setData] = useState(null);
  const [children, setChildren] = useState([]);
  const [childId, setChildId] = useState('');

  useEffect(() => {
    if (role === 'eltern') api.get('/dashboard').then((d) => { setChildren(d.children || []); setChildId(d.children?.[0]?.id || ''); });
    else api.get('/quran-goals').then(setData);
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
          <ProgressCard memorizedAyat={data.summary.memorizedAyat} />
          {data.goals.length === 0 ? (
            <Card className="p-6 text-sage-muted">Noch keine Ziele.</Card>
          ) : data.goals.map((g) => <GoalCard key={g.id} g={g} surahs={surahs} />)}
        </>
      )}
    </div>
  );
}
