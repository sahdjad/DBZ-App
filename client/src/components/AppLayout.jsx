import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  QrCode,
  CalendarCheck,
  CalendarX,
  CalendarDays,
  ClipboardList,
  ClipboardCheck,
  CheckSquare,
  Users2,
  Bell,
  UserCog,
  Menu,
  X,
  LogOut,
  BookMarked,
  Share2,
  Sparkles,
  FileText,
  GraduationCap,
  Star,
  Megaphone,
  FolderOpen,
  Book,
  MessagesSquare,
  Scale,
  Gauge,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { api } from '../lib/api.js';
import { Avatar, Button } from './ui.jsx';

// Rollen-abhängige Navigation (docs/INFORMATION_ARCHITECTURE.md).
const ITEMS = {
  dashboard: { to: '/dashboard', label: 'Start', icon: LayoutDashboard },
  ankuendigungen: { to: '/ankuendigungen', label: 'Ankündigungen', icon: Megaphone },
  nachrichten: { to: '/nachrichten', label: 'Nachrichten', icon: MessagesSquare },
  aufgaben: { to: '/aufgaben', label: 'Aufgaben', icon: BookOpen },
  checkin: { to: '/checkin', label: 'Einchecken', icon: QrCode },
  unterricht: { to: '/unterricht', label: 'Unterricht', icon: Users2 },
  klassenliste: { to: '/klassenliste', label: 'Klassenliste', icon: Users2 },
  leitung: { to: '/leitung', label: 'Leitung', icon: Gauge },
  kalender: { to: '/kalender', label: 'Kalender', icon: CalendarDays },
  anwesenheit: { to: '/anwesenheit', label: 'Anwesenheit', icon: CalendarCheck },
  abwesenheit: { to: '/abwesenheit', label: 'Abwesenheit melden', icon: CalendarX },
  entschuldigungen: { to: '/entschuldigungen', label: 'Entschuldigungen', icon: ClipboardCheck },
  korrektur: { to: '/korrektur', label: 'Korrektur', icon: CheckSquare },
  verhalten: { to: '/verhalten', label: 'Verhalten', icon: Sparkles },
  strafen: { to: '/strafen', label: 'Strafen', icon: Scale },
  quran: { to: '/quran', label: "Qur'an", icon: Book },
  hifz: { to: '/hifz', label: "Hifz & Muraja'ah", icon: Star },
  materialien: { to: '/materialien', label: 'Materialien', icon: FolderOpen },
  pruefungen: { to: '/pruefungen', label: 'Prüfungen', icon: GraduationCap },
  berichte: { to: '/berichte', label: 'Berichte', icon: FileText },
  protokolle: { to: '/protokolle', label: 'Protokolle', icon: ClipboardList },
  admin: { to: '/admin', label: 'Verwaltung', icon: UserCog },
  benachrichtigungen: { to: '/benachrichtigungen', label: 'Benachrichtigungen', icon: Bell },
  dbzonline: { to: '/dbz-online', label: 'DBZ Online', icon: Share2 },
  konto: { to: '/konto', label: 'Konto', icon: UserCog },
};

function navForRole(role) {
  const k = (...keys) => keys.map((key) => ITEMS[key]);
  switch (role) {
    case 'schueler':
      return k('dashboard', 'ankuendigungen', 'nachrichten', 'aufgaben', 'checkin', 'kalender', 'quran', 'hifz', 'pruefungen', 'materialien', 'anwesenheit', 'verhalten', 'strafen', 'berichte', 'abwesenheit', 'protokolle', 'benachrichtigungen', 'dbzonline', 'konto');
    case 'klassensprecher':
      return k('dashboard', 'ankuendigungen', 'nachrichten', 'aufgaben', 'checkin', 'kalender', 'quran', 'hifz', 'pruefungen', 'materialien', 'protokolle', 'anwesenheit', 'verhalten', 'strafen', 'berichte', 'abwesenheit', 'benachrichtigungen', 'dbzonline', 'konto');
    case 'klassenlehrer':
    case 'vertretung':
      return k('dashboard', 'ankuendigungen', 'nachrichten', 'unterricht', 'klassenliste', 'aufgaben', 'kalender', 'quran', 'hifz', 'pruefungen', 'materialien', 'korrektur', 'entschuldigungen', 'anwesenheit', 'verhalten', 'strafen', 'berichte', 'protokolle', 'benachrichtigungen', 'dbzonline', 'konto');
    case 'eltern':
      return k('dashboard', 'ankuendigungen', 'nachrichten', 'kalender', 'quran', 'hifz', 'materialien', 'abwesenheit', 'verhalten', 'strafen', 'berichte', 'benachrichtigungen', 'dbzonline', 'konto');
    case 'super_admin':
    case 'leitung':
      return k('dashboard', 'leitung', 'ankuendigungen', 'nachrichten', 'admin', 'klassenliste', 'strafen', 'benachrichtigungen', 'dbzonline', 'konto');
    default:
      return k('dashboard', 'benachrichtigungen', 'konto');
  }
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <span className="grid place-items-center h-10 w-10 rounded-lg bg-mint/15 border border-mint/25 text-mint">
        <BookMarked size={22} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="leading-tight">
        <div className="font-display text-lg text-ivory">DBZ</div>
        <div className="text-[11px] font-mono uppercase tracking-widest text-sage-muted">
          Deen Bildungszentrum
        </div>
      </div>
    </div>
  );
}

