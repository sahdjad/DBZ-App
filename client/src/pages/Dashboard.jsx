import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  QrCode,
  ClipboardCheck,
  CheckSquare,
  ClipboardList,
  CalendarClock,
  Bell,
  Megaphone,
  MessagesSquare,
  Clock,
  GraduationCap,
  Users2,
  UserPlus,
  CheckCircle2,
  ChevronRight,
  UserRoundCog,
} from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api, peek } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { Card, Button, Badge, StatusBadge, Spinner, Ring, Section, ListGroup, ListRow, Stat, EmptyState, CountBadge, useToast } from '../components/ui.jsx';
import { openNotification } from '../lib/notify.js';
import DayHero from '../components/DayCard.jsx';

const fmtDue = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'ohne Frist');
const hm = (iso) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

export default function Dashboard() {
  const [data, setData] = useState(() => peek('/dashboard'));
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

  return (
    <AppLayout title="Start" wide>
      <DayHero name={data.user.name} subtitle={[data.user.roleLabel, data.org?.name].filter(Boolean).join(' · ')} />

      <div className="mt-6 md:mt-7 grid grid-cols-1 gap-x-8 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] items-start">
        <div>
          {data.unreadMessages > 0 && (
            <ListGroup className="mb-6">
              <ListRow
                to="/nachrichten"
                icon={MessagesSquare}
                title={`${data.unreadMessages} ungelesene Nachricht${data.unreadMessages === 1 ? '' : 'en'}`}
                badge={data.unreadMessages}
              />
            </ListGroup>
          )}

          {data.role === 'schueler' && <StudentHome d={data} />}
          {data.role === 'klassensprecher' && <StudentHome d={data} rep />}
          {data.role === 'lehrer' && <TeacherHome d={data} />}
          {data.role === 'eltern' && <ParentHome d={data} />}
          {data.role === 'admin' && <AdminHome d={data} />}
        </div>

        <aside className="mt-7 md:mt-0">
          <LinkedAccountsHome />
          <Upcoming items={data.upcoming} />
          <Announcements items={data.announcements} />
          <NotificationPeek items={data.notifications} />
        </aside>
      </div>
    </AppLayout>
  );
}

// --- Schüler / Klassensprecher ----------------------------------------------
function StudentHome({ d, rep = false }) {
  const a = d.attendance;
  const rate = a.sessions ? Math.round(((a.present + a.late) / a.sessions) * 100) : 0;
  const open = d.openAssignments || [];
  return (
    <>
      <Link
        to="/checkin"
        className="flex items-center gap-4 rounded-2xl bg-mint text-onaccent px-5 py-4 shadow-card active:scale-[0.99] transition-transform"
      >
        <span className="grid place-items-center h-11 w-11 rounded-xl bg-white/15 shrink-0"><QrCode size={22} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold">Zum Unterricht einchecken</span>
          <span className="block text-footnote opacity-80">QR-Code an der Tür scannen</span>
        </span>
        <ChevronRight size={20} className="opacity-70 shrink-0" />
      </Link>

      <Section title="Offene Aufgaben" className="mt-7" action={<Link to="/aufgaben" className="text-subhead text-mint-light dark:text-mint font-medium">Alle</Link>}>
        {open.length === 0 ? (
          <Card><EmptyState icon={CheckCircle2} title="Alles erledigt" text="Keine offenen Aufgaben – bāraka llāhu fīk!" /></Card>
        ) : (
          <ListGroup>
            {open.map((x) => (
              <ListRow key={x.id} to={`/aufgaben/${x.id}`} title={x.title} subtitle={`${x.subjectName || 'Aufgabe'} · Frist ${fmtDue(x.dueAt)}`} chevron>
                <span className="mt-1.5 block"><StatusBadge status={x.studentStatus} /></span>
              </ListRow>
            ))}
          </ListGroup>
        )}
      </Section>

      {rep && (
        <Section title="Klassensprecher">
          <ListGroup>
            <ListRow to="/protokolle" icon={ClipboardList} title="Protokoll schreiben" subtitle="Für die heutige Sitzung" />
            <ListRow to="/aufgaben" icon={CheckSquare} title="Hausaufgabe vorschlagen" subtitle="Die Lehrkraft gibt sie frei" />
          </ListGroup>
        </Section>
      )}

      <Section title="Anwesenheit" action={<Link to="/anwesenheit" className="text-subhead text-mint-light dark:text-mint font-medium">Details</Link>}>
        <Card className="p-4 sm:p-5 flex items-center gap-5">
          <Ring value={rate} size={76} stroke={7} label={`${rate}%`} />
          <div className="grid grid-cols-3 gap-4 flex-1 min-w-0">
            <Stat label="Anwesend" value={a.present} tone="present" />
            <Stat label="Verspätet" value={a.late} tone="late" />
            <Stat label="Entschuldigt" value={a.excused} tone="excused" />
          </div>
        </Card>
      </Section>
    </>
  );
}

