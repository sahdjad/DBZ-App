import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Plus, Pencil, Trash2, ChevronDown, History } from 'lucide-react';
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
        !shown ? <Spinner /> : shown.length === 0 ? (
          <Card className="p-5">
            <CardHeader title="Protokolle" icon={ClipboardList} />
            <p className="p-4 text-sage-muted text-sm">Noch keine Protokolle.</p>
          </Card>
        ) : (
          <ProtocolList
            protocols={shown}
            isManager={isManager}
            isLeadership={isLeadership}
            onEdit={openEdit}
            onRemove={remove}
            onDecide={decide}
          />
        )
      )}
    </AppLayout>
  );
}

// Aufbau: oben groß das aktuelle (neueste) Protokoll, darunter die älteren als
// kompakte Liste (Datum + Vorschau). Antippen klappt ein Protokoll auf.
// Bei mehreren Klassen: oben Klasse wählen, jede Klasse hat ihr eigenes „aktuell".
function ProtocolList({ protocols, isManager, isLeadership, onEdit, onRemove, onDecide }) {
  const classes = useMemo(() => {
    const m = new Map();
    protocols.forEach((p) => { if (!m.has(p.classId)) m.set(p.classId, p.className); });
    return [...m.entries()];
  }, [protocols]);
  const [classId, setClassId] = useState(null);
  const activeClass = classes.some(([id]) => id === classId) ? classId : classes[0]?.[0];
  const list = classes.length > 1 ? protocols.filter((p) => p.classId === activeClass) : protocols;
  // Wartende Protokolle (Klassensprecher eingereicht) bleiben für die Lehrkraft
  // immer aufgeklappt sichtbar, damit keine Freigabe untergeht.
  const pending = isManager ? list.filter((p) => p.status === 'submitted') : [];
  const [current, ...older] = list.filter((p) => !pending.includes(p));
  const [openId, setOpenId] = useState(null);
  const actions = { isManager, isLeadership, onEdit, onRemove, onDecide };

  return (
    <div className="space-y-4">
      {classes.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {classes.map(([id, name]) => (
            <button
              key={id}
              onClick={() => { setClassId(id); setOpenId(null); }}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm border transition ${id === activeClass ? 'bg-mint text-white border-mint' : 'border-line text-sage hover:bg-subtle'}`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {pending.map((p) => (
        <Card key={p.id} className="p-4 border-gold/50">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gold mb-2">Wartet auf deine Freigabe</div>
          <ProtocolBody p={p} {...actions} />
        </Card>
      ))}

      {current && (
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/10 text-mint text-[11px] font-bold uppercase tracking-wider px-2.5 py-1">
              <ClipboardList size={13} /> Aktuelles Protokoll
            </span>
          </div>
          <ProtocolBody p={current} {...actions} large />
        </Card>
      )}

      {older.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
            <History size={16} className="text-sage-muted" />
            <span className="text-sm font-medium text-ivory">Ältere Protokolle</span>
            <span className="ml-auto text-xs text-sage-muted">{older.length}</span>
          </div>
          <ul className="divide-y divide-line">
            {older.map((p) => {
              const open = openId === p.id;
              const d = new Date(`${p.date}T12:00:00`);
              return (
                <li key={p.id}>
                  <button
                    onClick={() => setOpenId(open ? null : p.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-subtle/60 transition"
                    aria-expanded={open}
                  >
                    <span className="grid place-items-center shrink-0 w-12 h-12 rounded-xl bg-subtle border border-line leading-none">
                      <span className="text-lg font-semibold text-ivory">{d.getDate()}</span>
                      <span className="text-[10px] uppercase tracking-wide text-sage-muted">{d.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '')}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ivory">{fmtDate(p.date)}</span>
                        {p.status !== 'approved' && <StatusBadge status={p.status} />}
                      </span>
                      <span data-noi18n className="block text-xs text-sage-muted truncate">{preview(p)}</span>
                    </span>
                    <ChevronDown size={18} className={`shrink-0 text-sage-muted transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && (
                    <div className="px-4 pb-4 dbz-fade-in">
                      <ProtocolBody p={p} {...actions} hideDate />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

// Erste Zeile der Themen als Vorschau in der Liste.
const preview = (p) => (p.content?.topics || p.content?.homework || p.content?.notes || '').split('\n').map((x) => x.trim()).filter(Boolean).join(' · ');

function ProtocolBody({ p, isManager, isLeadership, onEdit, onRemove, onDecide, large = false, hideDate = false }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {!hideDate && <div className={`${large ? 'font-display text-xl' : 'text-sm font-medium'} text-ivory`}>{fmtDate(p.date)}</div>}
          <div className="text-xs text-sage-muted">{p.className}{p.createdByName ? ` · ${p.createdByName}` : ''}</div>
          {p.editedAfterApproval && (
            <div className="text-[11px] text-gold mt-0.5">
              Aktualisiert {new Date(p.editedAfterApproval).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}{p.updatedByName ? ` von ${p.updatedByName}` : ''}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {p.status !== 'approved' && hideDate === false && <StatusBadge status={p.status} />}
          {p.canEdit && <button onClick={() => onEdit(p)} className="p-2 rounded-lg text-sage hover:bg-subtle" aria-label="Bearbeiten"><Pencil size={16} /></button>}
          {(isManager || isLeadership) && p.canEdit && <button onClick={() => onRemove(p)} className="p-2 rounded-lg text-status-absent hover:bg-subtle" aria-label="Löschen"><Trash2 size={16} /></button>}
        </div>
      </div>
      <div className="mt-3 space-y-2.5">
        <Section label="Behandelte Themen" text={p.content?.topics} />
        <Section label="Hausaufgaben" text={p.content?.homework} accent />
        <Section label="Besondere Vorkommnisse" text={p.content?.notes} />
      </div>
      {isManager && p.status === 'submitted' && (
        <div className="flex gap-2 mt-3">
          <Button size="sm" onClick={() => onDecide(p.id, 'approve')}>Freigeben</Button>
          <Button size="sm" variant="outline" onClick={() => onDecide(p.id, 'return')}>Zurückgeben</Button>
        </div>
      )}
    </div>
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

  // Schon freigegeben? Dann sieht die Klasse jede Änderung sofort (mit Hinweis).
  const approved = protocols.find((p) => p.id === form.id)?.status === 'approved';
  const changeKey = (patch) => setForm((f) => ({ ...f, ...patch, id: undefined, content: f.id ? { ...EMPTY } : f.content }));

  const save = async (submit) => {
    setBusy(true);
    try {
      await api.post(`/classes/${form.classId}/protocols`, { date: form.date, content: form.content, submit });
      toast.push(approved ? 'Gespeichert – die Klasse wurde über die Änderung benachrichtigt' : isRep ? (submit ? 'Eingereicht – die Lehrkraft bestätigt' : 'Entwurf gespeichert') : 'Protokoll gespeichert', 'success');
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
        <Field label="Behandelte Themen" hint="Was wurde im Unterricht durchgenommen?" value={form.content.topics} onChange={(v) => set('topics', v)} />
        <Field label="Aufgegebene Hausaufgaben" hint="Was ist bis zum nächsten Mal zu tun?" value={form.content.homework} onChange={(v) => set('homework', v)} />
        <Field label="Besondere Vorkommnisse" hint="Optional" value={form.content.notes} onChange={(v) => set('notes', v)} />
        {approved && (
          <p className="text-xs text-sage-muted rounded-lg border border-line bg-subtle/40 px-3 py-2">
            Dieses Protokoll ist schon freigegeben. Wenn du etwas änderst, bekommt die Klasse eine Nachricht „Protokoll aktualisiert“{isRep ? ' und die Lehrkraft wird informiert' : ''}.
          </p>
        )}
        <div className="flex gap-2 flex-wrap">
          {isRep && !approved ? (
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

// Feste Überschrift (Vorlage) klar abgesetzt vom geschriebenen Inhalt:
// kleine, fette, farbige Überschrift oben -- darunter der Text in normaler Schrift.
function Section({ label, text, accent = false }) {
  if (!text) return null;
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${accent ? 'border-gold/40 bg-gold/[0.07]' : 'border-line bg-card'}`}>
      <div className={`text-[11px] font-bold uppercase tracking-wider ${accent ? 'text-gold' : 'text-mint'}`}>{label}</div>
      <p data-noi18n className="mt-1 text-[15px] leading-relaxed text-ivory whitespace-pre-line">{text}</p>
    </div>
  );
}

function Field({ label, hint, value, onChange }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wider text-mint">{label}</span>
      {hint && <span className="block text-[11px] text-sage-muted">{hint}</span>}
      <textarea className="input mt-1.5 text-[15px] leading-relaxed" rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Hier schreiben …" />
    </label>
  );
}
