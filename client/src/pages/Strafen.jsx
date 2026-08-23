import { useEffect, useMemo, useState } from 'react';
import { Scale, Plus, Check, X, Trash2, HandCoins, FileText } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, Spinner, useToast } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];
const fmt = (iso) => new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' });
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const penAmount = (p) => (p.effectiveAmount ?? p.amount); // inkl. Zuschlag bei Überfälligkeit
const penText = (p) => (p.type === 'money' ? `${penAmount(p)} €` : `${penAmount(p)} Seiten`);

const STATUS = {
  pending: { label: 'Wartet auf Genehmigung', tone: 'neutral' },
  approved: { label: 'Offen', tone: 'late' },
  settled: { label: 'Erledigt', tone: 'present' },
  rejected: { label: 'Abgelehnt', tone: 'neutral' },
};

export default function Strafen() {
  const { user } = useAuth();
  return (
    <AppLayout title="Strafen">
      {MANAGER.includes(user.role) ? (
        <ManagerView />
      ) : user.role === 'klassensprecher' ? (
        <SprecherView />
      ) : (
        <ReadView role={user.role} />
      )}
    </AppLayout>
  );
}

/** Fasst offene (genehmigte) Strafen zu Schulden je Schüler zusammen. */
function debtSummary(list) {
  const byStudent = new Map();
  for (const p of list) {
    if (p.status !== 'approved') continue;
    const cur = byStudent.get(p.studentId) || { studentId: p.studentId, studentName: p.studentName, money: 0, pages: 0, count: 0 };
    if (p.type === 'money') cur.money += penAmount(p);
    else cur.pages += penAmount(p);
    cur.count += 1;
    byStudent.set(p.studentId, cur);
  }
  return [...byStudent.values()].sort((a, b) => a.studentName.localeCompare(b.studentName));
}

// Kumulierte offene Summe; klickbar für die Detailübersicht.
function TotalsBar({ list, onToggle, open }) {
  const money = list.filter((p) => p.status === 'approved' && p.type === 'money').reduce((s, p) => s + penAmount(p), 0);
  const pages = list.filter((p) => p.status === 'approved' && p.type === 'pages').reduce((s, p) => s + penAmount(p), 0);
  const Wrap = onToggle ? 'button' : 'div';
  return (
    <Wrap type={onToggle ? 'button' : undefined} onClick={onToggle} className="flex flex-wrap gap-2 items-center text-left">
      <span className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-full bg-status-late/12 text-status-late">
        <HandCoins size={15} /> Offen: {money} €
      </span>
      <span className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-full bg-status-late/12 text-status-late">
        <FileText size={15} /> Offen: {pages} Seiten
      </span>
      {onToggle && <span className="text-xs text-mint-light underline">{open ? 'Details ausblenden' : 'Details anzeigen'}</span>}
    </Wrap>
  );
}

