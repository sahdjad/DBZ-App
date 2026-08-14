import { useEffect, useState } from 'react';
import { Sparkles, Plus, ThumbsUp, AlertTriangle } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, Spinner, useToast } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];
const fmt = (iso) => new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' });

export default function Verhalten() {
  const { user } = useAuth();
  return (
    <AppLayout title="Verhalten & Tarbiyah">
      {MANAGER.includes(user.role) ? <ManagerView /> : <ReadView role={user.role} />}
    </AppLayout>
  );
}

function ToneIcon({ tone }) {
  return tone === 'negative' ? (
    <AlertTriangle size={16} className="text-status-late" />
  ) : (
    <ThumbsUp size={16} className="text-status-present" />
  );
}

function RecordList({ records, showStudent }) {
  if (!records) return <Spinner />;
  if (records.length === 0) return <p className="p-4 text-sage-muted text-sm">Noch keine Vermerke.</p>;
  return (
    <div className="divide-y divide-white/5">
      {records.map((r) => (
        <div key={r.id} className="py-3 flex items-start gap-3">
          <ToneIcon tone={r.tone} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {showStudent && <span className="text-ivory">{r.studentName}</span>}
              <Badge tone="neutral">{r.categoryLabel || r.category}</Badge>
              <span className="text-xs text-sage-muted">{fmt(r.createdAt)}</span>
            </div>
            <p className="text-sage text-sm mt-1">{r.note}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function useCategories() {
  const [cats, setCats] = useState([]);
  useEffect(() => { api.get('/behavior-categories').then((d) => setCats(d.categories)); }, []);
  return cats;
}
const labelFor = (cats, id) => cats.find((c) => c.id === id)?.label || id;

function ManagerView() {
  const toast = useToast();
  const cats = useCategories();
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState(null);
  const [form, setForm] = useState({ studentId: '', category: 'adab', tone: 'positive', note: '', visibleToStudent: true, visibleToParent: true });

  useEffect(() => {
    api.get('/classes').then((d) => {
      setClasses(d.classes);
      setClassId(d.classes[0]?.id || '');
    });
  }, []);
  useEffect(() => {
    if (!classId) return;
    api.get(`/classes/${classId}/students`).then((d) => {
      setStudents(d.students);
      setForm((f) => ({ ...f, studentId: d.students[0]?.id || '' }));
    });
    loadRecords();
    // eslint-disable-next-line
  }, [classId]);

  const loadRecords = () => api.get('/behavior').then((d) => setRecords(d.records.filter((r) => r.classId === classId).map((r) => ({ ...r, categoryLabel: labelFor(cats, r.category) }))));

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post('/behavior', { ...form, classId });
      toast.push('Vermerk gespeichert', 'success');
      setForm((f) => ({ ...f, note: '' }));
      loadRecords();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  return (
    <div className="space-y-4">
      {classes.length > 1 && (
        <select className="input w-auto" value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}

      <Card className="p-5">
        <CardHeader title="Neuer Vermerk" subtitle="Positive oder verbesserungswürdige Beobachtung" icon={Sparkles} />
        <form onSubmit={save} className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-sage">Schüler</span>
              <select className="input mt-1" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} required>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-sage">Kategorie</span>
              <select className="input mt-1" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant={form.tone === 'positive' ? 'primary' : 'outline'} size="sm" onClick={() => setForm({ ...form, tone: 'positive' })}>
              <ThumbsUp size={16} /> Positiv
            </Button>
            <Button type="button" variant={form.tone === 'negative' ? 'primary' : 'outline'} size="sm" onClick={() => setForm({ ...form, tone: 'negative' })}>
              <AlertTriangle size={16} /> Hinweis
            </Button>
          </div>
          <label className="block">
            <span className="text-sm text-sage">Vermerk</span>
            <textarea className="input mt-1" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} required />
          </label>
          <div className="flex flex-wrap gap-4 text-sm text-sage">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.visibleToStudent} onChange={(e) => setForm({ ...form, visibleToStudent: e.target.checked })} /> Für Schüler sichtbar
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.visibleToParent} onChange={(e) => setForm({ ...form, visibleToParent: e.target.checked })} /> Für Eltern sichtbar
            </label>
          </div>
          <Button type="submit"><Plus size={18} /> Speichern</Button>
        </form>
      </Card>

      <Card className="p-5">
        <CardHeader title="Vermerke der Klasse" />
        <RecordList records={records} showStudent />
      </Card>
    </div>
  );
}

function ReadView({ role }) {
  const cats = useCategories();
  const [records, setRecords] = useState(null);
  const [children, setChildren] = useState([]);
  const [childId, setChildId] = useState('');

  useEffect(() => {
    if (role === 'eltern') {
      api.get('/dashboard').then((d) => {
        setChildren(d.children || []);
        setChildId(d.children?.[0]?.id || '');
      });
    } else {
      api.get('/behavior').then((d) => setRecords(withLabels(d.records, cats)));
    }
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (role === 'eltern' && childId) {
      setRecords(null);
      api.get(`/behavior?studentId=${childId}`).then((d) => setRecords(withLabels(d.records, cats)));
    }
    // eslint-disable-next-line
  }, [childId]);

  return (
    <div className="space-y-4">
      {role === 'eltern' && children.length > 0 && (
        <select className="input w-auto" value={childId} onChange={(e) => setChildId(e.target.value)}>
          {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <Card className="p-5">
        <CardHeader title="Rückmeldungen & Tarbiyah" subtitle="Beobachtungen der Lehrkraft" icon={Sparkles} />
        <RecordList records={records} />
      </Card>
    </div>
  );
}

function withLabels(records, cats) {
  return records.map((r) => ({ ...r, categoryLabel: cats.find((c) => c.id === r.category)?.label || r.category }));
}
