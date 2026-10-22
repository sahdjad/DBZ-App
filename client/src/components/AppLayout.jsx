import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { startUpdateWatcher, applyUpdate } from '../lib/update.js';
import { attachScrollFeel } from '../lib/scroll.js';
import { getPushState, enablePush, iosNeedsInstall } from '../lib/push.js';
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
  ChevronsUpDown,
  Check,
  Info,
  LifeBuoy,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Settings,
  ScrollText,
  Trophy,
  Presentation,
  BellOff,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { api } from '../lib/api.js';
import { Avatar, Spinner, CountBadge, useToast } from './ui.jsx';
import { ConsentGate } from './Consent.jsx';
import { GuideGate } from './GuideTour.jsx';

// Rollen-abhängige Navigation (docs/INFORMATION_ARCHITECTURE.md).
const ITEMS = {
  dashboard: { to: '/dashboard', label: 'Start', icon: LayoutDashboard },
  ankuendigungen: { to: '/ankuendigungen', label: 'Ankündigungen', icon: Megaphone },
  nachrichten: { to: '/nachrichten', label: 'Nachrichten', icon: MessagesSquare },
  aufgaben: { to: '/aufgaben', label: 'Aufgaben', icon: BookOpen },
  checkin: { to: '/checkin', label: 'Einchecken', icon: QrCode },
  unterricht: { to: '/unterricht', label: 'Unterricht', icon: Presentation },
  klassenliste: { to: '/klassenliste', label: 'Klassenliste', icon: Users2 },
  leitung: { to: '/leitung', label: 'Leitung', icon: Gauge },
  kalender: { to: '/kalender', label: 'Kalender', icon: CalendarDays },
  anwesenheit: { to: '/anwesenheit', label: 'Anwesenheit', icon: CalendarCheck },
  abwesenheit: { to: '/abwesenheit', label: 'Abwesenheit melden', icon: CalendarX },
  entschuldigungen: { to: '/entschuldigungen', label: 'Entschuldigungen', icon: ClipboardCheck },
  korrektur: { to: '/korrektur', label: 'Korrektur', icon: CheckSquare },
  abgaben: { to: '/abgaben', label: 'Abgaben', icon: CheckSquare },
  verhalten: { to: '/verhalten', label: 'Verhalten', icon: Sparkles },
  strafen: { to: '/strafen', label: 'Strafen', icon: Scale },
  regeln: { to: '/regeln', label: 'Regeln & Katalog', icon: ScrollText },
  quran: { to: '/quran', label: "Qur'an", icon: Book },
  hifz: { to: '/hifz', label: "Hifz & Muraja'ah", icon: Star },
  materialien: { to: '/materialien', label: 'Materialien', icon: FolderOpen },
  pruefungen: { to: '/pruefungen', label: 'Prüfungen', icon: GraduationCap },
  berichte: { to: '/berichte', label: 'Zeugnisse', icon: FileText },
  aktivitaeten: { to: '/aktivitaeten', label: 'Aktivitäten', icon: Trophy },
  protokolle: { to: '/protokolle', label: 'Protokolle', icon: ClipboardList },
  admin: { to: '/admin', label: 'Verwaltung', icon: UserCog },
  benachrichtigungen: { to: '/benachrichtigungen', label: 'Benachrichtigungen', icon: Bell },
  dbzonline: { to: '/dbz-online', label: 'DBZ Online', icon: Share2 },
  konto: { to: '/konto', label: 'Konto & Einstellungen', icon: Settings },
  hilfe: { to: '/hilfe', label: 'Hilfe & Anleitung', icon: LifeBuoy },
  mehr: { to: '/mehr', label: 'Mehr', icon: LayoutGrid },
};