function PenaltyRow({ p, actions }) {
  const st = STATUS[p.status] || { label: p.status, tone: 'neutral' };
  return (
    <div className="py-3 flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-ivory">{p.studentName}</span>
          <span className={`font-mono text-sm ${p.type === 'money' ? 'text-mint-light' : 'text-sage'}`}>{penText(p)}</span>
          <Badge tone={st.tone}>{st.label}</Badge>
          {p.overdue && <Badge tone="absent">überfällig</Badge>}
          {p.surcharge > 0 && <span className="text-[11px] text-status-absent">inkl. {p.surcharge}{p.type === 'money' ? ' €' : ' Seiten'} Zuschlag</span>}
        </div>
        <div className="text-xs text-sage-muted mt-0.5">
          Grund: {p.reason} · {fmt(p.createdAt)}
          {p.dueDate ? ` · Frist: ${fmtDay(p.dueDate)}` : ''}
          {p.createdByName ? ` · erfasst von ${p.createdByName}` : ''}
          {p.rejectionReason ? ` · Ablehnung: ${p.rejectionReason}` : ''}
        </div>
      </div>
      {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

// Vorlagen für häufige Verstöße (Vorschlag – Lehrer/Sprecher kann alles anpassen).
const TEMPLATES = [
  { label: 'Verspätung', reason: 'Verspätung', type: 'money', amount: 2 },
  { label: 'Stören im Unterricht', reason: 'Stören im Unterricht', type: 'pages', amount: 5 },
  { label: 'Hausaufgaben vergessen', reason: 'Hausaufgaben vergessen', type: 'pages', amount: 5 },
  { label: 'Fehlende Mitarbeit', reason: 'Fehlende Mitarbeit', type: 'pages', amount: 5 },
];

function RecordForm({ onCreated }) {
  const toast = useToast();
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState({ studentId: '', type: 'pages', amount: 5, reason: '', dueInDays: '' });

  useEffect(() => {
    api.get('/classes').then((d) => {
      setClasses(d.classes);
      setClassId(d.classes[0]?.id || '');
    });
  }, []);
  useEffect(() => {
    if (!classId) return;
    api
      .get(`/classes/${classId}/students`)
      .then((d) => {
        const only = d.students.filter((s) => s.role === 'schueler');
        setStudents(only);
        setForm((f) => ({ ...f, studentId: only[0]?.id || '' }));
      })
      .catch(() => setStudents([]));
  }, [classId]);

  const save = async (e) => {
    e.preventDefault();
    try {
      const payload = { classId, studentId: form.studentId, type: form.type, amount: Number(form.amount), reason: form.reason };
      if (form.dueInDays !== '') payload.dueInDays = Number(form.dueInDays);
      await api.post('/penalties', payload);
      toast.push('Strafe erfasst', 'success');
      setForm((f) => ({ ...f, reason: '' }));
      onCreated?.();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  return (
    <Card className="p-5">
      <CardHeader title="Neue Strafe erfassen" subtitle="Seiten schreiben oder Geldstrafe" icon={Scale} />
      <form onSubmit={save} className="p-4 space-y-3">
        {/* Vorlagen für häufige Gründe (füllen Grund/Art/Höhe vor – frei änderbar) */}
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-sage-muted self-center mr-1">Vorlage:</span>
          {TEMPLATES.map((t) => (
            <button key={t.label} type="button" onClick={() => setForm((f) => ({ ...f, reason: t.reason, type: t.type, amount: t.amount }))}
              className="text-xs px-2.5 py-1 rounded-full border border-line text-sage hover:bg-hover">{t.label}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {classes.length > 1 && (
            <label className="block sm:col-span-2">
              <span className="text-sm text-sage">Klasse</span>
              <select className="input mt-1" value={classId} onChange={(e) => setClassId(e.target.value)}>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-sm text-sage">Schüler</span>
            <select className="input mt-1" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} required>
              {students.length === 0 && <option value="">– keine Schüler –</option>}
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-sage">Art</span>
              <select className="input mt-1" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="pages">Seiten schreiben</option>
                <option value="money">Geldstrafe (€)</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-sage">{form.type === 'money' ? 'Betrag (€)' : 'Seiten'}</span>
              <input type="number" min="1" step={form.type === 'money' ? '0.5' : '1'} className="input mt-1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            </label>
          </div>
        </div>
        <label className="block">
          <span className="text-sm text-sage">Grund</span>
          <textarea className="input mt-1" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required placeholder="z. B. Hausaufgabe wiederholt vergessen" />
        </label>
        <label className="block sm:max-w-xs">
          <span className="text-sm text-sage">Frist (Tage, leer = Standard)</span>
          <input type="number" min="0" className="input mt-1" value={form.dueInDays} placeholder="Standard aus Einstellungen" onChange={(e) => setForm({ ...form, dueInDays: e.target.value })} />
        </label>
        <Button type="submit" disabled={!form.studentId}><Plus size={18} /> Erfassen</Button>
      </form>
    </Card>
  );
}

function ManagerView() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const load = () => api.get('/penalties').then((d) => setData(d));
  useEffect(() => { load(); }, []);

  const act = async (id, action, body) => {
    try {
      await api.post(`/penalties/${id}/${action}`, body || {});
      toast.push('Gespeichert', 'success');
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };
  const reject = async (id) => {
    const reason = window.prompt('Grund der Ablehnung (optional):') ?? '';
    await act(id, 'reject', { reason });
  };
  const patchPen = async (id, body, msg) => {
    try { await api.patch(`/penalties/${id}`, body); toast.push(msg || 'Angepasst', 'success'); load(); }
    catch (err) { toast.push(err.message, 'error'); }
  };
  const changeAmount = (p) => {
    const v = window.prompt(`Neue Höhe (${p.type === 'money' ? '€' : 'Seiten'}):`, String(p.amount));
    if (v == null) return; const a = Number(v);
    if (!(a > 0)) return toast.push('Ungültige Höhe', 'error');
    patchPen(p.id, { amount: a }, 'Höhe angepasst');
  };
  const convert = (p) => {
    const nt = p.type === 'money' ? 'pages' : 'money';
    const v = window.prompt(`In ${nt === 'money' ? 'Geldstrafe (€)' : 'Seiten schreiben'} umwandeln – Höhe:`, nt === 'pages' ? '10' : '2');
    if (v == null) return; const a = Number(v);
    if (!(a > 0)) return toast.push('Ungültige Höhe', 'error');
    patchPen(p.id, { type: nt, amount: a }, 'Umgewandelt');
  };

  if (!data) return <Spinner />;
  const list = data.penalties;
  const pending = list.filter((p) => p.status === 'pending');
  const open = list.filter((p) => p.status === 'approved');
  const done = list.filter((p) => p.status === 'settled' || p.status === 'rejected');
  const debts = debtSummary(list);

  return (
    <div className="space-y-4">
      <RecordForm onCreated={load} />

      <TotalsBar list={list} />

      {pending.length > 0 && (
        <Card className="p-5">
          <CardHeader title="Zu genehmigen" subtitle={`${pending.length} vom Klassensprecher erfasst`} />
          <div className="divide-y divide-line">
            {pending.map((p) => (
              <PenaltyRow
                key={p.id}
                p={p}
                actions={
                  <>
                    <Button size="sm" variant="ghost" onClick={() => changeAmount(p)}>Höhe</Button>
                    <Button size="sm" onClick={() => act(p.id, 'approve')}><Check size={16} /> Genehmigen</Button>
                    <Button size="sm" variant="danger" onClick={() => reject(p.id)}><X size={16} /> Ablehnen</Button>
                  </>
                }
              />
            ))}
          </div>
        </Card>
      )}

      {debts.length > 0 && (
        <Card className="p-5">
          <CardHeader title="Offene Schulden je Schüler" subtitle="Zum Einzug durch die Leitung" icon={HandCoins} />
          <div className="divide-y divide-line">
            {debts.map((d) => (
              <div key={d.studentId} className="py-3 flex items-center justify-between gap-3">
                <span className="text-ivory">{d.studentName}</span>
                <div className="flex items-center gap-2 text-sm">
                  {d.money > 0 && <span className="font-mono text-mint-light">{d.money} €</span>}
                  {d.pages > 0 && <span className="font-mono text-sage">{d.pages} Seiten</span>}
                  <span className="text-xs text-sage-muted">({d.count})</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <CardHeader title="Offene Strafen" subtitle="Genehmigt – als erledigt verbuchen, wenn bezahlt / abgegeben" />
        <div className="divide-y divide-line">
          {open.length === 0 ? (
            <p className="p-4 text-sage-muted text-sm">Keine offenen Strafen.</p>
          ) : (
            open.map((p) => (
              <PenaltyRow
                key={p.id}
                p={p}
                actions={
                  <>
                    <Button size="sm" variant="ghost" onClick={() => changeAmount(p)}>Höhe</Button>
                    <Button size="sm" variant="ghost" onClick={() => convert(p)}>{p.type === 'money' ? '→ Seiten' : '→ Geld'}</Button>
                    <Button size="sm" variant="outline" onClick={() => act(p.id, 'settle')}><Check size={16} /> Erledigt</Button>
                  </>
                }
              />
            ))
          )}
        </div>
      </Card>

      {done.length > 0 && (
        <Card className="p-5">
          <CardHeader title="Verlauf" subtitle="Erledigt & abgelehnt" />
          <div className="divide-y divide-line">
            {done.map((p) => <PenaltyRow key={p.id} p={p} />)}
          </div>
        </Card>
      )}
    </div>
  );
}

function SprecherView() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const load = () => api.get('/penalties').then((d) => setData(d));
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    if (!window.confirm('Diesen offenen Eintrag löschen?')) return;
    try {
      await api.del(`/penalties/${id}`);
      toast.push('Gelöscht', 'success');
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  if (!data) return <Spinner />;
  const list = data.penalties;

  return (
    <div className="space-y-4">
      <RecordForm onCreated={load} />
      <Card className="p-5">
        <CardHeader title="Strafen der Klasse" subtitle="Vom Lehrer noch zu genehmigen bzw. bereits entschieden" />
        <div className="divide-y divide-line">
          {list.length === 0 ? (
            <p className="p-4 text-sage-muted text-sm">Noch keine Strafen erfasst.</p>
          ) : (
            list.map((p) => (
              <PenaltyRow
                key={p.id}
                p={p}
                actions={
                  p.status === 'pending' && p.createdBy && (
                    <Button size="sm" variant="ghost" onClick={() => remove(p.id)} aria-label="Löschen"><Trash2 size={16} /></Button>
                  )
                }
              />
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function ReadView({ role }) {
  const [list, setList] = useState(null);
  const [children, setChildren] = useState([]);
  const [childId, setChildId] = useState('');

  useEffect(() => {
    if (role === 'eltern') {
      api.get('/dashboard').then((d) => {
        setChildren(d.children || []);
        setChildId(d.children?.[0]?.id || '');
      });
    } else {
      api.get('/penalties').then((d) => setList(d.penalties));
    }
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (role === 'eltern' && childId) {
      setList(null);
      api.get(`/penalties?studentId=${childId}`).then((d) => setList(d.penalties));
    }
    // eslint-disable-next-line
  }, [childId]);

  const [showDetails, setShowDetails] = useState(false);
  const open = useMemo(() => (list || []).filter((p) => p.status === 'approved'), [list]);
  const done = useMemo(() => (list || []).filter((p) => p.status === 'settled'), [list]);

  return (
    <div className="space-y-4">
      {role === 'eltern' && children.length > 0 && (
        <select className="input w-auto" value={childId} onChange={(e) => setChildId(e.target.value)}>
          {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}

      {list && <TotalsBar list={list} onToggle={() => setShowDetails((s) => !s)} open={showDetails} />}

      {/* Detailübersicht: wann, Grund, welche Strafe, erledigt? */}
      {showDetails && list && (
        <Card className="p-5">
          <CardHeader title="Detailübersicht" subtitle="Alle Strafen mit Grund, Datum und Status" icon={Scale} />
          <div className="divide-y divide-line">
            {list.length === 0 ? <p className="p-4 text-sage-muted text-sm">Keine Einträge.</p> : list.map((p) => <PenaltyRow key={p.id} p={p} />)}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <CardHeader title={role === 'eltern' ? 'Offene Strafen' : 'Meine offenen Strafen'} icon={Scale} />
        {!list ? (
          <Spinner />
        ) : open.length === 0 ? (
          <p className="p-4 text-sage-muted text-sm">Keine offenen Strafen. 🎉</p>
        ) : (
          <div className="divide-y divide-line">{open.map((p) => <PenaltyRow key={p.id} p={p} />)}</div>
        )}
      </Card>

      {done.length > 0 && (
        <Card className="p-5">
          <CardHeader title="Erledigt" />
          <div className="divide-y divide-line">{done.map((p) => <PenaltyRow key={p.id} p={p} />)}</div>
        </Card>
      )}
    </div>
  );
}
