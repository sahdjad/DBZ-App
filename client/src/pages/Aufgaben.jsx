import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Plus, Trash2, ListChecks, ArchiveRestore, Lightbulb, Check, X } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, StatusBadge, Spinner, useToast, useSelection, useLongPress, SelectCheck, SelectionBar, ChoiceDialog } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'offen');
const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];

export default function Aufgaben() {
  const { user } = useAuth();
  const isManager = MANAGER.includes(user.role);
  return (
    <AppLayout title="Aufgaben">
      {isManager ? <ManagerView /> : (
        <div className="space-y-4">
          {user.role === 'klassensprecher' && <ProposalForm user={user} />}
          <StudentView />
        </div>
      )}
    </AppLayout>
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

// Klassensprecher: Aufgabe vorschlagen -> die Lehrkraft bestätigt (erst dann
// sehen die Mitschüler sie und sie zählt).
function ProposalForm({ user }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState([]);
  const [form, setForm] = useState({ title: '', description: '', type: 'text', dueAt: '' });
  const classId = (user.classIds || [])[0];
  const load = () => api.get('/assignment-proposals').then((d) => setMine(d.proposals)).catch(() => {});
  useEffect(() => { load(); }, []);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/assignment-proposals', { ...form, classId, dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null });
      toast.push('Vorschlag an die Lehrkraft gesendet', 'success');
      setForm({ title: '', description: '', type: 'text', dueAt: '' });
      setOpen(false);
      load();
    } catch (err) { toast.push(err.message, 'error'); }
  };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-sage">Als Klassensprecher kannst du Aufgaben vorschlagen – die Lehrkraft bestätigt sie.</div>
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}><Lightbulb size={16} /> Vorschlagen</Button>
      </div>
      {open && (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <Field label="Titel"><input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Beschreibung"><textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Art">
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="audio">Audio</option><option value="text">Text</option><option value="file">Datei</option><option value="quran">Qur'an</option><option value="mixed">Gemischt</option>
              </select>
            </Field>
            <Field label="Frist"><input type="datetime-local" className="input" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></Field>
          </div>
          <Button type="submit">Vorschlag senden</Button>
        </form>
      )}
      {mine.length > 0 && (
        <div className="mt-3 text-xs text-sage-muted space-y-1">
          {mine.map((p) => <div key={p.id}>⏳ „{p.title}" wartet auf Bestätigung</div>)}
        </div>
      )}
    </Card>
  );
}

