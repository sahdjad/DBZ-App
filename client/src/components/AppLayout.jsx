import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { attachScrollFeel } from '../lib/scroll.js';
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
  berichte: { to: '/berichte', label: 'Zeugnisse', icon: FileText },
  aktivitaeten: { to: '/aktivitaeten', label: 'Aktivitäten', icon: Sparkles },
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
      return k('dashboard', 'ankuendigungen', 'nachrichten', 'aufgaben', 'checkin', 'kalender', 'quran', 'hifz', 'pruefungen', 'materialien', 'anwesenheit', 'verhalten', 'strafen', 'berichte', 'aktivitaeten','abwesenheit', 'protokolle', 'benachrichtigungen', 'dbzonline', 'konto');
    case 'klassensprecher':
      return k('dashboard', 'ankuendigungen', 'nachrichten', 'aufgaben', 'checkin', 'kalender', 'quran', 'hifz', 'pruefungen', 'materialien', 'protokolle', 'anwesenheit', 'verhalten', 'strafen', 'berichte', 'aktivitaeten','abwesenheit', 'benachrichtigungen', 'dbzonline', 'konto');
    case 'klassenlehrer':
    case 'vertretung':
      return k('dashboard', 'ankuendigungen', 'nachrichten', 'unterricht', 'klassenliste', 'aufgaben', 'kalender', 'quran', 'hifz', 'pruefungen', 'materialien', 'korrektur', 'entschuldigungen', 'anwesenheit', 'verhalten', 'strafen', 'berichte', 'aktivitaeten','protokolle', 'benachrichtigungen', 'dbzonline', 'konto');
    case 'eltern':
      return k('dashboard', 'ankuendigungen', 'nachrichten', 'kalender', 'quran', 'hifz', 'materialien', 'abwesenheit', 'verhalten', 'strafen', 'berichte', 'aktivitaeten','benachrichtigungen', 'dbzonline', 'konto');
    case 'super_admin':
    case 'leitung':
      return k('dashboard', 'leitung', 'ankuendigungen', 'nachrichten', 'admin', 'klassenliste', 'berichte', 'aktivitaeten', 'strafen', 'benachrichtigungen', 'dbzonline', 'konto');
    default:
      return k('dashboard', 'benachrichtigungen', 'konto');
  }
}

function Brand() {
  const [logoOk, setLogoOk] = useState(true);
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      {logoOk ? (
        <img
          src="/logo.png"
          alt="DBZ"
          className="h-10 w-10 rounded-lg object-contain bg-white"
          onError={() => setLogoOk(false)}
        />
      ) : (
        <span className="grid place-items-center h-10 w-10 rounded-lg bg-mint/15 border border-mint/25 text-mint">
          <BookMarked size={22} strokeWidth={1.75} aria-hidden="true" />
        </span>
      )}
      <div className="leading-tight">
        <div className="font-display text-lg text-ivory">DBZ</div>
        <div className="text-[11px] font-mono uppercase tracking-widest text-sage-muted">
          Deen Bildungszentrum
        </div>
      </div>
    </div>
  );
}

// Ungelesen-Zähler je Navigationspunkt.
function badgeFor(to, badges) {
  if (to === '/nachrichten') return badges.messages;
  if (to === '/ankuendigungen') return badges.announcements;
  if (to === '/benachrichtigungen') return badges.total;
  return 0;
}