// Gruppen für „Mehr“ und die Seitenleiste am Computer.
const GROUP_ORDER = ['Kommunikation', 'Unterricht', 'Lernen', 'Verhalten & Regeln', 'Verwaltung', 'App'];
const NAV_GROUPS = {
  '/ankuendigungen': 'Kommunikation', '/nachrichten': 'Kommunikation', '/benachrichtigungen': 'Kommunikation',
  '/unterricht': 'Unterricht', '/klassenliste': 'Unterricht', '/checkin': 'Unterricht',
  '/anwesenheit': 'Unterricht', '/abwesenheit': 'Unterricht', '/kalender': 'Unterricht',
  '/korrektur': 'Unterricht', '/abgaben': 'Unterricht', '/entschuldigungen': 'Unterricht', '/protokolle': 'Unterricht',
  '/aufgaben': 'Unterricht',
  '/quran': 'Lernen', '/hifz': 'Lernen', '/pruefungen': 'Lernen',
  '/materialien': 'Lernen', '/berichte': 'Lernen', '/aktivitaeten': 'Lernen',
  '/verhalten': 'Verhalten & Regeln', '/strafen': 'Verhalten & Regeln', '/regeln': 'Verhalten & Regeln',
  '/admin': 'Verwaltung', '/leitung': 'Verwaltung', '/dbz-online': 'Verwaltung',
  '/konto': 'App', '/hilfe': 'App',
};

function navForRole(role) {
  const k = (...keys) => keys.map((key) => ITEMS[key]);
  switch (role) {
    case 'schueler':
    case 'klassensprecher':
      return k(
        'dashboard',
        'ankuendigungen', 'nachrichten', 'benachrichtigungen',
        'aufgaben', 'checkin', 'kalender', 'anwesenheit', 'abwesenheit', 'protokolle',
        'quran', 'hifz', 'pruefungen', 'materialien', 'berichte', 'aktivitaeten',
        'verhalten', 'strafen', 'regeln',
        'dbzonline', 'hilfe', 'konto',
      );
    case 'klassenlehrer':
    case 'vertretung':
      return k(
        'dashboard',
        'ankuendigungen', 'nachrichten', 'benachrichtigungen',
        'unterricht', 'klassenliste', 'aufgaben', 'korrektur', 'entschuldigungen', 'kalender', 'anwesenheit', 'protokolle',
        'quran', 'hifz', 'pruefungen', 'materialien', 'berichte', 'aktivitaeten',
        'verhalten', 'strafen', 'regeln',
        'dbzonline', 'hilfe', 'konto',
      );
    case 'eltern':
      return k(
        'dashboard',
        'ankuendigungen', 'nachrichten', 'benachrichtigungen',
        'kalender', 'abwesenheit',
        'quran', 'hifz', 'materialien', 'berichte', 'aktivitaeten',
        'verhalten', 'strafen', 'regeln',
        'dbzonline', 'hilfe', 'konto',
      );
    case 'super_admin':
    case 'leitung':
      // Leitung/Admin unterrichten nicht selbst: statt "Korrektur" nur
      // "Abgaben" (ansehen), Entschuldigungen nur einsehen, alles nach Klassen
      // geordnet. "Unterricht" = Tagesüberblick + gemeinsamer Schultag.
      return k(
        'dashboard', 'leitung',
        'ankuendigungen', 'nachrichten', 'benachrichtigungen',
        'unterricht', 'klassenliste', 'kalender', 'abgaben', 'entschuldigungen', 'protokolle', 'aktivitaeten',
        'strafen', 'regeln',
        'admin', 'dbzonline',
        'hilfe', 'konto',
      );
    default:
      return k('dashboard', 'benachrichtigungen', 'hilfe', 'konto');
  }
}

// Untere Leiste: die täglich gebrauchten Bereiche der Rolle, Rest unter „Mehr“.
function tabsForRole(role) {
  const t = (...keys) => keys.map((key) => ITEMS[key]);
  switch (role) {
    case 'schueler':
    case 'klassensprecher':
      return t('dashboard', 'aufgaben', 'quran', 'nachrichten', 'mehr');
    case 'klassenlehrer':
    case 'vertretung':
      return t('dashboard', 'unterricht', 'aufgaben', 'nachrichten', 'mehr');
    case 'eltern':
      return t('dashboard', 'kalender', 'nachrichten', 'mehr');
    case 'super_admin':
    case 'leitung':
      return t('dashboard', 'leitung', 'admin', 'nachrichten', 'mehr');
    default:
      return t('dashboard', 'benachrichtigungen', 'mehr');
  }
}
const TAB_LABEL = { '/admin': 'Verwaltung', '/quran': "Qur'an" };

