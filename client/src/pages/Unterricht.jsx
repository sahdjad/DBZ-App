import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext.jsx';
import { Play, Square, QrCode, RefreshCw, Users2, DoorOpen, Printer, Clock, Trash2, ListChecks, RotateCcw } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, StatusBadge, Spinner, useToast, useSelection, SelectCheck, SelectionBar } from '../components/ui.jsx';
import { QrStage, printQrCode } from '../components/QrCode.jsx';
import { ClassSettingsCard, SessionHistoryCard, SchoolDaysCard, SchoolTodayCard, SchoolDayBanner } from './UnterrichtParts.jsx';

const STATUSES = [
  ['present', 'Anwesend'],
  ['late', 'Verspätet'],
  ['excused', 'Entschuldigt'],
  ['unexcused', 'Unentschuldigt'],
  ['left_early', 'Früher gegangen'],
];

// Farbige Markierung pro Zeile – Anwesenheit auf einen Blick (grün/gelb/blau/rot).
const ROW_TINT = {
  present: 'border-status-present bg-status-present/[0.07]',
  late: 'border-status-late bg-status-late/[0.07]',
  left_early: 'border-status-late bg-status-late/[0.07]',
  excused: 'border-status-excused bg-status-excused/[0.07]',
  unexcused: 'border-status-absent bg-status-absent/[0.07]',
};
const rowTint = (status) => ROW_TINT[status] || 'border-status-absent bg-status-absent/[0.05]';

export default function Unterricht() {
  const { user } = useAuth();
  // Leitung/Admin führen keinen Klassenunterricht: Tagesüberblick + gemeinsamer Schultag.
  if (user?.role === 'leitung' || user?.role === 'super_admin') {
    return (
      <AppLayout title="Unterricht">
        {user.role === 'leitung' && <SchoolTodayCard />}
        <SchoolDaysCard />
      </AppLayout>
    );
  }
  return <TeacherUnterricht />;
}

