import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext.jsx';
import { Play, Square, QrCode, RefreshCw, Users2, DoorOpen, Printer, Clock, Trash2, ListChecks, RotateCcw, ChevronDown, MoreHorizontal } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, StatusBadge, Spinner, Section, ListGroup, Segmented, EmptyState, useToast, useSelection, SelectCheck, SelectionBar } from '../components/ui.jsx';
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
const DOT = { present: 'bg-status-present', late: 'bg-status-late', left_early: 'bg-status-late', excused: 'bg-status-excused', unexcused: 'bg-status-absent' };
const checkInfo = (r) => [
  r.checkInAt ? `Check-in ${new Date(r.checkInAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'Kein Check-in',
  r.minutesLate ? `${r.minutesLate} Min verspätet${r.lateUnexcused ? ' (unentschuldigt)' : ''}` : null,
  r.source ? (r.source === 'qr' ? 'QR' : 'manuell') : null,
].filter(Boolean).join(' · ');

// „…“-Menü je Schüler (Handy): seltene Aktionen, damit die Zeile ruhig bleibt.
function RowMenu({ r, onEarly, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={`Weitere Aktionen für ${r.name}`}
        className="grid place-items-center h-9 w-9 rounded-full text-sage-muted hover:bg-hover"><MoreHorizontal size={18} /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="dbz-pop absolute right-0 top-10 z-40 w-56 rounded-2xl bg-card dark:bg-elevated border border-line/70 shadow-float overflow-hidden divide-y divide-line/70" style={{ transformOrigin: 'top right' }}>
            <button type="button" onClick={() => { setOpen(false); onEarly(); }} className="w-full text-left px-4 h-11 text-body text-ivory hover:bg-hover">Früher gegangen</button>
            {onDelete && <button type="button" onClick={() => { setOpen(false); onDelete(); }} className="w-full text-left px-4 h-11 text-body text-status-absent hover:bg-hover">Eintrag löschen</button>}
          </div>
        </>
      )}
    </div>
  );
}

const SHORT = { present: 'Da', late: 'Spät', excused: 'Entsch.', unexcused: 'Fehlt', left_early: 'Früher' };
const CHIP_ON = {
  present: 'bg-status-present text-white',
  late: 'bg-status-late text-white',
  left_early: 'bg-status-late text-white',
  excused: 'bg-status-excused text-white',
  unexcused: 'bg-status-absent text-white',
};

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
  const [doorOpen, setDoorOpen] = useState(false);

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
  if (!sessions.length) return <AppLayout title="Unterricht"><Card><EmptyState icon={Users2} title="Heute kein Unterricht" text="Heute ist keine Sitzung für deine Klassen geplant." /></Card></AppLayout>;

  const counts = (attendance || []).reduce((m, r) => { const k = ['present', 'late', 'excused'].includes(r.status) ? r.status : 'absent'; m[k] = (m[k] || 0) + 1; return m; }, {});
  const statusLabel = session?.status === 'active' ? 'Läuft' : session?.status === 'ended' ? 'Beendet' : 'Geplant';

  return (
    <AppLayout title="Unterricht">
      <SchoolDayBanner />
      {sessions.length > 1 && (
        <Segmented className="w-full mb-4" options={sessions.map((s) => [s.id, s.className])} value={active} onChange={(id) => { setActive(id); setQr(null); }} />
      )}

      {/* Sitzung */}
      <Card className="p-5 mb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-title2 font-bold text-ivory truncate" data-noi18n>{session?.className || 'Sitzung'}</h2>
            {session && <p className="text-subhead text-sage-muted mt-0.5">{new Date(session.scheduledStart).toLocaleString('de-DE', { weekday: 'long', hour: '2-digit', minute: '2-digit' })} Uhr</p>}
          </div>
          <Badge tone={session?.status === 'active' ? 'present' : 'neutral'}>{statusLabel}</Badge>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {session?.status !== 'active' && session?.status !== 'ended' && (
            <Button size="lg" className="flex-1 sm:flex-none" onClick={start}><Play size={18} /> Unterricht starten</Button>
          )}
          {session?.status === 'active' && (
            <>
              <Button className="flex-1 sm:flex-none" onClick={genQr}><QrCode size={18} /> Check-in-Code</Button>
              <Button variant="danger" className="flex-1 sm:flex-none" onClick={end}><Square size={16} /> Beenden</Button>
            </>
          )}
          {(session?.status && session.status !== 'scheduled') || attendance?.some(hasEntry) ? (
            <Button variant="ghost" size="sm" onClick={resetSession}><RotateCcw size={15} /> Zurücksetzen</Button>
          ) : null}
        </div>

        {qr && (
          <div className="mt-4">
            <QrStage value={qr.token} title={session?.className} subtitle="Jetzt einchecken" size={230}>
              <div className="font-code text-2xl sm:text-3xl tracking-[0.15em] sm:tracking-[0.3em] uppercase break-all leading-snug">{qr.token}</div>
              <div className="text-xs opacity-80">Gültig bis {new Date(qr.expiresAt).toLocaleTimeString('de-DE')}</div>
            </QrStage>
          </div>
        )}
      </Card>

      {/* Anwesenheit – ein Tipp je Schüler */}
      <Section
        title="Anwesenheit"
        action={(
          <div className="flex items-center gap-1">
            {attendance?.some(hasEntry) && !selection.active && (
              <Button variant="ghost" size="sm" onClick={() => selection.start()}><ListChecks size={15} /> Auswählen</Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => loadAttendance(active)} aria-label="Aktualisieren"><RefreshCw size={15} /></Button>
          </div>
        )}
        footer="Automatisch per Check-in – tippe einen Status an, um ihn zu korrigieren."
      >
        {attendance && (
          <Card className="grid grid-cols-4 divide-x divide-line/70 mb-3">
            {[['present', 'Da', 'text-status-present'], ['late', 'Spät', 'text-status-late'], ['excused', 'Entsch.', 'text-status-excused'], ['absent', 'Fehlt', 'text-status-absent']].map(([k, l, c]) => (
              <div key={k} className="py-3 text-center">
                <div className={`text-title2 font-semibold font-mono leading-none ${c}`}>{counts[k] || 0}</div>
                <div className="text-caption text-sage-muted mt-1">{l}</div>
              </div>
            ))}
          </Card>
        )}
        {!attendance ? <Spinner /> : (
          <>
            {/* Handy: Zeile mit 4 Hauptzuständen, Seltenes im „…“-Menü */}
            <ListGroup className="md:hidden">
              {attendance.map((r) => (
                <div key={r.studentId}
                  onClick={() => { if (selection.active && hasEntry(r)) selection.toggle(r.studentId); }}
                  className={`px-4 py-3 ${selection.active && hasEntry(r) ? 'cursor-pointer active:bg-hover' : ''} ${selection.has(r.studentId) ? 'bg-mint/[0.06]' : ''}`}>
                  <div className="flex items-center gap-3">
                    {selection.active && (hasEntry(r) ? <SelectCheck checked={selection.has(r.studentId)} /> : <span className="w-5" />)}
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${DOT[r.status] || 'bg-sage-muted/30'}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="text-body font-medium text-ivory truncate" data-noi18n>{r.name}</div>
                      <div className="text-footnote text-sage-muted">{checkInfo(r)}</div>
                    </div>
                    {!selection.active && <RowMenu r={r} onEarly={() => setStatus(r.studentId, 'left_early')} onDelete={hasEntry(r) ? () => deleteEntries([r.studentId]) : null} />}
                  </div>
                  {!selection.active && (
                    <div className="mt-2.5 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={`Status von ${r.name}`}>
                      {STATUSES.filter(([v]) => v !== 'left_early').map(([v, l]) => {
                        const on = r.status === v;
                        return (
                          <button key={v} type="button" role="radio" aria-checked={on} onClick={() => !on && setStatus(r.studentId, v)}
                            className={`min-h-[2.25rem] rounded-lg text-footnote font-semibold px-1 transition-colors active:scale-[0.97] ${on ? CHIP_ON[v] : 'bg-subtle text-sage hover:text-ivory'}`}>
                            {SHORT[v] || l}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {r.status === 'left_early' && !selection.active && <div className="mt-1.5 text-footnote text-status-late">Früher gegangen</div>}
                </div>
              ))}
            </ListGroup>

            {/* iPad & Mac: Tabelle, alle Zustände direkt anklickbar */}
            <Card className="hidden md:block overflow-x-auto">
              <table className="w-full text-subhead">
                <thead>
                  <tr className="text-left text-footnote text-sage-muted border-b border-line/70 bg-subtle/50">
                    {selection.active && <th className="w-10" />}
                    <th className="py-2.5 px-4 font-medium">Schüler</th>
                    <th className="py-2.5 px-3 font-medium">Check-in</th>
                    <th className="py-2.5 px-3 font-medium">Status</th>
                    <th className="py-2.5 pr-3 w-12"><span className="sr-only">Aktionen</span></th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((r) => (
                    <tr key={r.studentId}
                      onClick={() => { if (selection.active && hasEntry(r)) selection.toggle(r.studentId); }}
                      className={`border-b border-line/60 last:border-0 ${selection.active && hasEntry(r) ? 'cursor-pointer hover:bg-hover/60' : ''} ${selection.has(r.studentId) ? 'bg-mint/[0.06]' : ''}`}>
                      {selection.active && <td className="pl-4">{hasEntry(r) && <SelectCheck checked={selection.has(r.studentId)} />}</td>}
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${DOT[r.status] || 'bg-sage-muted/30'}`} aria-hidden="true" />
                          <span className="font-medium text-ivory" data-noi18n>{r.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-sage-muted whitespace-nowrap">{checkInfo(r)}</td>
                      <td className="py-2 px-3">
                        <div className="inline-flex flex-wrap gap-0.5 rounded-[0.7rem] bg-subtle p-0.5 border border-line/60" role="radiogroup" aria-label={`Status von ${r.name}`}>
                          {STATUSES.map(([v, l]) => {
                            const on = r.status === v;
                            return (
                              <button key={v} type="button" role="radio" aria-checked={on} disabled={selection.active}
                                onClick={(e) => { e.stopPropagation(); if (!on) setStatus(r.studentId, v); }}
                                className={`rounded-[0.55rem] px-2.5 lg:px-3 py-1.5 text-footnote font-semibold whitespace-nowrap transition-colors ${on ? CHIP_ON[v] + ' shadow-sm' : 'text-sage-muted hover:text-ivory'}`}>
                                <span className="xl:hidden">{SHORT[v] || l}</span><span className="hidden xl:inline">{l}</span>
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {!selection.active && hasEntry(r) && (
                          <button onClick={() => deleteEntries([r.studentId])} title="Eintrag löschen" aria-label={`Eintrag von ${r.name} löschen`}
                            className="grid place-items-center h-9 w-9 rounded-full text-sage-muted hover:text-status-absent hover:bg-status-absent/10"><Trash2 size={16} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </Section>

      {/* Tür-QR-Code: eingeklappt, wird selten gebraucht */}
      {door && (
        <Section title="Tür-QR-Code">
          <Card className="overflow-hidden">
            <button type="button" onClick={() => setDoorOpen((v) => !v)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-hover">
              <span className="grid place-items-center h-8 w-8 rounded-[0.6rem] bg-mint/10 text-mint-light dark:text-mint shrink-0"><DoorOpen size={17} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-body text-ivory">{door.window?.open ? `Check-in offen${door.checkinOpenUntil ? ` bis ${new Date(door.checkinOpenUntil).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ''}` : 'Check-in gerade geschlossen'}</span>
                <span className="block text-footnote text-sage-muted">Fester Code zum Aufhängen – nur für diese Klasse</span>
              </span>
              <ChevronDown size={18} className={`text-sage-muted transition-transform ${doorOpen ? 'rotate-180' : ''}`} />
            </button>
            {doorOpen && (
              <div className="px-4 pb-5 border-t border-line/70 pt-4">
                <div className="max-w-sm mx-auto">
                  <QrStage value={door.code} title={session?.className} subtitle="Deen Bildungszentrum" caption="Beim Ankommen scannen" size={200}>
                    <span className="inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full bg-black/25 text-white/90">
                      <Clock size={14} /> {door.window?.open ? 'Check-in offen' : 'Check-in gerade geschlossen'}
                    </span>
                  </QrStage>
                </div>
                <div className="flex gap-2 justify-center flex-wrap mt-4">
                  <Button variant="outline" size="sm" onClick={() => printQrCode(door.code, session?.className || 'Check-in', 'Beim Ankommen scannen')}><Printer size={15} /> Drucken</Button>
                  {!door.window?.open && <Button size="sm" onClick={openCheckin}><DoorOpen size={15} /> Check-in öffnen</Button>}
                  <Button variant="ghost" size="sm" onClick={rotateDoorCode}><RefreshCw size={15} /> Neuer Code</Button>
                </div>
                <p className="text-footnote text-sage-muted mt-4 text-center">
                  Der Code bleibt immer gleich – einmal aufhängen genügt. Er öffnet automatisch kurz vor eurem Unterrichtsbeginn;
                  wer nach eurer Toleranz scannt, wird als verspätet geführt. Schluss ist um {door.autoClose} Uhr – oder wenn du „Beenden" drückst.
                </p>
              </div>
            )}
          </Card>
        </Section>
      )}

      {session?.classId && (
        <div className="grid gap-4 lg:grid-cols-2 items-start mt-7">
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