// Gruppierte Navigation (für „Mehr“ und Seitenleiste).
export function groupNav(items) {
  const map = new Map();
  for (const it of items) {
    const g = NAV_GROUPS[it.to];
    if (!g) continue;
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(it);
  }
  return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, items: map.get(g) }));
}

// Navigationsdaten für Seiten innerhalb des Layouts (z. B. „Mehr“).
const NavContext = createContext({ items: [], tabs: [], badges: {}, openAccounts: () => {} });
export const useNav = () => useContext(NavContext);

function Brand() {
  const [logoOk, setLogoOk] = useState(true);
  return (
    <div className="flex items-center gap-3 px-5 pt-6 pb-5">
      {logoOk ? (
        <img
          src="/logo.png"
          alt="DBZ"
          className="h-11 w-11 shrink-0 rounded-xl object-contain bg-[#fbf8ee] p-1"
          onError={() => setLogoOk(false)}
        />
      ) : (
        <span className="grid place-items-center h-11 w-11 rounded-xl bg-white/10 text-white">
          <BookMarked size={22} strokeWidth={1.75} aria-hidden="true" />
        </span>
      )}
      <div className="leading-tight">
        <div className="text-[1.0625rem] font-semibold text-ivory">DBZ</div>
        <div className="text-caption text-sage-muted">Deen Bildungszentrum</div>
      </div>
    </div>
  );
}

// Ungelesen-Zähler je Navigationspunkt.
export function badgeFor(to, badges) {
  if (to === '/nachrichten') return badges.messages;
  if (to === '/ankuendigungen') return badges.announcements;
  if (to === '/benachrichtigungen') return badges.total;
  // Alle anderen Bereiche (Korrektur, Aufgaben, Protokolle, Entschuldigungen …):
  // ungelesene Benachrichtigungen, die dorthin führen.
  return badges.byRoute?.[to] || 0;
}

