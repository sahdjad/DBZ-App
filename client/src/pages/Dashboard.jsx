import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  QrCode,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  CheckSquare,
  ClipboardList,
  Users2,
  CalendarClock,
  Bell,
  Megaphone,
  MessagesSquare,
  Clock,
  GraduationCap,
} from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, StatusBadge, Spinner, Ring } from '../components/ui.jsx';
import { openNotification } from '../lib/notify.js';

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '');

function Stat({ label, value, tone = 'mint' }) {
  const colors = {
    mint: 'text-mint-light',
    present: 'text-status-present',
    late: 'text-status-late',
    absent: 'text-status-absent',
  };
  return (
    <div className="rounded-lg border border-line bg-subtle p-4">
      <div className={`font-mono text-2xl ${colors[tone] || colors.mint}`}>{value}</div>
      <div className="text-xs text-sage-muted mt-1">{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error)
    return (
      <AppLayout title="Start">
        <Card className="p-6 text-status-absent">{error}</Card>
      </AppLayout>
    );
  if (!data) return <AppLayout title="Start"><Spinner /></AppLayout>;

  const greeting = `As-salāmu ʿalaykum, ${data.user.name}`;

  return (
    <AppLayout title="Start">
      <div className="mb-6">
        <p className="font-arabic text-xl text-mint-light" dir="rtl">السلام عليكم</p>
        <h2 className="font-display text-2xl text-ivory">{greeting}</h2>
        <p className="text-sm text-sage-muted">{data.user.roleLabel} · {data.org?.name}</p>
      </div>

      {data.unreadMessages > 0 && (
        <Link to="/nachrichten">
          <Card className="p-3.5 mb-4 flex items-center gap-3 hover:bg-hover transition border-mint/30">
            <MessagesSquare size={20} className="text-mint" />
            <span className="text-sm text-ivory">Du hast {data.unreadMessages} ungelesene Nachricht{data.unreadMessages === 1 ? '' : 'en'}</span>
          </Card>
        </Link>
      )}

      {data.role === 'schueler' && <StudentHome d={data} />}
      {data.role === 'klassensprecher' && <RepHome d={data} />}
      {data.role === 'lehrer' && <TeacherHome d={data} />}
      {data.role === 'eltern' && <ParentHome d={data} />}
      {data.role === 'admin' && <AdminHome d={data} />}

      <SharedHome d={data} />
      <NotificationPeek items={data.notifications} />
    </AppLayout>
  );
}

function StudentHome({ d }) {
  const a = d.attendance;
  const rate = a.sessions ? Math.round(((a.present + a.late) / a.sessions) * 100) : 0;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="md:col-span-2 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg">Offene Aufgaben</h3>
          <Button as={Link} to="/aufgaben" variant="outline" size="sm">Alle anzeigen</Button>
        </div>
        {d.openAssignments.length === 0 ? (
          <p className="text-sm text-sage-muted">Keine offenen Aufgaben – bārakॱAllāhu fīk!</p>
        ) : (
          <ul className="space-y-2">
            {d.openAssignments.map((a) => (
              <li key={a.id}>
                <Link to={`/aufgaben/${a.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-line p-3 hover:bg-subtle">
                  <div className="min-w-0">
                    <div className="text-ivory truncate">{a.title}</div>
                    <div className="text-xs text-sage-muted">{a.subjectName || 'Aufgabe'} · Frist {fmtTime(a.dueAt) || 'offen'}</div>
                  </div>
                  <StatusBadge status={a.studentStatus} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <Ring value={rate} size={72} label={`${rate}%`} sublabel="Anwesend" />
            <div className="text-sm space-y-1">
              <div className="flex items-center gap-2"><StatusBadge status="present" /> {a.present}</div>
              <div className="flex items-center gap-2"><StatusBadge status="late" /> {a.late}</div>
              <div className="flex items-center gap-2"><StatusBadge status="excused" /> {a.excused}</div>
            </div>
          </div>
        </Card>
        <Button as={Link} to="/checkin" size="lg" className="w-full">
          <QrCode size={18} /> Zum Unterricht einchecken
        </Button>
      </div>
    </div>
  );
}

function RepHome({ d }) {
  // Volle Schüleransicht (eigenes 3-Spalten-Raster) OBEN, darunter die
  // Klassensprecher-Karte – nicht ineinander verschachteln (sonst Überlappung).
  return (
    <div className="space-y-4">
      <StudentHome d={{ ...d, openAssignments: d.openAssignments || [] }} />
      <Card className="p-5">
        <CardHeader title="Klassensprecher" subtitle="Protokoll für die heutige Sitzung" icon={ClipboardList} />
        <div className="p-4 pt-2">
          <Button as={Link} to="/protokolle">Protokoll bearbeiten</Button>
        </div>
      </Card>
    </div>
  );
}

function TeacherHome({ d }) {
  const p = d.pending;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ActionCard to="/entschuldigungen" icon={ClipboardCheck} label="Entschuldigungen" count={p.absences} />
        <ActionCard to="/korrektur" icon={CheckSquare} label="Korrekturen" count={p.reviews} />
        <ActionCard to="/protokolle" icon={ClipboardList} label="Protokolle" count={p.protocols} />
      </div>
      {d.todaySessions.map((s) => (
        <Card key={s.id} className="p-5">
          <CardHeader
            title={s.className}
            subtitle={`Heute · ${new Date(s.scheduledStart).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}–${new Date(s.scheduledEnd).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}
            icon={Users2}
            action={<Badge tone={s.status === 'active' ? 'present' : 'neutral'}>{s.status === 'active' ? 'Aktiv' : s.status === 'ended' ? 'Beendet' : 'Geplant'}</Badge>}
          />
          <div className="p-4">
            <Button as={Link} to="/unterricht"><Users2 size={18} /> Unterricht & Anwesenheit</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ActionCard({ to, icon: Icon, label, count }) {
  return (
    <Link to={to} className="rounded-xl border border-line bg-card p-4 hover:bg-hover transition flex items-center gap-3">
      <span className="grid place-items-center h-10 w-10 rounded-lg bg-mint/15 text-mint"><Icon size={20} /></span>
      <div>
        <div className="font-mono text-xl text-ivory">{count}</div>
        <div className="text-xs text-sage-muted">{label}</div>
      </div>
    </Link>
  );
}

function ParentHome({ d }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {d.children.length === 0 && <Card className="p-5 text-sage-muted">Keine verknüpften Kinder.</Card>}
      {d.children.map((c) => {
        const a = c.attendance;
        const rate = a.sessions ? Math.round(((a.present + a.late) / a.sessions) * 100) : 0;
        return (
          <Link key={c.id} to={`/profil/${c.id}`}>
            <Card className="p-5 hover:bg-hover transition">
              <CardHeader title={c.name} subtitle="Profil anzeigen" icon={CalendarCheck} />
              <div className="p-4 flex items-center gap-4">
                <Ring value={rate} size={72} label={`${rate}%`} sublabel="Anwesend" />
                <div className="text-sm space-y-1">
                  <div>Anwesend: {a.present} · Verspätet: {a.late}</div>
                  <div>Entschuldigt: {a.excused} · Sitzungen: {a.sessions}</div>
                </div>
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function AdminHome({ d }) {
  const s = d.stats;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Nutzer" value={s.users} />
        <Stat label="Schüler" value={s.students} />
        <Stat label="Klassen" value={s.classes} />
        <Stat label="Warten auf Freigabe" value={s.pendingUsers} tone={s.pendingUsers ? 'late' : 'mint'} />
      </div>
      <Button as={Link} to="/admin"><Users2 size={18} /> Zur Verwaltung</Button>
    </div>
  );
}

function SharedHome({ d }) {
  const hasUpcoming = d.upcoming?.length > 0;
  const hasAnn = d.announcements?.length > 0;
  if (!hasUpcoming && !hasAnn) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      {hasUpcoming && (
        <Card className="p-5">
          <CardHeader title="Anstehend" icon={CalendarClock} action={<Button as={Link} to="/kalender" variant="ghost" size="sm">Kalender</Button>} />
          <ul className="divide-y divide-line">
            {d.upcoming.map((e, i) => (
              <li key={i} className="py-2.5 flex items-center gap-3">
                <span className={`grid place-items-center h-8 w-8 rounded-lg shrink-0 ${e.type === 'lesson' ? 'bg-mint/15 text-mint' : 'bg-status-late/15 text-status-late'}`}>
                  {e.type === 'lesson' ? <GraduationCap size={16} /> : <Clock size={16} />}
                </span>
                <div className="min-w-0">
                  <div className="text-sm text-ivory truncate">{e.title}</div>
                  <div className="text-xs text-sage-muted">
                    {new Date(e.date).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })} · {e.time}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {hasAnn && (
        <Card className="p-5">
          <CardHeader title="Ankündigungen" icon={Megaphone} action={<Button as={Link} to="/ankuendigungen" variant="ghost" size="sm">Alle</Button>} />
          <ul className="divide-y divide-line">
            {d.announcements.map((a) => (
              <li key={a.id} className="py-2.5">
                <div className="text-sm text-ivory">{a.title} <span className="text-[11px] text-sage-muted">· {a.audienceLabel}</span></div>
                <div className="text-xs text-sage-muted line-clamp-2">{a.body}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function NotificationPeek({ items }) {
  const navigate = useNavigate();
  if (!items?.length) return null;
  return (
    <Card className="mt-6 p-5">
      <CardHeader title="Neueste Benachrichtigungen" icon={Bell} action={<Button as={Link} to="/benachrichtigungen" variant="ghost" size="sm">Alle</Button>} />
      <ul className="divide-y divide-line">
        {items.slice(0, 4).map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => openNotification(n, navigate)}
              className="w-full text-left py-3 flex items-start gap-3 rounded-lg -mx-2 px-2 hover:bg-hover transition"
            >
              <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${n.read ? 'bg-subtle' : 'bg-mint'}`} />
              <div>
                <div className="text-sm text-ivory">{n.title}</div>
                <div className="text-xs text-sage-muted">{n.body}</div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