// Lehrkraft: offene Vorschläge des Klassensprechers bestätigen/ablehnen.
function ProposalInbox({ onChanged }) {
  const toast = useToast();
  const [list, setList] = useState([]);
  const load = () => api.get('/assignment-proposals').then((d) => setList(d.proposals)).catch(() => {});
  useEffect(() => { load(); }, []);
  const decide = async (p, approve) => {
    try {
      await api.post(`/assignment-proposals/${p.id}/decide`, { approve });
      toast.push(approve ? 'Aufgabe freigegeben – die Klasse wurde benachrichtigt' : 'Vorschlag abgelehnt', 'success');
      load();
      if (approve) onChanged();
    } catch (err) { toast.push(err.message, 'error'); }
  };
  if (!list.length) return null;
  return (
    <Card className="p-4 border-status-late/40">
      <div className="text-ivory font-medium mb-2 flex items-center gap-2"><Lightbulb size={17} /> Vorschläge vom Klassensprecher</div>
      <div className="space-y-2">
        {list.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
            <div className="min-w-0">
              <div className="text-ivory">{p.title}</div>
              <div className="text-xs text-sage-muted">{p.className} · von {p.proposedByName} · Frist {fmt(p.dueAt)}{p.description ? ` · ${p.description}` : ''}</div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" onClick={() => decide(p, true)}><Check size={15} /> Freigeben</Button>
              <Button size="sm" variant="ghost" onClick={() => decide(p, false)}><X size={15} /> Ablehnen</Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ManagerView() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [archived, setArchived] = useState(false);
  const [confirm, setConfirm] = useState(null); // { ids, title?, onlyDelete? }
  const selection = useSelection();
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ classId: '', title: '', description: '', subjectId: '', type: 'audio', dueAt: '' });

  const load = () => api.get(`/assignments${archived ? '?archived=1' : ''}`).then((d) => setList(d.assignments));
  useEffect(() => { setList(null); selection.clear(); load(); /* eslint-disable-next-line */ }, [archived]);
  useEffect(() => {
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

  const runBulk = async (ids, action) => {
    try {
      const { results } = await api.post('/assignments/bulk', { ids, action });
      const ok = results.filter((r) => r.ok).length;
      const msg = action === 'delete' ? 'endgültig gelöscht' : action === 'archive' ? 'archiviert' : 'wiederhergestellt';
      toast.push(`${ok} Aufgabe(n) ${msg}`, ok === ids.length ? 'success' : 'error');
      selection.clear();
      setConfirm(null);
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  if (!list) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-line p-1" role="tablist">
          {[[false, 'Aktuell'], [true, 'Archiv']].map(([v, l]) => (
            <button key={l} role="tab" aria-selected={archived === v} onClick={() => setArchived(v)}
              className={`px-3 py-1.5 rounded-lg text-sm ${archived === v ? 'bg-mint text-onaccent' : 'text-sage hover:bg-hover'}`}>{l}</button>
          ))}
        </div>
        <div className="flex gap-2">
          {list.length > 0 && !selection.active && (
            <Button variant="outline" onClick={() => selection.start()}><ListChecks size={18} /> Auswählen</Button>
          )}
          {!archived && <Button onClick={() => setShowForm((f) => !f)}><Plus size={18} /> Neue Aufgabe</Button>}
        </div>
      </div>
      {!archived && <ProposalInbox onChanged={load} />}
      {archived && (
        <p className="text-xs text-sage-muted">
          Archivierte Aufgaben sind nur aus deiner Übersicht und der Korrektur-Liste ausgeblendet. Abgaben, Bewertungen und
          Statistiken bleiben vollständig erhalten; Schüler sehen sie weiterhin in ihrem Verlauf.
        </p>
      )}

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
        <Card className="p-6 text-sage-muted">
          {archived ? <p>Keine archivierten Aufgaben.</p> : (
            <>
              <p>Hier erscheinen die Aufgaben, die du dieser Klasse stellst, mit Abgabestatus je Schüler.</p>
              {!showForm && <Button size="sm" className="mt-3" onClick={() => setShowForm(true)}>Erste Aufgabe erstellen</Button>}
            </>
          )}
        </Card>
      ) : (
        list.map((a) => (
          <AssignmentRow key={a.id} a={a} selection={selection} archived={archived}
            onDelete={() => setConfirm({ ids: [a.id], title: a.title })}
            onRestore={() => runBulk([a.id], 'unarchive')} />
        ))
      )}

      <SelectionBar
        selection={selection}
        allIds={list.map((a) => a.id)}
        actions={archived
          ? [
            { label: 'Wiederherstellen', icon: ArchiveRestore, onClick: () => runBulk([...selection.ids], 'unarchive') },
            { label: 'Endgültig löschen', icon: Trash2, variant: 'danger', onClick: () => setConfirm({ ids: [...selection.ids], onlyDelete: true }) },
          ]
          : [{ label: 'Entfernen …', icon: Trash2, variant: 'danger', onClick: () => setConfirm({ ids: [...selection.ids] }) }]}
      />

      {confirm && (
        <ChoiceDialog
          title={confirm.ids.length === 1 && confirm.title ? `„${confirm.title}" entfernen` : `${confirm.ids.length} Aufgabe(n) entfernen`}
          message="Wie soll entfernt werden?"
          onClose={() => setConfirm(null)}
          onChoose={(key) => runBulk(confirm.ids, key)}
          options={[
            ...(confirm.onlyDelete ? [] : [{
              key: 'archive', label: 'Nur ausblenden (archivieren)',
              description: 'Für mehr Übersicht: verschwindet aus deiner Liste und der Korrektur. Abgaben, Bewertungen und Statistiken bleiben erhalten. Jederzeit wiederherstellbar.',
            }]),
            {
              key: 'delete', variant: 'danger', label: 'Endgültig löschen',
              description: 'Als hätte es die Aufgabe nie gegeben: auch alle Abgaben und Bewertungen werden gelöscht und nirgends mehr mitgezählt. Nicht rückgängig zu machen.',
            },
          ]}
        />
      )}
    </div>
  );
}

function AssignmentRow({ a, selection, archived, onDelete, onRestore }) {
  const longPress = useLongPress(() => selection.start(a.id));
  const selected = selection.has(a.id);
  return (
    <Card
      {...longPress.handlers}
      onClick={() => { if (longPress.wasLongPress()) return; if (selection.active) selection.toggle(a.id); }}
      className={`p-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 select-none ${selection.active ? 'cursor-pointer' : ''} ${selected ? 'border-mint/60 bg-mint/5' : ''}`}
    >
      {selection.active && <SelectCheck checked={selected} />}
      <div className="min-w-0 flex-1 basis-48">
        <div className="text-ivory break-words">{a.title}</div>
        <div className="text-xs text-sage-muted">{a.className} · {a.subjectName || a.type} · Frist {fmt(a.dueAt)}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge tone="neutral">{a.submittedCount}/{a.targetCount} abgegeben</Badge>
        {a.pendingReview > 0 && <Badge tone="late">{a.pendingReview} offen</Badge>}
        {!selection.active && (archived ? (
          <button onClick={onRestore} title="Wiederherstellen" aria-label="Wiederherstellen"
                  className="p-1.5 rounded-lg text-sage-muted hover:text-ivory hover:bg-hover">
            <ArchiveRestore size={16} />
          </button>
        ) : (
          <button onClick={onDelete} title="Aufgabe entfernen" aria-label="Aufgabe entfernen"
                  className="p-1.5 rounded-lg text-sage-muted hover:text-status-absent hover:bg-status-absent/10">
            <Trash2 size={16} />
          </button>
        ))}
      </div>
    </Card>
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
