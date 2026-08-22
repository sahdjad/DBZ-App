import { useEffect, useState } from 'react';
import { Megaphone, Plus, Trash2, AlertTriangle } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, Spinner, useToast } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];
const ADMIN = ['super_admin', 'leitung'];
const ROLE_OPTIONS = [
  ['schueler', 'Schüler'], ['eltern', 'Eltern'], ['klassenlehrer', 'Lehrer'],
  ['klassensprecher', 'Klassensprecher'],
];
const fmt = (iso) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

export default function Ankuendigungen() {
  const { user } = useAuth();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [showForm, setShowForm] = useState(false);

  // Das Öffnen markiert Ankündigungen als gelesen -> Badges/Zähler aktualisieren.
  const load = () => api.get('/announcements').then((d) => { setList(d.announcements); window.dispatchEvent(new Event('dbz:notifications')); });
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    try { await api.del(`/announcements/${id}`); toast.push('Gelöscht', 'success'); load(); }
    catch (err) { toast.push(err.message, 'error'); }
  };

  const isManager = MANAGER.includes(user.role);

  return (
    <AppLayout title="Ankündigungen">
      {isManager && (
        <div className="flex justify-end mb-4">
          <Button onClick={() => setShowForm((s) => !s)}><Plus size={18} /> Neue Ankündigung</Button>
        </div>
      )}
      {showForm && <NewForm user={user} onDone={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />}

      {!list ? <Spinner /> : list.length === 0 ? (
        <Card className="p-8 text-center text-sage-muted">
          <Megaphone size={32} className="mx-auto mb-3 opacity-50" />
          Noch keine Ankündigungen.
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 items-start">
          {list.map((a) => (
            <Card key={a.id} className={`p-5 ${a.priority === 'high' ? 'border-status-late/40' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.priority === 'high' && <AlertTriangle size={16} className="text-status-late" />}
                    <h3 className="text-ivory">{a.title}</h3>
                    <Badge tone="neutral">{a.audienceLabel}</Badge>
                  </div>
                  <div className="text-xs text-sage-muted mt-1">{a.authorName} · {fmt(a.createdAt)}</div>
                </div>
                {(a.authorId === user.id || ADMIN.includes(user.role)) && (
                  <button onClick={() => remove(a.id)} className="text-status-absent p-1 shrink-0" aria-label="Löschen"><Trash2 size={16} /></button>
                )}
              </div>
              <p className="text-sage mt-3 whitespace-pre-line">{a.body}</p>
            </Card>
          ))}
        </div>
      )}
    </AppLayout>
  );
}

function NewForm({ user, onDone, onCancel }) {
  const toast = useToast();
  const isAdmin = ADMIN.includes(user.role);
  const [classes, setClasses] = useState([]);
  const [f, setF] = useState({ title: '', body: '', priority: 'normal', audienceType: isAdmin ? 'all' : 'class', classId: '', role: 'schueler' });

  useEffect(() => {
    api.get('/classes').then((d) => { setClasses(d.classes); setF((x) => ({ ...x, classId: d.classes[0]?.id || '' })); });
  }, []);

  const submit = async () => {
    let audience = { type: 'all' };
    if (f.audienceType === 'class') audience = { type: 'class', classId: f.classId };
    else if (f.audienceType === 'role') audience = { type: 'role', role: f.role };
    try {
      await api.post('/announcements', { title: f.title, body: f.body, priority: f.priority, audience });
      toast.push('Ankündigung veröffentlicht', 'success');
      onDone();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  return (
    <Card className="p-5 mb-4">
      <CardHeader title="Neue Ankündigung" icon={Megaphone} />
      <div className="p-4 space-y-3">
        <label className="block">
          <span className="text-sm text-sage">Titel</span>
          <input className="input mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-sm text-sage">Text</span>
          <textarea className="input mt-1" rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-sage">Zielgruppe</span>
            <select className="input mt-1" value={f.audienceType} onChange={(e) => setF({ ...f, audienceType: e.target.value })}>
              {isAdmin && <option value="all">Alle</option>}
              <option value="class">Klasse</option>
              {isAdmin && <option value="role">Rolle</option>}
            </select>
          </label>
          {f.audienceType === 'class' && (
            <label className="block">
              <span className="text-sm text-sage">Klasse</span>
              <select className="input mt-1" value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          {f.audienceType === 'role' && (
            <label className="block">
              <span className="text-sm text-sage">Rolle</span>
              <select className="input mt-1" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-sage">
          <input type="checkbox" checked={f.priority === 'high'} onChange={(e) => setF({ ...f, priority: e.target.checked ? 'high' : 'normal' })} /> Wichtig (hervorheben)
        </label>
        <div className="flex gap-2">
          <Button onClick={submit}>Veröffentlichen</Button>
          <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
        </div>
      </div>
    </Card>
  );
}