function NavItems({ items, unread, onNavigate }) {
  return (
    <nav className="flex-1 px-3 space-y-1 overflow-y-auto" aria-label="Hauptmenü">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            [
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-300',
              isActive
                ? 'bg-hover text-ivory border border-black/10'
                : 'text-sage hover:text-ivory hover:bg-black/[0.05] border border-transparent',
            ].join(' ')
          }
        >
          <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
          <span className="flex-1">{label}</span>
          {to === '/benachrichtigungen' && unread > 0 && (
            <span className="min-w-5 h-5 px-1.5 grid place-items-center rounded-full bg-mint text-sidebar text-[11px] font-mono font-semibold">
              {unread}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppLayout({ children, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      api
        .get('/notifications')
        .then((d) => alive && setUnread(d.unread || 0))
        .catch(() => {});
    refresh();
    // Wird ausgelöst, sobald irgendwo eine Benachrichtigung gelesen wird.
    window.addEventListener('dbz:notifications', refresh);
    return () => {
      alive = false;
      window.removeEventListener('dbz:notifications', refresh);
    };
  }, []);

  const items = navForRole(user?.role);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const Sidebar = (
    <div className="flex flex-col h-full bg-sidebar border-r border-black/10">
      <Brand />
      <NavItems items={items} unread={unread} onNavigate={() => setOpen(false)} />
      <div className="p-3 border-t border-black/10">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar name={user?.name} size={36} />
          <div className="leading-tight min-w-0 flex-1">
            <div className="text-sm text-ivory truncate">{user?.name}</div>
            <div className="text-[11px] text-sage-muted truncate">{user?.roleLabel}</div>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start mt-1" onClick={handleLogout}>
          <LogOut size={16} /> Abmelden
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-bg">
      {/* Desktop-Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 sticky top-0 h-screen">{Sidebar}</aside>

      {/* Mobile-Drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[80vw]">{Sidebar}</div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 px-4 lg:px-8 py-4 bg-bg/85 backdrop-blur border-b border-black/10">
          <button
            className="lg:hidden text-sage hover:text-ivory"
            onClick={() => setOpen(true)}
            aria-label="Menü öffnen"
          >
            <Menu size={22} />
          </button>
          <h1 className="font-display text-xl text-ivory flex-1 truncate">{title}</h1>
          <NavLink to="/benachrichtigungen" className="relative text-sage hover:text-ivory" aria-label="Benachrichtigungen">
            <Bell size={20} />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 grid place-items-center rounded-full bg-mint text-sidebar text-[10px] font-mono font-semibold">
                {unread}
              </span>
            )}
          </NavLink>
        </header>

        <main className="flex-1 px-4 lg:px-8 py-6 max-w-6xl w-full mx-auto">{children}</main>
      </div>

      {/* Mobile-Bottom-Nav für schnellen Zugriff */}
      <MobileTabBar items={items.slice(0, 4)} />
    </div>
  );
}

function MobileTabBar({ items }) {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-sidebar/95 backdrop-blur border-t border-black/10 flex">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            [
              'flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px]',
              isActive ? 'text-mint' : 'text-sage-muted',
            ].join(' ')
          }
        >
          <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
          <span className="truncate max-w-full px-1">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
