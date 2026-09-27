// Bausteine der Unterricht-Seite: Zeiten & Regeln je Klasse, vergangene
// Unterrichtstage, gemeinsamer Schultag (Leitung/Admin) und Tagesüberblick.
import { useEffect, useState } from 'react';
import { Settings2, History, School, Plus, Trash2, Printer, CalendarDays, Gauge } from 'lucide-react';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, Spinner, useToast } from '../components/ui.jsx';
import { QrStage, printQrCode } from '../components/QrCode.jsx';

export const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const fmtDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function Field({ label, hint, children }) {
  return (
    <label className="block">
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
      <CardHeader title="Unterrichtszeiten & Regeln" subtitle="Gilt nur für diese Klasse" icon={Settings2} />
      {!f ? <Spinner /> : (
        <form onSubmit={save} className="p-4 grid gap-3 sm:grid-cols-2">
          <Field label="Wochentag">
            <select className="input" value={f.weekday} onChange={(e) => setF({ ...f, weekday: e.target.value })}>
              {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Beginn"><input type="time" className="input" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} required /></Field>
            <Field label="Ende"><input type="time" className="input" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} required /></Field>
          </div>
          <Field label="Pünktlich bis (Minuten nach Beginn)" hint="Wer bis dahin eincheckt, gilt als pünktlich.">
            <input type="number" min="0" max="120" className="input" value={f.lateAfterMinutes} onChange={(e) => setF({ ...f, lateAfterMinutes: e.target.value })} />
          </Field>
          <Field label="Unentschuldigt zu spät ab (Minuten)" hint="Leer lassen = keine Grenze.">
            <input type="number" min="1" max="300" className="input" value={f.unexcusedLateAfterMinutes} onChange={(e) => setF({ ...f, unexcusedLateAfterMinutes: e.target.value })} placeholder="z. B. 30" />
          </Field>
          <Field label="Check-in öffnet (Minuten vor Beginn)">
            <input type="number" min="0" max="120" className="input" value={f.checkinOpensBefore} onChange={(e) => setF({ ...f, checkinOpensBefore: e.target.value })} />
          </Field>
          <div className="sm:col-span-2 flex items-end"><Button type="submit" loading={busy}>Speichern</Button></div>
        </form>
      )}
    </Card>
  );
}

// Vergangene Unterrichtstage: einzelne (z. B. Testläufe) oder alle löschen.
export function SessionHistoryCard({ classId, className, onChanged }) {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [sel, setSel] = useState([]);
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
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <Card className="p-5">
      <CardHeader title="Vergangene Unterrichtstage" subtitle="Testläufe oder falsche Tage löschen" icon={History} />
      {!list ? <Spinner /> : list.length === 0 ? <p className="p-4 text-sm text-sage-muted">Noch keine Unterrichtstage.</p> : (
        <ul className="divide-y divide-line max-h-80 overflow-y-auto dbz-scroll">
          {list.map((x) => (
            <li key={x.id} className="flex items-center gap-3 py-2 px-1">
              <input type="checkbox" aria-label={`${fmtDate(x.date)} auswählen`} checked={sel.includes(x.id)} onChange={() => toggle(x.id)} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ivory">{fmtDate(x.date)} {x.schoolDay && <Badge tone="mint">Schultag</Badge>}</div>
                <div className="text-xs text-sage-muted">{x.entries ? `${x.present} da · ${x.late} spät · ${x.excused} entsch. · ${x.unexcused} unentsch.` : 'keine Einträge'}</div>
              </div>
              <button onClick={() => del([x.id])} className="p-1.5 rounded-lg text-sage-muted hover:text-status-absent hover:bg-status-absent/10" aria-label="Tag löschen"><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 pt-3">
        {sel.length > 0 && <Button size="sm" variant="danger" onClick={() => del(sel)}><Trash2 size={16} /> {sel.length} löschen</Button>}
        <Button size="sm" variant="ghost" onClick={resetAll}>Alle Anwesenheitsdaten löschen …</Button>
      </div>
    </Card>
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
        <form onSubmit={create} className="p-4 grid gap-3 sm:grid-cols-2">
          <Field label="Bezeichnung"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Datum"><input type="date" className="input" min={todayKey} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Beginn"><input type="time" className="input" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} required /></Field>
            <Field label="Ende"><input type="time" className="input" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} required /></Field>
          </div>
          <Field label="Pünktlich bis (Minuten nach Beginn)"><input type="number" min="0" max="120" className="input" value={f.lateAfterMinutes} onChange={(e) => setF({ ...f, lateAfterMinutes: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Button type="submit">Anlegen & alle benachrichtigen</Button></div>
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