function NavItems({ items, badges, onNavigate }) {
  return (
    <nav className="flex-1 px-3 space-y-1 overflow-y-auto" aria-label="Hauptmenü">
      {items.map(({ to, label, icon: Icon }) => {
        const count = badgeFor(to, badges);
        return (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-300',
                isActive
                  ? 'bg-hover text-ivory border border-line'
                  : 'text-sage hover:text-ivory hover:bg-subtle border border-transparent',
              ].join(' ')
            }
          >
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {count > 0 && (
              <span className="min-w-5 h-5 px-1.5 grid place-items-center rounded-full bg-mint text-onaccent text-[11px] font-mono font-semibold">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

// App-Symbol-Badge (Home-Bildschirm) setzen/entfernen – best-effort.
function setAppBadge(n) {
  try {
    if (n > 0) navigator.setAppBadge?.(n);
    else navigator.clearAppBadge?.();
  } catch { /* nicht unterstützt */ }
}

export default function AppLayout({ children, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [badges, setBadges] = useState({ messages: 0, announcements: 0, total: 0 });
  const scrollRef = useRef(null);

  // Eigener Scroll-Bereich für den Hauptinhalt (unabhängig von der Seitenleiste)
  // mit weichem Verhalten & Rand-Abfedern.
  useEffect(() => attachScrollFeel(scrollRef.current), []);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      api
        .get('/badges')
        .then((d) => { if (!alive) return; const b = { messages: d.messages || 0, announcements: d.announcements || 0, total: d.total || 0 }; setBadges(b); setAppBadge(b.total); })
        .catch(() => {});
    refresh();
    // Neu berechnen bei: Lesen/Änderung, Fensterfokus, Sichtbarkeit, Push, Intervall.
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('dbz:notifications', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    const iv = setInterval(refresh, 45000);
    return () => {
      alive = false;
      window.removeEventListener('dbz:notifications', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(iv);
    };
  }, []);
  const unread = badges.total;

  const items = navForRole(user?.role);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const Sidebar = (
    <div className="flex flex-col h-full bg-sidebar border-r border-line">
      <Brand />
      <NavItems items={items} badges={badges} onNavigate={() => setOpen(false)} />
      <div className="p-3 border-t border-line">
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
    <div className="app-h flex bg-bg overflow-hidden">
      {/* Desktop-Sidebar – eigener, fester Bereich (scrollt nicht mit dem Inhalt) */}
      <aside className="hidden lg:flex w-64 shrink-0 app-h">{Sidebar}</aside>

      {/* Mobile-Drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[80vw]">{Sidebar}</div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col app-h">
        {/* Topbar – fest oben, außerhalb des Scroll-Bereichs */}
        <header className="shrink-0 flex items-center gap-3 px-4 lg:px-8 py-4 bg-sidebar border-b border-line">
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
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 grid place-items-center rounded-full bg-mint text-onaccent text-[10px] font-mono font-semibold">
                {unread}
              </span>
            )}
          </NavLink>
        </header>

        {/* Eigener Scroll-Container: scrollt unabhängig von der Navigation,
            mit reichlich Abstand unten (klärt die mobile Tab-Leiste + iPhone-Safe-Area). */}
        <main ref={scrollRef} className="dbz-scroll flex-1 overflow-y-auto overscroll-contain">
          <div className="px-4 lg:px-8 py-6 max-w-7xl w-full mx-auto pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-12">{children}</div>
        </main>
      </div>

      {/* Mobile-Bottom-Nav für schnellen Zugriff */}
      <MobileTabBar items={items.slice(0, 4)} badges={badges} />
    </div>
  );
}

function MobileTabBar({ items, badges }) {
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-sidebar/95 backdrop-blur border-t border-line flex"
      // Safe-Area unten (iPhone Home-Indikator): Leiste sitzt höher, damit
      // Tipps nicht die Home-Geste auslösen. Auf Geräten ohne Indikator = 0.
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
    >
      {items.map(({ to, label, icon: Icon }) => {
        const count = badgeFor(to, badges);
        return (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'relative flex-1 flex flex-col items-center gap-1 pt-2.5 pb-1 text-[11px]',
                isActive ? 'text-mint' : 'text-sage-muted',
              ].join(' ')
            }
          >
            <span className="relative">
              <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
              {count > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-mint text-onaccent text-[10px] font-mono font-semibold">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </span>
            <span className="truncate max-w-full px-1">{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
