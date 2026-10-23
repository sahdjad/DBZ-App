import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Plus, Trash2, ListChecks, ArchiveRestore, Lightbulb, Check, X, SlidersHorizontal, Pencil, ChevronDown, Archive } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api, peek } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, StatusBadge, Spinner, useToast, useSelection, useLongPress, SelectCheck, SelectionBar, ChoiceDialog, Segmented } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';
import { DuePresets, toLocalInput, AssignmentEditForm } from '../components/AssignmentEditForm.jsx';
import { groupByWeek, weekInfo } from '../lib/weeks.js';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'offen');
const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];
const TYPE_LABEL = { audio: 'Audio', text: 'Text', file: 'Datei', quran: "Qur'an", mixed: 'Gemischt' };

export default function Aufgaben() {
  const { user } = useAuth();
  const isManager = MANAGER.includes(user.role);
  return (
    <AppLayout title="Aufgaben" wide>
      {isManager ? <ManagerView /> : (
        <div className="space-y-4">
          {user.role === 'klassensprecher' && <ProposalForm user={user} />}
          <StudentView />
        </div>
      )}
    </AppLayout>
  );
}

// Schüler: oben nur, was noch zu tun ist (nach Woche), darunter vergangene
// Wochen zusammengeklappt – eine Zeile pro Kalenderwoche.
function StudentView() {
  const [list, setList] = useState(() => peek('/assignments')?.assignments ?? null);
  const [openWeeks, setOpenWeeks] = useState(() => new Set());
  useEffect(() => {
    api.get('/assignments').then((d) => setList(d.assignments)).catch(() => setList([]));
  }, []);
  if (!list) return <Spinner />;
  if (!list.length) return <Card className="p-6 text-sage-muted">Aktuell sind keine Aufgaben zugewiesen.</Card>;
  const isCurrent = (a) => a.canSubmit || a.studentStatus === 'revision_required' || !a.dueAt;
  const current = groupByWeek(list.filter(isCurrent), (a) => a.dueAt);
  const past = groupByWeek(list.filter((a) => !isCurrent(a)), (a) => a.dueAt, { newestFirst: true });
  const toggle = (k) => setOpenWeeks((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const row = (a) => (
    <Link key={a.id} to={`/aufgaben/${a.id}`} className="block">
      <div className="px-4 py-3 active:bg-hover hover:bg-hover/60 transition-colors flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-ivory line-clamp-2">{a.title}</div>
          <div className="text-xs text-sage-muted">{a.subjectName || 'Aufgabe'} · Frist {fmt(a.dueAt)}</div>
        </div>
        <StatusBadge status={a.studentStatus} />
      </div>
    </Link>
  );
  return (
    <div className="space-y-5">
      {current.length === 0 ? (
        <Card className="p-4 sm:p-5 text-sage-muted text-sm">Alles erledigt – gerade ist keine Hausaufgabe offen.</Card>
      ) : current.map((w) => {
        const info = w.key ? weekInfo(w.key) : null;
        return (
          <section key={w.key || 'none'}>
            <WeekTitle info={info} count={w.items.length} />
            <div className="bg-card border border-line/70 rounded-2xl shadow-card overflow-hidden divide-y divide-line/70">{w.items.map(row)}</div>
          </section>
        );
      })}
      {past.length > 0 && (
        <section>
          <div className="text-xs font-bold uppercase tracking-wider text-sage-muted mb-2 px-1">Vergangene Wochen</div>
          <div className="space-y-2">
            {past.map((w) => {
              const info = weekInfo(w.key);
              const open = openWeeks.has(w.key);
              const done = w.items.filter((a) => ['submitted', 'passed'].includes(a.studentStatus)).length;
              const missed = w.items.filter((a) => a.studentStatus === 'missed').length;
              return (
                <div key={w.key}>
                  <button type="button" onClick={() => toggle(w.key)} aria-expanded={open}
                    className="w-full flex items-center gap-3 text-left rounded-2xl border border-line bg-card px-4 py-3 hover:bg-subtle/60">
                    <WeekBadge kw={info.kw} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ivory">{info.range}</span>
                      <span className="block text-xs text-sage-muted">
                        {`${done} von ${w.items.length} erledigt`}{missed > 0 ? <span className="text-status-absent">{` · ${missed} verpasst`}</span> : null}
                      </span>
                    </span>
                    <ChevronDown size={18} className={`shrink-0 text-sage-muted transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && <div className="mt-2 bg-card border border-line/70 rounded-2xl shadow-card overflow-hidden divide-y divide-line/70">{w.items.map(row)}</div>}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function WeekBadge({ kw }) {
  return (
    <span className="grid place-items-center shrink-0 h-11 w-11 rounded-xl bg-mint/15 text-mint leading-none">
      {kw ? (<><span className="text-[0.5625rem] font-bold tracking-wider">KW</span><span className="text-base font-semibold">{kw}</span></>) : <span className="text-xs">–</span>}
    </span>
  );
}

function WeekTitle({ info, count }) {
  return (
    <div className="flex items-center gap-3 mb-2 px-1">
      <WeekBadge kw={info?.kw} />
      <div className="min-w-0">
        <div className="text-sm font-medium text-ivory">
          {info ? info.range : 'Ohne Frist'}{info?.hint ? <span className="ml-2 text-xs font-normal text-mint">{info.hint}</span> : null}
        </div>
        <div className="text-xs text-sage-muted">{`${count} ${count === 1 ? 'Hausaufgabe' : 'Hausaufgaben'}`}</div>
      </div>
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
  const [klass, setKlass] = useState(null);
  const load = () => api.get('/assignment-proposals').then((d) => setMine(d.proposals)).catch(() => {});
  useEffect(() => {
    load();
    api.get('/classes').then((d) => setKlass(d.classes.find((c) => c.id === classId) || null)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Art">
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="audio">Audio</option><option value="text">Text</option><option value="file">Datei</option><option value="quran">Qur'an</option><option value="mixed">Gemischt</option>
              </select>
            </Field>
            <Field label="Frist">
              <input type="datetime-local" className="input" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
              <DuePresets klass={klass} onPick={(v) => setForm((f) => ({ ...f, dueAt: v }))} />
            </Field>
          </div>
          <Button type="submit">Vorschlag senden</Button>
        </form>
      )}
      {mine.length > 0 && (
        <div className="mt-3 text-xs text-sage-muted space-y-1">
          {mine.map((p) => <div key={p.id}>⏳ {p.kind === 'edit' ? `Korrektur an „${p.title}"` : `„${p.title}"`} wartet auf Bestätigung</div>)}
        </div>
      )}
    </Card>
  );
}

// Regeln für Audio-Hausaufgaben pro Klasse (und einzelne Schüler):
// mehrere Audio-Hausaufgaben am selben Tag markieren, sperren oder erlauben.
const RULES = [['mark', 'Markieren (rot)'], ['block', 'Sperren'], ['off', 'Erlaubt']];
function HomeworkRules({ classes }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState('');
  const [data, setData] = useState(null);
  const cid = classId || classes[0]?.id;
  useEffect(() => {
    if (!open || !cid) return;
    setData(null);
    api.get(`/classes/${cid}/homework-rules`).then(setData).catch((e) => toast.push(e.message, 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cid]);
  const save = async (patch) => {
    try {
      await api.patch(`/classes/${cid}/homework-rules`, patch);
      setData(await api.get(`/classes/${cid}/homework-rules`));
      toast.push('Gespeichert', 'success');
    } catch (err) { toast.push(err.message, 'error'); }
  };
  if (!classes.length) return null;
  return (
    <Card className="p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2 text-sm text-ivory"><SlidersHorizontal size={16} className="text-mint" /> Regeln: eine Hausaufgabe pro Tag</span>
        <span className="text-xs text-sage-muted">{open ? 'Schließen' : 'Einstellen'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-sage-muted">
            Zu einer Hausaufgabe dürfen Schüler am selben Tag beliebig viele Aufnahmen schicken. Verschiedene Hausaufgaben
            sollen an verschiedenen Tagen gemacht werden – eine Audio- und eine schriftliche Hausaufgabe am selben Tag sind ok,
            zwei Audio-Hausaufgaben (oder zwei schriftliche) nicht. Ob das rot markiert, gesperrt oder erlaubt wird,
            stellst du hier ein – für die ganze Klasse oder einzelne Schüler.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {classes.length > 1 && (
              <Field label="Klasse">
                <select className="input" value={cid} onChange={(e) => setClassId(e.target.value)}>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Mehrere Hausaufgaben derselben Art am selben Tag (ganze Klasse)">
              <select className="input" value={data?.rule || 'mark'} disabled={!data} onChange={(e) => save({ rule: e.target.value })}>
                {RULES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          </div>
          {!data ? <Spinner /> : data.students.length > 0 && (
            <div>
              <div className="text-sm text-sage mb-1">Abweichend für einzelne Schüler</div>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {data.students.map((st) => (
                  <li key={st.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="text-sm text-ivory truncate">{st.name}</span>
                    <select className="input py-1 w-auto text-sm" value={st.rule || ''} onChange={(e) => save({ overrides: { [st.id]: e.target.value || null } })}>
                      <option value="">Wie Klasse</option>
                      {RULES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// Lehrkraft: offene Vorschläge des Klassensprechers bestätigen/ablehnen.

function ProposalInbox({ onChanged, classes = [] }) {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null); // { id, title, description, dueAt }
  const load = () => api.get('/assignment-proposals').then((d) => setList(d.proposals)).catch(() => {});
  useEffect(() => { load(); }, []);
  const decide = async (p, approve, edits) => {
    try {
      await api.post(`/assignment-proposals/${p.id}/decide`, { approve, ...(edits ? { edits } : {}) });
      toast.push(approve ? (p.kind === 'edit' ? 'Korrektur übernommen – die Klasse wurde benachrichtigt' : 'Aufgabe freigegeben – die Klasse wurde benachrichtigt') : 'Vorschlag abgelehnt', 'success');
      setEditing(null);
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
          <div key={p.id} className="rounded-lg border border-line p-3">
            {p.kind === 'edit' ? (
              <EditProposal p={p} klass={classes.find((c) => c.id === p.classId)} onDecide={(approve, edits) => decide(p, approve, edits)} />
            ) : editing?.id === p.id ? (
              // Vor dem Freigeben anpassen (Titel, Beschreibung, Frist).
              <div className="space-y-2">
                <input className="input" aria-label="Titel" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                <textarea className="input" rows={3} aria-label="Beschreibung" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                <label className="block text-xs text-sage-muted">Frist
                  <input type="datetime-local" className="input mt-1" value={editing.dueAt} onChange={(e) => setEditing({ ...editing, dueAt: e.target.value })} />
                  <DuePresets klass={classes.find((c) => c.id === p.classId)} onPick={(v) => setEditing((ed) => ({ ...ed, dueAt: v }))} />
                </label>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" disabled={!editing.title.trim()} onClick={() => decide(p, true, {
                    title: editing.title.trim(),
                    description: editing.description,
                    dueAt: editing.dueAt ? new Date(editing.dueAt).toISOString() : null,
                  })}><Check size={15} /> Geändert freigeben</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Abbrechen</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-ivory">{p.title}</div>
                  <div className="text-xs text-sage-muted">{p.className} · von {p.proposedByName} · Frist {fmt(p.dueAt)}{p.description ? ` · ${p.description}` : ''}</div>
                </div>
                <div className="flex gap-1 flex-wrap">
                  <Button size="sm" onClick={() => decide(p, true)}><Check size={15} /> Freigeben</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing({ id: p.id, title: p.title, description: p.description || '', dueAt: toLocalInput(p.dueAt) })}>Bearbeiten</Button>
                  <Button size="sm" variant="ghost" onClick={() => decide(p, false)}><X size={15} /> Ablehnen</Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// Korrekturvorschlag des Klassensprechers zu einer bestehenden Hausaufgabe:
// zeigt alt -> neu; die Lehrkraft übernimmt, passt an oder lehnt ab.
const FIELD_LABEL = { title: 'Titel', description: 'Beschreibung', type: 'Art', dueAt: 'Frist', subjectId: 'Fach' };
function EditProposal({ p, klass, onDecide }) {
  const [editing, setEditing] = useState(false);
  const show = (k, v) => (k === 'dueAt' ? fmt(v) : v || '–');
  if (editing) {
    return (
      <AssignmentEditForm assignment={{ ...p.current, ...p.changes }} klass={klass} submitLabel="Geändert übernehmen"
        onSubmit={(edits) => onDecide(true, edits)} onCancel={() => setEditing(false)} />
    );
  }
  return (
    <div className="space-y-2">
      <div className="text-ivory">Korrektur zu „{p.current?.title || p.title}"</div>
      <div className="text-xs text-sage-muted">{p.className} · von {p.proposedByName}{p.note ? ` · „${p.note}"` : ''}</div>
      <ul className="text-sm space-y-1">
        {Object.entries(p.changes || {}).map(([k, v]) => (
          <li key={k} className="break-words">
            <span className="text-sage-muted">{FIELD_LABEL[k] || k}: </span>
            <span className="line-through text-sage-muted">{show(k, p.current?.[k])}</span>{' → '}
            <span className="text-ivory">{show(k, v)}</span>
          </li>
        ))}
      </ul>
      <div className="flex gap-1 flex-wrap">
        <Button size="sm" onClick={() => onDecide(true)}><Check size={15} /> Übernehmen</Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Bearbeiten</Button>
        <Button size="sm" variant="ghost" onClick={() => onDecide(false)}><X size={15} /> Ablehnen</Button>
      </div>
    </div>
  );
}

function ManagerView() {
  const toast = useToast();
  const [list, setList] = useState(() => peek('/assignments')?.assignments ?? null);
  const [archived, setArchived] = useState(false);
  const [confirm, setConfirm] = useState(null); // { ids, title?, onlyDelete? }
  const selection = useSelection();
  const [classes, setClasses] = useState(() => peek('/classes')?.classes ?? []);
  const [subjects, setSubjects] = useState(() => peek('/subjects')?.subjects ?? []);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ classId: '', title: '', description: '', subjectId: '', type: 'audio', dueAt: '' });
  const saveEdit = async (a, edits) => {
    if (!Object.keys(edits).length) { setEditId(null); return; }
    try {
      await api.patch(`/assignments/${a.id}`, edits);
      toast.push('Hausaufgabe geändert – die Schüler wurden benachrichtigt', 'success');
      setEditId(null);
      load();
    } catch (err) { toast.push(err.message, 'error'); }
  };

  // Aktuell = Frist noch nicht vorbei (oder keine Frist). Nach der Frist landet
  // eine Hausaufgabe automatisch im Archiv – nur in der Ansicht: Korrektur,
  // Abgaben und Statistik behalten sie. Von Hand Ausgeblendetes steht im
  // Archiv getrennt darunter.
  const [hidden, setHidden] = useState([]);
  const load = () => Promise.all([
    api.get('/assignments'),
    archived ? api.get('/assignments?archived=1') : Promise.resolve({ assignments: [] }),
  ]).then(([d, h]) => { setList(d.assignments); setHidden(h.assignments); });
  const now = Date.now();
  const isPast = (a) => Boolean(a.dueAt) && new Date(a.dueAt).getTime() < now;
  const visible = useMemo(() => (list ? list.filter((a) => (archived ? isPast(a) : !isPast(a))) : []), [list, archived]); // eslint-disable-line react-hooks/exhaustive-deps
  const weeks = useMemo(() => groupByWeek(visible, (a) => a.dueAt || a.createdAt, { newestFirst: archived }), [visible, archived]);
  const [openWeeks, setOpenWeeks] = useState(() => new Set());
  const toggleWeek = (k) => setOpenWeeks((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const allIds = [...visible, ...hidden].map((a) => a.id);
  // Aktuelle Liste: zuletzt geladener Stand sofort; Archiv immer frisch laden.
  useEffect(() => { setList(archived ? null : (peek('/assignments')?.assignments ?? null)); selection.clear(); load(); /* eslint-disable-next-line */ }, [archived]);
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

  const renderRow = (a, isHidden) => (editId === a.id ? (
    <div key={a.id} className="p-4 bg-mint/[0.04]">
      <div className="text-sm text-ivory font-medium mb-3 flex items-center gap-2"><Pencil size={15} /> Hausaufgabe bearbeiten</div>
      <AssignmentEditForm assignment={a} klass={classes.find((c) => c.id === a.classId)} subjects={subjects}
        onSubmit={(edits) => saveEdit(a, edits)} onCancel={() => setEditId(null)} />
      <p className="text-caption text-sage-muted mt-2">Bereits abgegebene Hausaufgaben bleiben erhalten. Wird die Frist verlängert, können Schüler wieder abgeben.</p>
    </div>
  ) : (
    <AssignmentRow key={a.id} a={a} selection={selection} archived={isHidden}
      onEdit={() => setEditId(a.id)}
      onDelete={() => setConfirm({ ids: [a.id], title: a.title })}
      onRestore={() => runBulk([a.id], 'unarchive')} />
  ));

  if (!list) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented options={[[false, 'Aktuell'], [true, 'Archiv']]} value={archived} onChange={setArchived} />
        <div className="flex gap-2">
          {allIds.length > 0 && !selection.active && (
            <Button variant="outline" onClick={() => selection.start()}><ListChecks size={18} /> Auswählen</Button>
          )}
          {!archived && <Button onClick={() => setShowForm((f) => !f)}><Plus size={18} /> Neue Aufgabe</Button>}
        </div>
      </div>
      {!archived && <ProposalInbox onChanged={load} classes={classes} />}
      {!archived && <HomeworkRules classes={classes} />}
      {archived && (
        <p className="text-xs text-sage-muted">
          Hausaufgaben kommen nach Ablauf der Frist automatisch hierher, sortiert nach Kalenderwoche. Abgaben, Bewertungen und
          Korrektur bleiben vollständig erhalten.
        </p>
      )}

      {showForm && (
        <Card className="p-4 sm:p-5">
          <CardHeader title="Neue Hausaufgabe" icon={BookOpen} />
          <form onSubmit={create} className="space-y-3">
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
                <DuePresets klass={classes.find((c) => c.id === form.classId)} onPick={(v) => setForm((f) => ({ ...f, dueAt: v }))} />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Erstellen</Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Abbrechen</Button>
            </div>
          </form>
        </Card>
      )}

      {visible.length === 0 && hidden.length === 0 ? (
        <Card className="p-6 text-sage-muted">
          {archived ? <p>Noch keine Hausaufgaben mit abgelaufener Frist.</p> : (
            <>
              <p>Keine offenen Hausaufgaben. Hausaufgaben mit abgelaufener Frist findest du im Archiv.</p>
              {!showForm && <Button size="sm" className="mt-3" onClick={() => setShowForm(true)}>Neue Aufgabe erstellen</Button>}
            </>
          )}
        </Card>
      ) : (
        <div className="space-y-5">
          {weeks.map((w) => {
            const info = w.key ? weekInfo(w.key) : null;
            const open = !archived || openWeeks.has(w.key) || selection.active;
            const sub = w.items.reduce((n, a) => n + (a.submittedCount || 0), 0);
            const tgt = w.items.reduce((n, a) => n + (a.targetCount || 0), 0);
            const pend = w.items.reduce((n, a) => n + (a.pendingReview || 0), 0);
            return (
              <section key={w.key || 'none'}>
                <button
                  type="button"
                  onClick={() => archived && toggleWeek(w.key)}
                  className={`w-full flex items-center gap-3 text-left mb-2 ${archived ? 'rounded-2xl border border-line bg-card px-4 py-3 hover:bg-subtle/60' : 'px-1 cursor-default'}`}
                  aria-expanded={open}
                >
                  <WeekBadge kw={info?.kw} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ivory">
                      {info ? info.range : 'Ohne Frist'}{info?.hint ? <span className="ml-2 text-xs font-normal text-mint">{info.hint}</span> : null}
                    </span>
                    <span className="block text-xs text-sage-muted">
                      {`${w.items.length} ${w.items.length === 1 ? 'Hausaufgabe' : 'Hausaufgaben'} · ${sub}/${tgt} abgegeben`}{pend > 0 ? <span className="text-gold">{` · ${pend} zu korrigieren`}</span> : null}
                    </span>
                  </span>
                  {archived && <ChevronDown size={18} className={`shrink-0 text-sage-muted transition-transform ${open ? 'rotate-180' : ''}`} />}
                </button>
                {open && (
                  <div className="bg-card border border-line/70 rounded-2xl shadow-card overflow-hidden divide-y divide-line/70">
                    {w.items.map((a) => renderRow(a, false))}
                  </div>
                )}
              </section>
            );
          })}

          {archived && hidden.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => toggleWeek('__hidden')}
                className="w-full flex items-center gap-3 text-left mb-2 rounded-2xl border border-dashed border-line px-4 py-3 hover:bg-subtle/60"
                aria-expanded={openWeeks.has('__hidden')}
              >
                <span className="grid place-items-center shrink-0 h-11 w-11 rounded-xl bg-subtle text-sage-muted"><Archive size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ivory">Von Hand ausgeblendet</span>
                  <span className="block text-xs text-sage-muted">{`${hidden.length} · auch aus der Korrektur ausgeblendet, jederzeit wiederherstellbar`}</span>
                </span>
                <ChevronDown size={18} className={`shrink-0 text-sage-muted transition-transform ${openWeeks.has('__hidden') ? 'rotate-180' : ''}`} />
              </button>
              {(openWeeks.has('__hidden') || selection.active) && (
                <div className="bg-card border border-line/70 rounded-2xl shadow-card overflow-hidden divide-y divide-line/70">{hidden.map((a) => renderRow(a, true))}</div>
              )}
            </section>
          )}
        </div>
      )}

      <SelectionBar
        selection={selection}
        allIds={allIds}
        actions={[
          ...([...selection.ids].some((id) => hidden.some((h) => h.id === id))
            ? [{ label: 'Wiederherstellen', icon: ArchiveRestore, onClick: () => runBulk([...selection.ids].filter((id) => hidden.some((h) => h.id === id)), 'unarchive') }]
            : []),
          { label: 'Entfernen …', icon: Trash2, variant: 'danger', onClick: () => setConfirm({ ids: [...selection.ids] }) },
        ]}
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

function AssignmentRow({ a, selection, archived, onEdit, onDelete, onRestore }) {
  const longPress = useLongPress(() => selection.start(a.id));
  const selected = selection.has(a.id);
  const pct = a.targetCount ? Math.round((a.submittedCount / a.targetCount) * 100) : 0;
  return (
    <div
      {...longPress.handlers}
      onClick={() => { if (longPress.wasLongPress()) return; if (selection.active) selection.toggle(a.id); }}
      className={`px-4 py-3 flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-2 select-none transition-colors ${selection.active ? 'cursor-pointer hover:bg-hover/60' : ''} ${selected ? 'bg-mint/[0.07]' : ''}`}
    >
      {selection.active && <SelectCheck checked={selected} />}
      <div className="min-w-0 flex-1 basis-48">
        <div className="text-body font-medium text-ivory line-clamp-2" data-noi18n>{a.title}</div>
        <div className="text-footnote text-sage-muted">{a.className} · {a.subjectName || TYPE_LABEL[a.type] || a.type} · Frist {fmt(a.dueAt)}</div>
      </div>
      {/* Abgabefortschritt: Zahl + Balken (nicht nur Farbe) */}
      <div className="w-36 shrink-0">
        <div className="flex items-baseline justify-between text-footnote">
          <span className="text-sage"><b className="text-ivory tabular-nums">{a.submittedCount}</b>/{a.targetCount} abgegeben</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-subtle overflow-hidden" aria-hidden="true"><div className="h-full rounded-full bg-status-present" style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="flex items-center gap-1 shrink-0 md:w-[9.5rem] md:justify-end">
        {a.pendingReview > 0 && <Badge tone="late">{a.pendingReview} zu bewerten</Badge>}
        {!selection.active && (archived ? (
          <button onClick={onRestore} title="Wiederherstellen" aria-label="Wiederherstellen"
                  className="grid place-items-center h-9 w-9 rounded-full text-sage-muted hover:text-ivory hover:bg-hover">
            <ArchiveRestore size={16} />
          </button>
        ) : (
          <>
          <button onClick={onEdit} title="Bearbeiten" aria-label="Aufgabe bearbeiten"
                  className="grid place-items-center h-9 w-9 rounded-full text-sage-muted hover:text-ivory hover:bg-hover">
            <Pencil size={16} />
          </button>
          <button onClick={onDelete} title="Aufgabe entfernen" aria-label="Aufgabe entfernen"
                  className="grid place-items-center h-9 w-9 rounded-full text-sage-muted hover:text-status-absent hover:bg-status-absent/10">
            <Trash2 size={16} />
          </button>
          </>
        ))}
      </div>
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