function TeacherUnterricht() {
  const toast = useToast();
  const [sessions, setSessions] = useState(null);
  const [active, setActive] = useState(null); // session id
  const [attendance, setAttendance] = useState(null);
  const [session, setSession] = useState(null);
  const [qr, setQr] = useState(null);
  const [door, setDoor] = useState(null); // fester Tür-QR der Klasse

  useEffect(() => {
    api.get('/sessions/today').then((d) => {
      setSessions(d.sessions);
      if (d.sessions[0]) setActive(d.sessions[0].id);
    });
  }, []);

  const loadAttendance = useCallback(async (sid) => {
    if (!sid) return;
    const d = await api.get(`/sessions/${sid}/attendance`);
    setAttendance(d.attendance);
    setSession(d.session);
    if (d.session?.classId) api.get(`/classes/${d.session.classId}/checkin-qr`).then(setDoor).catch(() => {});
  }, []);

  const openCheckin = async () => {
    const sid = door?.sessionId || active;
    if (!sid) return;
    try {
      await api.post(`/sessions/${sid}/checkin-open`, {});
      if (session?.classId) api.get(`/classes/${session.classId}/checkin-qr`).then(setDoor).catch(() => {});
      loadAttendance(active);
      toast.push('Check-in geöffnet – die Schüler wurden benachrichtigt', 'success');
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  const rotateDoorCode = async () => {
    if (!door || !window.confirm('Neuen Tür-Code erzeugen? Der alte Ausdruck/QR wird dadurch ungültig und muss neu aufgehängt werden.')) return;
    try {
      await api.post(`/classes/${session.classId}/checkin-qr/rotate`);
      await loadAttendance(active);
      toast.push('Neuer Tür-Code erzeugt – bitte neu ausdrucken & aufhängen', 'success');
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  useEffect(() => {
    if (!active) return;
    loadAttendance(active);
    const t = setInterval(() => loadAttendance(active), 8000); // Live-Aktualisierung
    return () => clearInterval(t);
  }, [active, loadAttendance]);

  const start = async () => {
    const d = await api.post(`/sessions/${active}/start`);
    setSession(d.session);
    toast.push('Unterricht gestartet', 'success');
  };
  const end = async () => {
    const d = await api.post(`/sessions/${active}/end`);
    setSession(d.session);
    setQr(null);
    toast.push('Unterricht beendet', 'success');
  };
  const genQr = async () => {
    try {
      const d = await api.post(`/sessions/${active}/qr`);
      setQr(d);
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };
  const setStatus = async (studentId, status) => {
    await api.post(`/sessions/${active}/attendance`, { studentId, status });
    loadAttendance(active);
  };
  const selection = useSelection();
  const hasEntry = (r) => Boolean(r.source) || STATUSES.some(([v]) => v === r.status);
  const deleteEntries = async (ids) => {
    if (!window.confirm(`${ids.length} Anwesenheitseintrag/-einträge löschen? Die Schüler haben für diese Sitzung dann keinen Eintrag mehr.`)) return;
    let ok = 0;
    for (const sid of ids) {
      try { await api.del(`/sessions/${active}/attendance/${sid}`); ok++; } catch { /* kein Eintrag */ }
    }
    toast.push(`${ok} Eintrag/Einträge gelöscht`, 'success');
    selection.clear();
    loadAttendance(active);
  };
  const resetSession = async () => {
    if (!window.confirm('Diese Sitzung komplett zurücksetzen? Alle Anwesenheitseinträge dieser Sitzung werden gelöscht und die Sitzung steht wieder auf „geplant". (z. B. nach einem Probedurchlauf)')) return;
    try {
      const d = await api.post(`/sessions/${active}/reset`);
      setSession(d.session);
      setQr(null);
      toast.push(`Sitzung zurückgesetzt (${d.removed} Einträge gelöscht)`, 'success');
      loadAttendance(active);
    } catch (err) { toast.push(err.message, 'error'); }
  };

  if (!sessions) return <AppLayout title="Unterricht"><Spinner /></AppLayout>;
  if (!sessions.length) return <AppLayout title="Unterricht"><Card className="p-6 text-sage-muted">Heute ist keine Sitzung für deine Klassen geplant.</Card></AppLayout>;

  return (
    <AppLayout title="Unterricht">
      <SchoolDayBanner />
      {sessions.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {sessions.map((s) => (
            <Button key={s.id} variant={active === s.id ? 'primary' : 'outline'} size="sm" onClick={() => { setActive(s.id); setQr(null); }}>
              {s.className}
            </Button>
          ))}
        </div>
      )}

      <Card className="p-5 mb-4">
        <CardHeader
          title={session?.className || 'Sitzung'}
          subtitle={session ? `${new Date(session.scheduledStart).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
          icon={Users2}
          action={<Badge tone={session?.status === 'active' ? 'present' : 'neutral'}>{session?.status === 'active' ? 'Aktiv' : session?.status === 'ended' ? 'Beendet' : 'Geplant'}</Badge>}
        />
        <div className="p-4 flex flex-wrap gap-2">
          {session?.status !== 'active' && session?.status !== 'ended' && (
            <Button onClick={start}><Play size={18} /> Unterricht starten</Button>
          )}
          {session?.status === 'active' && (
            <>
              <Button onClick={genQr}><QrCode size={18} /> Check-in-Code anzeigen</Button>
              <Button variant="danger" onClick={end}><Square size={18} /> Beenden</Button>
            </>
          )}
          {(session?.status && session.status !== 'scheduled') || attendance?.some(hasEntry) ? (
            <Button variant="ghost" onClick={resetSession}><RotateCcw size={18} /> Sitzung zurücksetzen</Button>
          ) : null}
        </div>

        {qr && (
          <div className="mx-4 mb-4">
            <QrStage value={qr.token} title={session?.className} subtitle="Jetzt einchecken" size={230}>
              <div className="font-mono text-2xl sm:text-3xl tracking-[0.15em] sm:tracking-[0.3em] uppercase break-all leading-snug">{qr.token}</div>
              <div className="text-xs opacity-80">Gültig bis {new Date(qr.expiresAt).toLocaleTimeString('de-DE')}</div>
            </QrStage>
          </div>
        )}
      </Card>

      {door && (
        <Card className="p-5 mb-4">
          <CardHeader
            title="Tür-QR-Code (zum Aufhängen)"
            subtitle="Nur für diese Klasse gültig – Schüler anderer Klassen können damit nicht einchecken"
            icon={DoorOpen}
          />
          <div className="p-4 max-w-md mx-auto w-full">
            <QrStage value={door.code} title={session?.className} subtitle="Deen Bildungszentrum" caption="Beim Ankommen scannen" size={200}>
              <span className={`inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full ${door.window?.open ? 'bg-status-present/25 text-white' : 'bg-black/25 text-white/90'}`}>
                <Clock size={14} /> {door.window?.open ? `Check-in offen${door.checkinOpenUntil ? ` bis ${new Date(door.checkinOpenUntil).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ''}` : 'Check-in gerade geschlossen'}
              </span>
            </QrStage>
            <div className="flex gap-2 justify-center flex-wrap mt-4">
              <Button variant="outline" size="sm" onClick={() => printQrCode(door.code, session?.className || 'Check-in', 'Beim Ankommen scannen')}><Printer size={16} /> QR drucken</Button>
              {!door.window?.open && <Button size="sm" onClick={openCheckin}><DoorOpen size={16} /> Check-in öffnen</Button>}
              <Button variant="ghost" size="sm" onClick={rotateDoorCode}><RefreshCw size={16} /> Neuen Code erzeugen</Button>
            </div>
            <p className="text-sm text-sage mt-4 text-center">
              Der Code bleibt <b>immer gleich</b> – einmal aufhängen genügt. Er öffnet automatisch kurz vor eurem Unterrichtsbeginn;
              wer nach eurer Toleranz scannt, wird als <b>verspätet</b> geführt. Schluss ist um {door.autoClose} Uhr – oder wenn du „Beenden" drückst.
            </p>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <CardHeader
          title="Anwesenheit"
          subtitle="Automatisch per Check-in, manuell korrigierbar"
          action={(
            <div className="flex gap-1">
              {attendance?.some(hasEntry) && !selection.active && (
                <Button variant="ghost" size="sm" onClick={() => selection.start()}><ListChecks size={16} /> Auswählen</Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => loadAttendance(active)}><RefreshCw size={16} /> Aktualisieren</Button>
            </div>
          )}
        />
        <div className="space-y-2 mt-2">
          {!attendance ? <Spinner /> : attendance.map((r) => (
            <div key={r.studentId}
              onClick={() => { if (selection.active && hasEntry(r)) selection.toggle(r.studentId); }}
              className={`rounded-lg border-l-4 pl-3 pr-3 py-2.5 flex items-center justify-between gap-3 flex-wrap ${rowTint(r.status)} ${selection.active && hasEntry(r) ? 'cursor-pointer' : ''} ${selection.has(r.studentId) ? 'ring-2 ring-mint/60' : ''}`}>
              {selection.active && (hasEntry(r) ? <SelectCheck checked={selection.has(r.studentId)} /> : <span className="w-5" />)}
              <div className="min-w-0 flex-1">
                <div className="text-ivory">{r.name}</div>
                <div className="text-xs text-sage-muted">
                  {r.checkInAt ? `Check-in ${new Date(r.checkInAt).toLocaleTimeString('de-DE')}` : 'Kein Check-in'}
                  {r.minutesLate ? ` · ${r.minutesLate} Min verspätet${r.lateUnexcused ? ' (unentschuldigt)' : ''}` : ''}
                  {r.source ? ` · ${r.source === 'qr' ? 'QR' : 'manuell'}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={r.status} />
                {!selection.active && (
                  <select className="input py-1.5 w-auto text-sm" value={['present','late','excused','unexcused','left_early'].includes(r.status) ? r.status : ''} onChange={(e) => setStatus(r.studentId, e.target.value)}>
                    <option value="" disabled>korrigieren …</option>
                    {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                )}
                {!selection.active && hasEntry(r) && (
                  <button onClick={() => deleteEntries([r.studentId])} title="Eintrag löschen" aria-label={`Eintrag von ${r.name} löschen`}
                    className="p-1.5 rounded-lg text-sage-muted hover:text-status-absent hover:bg-status-absent/10"><Trash2 size={16} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
      {session?.classId && (
        <div className="grid gap-4 lg:grid-cols-2 items-start mt-4">
          <SessionHistoryCard classId={session.classId} className={session.className} onChanged={() => loadAttendance(active)} />
          <ClassSettingsCard classId={session.classId} onSaved={() => loadAttendance(active)} />
        </div>
      )}
      <SelectionBar
        selection={selection}
        allIds={(attendance || []).filter(hasEntry).map((r) => r.studentId)}
        actions={[{ label: 'Einträge löschen', icon: Trash2, variant: 'danger', onClick: () => deleteEntries([...selection.ids]) }]}
      />
    </AppLayout>
  );
}
