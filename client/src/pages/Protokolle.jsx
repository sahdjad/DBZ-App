import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Plus, Pencil, Trash2 } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, StatusBadge, Spinner, useToast, ClassFolders } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

// Lehrkräfte schreiben Protokolle selbst (sofort freigegeben) – für jeden Tag,
// auch rückwirkend. Klassensprecher reichen ein, die Lehrkraft bestätigt.
// Leitung/Admin lesen nach Klassen sortiert.
const MANAGER = ['klassenlehrer', 'vertretung'];
const LEADERSHIP = ['super_admin', 'leitung'];
const fmtDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const EMPTY = { topics: '', homework: '', notes: '' };

export default function Protokolle() {
  const { user } = useAuth();
  const toast = useToast();
  const [protocols, setProtocols] = useState(null);
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState(null); // { classId, date, content, id? }

  const isManager = MANAGER.includes(user.role);
  const isRep = user.role === 'klassensprecher';
  const isLeadership = LEADERSHIP.includes(user.role);
  const canWrite = isManager || isRep || isLeadership;

  const load = () => api.get('/protocols').then((d) => setProtocols(d.protocols)).catch((e) => { setProtocols([]); toast.push(e.message, 'error'); });
  useEffect(() => {
    load();
    if (canWrite) api.get('/classes').then((d) => setClasses(d.classes)).catch(() => {});
  }, []);

  const [cls, setCls] = useState(null);
  const groups = useMemo(() => {
    const m = new Map();
    (protocols || []).forEach((p) => { const g = m.get(p.classId) || { id: p.classId, name: p.className, count: 0 }; g.count++; m.set(p.classId, g); });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
  }, [protocols]);
  const shown = isLeadership ? (protocols || []).filter((p) => p.classId === cls) : protocols;

  const openNew = () => setForm({ classId: (isLeadership && cls) || classes[0]?.id || user.classIds?.[0] || '', date: today(), content: { ...EMPTY } });
  const openEdit = (p) => setForm({ id: p.id, classId: p.classId, date: p.date, content: { ...EMPTY, ...p.content } });

  const decide = async (id, decision) => {
    try {
      await api.post(`/protocols/${id}/approve`, { decision });
      toast.push(decision === 'approve' ? 'Protokoll freigegeben' : 'Zurückgegeben', 'success');
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };
  const remove = async (p) => {
    if (!window.confirm(`Protokoll vom ${fmtDate(p.date)} löschen?`)) return;
    try { await api.del(`/protocols/${p.id}`); toast.push('Gelöscht', 'success'); load(); }
    catch (err) { toast.push(err.message, 'error'); }
  };

  return (
    <AppLayout title="Protokolle">
      {canWrite && !form && (
        <div className="flex justify-end mb-4">
          <Button onClick={openNew}><Plus size={18} /> Protokoll schreiben</Button>
        </div>
      )}
      {form && (
        <ProtocolForm
          form={form}
          setForm={setForm}
          classes={classes}
          isRep={isRep}
          protocols={protocols || []}
          onDone={() => { setForm(null); load(); }}
        />
      )}

      {isLeadership && protocols && <ClassFolders groups={groups} selected={cls} onSelect={setCls} emptyText="Noch keine Protokolle." />}
      {(!isLeadership || cls) && (
        <Card className="p-5">
          <CardHeader title="Protokolle" subtitle="Neueste zuerst" icon={ClipboardList} />
          <div className="grid gap-3 lg:grid-cols-2 items-start">
            {!shown ? <Spinner /> : shown.length === 0 ? (
              <p className="p-4 text-sage-muted text-sm">Noch keine Protokolle.</p>
            ) : shown.map((p) => (
              <div key={p.id} className="rounded-lg border border-line bg-subtle/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-ivory font-medium">{fmtDate(p.date)}</div>
                    <div className="text-xs text-sage-muted">{p.className}{p.createdByName ? ` · ${p.createdByName}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <StatusBadge status={p.status} />
                    {p.canEdit && <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-sage hover:bg-subtle" aria-label="Bearbeiten"><Pencil size={15} /></button>}
                    {(isManager || isLeadership) && p.canEdit && <button onClick={() => remove(p)} className="p-1.5 rounded-lg text-status-absent hover:bg-subtle" aria-label="Löschen"><Trash2 size={15} /></button>}
                  </div>
                </div>
                <div className="mt-2 text-sm space-y-1">
                  {p.content?.topics && <p className="text-sage whitespace-pre-line"><span className="text-ivory">Themen:</span> {p.content.topics}</p>}
                  {p.content?.homework && <p className="text-sage whitespace-pre-line"><span className="text-ivory">Hausaufgaben:</span> {p.content.homework}</p>}
                  {p.content?.notes && <p className="text-sage whitespace-pre-line"><span className="text-ivory">Vorkommnisse:</span> {p.content.notes}</p>}
                </div>
                {isManager && p.status === 'submitted' && (
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={() => decide(p.id, 'approve')}>Freigeben</Button>
                    <Button size="sm" variant="outline" onClick={() => decide(p.id, 'return')}>Zurückgeben</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </AppLayout>
  );
}

function ProtocolForm({ form, setForm, classes, isRep, protocols, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, content: { ...f.content, [k]: v } }));

  // Gibt es für Klasse+Datum schon ein Protokoll? Dann dieses bearbeiten.
  const existing = protocols.find((p) => p.classId === form.classId && p.date === form.date && p.id !== form.id);
  useEffect(() => {
    if (existing && !form.id) setForm((f) => ({ ...f, id: existing.id, content: { ...EMPTY, ...existing.content } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id]);

  const changeKey = (patch) => setForm((f) => ({ ...f, ...patch, id: undefined, content: f.id ? { ...EMPTY } : f.content }));

  const save = async (submit) => {
    setBusy(true);
    try {
      await api.post(`/classes/${form.classId}/protocols`, { date: form.date, content: form.content, submit });
      toast.push(isRep ? (submit ? 'Eingereicht – die Lehrkraft bestätigt' : 'Entwurf gespeichert') : 'Protokoll gespeichert', 'success');
      onDone();
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 mb-4">
      <CardHeader title={form.id ? 'Protokoll bearbeiten' : 'Protokoll schreiben'} subtitle="Auch für vergangene Tage möglich" icon={ClipboardList} />
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {classes.length > 1 && (
            <label className="block">
              <span className="text-sm text-sage">Klasse</span>
              <select className="input mt-1" value={form.classId} onChange={(e) => changeKey({ classId: e.target.value })}>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-sm text-sage">Datum des Unterrichts</span>
            <input type="date" className="input mt-1" value={form.date} max={today()} onChange={(e) => e.target.value && changeKey({ date: e.target.value })} />
          </label>
        </div>
        <Field label="Behandelte Themen" value={form.content.topics} onChange={(v) => set('topics', v)} />
        <Field label="Aufgegebene Hausaufgaben" value={form.content.homework} onChange={(v) => set('homework', v)} />
        <Field label="Besondere Vorkommnisse" value={form.content.notes} onChange={(v) => set('notes', v)} />
        <div className="flex gap-2 flex-wrap">
          {isRep ? (
            <>
              <Button variant="outline" onClick={() => save(false)} disabled={busy}>Entwurf speichern</Button>
              <Button onClick={() => save(true)} disabled={busy}>Zur Bestätigung einreichen</Button>
            </>
          ) : (
            <Button onClick={() => save(false)} disabled={busy}>{busy ? 'Speichert …' : 'Speichern'}</Button>
          )}
          <Button variant="ghost" onClick={() => setForm(null)}>Abbrechen</Button>
        </div>
      </div>
    </Card>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="text-sm text-sage">{label}</span>
      <textarea className="input mt-1" rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
