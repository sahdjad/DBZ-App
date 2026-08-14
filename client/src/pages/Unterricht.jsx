import { useEffect, useState, useCallback } from 'react';
import { Play, Square, QrCode, RefreshCw, Users2 } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, StatusBadge, Spinner, useToast } from '../components/ui.jsx';
import { QrImage } from '../components/QrCode.jsx';

const STATUSES = [
  ['present', 'Anwesend'],
  ['late', 'Verspätet'],
  ['excused', 'Entschuldigt'],
  ['unexcused', 'Unentschuldigt'],
  ['left_early', 'Früher gegangen'],
];

export default function Unterricht() {
  const toast = useToast();
  const [sessions, setSessions] = useState(null);
  const [active, setActive] = useState(null); // session id
  const [attendance, setAttendance] = useState(null);
  const [session, setSession] = useState(null);
  const [qr, setQr] = useState(null);

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
  }, []);

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

  if (!sessions) return <AppLayout title="Unterricht"><Spinner /></AppLayout>;
  if (!sessions.length) return <AppLayout title="Unterricht"><Card className="p-6 text-sage-muted">Heute ist keine Sitzung für deine Klassen geplant.</Card></AppLayout>;

  return (
    <AppLayout title="Unterricht">
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
        </div>

        {qr && (
          <div className="mx-4 mb-4 rounded-xl border border-mint/30 bg-mint/5 p-6 text-center">
            <div className="text-sm text-sage-muted mb-4">Schüler scannen diesen QR-Code oder geben den Code ein:</div>
            <div className="flex justify-center mb-4">
              <QrImage value={qr.token} size={220} />
            </div>
            <div className="font-mono text-3xl tracking-[0.3em] text-mint-light uppercase">{qr.token}</div>
            <div className="text-xs text-sage-muted mt-3">Gültig bis {new Date(qr.expiresAt).toLocaleTimeString('de-DE')}</div>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <CardHeader
          title="Anwesenheit"
          subtitle="Automatisch per Check-in, manuell korrigierbar"
          action={<Button variant="ghost" size="sm" onClick={() => loadAttendance(active)}><RefreshCw size={16} /> Aktualisieren</Button>}
        />
        <div className="divide-y divide-black/5">
          {!attendance ? <Spinner /> : attendance.map((r) => (
            <div key={r.studentId} className="py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="text-ivory">{r.name}</div>
                <div className="text-xs text-sage-muted">
                  {r.checkInAt ? `Check-in ${new Date(r.checkInAt).toLocaleTimeString('de-DE')}` : 'Kein Check-in'}
                  {r.minutesLate ? ` · ${r.minutesLate} Min verspätet` : ''}
                  {r.source ? ` · ${r.source === 'qr' ? 'QR' : 'manuell'}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={r.status} />
                <select className="input py-1.5 w-auto text-sm" value={['present','late','excused','unexcused','left_early'].includes(r.status) ? r.status : ''} onChange={(e) => setStatus(r.studentId, e.target.value)}>
                  <option value="" disabled>korrigieren …</option>
                  {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </AppLayout>
  );
}
