// Bausteine der Unterricht-Seite: Zeiten & Regeln je Klasse, vergangene
// Unterrichtstage, gemeinsamer Schultag (Leitung/Admin) und Tagesüberblick.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings2, History, School, Plus, Trash2, Printer, CalendarDays, Gauge, ArrowLeft, ChevronRight, CalendarPlus } from 'lucide-react';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, Spinner, useToast, useBackToClose } from '../components/ui.jsx';
import { QrStage, printQrCode } from '../components/QrCode.jsx';

export const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const fmtDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function Field({ label, hint, children }) {
  return (
    <label className="block min-w-0">
      <span className="text-sm text-sage">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="text-[11px] text-sage-muted">{hint}</span>}
    </label>
  );
}

// Unterrichtszeiten und Pünktlichkeitsregeln der Klasse -- stellt die
// Lehrkraft selbst ein, unabhängig von anderen Klassen und der Leitung.
export function ClassSettingsCard({ classId, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get('/classes').then((d) => {
      const c = d.classes.find((x) => x.id === classId);
      if (!c) return;
      setF({
        weekday: c.weekday ?? 6, startTime: c.startTime || '14:00', endTime: c.endTime || '18:00',
        lateAfterMinutes: c.rules?.lateAfterMinutes ?? 5,
        unexcusedLateAfterMinutes: c.rules?.unexcusedLateAfterMinutes ?? '',
        checkinOpensBefore: c.rules?.checkinOpensBefore ?? 15,
      });
    });
  }, [classId]);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/classes/${classId}/settings`, {
        ...f,
        weekday: Number(f.weekday),
        lateAfterMinutes: Number(f.lateAfterMinutes),
        unexcusedLateAfterMinutes: f.unexcusedLateAfterMinutes === '' ? null : Number(f.unexcusedLateAfterMinutes),
        checkinOpensBefore: Number(f.checkinOpensBefore),
      });
      toast.push('Unterrichtszeiten gespeichert', 'success');
      onSaved?.();
    } catch (err) { toast.push(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Card className="p-5">
      <CardHeader title="QR-Check-in: Zeiten & Regeln" subtitle="Gilt nur für diese Klasse – hier stellst du ein, wann der QR-Code gilt" icon={Settings2} />
      {!f ? <Spinner /> : (
        <form onSubmit={save} className="p-4 grid gap-3 grid-cols-2">
          <div className="col-span-2"><Field label="Wochentag">
            <select className="input" value={f.weekday} onChange={(e) => setF({ ...f, weekday: e.target.value })}>
              {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </Field></div>
          <Field label="Beginn"><input type="time" className="input" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} required /></Field>
          <Field label="Ende"><input type="time" className="input" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} required /></Field>
          <div className="col-span-2"><Field label="Pünktlich bis (Minuten nach Beginn)" hint="Wer bis dahin eincheckt, gilt als pünktlich.">
            <input type="number" inputMode="numeric" min="0" max="120" className="input" value={f.lateAfterMinutes} onChange={(e) => setF({ ...f, lateAfterMinutes: e.target.value })} />
          </Field></div>
          <div className="col-span-2"><Field label="Unentschuldigt zu spät ab (Minuten)" hint="Leer lassen = keine Grenze.">
            <input type="number" inputMode="numeric" min="1" max="300" className="input" value={f.unexcusedLateAfterMinutes} onChange={(e) => setF({ ...f, unexcusedLateAfterMinutes: e.target.value })} placeholder="z. B. 30" />
          </Field></div>
          <div className="col-span-2"><Field label="QR-Check-in öffnet (Minuten vor Beginn)" hint="Vorher kann niemand einchecken.">
            <input type="number" inputMode="numeric" min="0" max="120" className="input" value={f.checkinOpensBefore} onChange={(e) => setF({ ...f, checkinOpensBefore: e.target.value })} />
          </Field></div>
          <div className="col-span-2 flex items-end"><Button type="submit" loading={busy}>Speichern</Button></div>
        </form>
      )}
    </Card>
  );
}

// Vergangene Unterrichtstage: einzelne (z. B. Testläufe) oder alle löschen.
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function SessionHistoryCard({ classId, className, onChanged }) {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [sel, setSel] = useState([]);
  const [editing, setEditing] = useState(null); // { id, date }
  const [newDate, setNewDate] = useState('');
  const load = () => api.get(`/classes/${classId}/sessions`).then((d) => { setList(d.sessions); setSel([]); });
  useEffect(() => { load(); }, [classId]);
  const del = async (ids) => {
    if (!ids.length) return;
    if (!window.confirm(`${ids.length} Unterrichtstag(e) mit allen Anwesenheitseinträgen löschen? Das zählt danach nirgends mehr (Statistik, Zeugnis).`)) return;
    try {
      const r = await api.post('/sessions/bulk-delete', { ids });
      toast.push(`${r.sessions} Tag(e) gelöscht (${r.entries} Einträge)`, 'success');
      load(); onChanged?.();
    } catch (err) { toast.push(err.message, 'error'); }
  };
  const resetAll = async () => {
    const name = window.prompt(`ALLE Anwesenheitsdaten von „${className}" löschen (alle Tage, alle Check-ins)? Zur Bestätigung den Klassennamen eingeben:`);
    if (name == null) return;
    try {
      const r = await api.post(`/classes/${classId}/reset-data`, { scopes: ['attendance'], confirmName: name.trim() });
      toast.push(`Alles gelöscht (${r.counts.sessions || 0} Tage, ${r.counts.attendance || 0} Einträge). Vorher wurde eine Sicherung angelegt.`, 'success');
      load(); onChanged?.();
    } catch (err) { toast.push(err.message, 'error'); }
  };
  const openDate = async (date) => {
    if (!date) return;
    try {
      const r = await api.post(`/classes/${classId}/days`, { date });
      setEditing({ id: r.session.id, date });
      setNewDate('');
    } catch (err) { toast.push(err.message, 'error'); }
  };
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <Card className="p-5">
      <CardHeader title="Anwesenheit nachtragen & korrigieren" subtitle="Tag antippen zum Bearbeiten – auch Tage, die noch fehlen" icon={History} />
      <div className="flex items-end gap-2 pb-3">
        <label className="block flex-1">
          <span className="text-xs text-sage">Tag nachtragen</span>
          <input type="date" className="input mt-1" value={newDate} max={localToday()} onChange={(e) => setNewDate(e.target.value)} />
        </label>
        <Button onClick={() => openDate(newDate)} disabled={!newDate}><CalendarPlus size={16} /> Öffnen</Button>
      </div>
      {!list ? <Spinner /> : list.length === 0 ? <p className="p-4 text-sm text-sage-muted">Noch keine Unterrichtstage.</p> : (
        <ul className="divide-y divide-line max-h-96 overflow-y-auto dbz-scroll">
          {list.map((x) => (
            <li key={x.id} className="flex items-center gap-3 py-1 px-1">
              <input type="checkbox" aria-label={`${fmtDate(x.date)} auswählen`} checked={sel.includes(x.id)} onChange={() => toggle(x.id)} />
              <button onClick={() => setEditing({ id: x.id, date: x.date })} className="flex flex-1 min-w-0 items-center gap-2 rounded-lg py-1.5 text-left hover:bg-subtle">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ivory">{fmtDate(x.date)} {x.schoolDay && <Badge tone="mint">Schultag</Badge>}</div>
                  <div className="text-xs text-sage-muted">{x.entries ? `${x.present} da · ${x.late} spät · ${x.excused} entsch. · ${x.unexcused} unentsch.` : 'keine Einträge – antippen zum Eintragen'}</div>
                </div>
                <ChevronRight size={16} className="text-sage-muted shrink-0" />
              </button>
              <button onClick={() => del([x.id])} className="p-1.5 rounded-lg text-sage-muted hover:text-status-absent hover:bg-status-absent/10" aria-label="Tag löschen"><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 pt-3">
        {sel.length > 0 && <Button size="sm" variant="danger" onClick={() => del(sel)}><Trash2 size={16} /> {sel.length} löschen</Button>}
        <Button size="sm" variant="ghost" onClick={resetAll}>Alle Anwesenheitsdaten löschen …</Button>
      </div>
      {editing && <DayEditor sessionId={editing.id} date={editing.date} onClose={() => { setEditing(null); load(); onChanged?.(); }} />}
    </Card>
  );
}

// Ein Unterrichtstag im Nachhinein: Status je Schüler setzen (Handy-tauglich).
const DAY_STATUSES = [
  { key: 'present', label: 'Da', status: 'present', cls: 'bg-status-present text-white' },
  { key: 'late', label: 'Spät', status: 'late', cls: 'bg-status-late text-white' },
  { key: 'sick', label: 'Krank', status: 'excused', note: 'Krank', cls: 'bg-status-excused text-white' },
  { key: 'excused', label: 'Entsch.', status: 'excused', cls: 'bg-status-excused text-white' },
  { key: 'unexcused', label: 'Fehlt', status: 'unexcused', cls: 'bg-status-absent text-white' },
];
const keyOf = (r) => {
  if (r.status === 'excused' && /^krank/i.test(r.note || '')) return 'sick';
  return ['present', 'late', 'excused', 'unexcused'].includes(r.status) ? r.status : r.status === 'left_early' ? 'present' : null;
};

function DayEditor({ sessionId, date, onClose }) {
  useBackToClose(true, onClose);
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = () => api.get(`/sessions/${sessionId}/attendance`).then((d) => setRows(d.attendance.sort((a, b) => a.name.localeCompare(b.name, 'de'))));
  useEffect(() => { load().catch((e) => toast.push(e.message, 'error')); }, [sessionId]);

  const setStatus = async (r, opt, minutesLate) => {
    setBusy(r.studentId);
    try {
      const body = { studentId: r.studentId, status: opt.status, note: opt.note || (keyOf(r) === 'sick' ? '' : undefined) };
      if (opt.status === 'late') body.minutesLate = minutesLate ?? (r.minutesLate || 5);
      await api.post(`/sessions/${sessionId}/attendance`, body);
      await load();
    } catch (err) { toast.push(err.message, 'error'); }
    setBusy(null);
  };
  const clear = async (r) => {
    setBusy(r.studentId);
    try { await api.del(`/sessions/${sessionId}/attendance/${r.studentId}`); await load(); }
    catch (err) { toast.push(err.message, 'error'); }
    setBusy(null);
  };
  const allPresent = async () => {
    const open = (rows || []).filter((r) => r.status === 'open');
    if (!open.length) return;
    setBusy('all');
    try {
      for (const r of open) await api.post(`/sessions/${sessionId}/attendance`, { studentId: r.studentId, status: 'present' });
      await load();
    } catch (err) { toast.push(err.message, 'error'); }
    setBusy(null);
  };

  const counts = (rows || []).reduce((acc, r) => { const k = keyOf(r) || 'open'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});

  return createPortal(
    <div className="fixed inset-0 z-[85] flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label={`Anwesenheit ${fmtDate(date)}`}>
      <div className="flex items-center gap-2 border-b border-line bg-card px-3" style={{ paddingTop: 'max(env(safe-area-inset-top), 0.6rem)', paddingBottom: '0.6rem' }}>
        <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-3 py-2 text-sm text-ivory"><ArrowLeft size={18} /> Zurück</button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-medium text-ivory">{fmtDate(date)}</div>
          <div className="text-[11px] text-sage-muted">{rows ? `${counts.present || 0} da · ${counts.late || 0} spät · ${(counts.sick || 0) + (counts.excused || 0)} entsch. · ${counts.unexcused || 0} fehlt · ${counts.open || 0} offen` : ' '}</div>
        </div>
        <span className="w-16" />
      </div>
      <div className="flex-1 overflow-y-auto p-3 pb-10">
        {!rows ? <Spinner /> : rows.length === 0 ? <p className="p-4 text-sm text-sage-muted">Keine Schüler in dieser Klasse.</p> : (
          <>
            {counts.open > 0 && (
              <div className="mb-3 flex justify-end">
                <Button size="sm" variant="outline" onClick={allPresent} disabled={busy === 'all'}>Alle offenen auf „Da“</Button>
              </div>
            )}
            <ul className="space-y-2">
              {rows.map((r) => {
                const k = keyOf(r);
                return (
                  <li key={r.studentId} className={`rounded-xl border border-line bg-card p-3 ${busy === r.studentId ? 'opacity-60' : ''}`}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-ivory">{r.name}</span>
                      {r.status !== 'open'
                        ? <button onClick={() => clear(r)} className="shrink-0 text-[11px] text-sage-muted underline">Eintrag entfernen</button>
                        : <span className="shrink-0 text-[11px] text-sage-muted">kein Eintrag</span>}
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {DAY_STATUSES.map((opt) => (
                        <button
                          key={opt.key}
                          disabled={busy === r.studentId}
                          onClick={() => setStatus(r, opt)}
                          className={`rounded-lg px-1 py-2 text-xs font-medium transition ${k === opt.key ? opt.cls : 'bg-subtle text-sage'}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {k === 'late' && (
                      <label className="mt-2 flex items-center gap-2 text-xs text-sage">
                        Minuten zu spät:
                        <input
                          type="number"
                          min={0}
                          max={600}
                          defaultValue={r.minutesLate || 0}
                          className="input w-20 py-1 text-sm"
                          onBlur={(e) => { const v = parseInt(e.target.value, 10); if (Number.isInteger(v) && v !== (r.minutesLate || 0)) setStatus(r, DAY_STATUSES[1], v); }}
                        />
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

// Hinweis für Lehrkräfte, wenn ein gemeinsamer Schultag ansteht.
export function SchoolDayBanner() {
  const [days, setDays] = useState([]);
  useEffect(() => { api.get('/school-days').then((d) => setDays(d.days.filter((x) => x.date >= new Date().toISOString().slice(0, 10)).slice(0, 2))).catch(() => {}); }, []);
  if (!days.length) return null;
  return (
    <div className="mb-4 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ivory flex items-start gap-3">
      <School size={18} className="text-gold shrink-0 mt-0.5" />
      <div>
        {days.map((d) => (
          <div key={d.id}><b>{d.isToday ? 'Heute' : fmtDate(d.date)}:</b> {d.title}, {d.startTime}–{d.endTime} Uhr – ganze Schule gemeinsam, eingecheckt wird mit dem Schul-QR-Code.</div>
        ))}
      </div>
    </div>
  );
}

// Gemeinsamer Unterricht der ganzen Koran-Schule (Leitung/Admin).
export function SchoolDaysCard() {
  const toast = useToast();
  const [days, setDays] = useState(null);
  const [show, setShow] = useState(false);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [f, setF] = useState({ date: todayKey, startTime: '11:00', endTime: '14:00', title: 'Gemeinsamer Unterricht', lateAfterMinutes: 5 });
  const load = () => api.get('/school-days').then((d) => setDays(d.days));
  useEffect(() => { load(); }, []);
  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post('/school-days', { ...f, lateAfterMinutes: Number(f.lateAfterMinutes) });
      toast.push('Schultag angelegt – alle wurden benachrichtigt', 'success');
      setShow(false); load();
    } catch (err) { toast.push(err.message, 'error'); }
  };
  const remove = async (d) => {
    if (!window.confirm(`Gemeinsamen Unterricht am ${fmtDate(d.date)} löschen? Die Klassen haben dann wieder ihre eigenen Zeiten.`)) return;
    try { await api.del(`/school-days/${d.id}`); toast.push('Gelöscht', 'success'); load(); } catch (err) { toast.push(err.message, 'error'); }
  };
  const todayDay = days?.find((d) => d.isToday);
  return (
    <Card className="p-5 mb-4">
      <CardHeader
        title="Gemeinsamer Unterricht (ganze Schule)"
        subtitle="Ein QR-Code für alle Klassen – nur an diesem Tag gültig"
        icon={School}
        action={<Button size="sm" onClick={() => setShow((x) => !x)}><Plus size={16} /> Neu</Button>}
      />
      <p className="px-4 pt-3 text-sm text-sage-muted">
        Normalerweise hat jede Klasse ihren eigenen QR-Code und ihre eigenen Zeiten (stellt die Lehrkraft ein). Nur wenn die ganze Koran-Schule gemeinsam Unterricht hat, legst du hier einen Tag an.
      </p>
      {show && (
        <form onSubmit={create} className="p-4 grid gap-3 grid-cols-2 lg:grid-cols-4 items-end">
          <div className="col-span-2 lg:col-span-4"><Field label="Bezeichnung"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field></div>
          <div className="col-span-2 lg:col-span-1"><Field label="Datum"><input type="date" className="input" min={todayKey} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></Field></div>
          <Field label="Beginn"><input type="time" className="input" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} required /></Field>
          <Field label="Ende"><input type="time" className="input" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} required /></Field>
          <div className="col-span-2 lg:col-span-1"><Field label="Pünktlich bis (Min.)"><input type="number" inputMode="numeric" min="0" max="120" className="input" value={f.lateAfterMinutes} onChange={(e) => setF({ ...f, lateAfterMinutes: e.target.value })} /></Field></div>
          <div className="col-span-2 lg:col-span-4"><Button type="submit">Anlegen & alle benachrichtigen</Button></div>
        </form>
      )}
      {todayDay?.code && (
        <div className="p-4 max-w-md mx-auto w-full">
          <QrStage value={todayDay.code} title={todayDay.title} subtitle={`Heute · ${todayDay.startTime}–${todayDay.endTime}`} caption="Beim Ankommen scannen" size={210} />
          <div className="flex justify-center mt-3">
            <Button variant="outline" size="sm" onClick={() => printQrCode(todayDay.code, todayDay.title, 'Beim Ankommen scannen')}><Printer size={16} /> QR drucken</Button>
          </div>
        </div>
      )}
      {!days ? <Spinner /> : days.length === 0 ? <p className="p-4 text-sm text-sage-muted">Kein gemeinsamer Unterricht geplant.</p> : (
        <ul className="divide-y divide-line mt-2">
          {days.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5 px-1">
              <CalendarDays size={16} className="text-mint shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ivory">{fmtDate(d.date)} · {d.title}</div>
                <div className="text-xs text-sage-muted">{d.startTime}–{d.endTime} Uhr{d.createdByName ? ` · angelegt von ${d.createdByName}` : ''}</div>
              </div>
              {d.code && !d.isToday && d.date > todayKey && (
                <Button size="sm" variant="ghost" onClick={() => printQrCode(d.code, d.title, 'Beim Ankommen scannen')} aria-label="QR drucken"><Printer size={16} /></Button>
              )}
              <button onClick={() => remove(d)} className="p-1.5 rounded-lg text-sage-muted hover:text-status-absent hover:bg-status-absent/10" aria-label="Löschen"><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// Tagesüberblick für die DBZ-Leitung: nur Zahlen je Klasse, keine Namen.
export function SchoolTodayCard() {
  const [data, setData] = useState(null);
  useEffect(() => {
    const load = () => api.get('/school/today').then(setData).catch(() => setData({ classes: [] }));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  if (!data) return <Card className="p-5 mb-4"><Spinner /></Card>;
  const withLesson = data.classes.filter((c) => c.lessonToday);
  return (
    <Card className="p-5 mb-4">
      <CardHeader title="Heute in der Schule" subtitle={withLesson.length ? `${withLesson.length} Klasse(n) haben heute Unterricht` : 'Heute hat keine Klasse Unterricht'} icon={Gauge} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 p-3">
        {(withLesson.length ? withLesson : data.classes).map((c) => (
          <div key={c.id} className="rounded-xl border border-line bg-subtle/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ivory font-medium">{c.name}</span>
              <span className="text-xs text-sage-muted">{WEEKDAYS[c.weekday]?.slice(0, 2)} {c.startTime}–{c.endTime}</span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1 text-center text-xs">
              <div><div className="text-lg text-status-present font-semibold">{c.present}</div>da</div>
              <div><div className="text-lg text-status-late font-semibold">{c.late}</div>spät</div>
              <div><div className="text-lg text-status-excused font-semibold">{c.excused}</div>entsch.</div>
              <div><div className="text-lg text-sage font-semibold">{c.open}</div>offen</div>
            </div>
            {c.lateUnexcused > 0 && <div className="text-[11px] text-status-absent mt-1">{c.lateUnexcused} davon unentschuldigt zu spät</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}
