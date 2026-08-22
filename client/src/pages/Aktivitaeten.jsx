import { useEffect, useState } from 'react';
import { Gamepad2, Plus, Trash2, Star } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, Spinner, useToast } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];
const CATS = [['spiel', 'Spiel'], ['aktivitaet', 'Aktivität'], ['abgabe', 'Abgabe'], ['sonstiges', 'Sonstiges']];
const catLabel = (c) => (CATS.find(([k]) => k === c)?.[1] || c);
const fmt = (iso) => new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' });

export default function Aktivitaeten() {
  const { user } = useAuth();
  return <AppLayout title="Aktivitäten">{MANAGER.includes(user.role) ? <ManagerView /> : <ReadView />}</AppLayout>;
}

function ActivityRow({ a, onDelete }) {
  return (
    <div className="py-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-ivory">{a.title}</span>
          <Badge tone="neutral">{catLabel(a.category)}</Badge>
          {a.countsForGrade === false && <span className="text-[11px] text-sage-muted">zählt nicht zur Note</span>}
        </div>
        <div className="text-xs text-sage-muted mt-0.5">
          {fmt(a.createdAt)}{a.createdByName ? ` · ${a.createdByName}` : ''}{a.note ? ` · ${a.note}` : ''}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {a.percent != null ? (
          <span className="font-mono text-mint-light text-sm inline-flex items-center gap-1"><Star size={13} /> {a.points}/{a.maxPoints} · {a.percent}%</span>
        ) : (a.points != null ? <span className="font-mono text-ivory text-sm">{a.points} P.</span> : <span className="text-xs text-sage-muted">Teilnahme</span>)}
        {onDelete && <button onClick={() => onDelete(a.id)} className="text-status-absent p-1" aria-label="Löschen"><Trash2 size={15} /></button>}
      </div>
    </div>
  );
}

function ManagerView() {
  const toast = useToast();
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [items, setItems] = useState(null);
  const [form, setForm] = useState({ title: '', category: 'aktivitaet', points: '', maxPoints: '', countsForGrade: true, note: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/classes').then((d) => { setClasses(d.classes); setClassId(d.classes[0]?.id || ''); }); }, []);
  useEffect(() => { if (classId) api.get(`/classes/${classId}/students`).then((d) => { setStudents(d.students); setStudentId(d.students[0]?.id || ''); }); }, [classId]);
  const load = () => { if (studentId) api.get(`/activities?studentId=${studentId}`).then((d) => setItems(d.activities)); };
  useEffect(() => { setItems(null); load(); /* eslint-disable-next-line */ }, [studentId]);

  const add = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      await api.post('/activities', { studentId, ...form });
      setForm({ title: '', category: form.category, points: '', maxPoints: '', countsForGrade: true, note: '' });
      load();
      toast.push('Aktivität gespeichert', 'success');
    } catch (err) { toast.push(err.message, 'error'); }
    finally { setBusy(false); }
  };
  const del = async (id) => { try { await api.del(`/activities/${id}`); load(); } catch (err) { toast.push(err.message, 'error'); } };

  return (
    <div className="grid gap-4 lg:grid-cols-2 items-start">
      <Card className="p-5">
        <CardHeader title="Aktivität erfassen" subtitle="Spiele, Aktivitäten & Abgaben – fließen in den Leistungsstand ein" icon={Gamepad2} />
        <div className="p-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {classes.length > 1 && (
              <select className="input w-auto" value={classId} onChange={(e) => setClassId(e.target.value)}>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <select className="input w-auto flex-1" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <form onSubmit={add} className="space-y-3">
            <input className="input" placeholder="Titel (z. B. Vokabelspiel Runde 3)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <div className="flex gap-2 flex-wrap">
              <select className="input w-auto" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <input type="number" min={0} className="input w-24" placeholder="Punkte" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} />
              <span className="self-center text-sage-muted">/</span>
              <input type="number" min={0} className="input w-24" placeholder="max." value={form.maxPoints} onChange={(e) => setForm({ ...form, maxPoints: e.target.value })} />
            </div>
            <input className="input" placeholder="Notiz (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <label className="flex items-center gap-2 text-sm text-sage">
              <input type="checkbox" checked={form.countsForGrade} onChange={(e) => setForm({ ...form, countsForGrade: e.target.checked })} />
              Zählt zur Note (abwählen, z. B. für Freizeit/nicht Unterrichtsrelevantes)
            </label>
            <p className="text-[11px] text-sage-muted">Nur mit Punkten &amp; Maximum fließt eine Aktivität in den Notenvorschlag ein. Ohne Punkte gilt sie als reine Teilnahme.</p>
            <Button type="submit" disabled={busy || !studentId}><Plus size={18} /> Hinzufügen</Button>
          </form>
        </div>
      </Card>

      <Card className="p-5">
        <CardHeader title="Erfasste Aktivitäten" icon={Star} />
        <div className="p-4">
          {!items ? <Spinner /> : items.length === 0 ? (
            <p className="text-sage-muted text-sm">Noch keine Aktivitäten für diesen Schüler.</p>
          ) : (
            <div className="divide-y divide-line">{items.map((a) => <ActivityRow key={a.id} a={a} onDelete={del} />)}</div>
          )}
        </div>
      </Card>
    </div>
  );
}

function ReadView() {
  const [items, setItems] = useState(null);
  useEffect(() => { api.get('/activities').then((d) => setItems(d.activities)).catch(() => setItems([])); }, []);
  if (!items) return <Spinner />;
  if (!items.length) return <Card className="p-6 text-sage-muted text-sm">Noch keine Aktivitäten erfasst.</Card>;
  return (
    <Card className="p-5">
      <CardHeader title="Meine Aktivitäten" subtitle="Spiele, Aktivitäten & Abgaben" icon={Gamepad2} />
      <div className="p-4 divide-y divide-line">{items.map((a) => <ActivityRow key={a.id} a={a} />)}</div>
    </Card>
  );
}