// Seitenleiste am Computer: gruppiert, ruhig, aktive Zeile hell hinterlegt.
function SideNav({ items, badges }) {
  const groups = groupNav(items);
  const top = items.filter((i) => !NAV_GROUPS[i.to]);
  const row = ({ to, label, icon: Icon }) => {
    const count = badgeFor(to, badges);
    return (
      <NavLink
        key={to}
        to={to}
        className={({ isActive }) =>
          [
            'flex items-center gap-3 px-3 h-9 rounded-lg text-subhead transition-colors duration-150',
            isActive ? 'bg-white/[0.12] text-ivory font-semibold' : 'text-sage hover:text-ivory hover:bg-white/[0.06]',
          ].join(' ')
        }
      >
        <Icon size={18} strokeWidth={1.9} aria-hidden="true" className="shrink-0 opacity-90" />
        <span className="flex-1 truncate">{label}</span>
        {count > 0 && <span className="min-w-[1.25rem] h-5 px-1.5 grid place-items-center rounded-full bg-white/90 text-[#07382E] text-caption font-semibold font-mono">{count > 99 ? '99+' : count}</span>}
      </NavLink>
    );
  };
  return (
    <nav className="dbz-scroll flex-1 px-3 pb-6 overflow-y-auto overscroll-contain" aria-label="Hauptmenü">
      <div className="space-y-0.5">{top.map(row)}</div>
      {groups.map((g) => (
        <div key={g.group} className="mt-5">
          <div className="px-3 pb-1.5 text-caption font-semibold text-sage-muted" role="presentation">{g.group}</div>
          <div className="space-y-0.5">{g.items.map(row)}</div>
        </div>
      ))}
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

export default function AppLayout({ children, title, back, actions, wide = false }) {
  const { user, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [switcherOpen, setSwitcherOpen] = useState(false);
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
        .then((d) => {
          if (!alive) return;
          const b = { messages: d.messages || 0, announcements: d.announcements || 0, total: d.total || 0, byRoute: d.byRoute || {}, linkedTotal: d.linkedTotal || 0, grandTotal: d.grandTotal ?? (d.total || 0) };
          setBadges(b);
          // App-Symbol-Badge zählt ALLE Konten der Person (auch verknüpfte).
          setAppBadge(b.grandTotal);
        })
        .catch(() => {});
    // Bereich geöffnet -> seine Meldungen gelten als gelesen, danach Zahlen holen.
    const section = `/${pathname.split('/')[1] || ''}`;
    api.post('/notifications/read-route', { route: section }).catch(() => {}).finally(refresh);
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
  const tabs = tabsForRole(user?.role);
  const section = `/${pathname.split('/')[1] || ''}`;
  const isTabRoot = tabs.some((t) => t.to === pathname) || pathname === '/mehr';
  // Unterseiten (alles, was nicht direkt ein Reiter ist) bekommen „Zurück“.
  const showBack = back !== false && (back || !isTabRoot);
  const goBack = () => {
    if (typeof back === 'string') return navigate(back);
    if (window.history.state?.idx > 0) return navigate(-1);
    const tab = tabs.find((t) => t.to === section);
    return navigate(tab ? tab.to : '/mehr');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const nav = { items, tabs, badges, openAccounts: () => setSwitcherOpen(true), logout: handleLogout };

  return (
    <NavContext.Provider value={nav}>
    <div className="app-h flex bg-bg overflow-hidden">
      {/* Computer: feste Seitenleiste */}
      <aside className="hidden lg:flex w-72 shrink-0 app-h">
        <div className="nav-surface flex flex-col h-full w-full">
          <Brand />
          <SideNav items={items} badges={badges} />
          <div className="shrink-0 p-3 border-t border-white/10">
            <button
              type="button"
              onClick={() => setSwitcherOpen(true)}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/[0.06] transition-colors"
              aria-label="Rolle wechseln"
            >
              <Avatar name={user?.name} size={36} />
              <div className="leading-tight min-w-0 flex-1 text-left">
                <div className="text-subhead text-ivory font-medium truncate">{user?.name}</div>
                <div className="text-caption text-sage-muted truncate">{user?.roleLabel}</div>
              </div>
              <ChevronsUpDown size={16} className="text-sage-muted shrink-0" aria-hidden="true" />
            </button>
            <button type="button" onClick={handleLogout} className="mt-1 w-full flex items-center gap-2 px-3 h-9 rounded-lg text-subhead text-sage hover:text-ivory hover:bg-white/[0.06]">
              <LogOut size={16} /> Abmelden
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col app-h">
        {/* Kopfzeile: geht nahtlos unter die Statusleiste (Uhrzeit/Akku). */}
        <header className="nav-surface shrink-0 relative z-20" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="flex items-center gap-1 h-[3.25rem] px-2 lg:px-6">
            {showBack ? (
              <button onClick={goBack} className="lg:hidden flex items-center h-11 pl-1 pr-2 -mr-1 text-ivory/95 active:opacity-50" aria-label="Zurück">
                <ChevronLeft size={28} strokeWidth={2.2} />
              </button>
            ) : <span className="w-2 lg:hidden" />}
            <h1 className={`flex-1 min-w-0 truncate text-ivory font-semibold ${showBack ? 'text-[1.0625rem]' : 'text-[1.375rem] tracking-tight'} lg:text-[1.375rem] lg:tracking-tight`}>{title}</h1>
            {actions}
            <NavLink to="/benachrichtigungen" className="relative grid place-items-center h-11 w-11 rounded-full text-ivory/90 hover:bg-white/[0.08] active:opacity-60" aria-label="Benachrichtigungen">
              <Bell size={22} strokeWidth={1.9} />
              {unread > 0 && (
                <span className="absolute top-1.5 right-1 min-w-[1.125rem] h-[1.125rem] px-1 grid place-items-center rounded-full bg-[#E5484D] text-white text-[0.625rem] font-semibold font-mono ring-2 ring-[rgb(var(--header-bg))]">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </NavLink>
            <button type="button" onClick={() => setSwitcherOpen(true)} className="lg:hidden relative grid place-items-center h-11 w-11 rounded-full active:opacity-60" aria-label="Konto und Rolle">
              <Avatar name={user?.name} size={30} light />
              {badges.linkedTotal > 0 && <span className="absolute top-1.5 right-1 h-2.5 w-2.5 rounded-full bg-[#E5484D] ring-2 ring-[rgb(var(--header-bg))]" />}
            </button>
          </div>
        </header>

        {user && !user.demo && <PushNudge user={user} />}
        <UpdateBanner />
        <RoleFromLink user={user} />
        {user && <ConsentGate user={user} onDone={refresh} />}
        <GuideGate />
        {user?.demo && (
          <div className="shrink-0 bg-status-late/12 text-status-late text-footnote px-4 py-1.5 text-center" role="note">
            Demo-Modus – nur zum Ausprobieren. Nichts wird gespeichert, es gibt keinen Zugriff auf echte Daten.
          </div>
        )}
        {/* Eigener Scroll-Container: scrollt unabhängig von der Navigation. */}
        <main ref={scrollRef} className="dbz-scroll flex-1 overflow-y-auto overscroll-contain">
          <div key={pathname} className={`dbz-page px-4 sm:px-6 lg:px-10 pt-5 lg:pt-8 ${wide ? 'max-w-7xl' : 'max-w-5xl'} w-full mx-auto pb-[calc(var(--dbz-tabbar-h,0px)+2rem)] lg:pb-14`}>{children}</div>
        </main>
      </div>

      <MobileTabBar tabs={tabs} badges={badges} pathname={pathname} />

      <AccountSwitcherSheet open={switcherOpen} onClose={() => setSwitcherOpen(false)} currentUser={user} onLogout={handleLogout} />
    </div>
    </NavContext.Provider>
  );
}

// Untere Leiste (iOS-Tab-Bar): helles, leicht durchscheinendes Material.
function MobileTabBar({ tabs, badges, pathname }) {
  // Tatsächliche Höhe der Leiste (je nach Gerät/Home-Indikator verschieden)
  // als CSS-Variable bereitstellen -- darauf sitzen z. B. die Seitenleiste im
  // Qur'an ohne Lücke auf. Am Computer ist die Leiste ausgeblendet (Höhe 0).
  const navRef = useRef(null);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return undefined;
    const root = document.documentElement;
    const set = () => root.style.setProperty('--dbz-tabbar-h', `${Math.floor(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    window.addEventListener('resize', set);
    return () => { ro.disconnect(); window.removeEventListener('resize', set); root.style.setProperty('--dbz-tabbar-h', '0px'); };
  }, []);
  const section = `/${pathname.split('/')[1] || ''}`;
  const inTabs = tabs.some((t) => t.to === section);
  const moreBadge = badges.linkedTotal || 0;
  return (
    <nav
      ref={navRef}
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 flex border-t border-line/80 backdrop-blur-xl backdrop-saturate-150"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.375rem)', backgroundColor: 'rgb(var(--tabbar-bg) / 0.88)' }}
      aria-label="Bereiche"
    >
      {tabs.map(({ to, label, icon: Icon }) => {
        const active = to === '/mehr' ? !inTabs : section === to;
        const count = to === '/mehr' ? moreBadge : badgeFor(to, badges);
        return (
          <NavLink
            key={to}
            to={to}
            aria-current={active ? 'page' : undefined}
            className={[
              'relative flex-1 min-w-0 flex flex-col items-center gap-[0.2rem] pt-2 pb-0.5 transition-colors duration-150 active:opacity-60',
              active ? 'text-mint-light dark:text-mint' : 'text-sage-muted',
            ].join(' ')}
          >
            <span className="relative">
              <Icon size={25} strokeWidth={active ? 2.2 : 1.7} aria-hidden="true" />
              {count > 0 && (
                <span className="absolute -top-1 -right-2.5 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-[#E5484D] text-white text-[10px] font-semibold font-mono">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </span>
            <span className={`text-[10.5px] leading-none truncate max-w-full px-0.5 ${active ? 'font-semibold' : 'font-medium'}`}>{TAB_LABEL[to] || label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

// Konto & Rolle (wie der Kontowechsel in iOS-Apps): aktuelle Rolle oben klar
// erkennbar, verknüpfte Rollen darunter, Wechsel ohne erneutes Passwort.
function AccountSwitcherSheet({ open, onClose, currentUser, onLogout }) {
  const { switchAccount } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!open) return;
    setAccounts(null);
    api.get('/me/linked-accounts').then((d) => setAccounts(d.accounts)).catch(() => setAccounts([]));
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const go = async (id) => {
    setBusyId(id);
    try {
      await switchAccount(id);
      window.location.reload(); // sauberer Neustart mit dem neuen Konto
    } catch (err) {
      toast.push(err.message, 'error');
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Konto und Rolle">
      <div className="dbz-backdrop absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="dbz-sheet absolute inset-x-0 bottom-0 lg:inset-0 lg:m-auto lg:h-fit lg:max-w-md lg:rounded-3xl rounded-t-[1.5rem] bg-bg px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto shadow-float">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-sage-muted/30 lg:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between mb-4 px-1">
          <h2 className="text-title3 text-ivory">Konto</h2>
          <button onClick={onClose} aria-label="Schließen" className="grid place-items-center h-8 w-8 rounded-full bg-subtle text-sage-muted hover:text-ivory"><X size={16} strokeWidth={2.5} /></button>
        </div>

        <div className="rounded-2xl bg-card border border-line/70 p-4 flex items-center gap-3.5">
          <Avatar name={currentUser?.name} size={52} />
          <div className="min-w-0 flex-1">
            <div className="text-body font-semibold text-ivory truncate">{currentUser?.name}</div>
            <div className="text-footnote text-sage-muted truncate">{currentUser?.email}</div>
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-mint/10 text-mint-light dark:text-mint px-2 py-0.5 text-caption font-semibold">
              <Check size={12} strokeWidth={3} /> {currentUser?.roleLabel} · aktiv
            </span>
          </div>
        </div>

        <div className="mt-5 mb-1.5 px-1 text-footnote font-medium text-sage-muted">Rolle wechseln</div>
        {!accounts ? (
          <div className="py-4"><Spinner label="" /></div>
        ) : accounts.length === 0 ? (
          <p className="text-footnote text-sage-muted px-1 py-2">
            Du hast nur diese eine Rolle. Weitere Rollen (z. B. Lehrkraft und Schüler) vergibt die DBZ-Leitung.
          </p>
        ) : (
          <div className="rounded-2xl bg-card border border-line/70 overflow-hidden divide-y divide-line/70">
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={busyId != null}
                onClick={() => go(a.id)}
                className="w-full flex items-center gap-3 px-4 py-3 active:bg-hover hover:bg-hover/60 transition-colors text-left disabled:opacity-50"
              >
                <Avatar name={a.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="text-body text-ivory truncate">{a.roleLabel}</div>
                  <div className="text-footnote text-sage-muted truncate">
                    {[a.name !== currentUser?.name ? a.name : null, a.classNames?.join(', ') || null].filter(Boolean).join(' · ') || ' '}
                  </div>
                </div>
                {a.unread > 0 && <CountBadge n={a.unread} />}
                {busyId === a.id
                  ? <span className="h-4 w-4 rounded-full border-2 border-line border-t-mint animate-spin shrink-0" role="status" aria-label="Wird gewechselt" />
                  : <ChevronRight size={18} className="text-sage-muted/60 shrink-0" />}
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 rounded-2xl bg-card border border-line/70 overflow-hidden divide-y divide-line/70">
          <button type="button" onClick={() => { onClose(); navigate('/konto'); }} className="w-full flex items-center gap-3 px-4 h-12 text-left text-body text-ivory active:bg-hover">
            <Settings size={19} className="text-sage-muted" /> <span className="flex-1">Konto & Einstellungen</span> <ChevronRight size={18} className="text-sage-muted/60" />
          </button>
          <button type="button" onClick={() => { onClose(); onLogout(); }} className="w-full flex items-center gap-3 px-4 h-12 text-left text-body text-status-absent active:bg-hover">
            <LogOut size={19} /> Abmelden
          </button>
        </div>
      </div>
    </div>
  );
}

// Pflicht-Benachrichtigungen: Schüler, Klassensprecher und Eltern sollen neue
// Aufgaben, Materialien, Termine und Nachrichten sofort als Push sehen. Solange
// Push auf diesem Gerät nicht aktiv ist, erscheint dieser Hinweis (er lässt
// sich nicht dauerhaft wegklicken). Lehrkräfte/Leitung sehen ihn nicht.
const PUSH_REQUIRED = ['schueler', 'klassensprecher', 'eltern'];
// Mitarbeitende brauchen Push genauso (Entschuldigungen, Nachrichten) -- für sie
// ist der Hinweis aber abschaltbar (Konto -> Benachrichtigungen -> Aus).
// Anleitung passend zum Gerät: am Computer gibt es keine "Handy-Einstellungen".
function blockedHint() {
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) return 'Benachrichtigungen sind blockiert. Auf dem iPhone: Einstellungen → Mitteilungen → DBZ → „Mitteilungen erlauben“ einschalten.';
  if (/Android/i.test(ua)) return 'Benachrichtigungen sind blockiert. Auf dem Handy: Einstellungen → Apps → DBZ (bzw. Chrome) → Benachrichtigungen erlauben.';
  return 'Benachrichtigungen sind in diesem Browser blockiert. Links neben der Adresse auf das Schloss-/Einstellungs-Symbol klicken, „Benachrichtigungen“ erlauben und die Seite neu laden.';
}
const pushOptedOut = () => { try { return localStorage.getItem('dbz-push-optout') === '1'; } catch { return false; } };
function PushNudge({ user }) {
  const required = PUSH_REQUIRED.includes(user.role);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  // „Später“ gilt für die ganze Sitzung (nicht nur bis zum nächsten Seitenwechsel).
  const [hidden, setHiddenState] = useState(() => { try { return sessionStorage.getItem('dbz-push-later') === '1'; } catch { return false; } });
  const setHidden = (v) => { setHiddenState(v); try { sessionStorage.setItem('dbz-push-later', v ? '1' : '0'); } catch { /* egal */ } };
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!required && pushOptedOut()) return undefined;
    let alive = true;
    (async () => {
      let s = await getPushState().catch(() => ({ supported: false }));
      // Erlaubnis schon erteilt, aber (noch) kein Abo -> still anmelden.
      if (s.supported && s.permission === 'granted' && !s.subscribed) {
        try { await enablePush(); s = await getPushState(); } catch { /* egal */ }
      }
      if (alive) setState(s);
    })();
    return () => { alive = false; };
  }, [user.role]);
  if ((!required && pushOptedOut()) || !state || hidden || state.subscribed) return null;
  const ios = iosNeedsInstall();
  if (!state.supported && !ios) return null;
  const enable = async () => {
    setBusy(true);
    try { await enablePush(); setState(await getPushState()); } catch { setState(await getPushState().catch(() => state)); }
    finally { setBusy(false); }
  };
  const denied = state.permission === 'denied';
  const short = ios
    ? 'Für Mitteilungen: Teilen → „Zum Home-Bildschirm“.'
    : denied ? 'Mitteilungen sind blockiert.' : 'Mitteilungen einschalten, damit du nichts verpasst.';
  const long = ios
    ? 'Für Benachrichtigungen auf dem iPhone bitte „Teilen" → „Zum Home-Bildschirm" wählen und die App von dort öffnen.'
    : denied ? blockedHint()
      : required
        ? 'Bitte Benachrichtigungen einschalten, damit du neue Aufgaben, Termine und Nachrichten sofort bekommst.'
        : 'Bitte Benachrichtigungen einschalten, damit du Entschuldigungen und Nachrichten sofort auf dem Sperrbildschirm siehst.';
  return (
    <div className="shrink-0 mx-4 lg:mx-10 mt-3 rounded-2xl border border-line/70 bg-card shadow-card px-3.5 py-2.5" role="note">
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center h-7 w-7 rounded-full bg-status-late/12 text-status-late shrink-0"><BellOff size={15} aria-hidden="true" /></span>
        <button type="button" onClick={() => setMore((v) => !v)} className="flex-1 min-w-0 text-left text-footnote text-ivory" aria-expanded={more}>
          {short} <span className="text-mint-light dark:text-mint font-medium">{more ? 'Weniger' : 'Wie?'}</span>
        </button>
        {!ios && !denied && (
          <button onClick={enable} disabled={busy} className="rounded-full bg-mint text-onaccent px-3 py-1.5 text-footnote font-semibold disabled:opacity-60 shrink-0">
            {busy ? '…' : 'Einschalten'}
          </button>
        )}
        <button onClick={() => setHidden(true)} className="grid place-items-center h-7 w-7 rounded-full text-sage-muted hover:bg-hover shrink-0" aria-label="Später"><X size={15} /></button>
      </div>
      {more && <p className="mt-2 text-footnote text-sage-muted">{long}</p>}
    </div>
  );
}

// Neue App-Version während der Nutzung: Hinweis mit Knopf. Beim Start und beim
// Zurückholen aus dem Hintergrund aktualisiert sich die App automatisch hinter
// dem DBZ-Logo (lib/update.js).
let watcherStarted = false;
let latestSeen = null;
const updateListeners = new Set();
function UpdateBanner() {
  const [latest, setLatest] = useState(latestSeen);
  useEffect(() => {
    updateListeners.add(setLatest);
    if (!watcherStarted) {
      watcherStarted = true;
      startUpdateWatcher((l) => { latestSeen = l; updateListeners.forEach((fn) => fn(l)); });
    }
    return () => { updateListeners.delete(setLatest); };
  }, []);
  if (!latest) return null;
  return (
    <div className="shrink-0 mx-4 lg:mx-10 mt-3 rounded-2xl bg-mint text-onaccent px-4 py-2.5 text-footnote flex flex-wrap items-center gap-2 shadow-card" role="status">
      <span className="flex-1 min-w-[12rem] font-medium">Eine neue Version der DBZ-App ist da.</span>
      <button onClick={() => applyUpdate(latest)} className="rounded-full bg-white/20 px-3.5 py-1.5 text-footnote font-semibold">Aktualisieren</button>
    </div>
  );
}

// Push-Meldung für eine andere Rolle derselben Person (z. B. an die Lehrer-
// Rolle, während man gerade als Schüler drin ist): Link enthält ?as=<Konto>,
// die App wechselt dann automatisch in diese Rolle.
function RoleFromLink({ user }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { switchAccount } = useAuth();
  useEffect(() => {
    const as = new URLSearchParams(location.search).get('as');
    if (!as || !user) return;
    const clean = location.pathname;
    if (as === user.id) { navigate(clean, { replace: true }); return; }
    switchAccount(as)
      .then(() => { window.location.hash = `#${clean}`; window.location.reload(); })
      .catch(() => navigate(clean, { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, user?.id]);
  return null;
}
