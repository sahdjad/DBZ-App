import { useEffect, useState } from 'react';
import { FolderOpen, Plus, FileText, Link2 as LinkIcon, StickyNote, ExternalLink, Trash2, Paperclip } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, Spinner, useToast } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];
const ADMIN = ['super_admin', 'leitung'];
const fmt = (iso) => new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' });

export default function Materialien() {
  const { user } = useAuth();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = () => api.get('/materials').then((d) => setList(d.materials));
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    try { await api.del(`/materials/${id}`); toast.push('Gelöscht', 'success'); load(); }
    catch (err) { toast.push(err.message, 'error'); }
  };

  const isManager = MANAGER.includes(user.role);

  return (
    <AppLayout title="Materialien">
      {isManager && (
        <div className="flex justify-end mb-4">
          <Button onClick={() => setShowForm((s) => !s)}><Plus size={18} /> Neues Material</Button>
        </div>
      )}
      {showForm && <NewForm user={user} onDone={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />}

      {!list ? <Spinner /> : list.length === 0 ? (
        <Card className="p-8 text-center text-sage-muted">
          <FolderOpen size={32} className="mx-auto mb-3 opacity-50" />
          Noch keine Materialien.
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {list.map((m) => <MaterialCard key={m.id} m={m} canDelete={m.createdBy === user.id || ADMIN.includes(user.role)} onDelete={() => remove(m.id)} />)}
        </div>
      )}
    </AppLayout>
  );
}

function MaterialCard({ m, canDelete, onDelete }) {
  const Icon = m.materialType === 'file' ? FileText : m.materialType === 'link' ? LinkIcon : StickyNote;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0">
          <span className="grid place-items-center h-10 w-10 rounded-lg bg-mint/15 text-mint shrink-0"><Icon size={18} /></span>
          <div className="min-w-0">
            <div className="text-ivory truncate">{m.title}</div>
            <div className="text-xs text-sage-muted">{m.className}{m.subjectName ? ` · ${m.subjectName}` : ''} · {fmt(m.createdAt)}</div>
          </div>
        </div>
        {canDelete && <button onClick={onDelete} className="text-status-absent p-1 shrink-0" aria-label="Löschen"><Trash2 size={16} /></button>}
      </div>
      {m.description && <p className="text-sage text-sm mt-2">{m.description}</p>}
      {m.materialType === 'note' && <p className="text-sage text-sm mt-2 whitespace-pre-line rounded-lg bg-white/[0.03] border border-white/10 p-3">{m.body}</p>}
      {m.materialType === 'link' && (
        <a href={m.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-mint-light text-sm hover:underline">
          Öffnen <ExternalLink size={14} />
        </a>
      )}
      {m.materialType === 'file' && (
        <a href={`/api/materials/${m.id}/file`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-mint-light text-sm hover:underline">
          <Paperclip size={14} /> {m.fileName || 'Datei öffnen'}
        </a>
      )}
    </Card>
  );
}

function NewForm({ user, onDone, onCancel }) {
  const toast = useToast();
  const isAdmin = ADMIN.includes(user.role);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [f, setF] = useState({ title: '', description: '', materialType: 'link', classId: '', subjectId: '', url: '', body: '' });
  const [file, setFile] = useState(null);

  useEffect(() => {
    api.get('/classes').then((d) => { setClasses(d.classes); setF((x) => ({ ...x, classId: d.classes[0]?.id || '' })); });
    api.get('/subjects').then((d) => setSubjects(d.subjects));
  }, []);

  const submit = async () => {
    try {
      const fd = new FormData();
      fd.set('title', f.title);
      fd.set('description', f.description);
      fd.set('materialType', f.materialType);
      if (f.classId) fd.set('classId', f.classId);
      if (f.subjectId) fd.set('subjectId', f.subjectId);
      if (f.materialType === 'link') fd.set('url', f.url);
      if (f.materialType === 'note') fd.set('body', f.body);
      if (f.materialType === 'file' && file) fd.set('file', file);
      await api.upload('/materials', fd);
      toast.push('Material geteilt', 'success');
      onDone();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  return (
    <Card className="p-5 mb-4">
      <CardHeader title="Neues Material" icon={FolderOpen} />
      <div className="p-4 space-y-3">
        <label className="block">
          <span className="text-sm text-sage">Titel</span>
          <input className="input mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-sm text-sage">Art</span>
            <select className="input mt-1" value={f.materialType} onChange={(e) => setF({ ...f, materialType: e.target.value })}>
              <option value="link">Link (z. B. YouTube)</option>
              <option value="file">Datei (PDF/Bild)</option>
              <option value="note">Notiz</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-sage">Klasse</span>
            <select className="input mt-1" value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}>
              {isAdmin && <option value="">Schulweit</option>}
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-sage">Fach</span>
            <select className="input mt-1" value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>
              <option value="">– Fach –</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-sm text-sage">Beschreibung (optional)</span>
          <input className="input mt-1" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </label>

        {f.materialType === 'link' && (
          <label className="block">
            <span className="text-sm text-sage">Link-Adresse</span>
            <input className="input mt-1" placeholder="https://…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
          </label>
        )}
        {f.materialType === 'note' && (
          <label className="block">
            <span className="text-sm text-sage">Text</span>
            <textarea className="input mt-1" rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          </label>
        )}
        {f.materialType === 'file' && (
          <label className="block">
            <span className="text-sm text-sage">Datei (PDF/Bild, max. 25 MB)</span>
            <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files[0])}
              className="mt-1 block w-full text-sm text-sage file:mr-3 file:rounded-lg file:border-0 file:bg-mint file:px-3 file:py-2 file:text-sidebar" />
          </label>
        )}

        <div className="flex gap-2">
          <Button onClick={submit}>Teilen</Button>
          <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
        </div>
      </div>
    </Card>
  );
}
