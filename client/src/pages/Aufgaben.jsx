import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Plus } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, StatusBadge, Spinner, useToast } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'offen');
const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];

export default function Aufgaben() {
  const { user } = useAuth();
  const isManager = MANAGER.includes(user.role);
  return (
    <AppLayout title="Aufgaben">{isManager ? <ManagerView /> : <StudentView />}</AppLayout>
  );
}

function StudentView() {
  const [list, setList] = useState(null);
  useEffect(() => {
    api.get('/assignments').then((d) => setList(d.assignments)).catch(() => setList([]));
  }, []);
  if (!list) return <Spinner />;
  if (!list.length) return <Card className="p-6 text-sage-muted">Aktuell sind keine Aufgaben zugewiesen.</Card>;
  return (
    <div className="space-y-3">
      {list.map((a) => (
        <Link key={a.id} to={`/aufgaben/${a.id}`}>
          <Card className="p-4 hover:bg-hover transition flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-ivory truncate">{a.title}</div>
              <div className="text-xs text-sage-muted">{a.subjectName || 'Aufgabe'} · {a.type} · Frist {fmt(a.dueAt)}</div>
            </div>
            <StatusBadge status={a.studentStatus} />
          </Card>
        </Link>
      ))}
    </div>
  );
}

function ManagerView() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ classId: '', title: '', description: '', subjectId: '', type: 'audio', dueAt: '' });

  const load = () => api.get('/assignments').then((d) => setList(d.assignments));
  useEffect(() => {
    load();
    api.get('/classes').then((d) => {
      setClasses(d.classes);
      setForm((f) => ({ ...f, classId: d.classes[0]?.id || '' }));
    });
    api.get('/subjects').then((d) => setSubjects(d.subjects));
  }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null };
      await api.post('/assignments', payload);
      toast.push('Aufgabe erstellt', 'success');
      setShowForm(false);
      setForm((f) => ({ ...f, title: '', description: '', dueAt: '' }));
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  if (!list) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm((s) => !s)}><Plus size={18} /> Neue Aufgabe</Button>
      </div>

      {showForm && (
        <Card className="p-5">
          <CardHeader title="Neue Hausaufgabe" icon={BookOpen} />
          <form onSubmit={create} className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Klasse">
                <select className="input" value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Fach">
                <select className="input" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                  <option value="">– Fach –</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Titel">
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </Field>
            <Field label="Beschreibung">
              <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Art">
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="audio">Audio</option>
                  <option value="text">Text</option>
                  <option value="file">Datei</option>
                  <option value="quran">Qur'an</option>
                  <option value="mixed">Gemischt</option>
                </select>
              </Field>
              <Field label="Frist">
                <input type="datetime-local" className="input" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Erstellen</Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Abbrechen</Button>
            </div>
          </form>
        </Card>
      )}

      {list.length === 0 ? (
        <Card className="p-6 text-sage-muted">Noch keine Aufgaben erstellt.</Card>
      ) : (
        list.map((a) => (
          <Card key={a.id} className="p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-ivory truncate">{a.title}</div>
              <div className="text-xs text-sage-muted">{a.className} · {a.subjectName || a.type} · Frist {fmt(a.dueAt)}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge tone="neutral">{a.submittedCount}/{a.targetCount} abgegeben</Badge>
              {a.pendingReview > 0 && <Badge tone="late">{a.pendingReview} offen</Badge>}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-sm text-sage">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