// --- Lehrkraft ----------------------------------------------------------------
function TeacherHome({ d }) {
  const p = d.pending;
  const todo = [
    { to: '/korrektur', icon: CheckSquare, label: 'Abgaben korrigieren', n: p.reviews },
    { to: '/entschuldigungen', icon: ClipboardCheck, label: 'Entschuldigungen prüfen', n: p.absences },
    { to: '/protokolle', icon: ClipboardList, label: 'Protokolle freigeben', n: p.protocols },
  ];
  const openCount = todo.reduce((s, t) => s + (t.n || 0), 0);
  return (
    <>
      <Section title="Heute" className="mt-0" action={<Link to="/unterricht" className="text-subhead text-mint-light dark:text-mint font-medium">Unterricht</Link>}>
        {d.todaySessions.length === 0 ? (
          <Card><EmptyState icon={Users2} title="Heute kein Unterricht" text="Geplante Stunden erscheinen hier mit Uhrzeit." /></Card>
        ) : (
          <ListGroup>
            {d.todaySessions.map((s) => (
              <Link key={s.id} to="/unterricht" className="flex items-center gap-4 px-4 py-3.5 active:bg-hover hover:bg-hover/60 transition-colors">
                <span className="w-14 shrink-0 text-right leading-tight">
                  <span className="block text-body font-semibold text-ivory font-mono">{hm(s.scheduledStart)}</span>
                  <span className="block text-footnote text-sage-muted font-mono">{hm(s.scheduledEnd)}</span>
                </span>
                <span className={`w-1 self-stretch rounded-full ${s.status === 'active' ? 'bg-status-present' : 'bg-mint/25'}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-semibold text-ivory truncate">{s.className}</span>
                  <span className="block text-footnote text-sage-muted">{s.status === 'active' ? 'Läuft gerade' : s.status === 'ended' ? 'Beendet' : 'Geplant'}</span>
                </span>
                {s.status === 'active' ? <Badge tone="present">Aktiv</Badge> : <ChevronRight size={18} className="text-sage-muted/60" />}
              </Link>
            ))}
          </ListGroup>
        )}
      </Section>

      <Section title="Zu erledigen" footer={openCount === 0 ? 'Alles erledigt – nichts wartet auf dich.' : null}>
        <ListGroup>
          {todo.map((t) => (
            <ListRow
              key={t.to}
              to={t.to}
              icon={t.icon}
              iconTone={t.n > 0 ? 'late' : 'neutral'}
              title={t.label}
              value={t.n > 0 ? undefined : '0'}
              badge={t.n}
            />
          ))}
        </ListGroup>
      </Section>
    </>
  );
}

// --- Eltern ---------------------------------------------------------------------
function ParentHome({ d }) {
  return (
    <Section title="Meine Kinder" className="mt-0">
      {d.children.length === 0 ? (
        <Card><EmptyState icon={Users2} title="Keine verknüpften Kinder" text="Die DBZ-Leitung verknüpft dein Konto mit deinen Kindern." /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {d.children.map((c) => {
            const a = c.attendance;
            const rate = a.sessions ? Math.round(((a.present + a.late) / a.sessions) * 100) : 0;
            return (
              <Link key={c.id} to={`/profil/${c.id}`} className="block active:scale-[0.99] transition-transform">
                <Card className="p-4 flex items-center gap-4">
                  <Ring value={rate} size={64} stroke={6} label={`${rate}%`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-body font-semibold text-ivory truncate" data-noi18n>{c.name}</div>
                    <div className="text-footnote text-sage-muted mt-0.5">{`${a.present} anwesend · ${a.late} verspätet · ${a.excused} entschuldigt`}</div>
                  </div>
                  <ChevronRight size={18} className="text-sage-muted/60 shrink-0" />
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// --- Leitung / Admin -----------------------------------------------------------
function AdminHome({ d }) {
  const s = d.stats;
  return (
    <>
      {s.pendingUsers > 0 && (
        <ListGroup className="mb-6">
          <ListRow to="/admin?tab=pending" icon={UserPlus} iconTone="late" title="Registrierungen freigeben" subtitle="Neue Konten warten auf Bestätigung" badge={s.pendingUsers} />
        </ListGroup>
      )}
      <Section title="Überblick" className="mt-0">
        <Card className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-y-5 gap-x-4">
          <Stat label="Nutzer" value={s.users} />
          <Stat label="Schüler" value={s.students} />
          <Stat label="Klassen" value={s.classes} />
          <Stat label="Warten auf Freigabe" value={s.pendingUsers} tone={s.pendingUsers ? 'late' : undefined} />
        </Card>
      </Section>
      <Section title="Schnellzugriff">
        <ListGroup>
          <ListRow to="/leitung" icon={GraduationCap} title="Leitung" subtitle="Kennzahlen aller Klassen" />
          <ListRow to="/admin" icon={Users2} title="Verwaltung" subtitle="Personen, Klassen, Rollen" />
          <ListRow to="/unterricht" icon={CalendarClock} title="Unterricht heute" />
        </ListGroup>
      </Section>
    </>
  );
}

// --- Gemeinsam -------------------------------------------------------------------
function Upcoming({ items }) {
  if (!items?.length) return null;
  return (
    <Section title="Anstehend" action={<Link to="/kalender" className="text-subhead text-mint-light dark:text-mint font-medium">Kalender</Link>}>
      <ListGroup>
        {items.map((e, i) => {
          const d = new Date(e.date);
          return (
            <div key={i} className="flex items-center gap-3.5 px-4 py-3">
              <span className="w-11 shrink-0 text-center leading-none">
                <span className="block text-caption font-semibold uppercase text-status-absent">{d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')}</span>
                <span className="block text-title3 font-semibold text-ivory font-mono mt-0.5">{d.getDate()}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body text-ivory truncate">{e.title}</span>
                <span className="flex items-center gap-1 text-footnote text-sage-muted">
                  {e.type === 'lesson' ? <GraduationCap size={13} /> : <Clock size={13} />} {e.time}
                </span>
              </span>
            </div>
          );
        })}
      </ListGroup>
    </Section>
  );
}

function Announcements({ items }) {
  if (!items?.length) return null;
  return (
    <Section title="Ankündigungen" action={<Link to="/ankuendigungen" className="text-subhead text-mint-light dark:text-mint font-medium">Alle</Link>}>
      <ListGroup>
        {items.slice(0, 3).map((a) => (
          <Link key={a.id} to="/ankuendigungen" className="block px-4 py-3 active:bg-hover hover:bg-hover/60 transition-colors">
            <div className="flex items-center gap-2 text-footnote text-sage-muted">
              <Megaphone size={13} className="text-gold" /> {a.audienceLabel}
            </div>
            <div className="text-body font-medium text-ivory mt-0.5" data-noi18n>{a.title}</div>
            {a.body && <div className="text-subhead text-sage-muted line-clamp-2 mt-0.5" data-noi18n>{a.body}</div>}
          </Link>
        ))}
      </ListGroup>
    </Section>
  );
}

// Verknüpfte Konten der Person: Benachrichtigungen aller Konten auf einen Blick,
// mit schnellem Kontowechsel (ohne erneutes Passwort).
function LinkedAccountsHome() {
  const { switchAccount } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [accounts, setAccounts] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => { api.get('/me/linked-accounts').then((d) => setAccounts(d.accounts)).catch(() => setAccounts([])); }, []);
  if (!accounts || accounts.length === 0) return null;

  const go = async (id) => {
    setBusy(id);
    try {
      await switchAccount(id);
      // Alle Seiten bauen sich mit dem neuen Konto frisch auf (kein Neuladen).
      navigate('/dashboard');
    } catch (err) {
      toast.push(err.message, 'error');
      setBusy(null);
    }
  };

  return (
    <Section title="Weitere Rollen" className="mb-7">
      <ListGroup>
        {accounts.map((a) => (
          <ListRow
            key={a.id}
            onClick={() => go(a.id)}
            icon={UserRoundCog}
            title={a.roleLabel}
            subtitle={busy === a.id ? 'Wechsle …' : a.unread > 0 ? `${a.unread} ungelesen` : 'Nichts Neues'}
            badge={a.unread}
            chevron
          />
        ))}
      </ListGroup>
    </Section>
  );
}

function NotificationPeek({ items }) {
  const navigate = useNavigate();
  if (!items?.length) return null;
  return (
    <Section title="Benachrichtigungen" action={<Link to="/benachrichtigungen" className="text-subhead text-mint-light dark:text-mint font-medium">Alle</Link>}>
      <ListGroup>
        {items.slice(0, 4).map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => openNotification(n, navigate)}
            className="w-full text-left px-4 py-3 flex items-start gap-3 active:bg-hover hover:bg-hover/60 transition-colors"
          >
            <span className={`mt-[0.45rem] h-2 w-2 rounded-full shrink-0 ${n.read ? 'bg-transparent' : 'bg-mint-light dark:bg-mint'}`} />
            <span className="min-w-0">
              <span className={`block text-body text-ivory ${n.read ? '' : 'font-semibold'}`}>{n.title}</span>
              <span className="block text-subhead text-sage-muted line-clamp-2">{n.body}</span>
            </span>
          </button>
        ))}
      </ListGroup>
    </Section>
  );
}
