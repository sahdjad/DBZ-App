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
  PanelLeft,
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

function Brand({ compact = false }) {
  const [logoOk, setLogoOk] = useState(true);
  const logo = logoOk ? (
    <img
      src="/logo.png"
      alt="DBZ"
      className={`${compact ? 'h-10 w-10' : 'h-10 w-10'} shrink-0 rounded-xl object-contain bg-[#fbf8ee] p-1`}
      onError={() => setLogoOk(false)}
    />
  ) : (
    <span className="grid place-items-center h-10 w-10 rounded-xl bg-white/10 text-white">
      <BookMarked size={20} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
  if (compact) return <div className="grid place-items-center pt-4 pb-3">{logo}</div>;
  return (
    <div className="flex items-center gap-3 px-4 pt-5 pb-4">
      {logo}
      <div className="leading-tight min-w-0">
        <div className="text-[1.0625rem] font-semibold text-ivory">DBZ</div>
        <div className="text-caption text-sage-muted truncate">Deen Bildungszentrum</div>
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

const SideCount = ({ n }) => (n > 0
  ? <span className="min-w-[1.25rem] h-5 px-1.5 grid place-items-center rounded-full bg-white/90 text-[#07382E] text-caption font-semibold font-mono">{n > 99 ? '99+' : n}</span>
  : null);

// Volle Seitenleiste (iPad quer, Mac): gruppiert, ruhig, aktive Zeile hell.
function SideNav({ items, badges, onNavigate }) {
  const groups = groupNav(items);
  const top = items.filter((i) => !NAV_GROUPS[i.to]);
  const row = ({ to, label, icon: Icon }) => (
    <NavLink
      key={to}
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 px-3 h-9 rounded-lg text-subhead transition-colors duration-150 focus-visible:ring-offset-0',
          isActive ? 'bg-white/[0.13] text-ivory font-semibold' : 'text-sage hover:text-ivory hover:bg-white/[0.06]',
        ].join(' ')
      }
    >
      <Icon size={18} strokeWidth={1.9} aria-hidden="true" className="shrink-0 opacity-90" />
      <span className="flex-1 truncate">{label}</span>
      <SideCount n={badgeFor(to, badges)} />
    </NavLink>
  );
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

// Schmale Leiste (iPad hochkant, eingeklappte Seitenleiste am Mac): die
// Hauptbereiche der Rolle untereinander mit Beschriftung, „Mehr“ öffnet die
// vollständige Navigation.
function Rail({ tabs, badges, pathname, onMore }) {
  const section = `/${pathname.split('/')[1] || ''}`;
  const inTabs = tabs.some((t) => t.to === section);
  return (
    <nav className="flex-1 flex flex-col items-stretch gap-1 px-2 overflow-y-auto" aria-label="Bereiche">
      {tabs.map(({ to, label, icon: Icon }) => {
        const isMore = to === '/mehr';
        const active = isMore ? !inTabs : section === to;
        const count = isMore ? badges.linkedTotal || 0 : badgeFor(to, badges);
        const cls = [
          'relative flex flex-col items-center gap-1 rounded-xl py-2.5 px-1 transition-colors duration-150 focus-visible:ring-offset-0',
          active ? 'bg-white/[0.13] text-ivory' : 'text-sage hover:text-ivory hover:bg-white/[0.06]',
        ].join(' ');
        const inner = (
          <>
            <span className="relative">
              <Icon size={22} strokeWidth={active ? 2.1 : 1.8} aria-hidden="true" />
              {count > 0 && <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-[#E5484D] text-white text-[10px] font-semibold font-mono">{count > 99 ? '99+' : count}</span>}
            </span>
            <span className={`text-[11px] leading-tight text-center ${active ? 'font-semibold' : 'font-medium'}`}>{TAB_LABEL[to] || label}</span>
          </>
        );
        return isMore
          ? <button key={to} type="button" onClick={onMore} className={cls} aria-label="Alle Bereiche">{inner}</button>
          : <NavLink key={to} to={to} className={cls} aria-current={active ? 'page' : undefined}>{inner}</NavLink>;
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

// Seitenleiste am Mac/iPad quer ein-/ausklappbar (pro Gerät gemerkt).
const readCollapsed = () => { try { return localStorage.getItem('dbz-sidebar') === 'rail'; } catch { return false; } };

export default function AppLayout({ children, title, back, actions, wide = false }) {
  const { user, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [accountOpen, setAccountOpen] = useState(false);
  const [drawer, setDrawer] = useState(false); // volle Navigation als Overlay (iPad hochkant)
  const [collapsed, setCollapsedState] = useState(readCollapsed);
  const setCollapsed = (v) => { setCollapsedState(v); try { localStorage.setItem('dbz-sidebar', v ? 'rail' : 'full'); } catch { /* egal */ } };
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

  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDrawer(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);

  const items = navForRole(user?.role);
  const tabs = tabsForRole(user?.role);
  const section = `/${pathname.split('/')[1] || ''}`;
  const isTabRoot = tabs.some((t) => t.to === pathname) || pathname === '/mehr';
  // Unterseiten (alles, was nicht direkt ein Reiter ist) bekommen „Zurück“.
  const showBack = back !== false && (back || !isTabRoot);
  // Ab iPad ist die Navigation immer sichtbar: „Zurück“ dort nur auf
  // Detailseiten (z. B. /aufgaben/123) oder wenn die Seite es ausdrücklich will.
  const deep = pathname.split('/').filter(Boolean).length > 1;
  const backOnlyPhone = showBack && !deep && !back;
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

  const nav = { items, tabs, badges, openAccounts: () => setAccountOpen(true), logout: handleLogout };

  const accountButton = (compact) => (
    <button
      type="button"
      onClick={() => setAccountOpen((v) => !v)}
      className={`w-full flex items-center gap-3 rounded-xl hover:bg-white/[0.06] transition-colors focus-visible:ring-offset-0 ${compact ? 'justify-center p-2' : 'px-2 py-2'}`}
      aria-label="Konto und Rolle"
      aria-expanded={accountOpen}
    >
      <span className="relative">
        <Avatar name={user?.name} size={compact ? 38 : 36} light />
        {badges.linkedTotal > 0 && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#E5484D] ring-2 ring-[rgb(var(--header-bg))]" />}
      </span>
      {!compact && (
        <>
          <div className="leading-tight min-w-0 flex-1 text-left">
            <div className="text-subhead text-ivory font-medium truncate" data-noi18n>{user?.name}</div>
            <div className="text-caption text-sage-muted truncate">{user?.roleLabel}</div>
          </div>
          <ChevronsUpDown size={16} className="text-sage-muted shrink-0" aria-hidden="true" />
        </>
      )}
    </button>
  );

  return (
    <NavContext.Provider value={nav}>
    <div className="app-h flex bg-bg overflow-hidden">
      {/* iPad hochkant (md): schmale Leiste */}
      <aside className="hidden md:flex lg:hidden w-[5.5rem] shrink-0 app-h">
        <div className="nav-surface flex flex-col h-full w-full" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <Brand compact />
          <Rail tabs={tabs} badges={badges} pathname={pathname} onMore={() => setDrawer(true)} />
          <div className="shrink-0 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] border-t border-white/10">{accountButton(true)}</div>
        </div>
      </aside>

      {/* iPad quer / Mac (lg): volle Seitenleiste, einklappbar zur Leiste */}
      <aside className={`hidden lg:flex shrink-0 app-h transition-[width] duration-200 ${collapsed ? 'w-[5.5rem]' : 'w-[17rem]'}`}>
        <div className="nav-surface flex flex-col h-full w-full" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          {collapsed ? (
            <>
              <Brand compact />
              <Rail tabs={tabs} badges={badges} pathname={pathname} onMore={() => setDrawer(true)} />
              <div className="shrink-0 p-2 border-t border-white/10">{accountButton(true)}</div>
            </>
          ) : (
            <>
              <Brand />
              <SideNav items={items} badges={badges} />
              <div className="shrink-0 p-2.5 border-t border-white/10">{accountButton(false)}</div>
            </>
          )}
        </div>
      </aside>

      {/* Vollständige Navigation als Overlay (aus der schmalen Leiste) */}
      {drawer && (
        <div className="fixed inset-0 z-50 hidden md:block" role="dialog" aria-modal="true" aria-label="Alle Bereiche">
          <div className="dbz-backdrop absolute inset-0 bg-black/35" onClick={() => setDrawer(false)} />
          <div className="dbz-drawer absolute inset-y-0 left-0 w-[19rem] max-w-[85vw] shadow-float">
            <div className="nav-surface flex flex-col h-full" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
              <div className="flex items-center justify-between pr-3">
                <Brand />
                <button type="button" onClick={() => setDrawer(false)} className="grid place-items-center h-9 w-9 rounded-full text-sage hover:bg-white/[0.08]" aria-label="Schließen"><X size={18} /></button>
              </div>
              <SideNav items={items} badges={badges} onNavigate={() => setDrawer(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col app-h">
        {/* Kopfzeile: geht nahtlos unter die Statusleiste (Uhrzeit/Akku). */}
        <header className="nav-surface shrink-0 relative z-20" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="flex items-center gap-1 h-[3.25rem] px-2 md:px-4 lg:px-6">
            <button type="button" onClick={() => setCollapsed(!collapsed)} className="hidden lg:grid place-items-center h-9 w-9 -ml-1 mr-1 rounded-lg text-sage hover:text-ivory hover:bg-white/[0.08]" aria-label={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'} title={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}>
              <PanelLeft size={19} strokeWidth={1.9} />
            </button>
            {showBack ? (
              <button onClick={goBack} className={`${backOnlyPhone ? 'flex md:hidden' : 'flex'} items-center h-11 pl-1 pr-2 -mr-1 text-ivory/95 active:opacity-50 rounded-lg hover:bg-white/[0.06]`} aria-label="Zurück">
                <ChevronLeft size={28} strokeWidth={2.2} />
              </button>
            ) : <span className="w-2 md:hidden" />}
            <h1 className={`flex-1 min-w-0 truncate text-ivory font-semibold ${showBack ? 'text-[1.0625rem] md:text-title3' : 'text-[1.375rem] tracking-tight md:text-title3'} ${backOnlyPhone ? 'md:pl-1' : ''}`}>{title}</h1>
            {actions}
            <NavLink to="/benachrichtigungen" className="relative grid place-items-center h-11 w-11 rounded-full text-ivory/90 hover:bg-white/[0.08] active:opacity-60" aria-label="Benachrichtigungen" title="Benachrichtigungen">
              <Bell size={22} strokeWidth={1.9} />
              {unread > 0 && (
                <span className="absolute top-1.5 right-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-[#E5484D] text-white text-[10px] font-semibold font-mono ring-2 ring-[rgb(var(--header-bg))]">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </NavLink>
            <button type="button" onClick={() => setAccountOpen(true)} className="md:hidden relative grid place-items-center h-11 w-11 rounded-full active:opacity-60" aria-label="Konto und Rolle">
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
          <div key={pathname} className={`dbz-page px-4 sm:px-6 lg:px-8 xl:px-10 pt-5 md:pt-7 ${wide ? 'max-w-[90rem]' : 'max-w-6xl'} w-full mx-auto pb-[calc(var(--dbz-tabbar-h,0px)+2rem)] md:pb-14`}>{children}</div>
        </main>
      </div>

      <MobileTabBar tabs={tabs} badges={badges} pathname={pathname} />

      <AccountSwitcher open={accountOpen} onClose={() => setAccountOpen(false)} currentUser={user} onLogout={handleLogout} collapsed={collapsed} />
    </div>
    </NavContext.Provider>
  );
}

// Untere Leiste (iOS-Tab-Bar) – nur auf dem Handy.
function MobileTabBar({ tabs, badges, pathname }) {
  // Tatsächliche Höhe der Leiste (je nach Gerät/Home-Indikator verschieden)
  // als CSS-Variable bereitstellen -- darauf sitzen z. B. die Seitenleiste im
  // Qur'an ohne Lücke auf. Ab iPad ist die Leiste ausgeblendet (Höhe 0).
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
      className="md:hidden fixed bottom-0 inset-x-0 z-30 flex border-t border-line/80 backdrop-blur-xl backdrop-saturate-150"
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
              'relative flex-1 min-w-0 flex flex-col items-center gap-[3px] pt-2 pb-0.5 transition-colors duration-150 active:opacity-60',
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

// Konto & Rolle: Handy = Sheet von unten, iPad/Mac = Menü an der Seitenleiste.
// Rollenwechsel ohne Neuladen der App: Sitzung wird serverseitig gewechselt,
// danach werden alle Seiten neu aufgebaut (App.jsx: Routes mit key = Konto).
function AccountSwitcher({ open, onClose, currentUser, onLogout, collapsed }) {
  const { switchAccount } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setAccounts(null);
    api.get('/me/linked-accounts').then((d) => setAccounts(d.accounts)).catch(() => setAccounts([]));
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    setTimeout(() => panelRef.current?.querySelector('button')?.focus({ preventScroll: true }), 30);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const go = async (id) => {
    setBusyId(id);
    try {
      await switchAccount(id);
      onClose();
      setBusyId(null);
      navigate('/dashboard');
    } catch (err) {
      toast.push(err.message, 'error');
      setBusyId(null);
    }
  };

  const body = (
    <>
      <div className="rounded-2xl bg-card dark:bg-elevated border border-line/70 p-4 flex items-center gap-3.5">
        <Avatar name={currentUser?.name} size={48} />
        <div className="min-w-0 flex-1">
          <div className="text-body font-semibold text-ivory truncate" data-noi18n>{currentUser?.name}</div>
          <div className="text-footnote text-sage-muted truncate">{currentUser?.email}</div>
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-mint/10 text-mint-light dark:text-mint px-2 py-0.5 text-caption font-semibold">
            <Check size={12} strokeWidth={3} /> Aktiv: {currentUser?.roleLabel}
          </span>
        </div>
      </div>

      <div className="mt-5 mb-1.5 px-1 text-footnote font-medium text-sage-muted">Rolle wechseln</div>
      {!accounts ? (
        <div className="py-3 grid place-items-center"><span className="h-5 w-5 rounded-full border-2 border-line border-t-mint animate-spin" role="status" aria-label="Lädt" /></div>
      ) : accounts.length === 0 ? (
        <p className="text-footnote text-sage-muted px-1 py-1">
          Du hast nur diese eine Rolle. Weitere Rollen (z. B. Lehrkraft und Schüler) vergibt die DBZ-Leitung.
        </p>
      ) : (
        <div className="rounded-2xl bg-card dark:bg-elevated border border-line/70 overflow-hidden divide-y divide-line/70">
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={busyId != null}
              onClick={() => go(a.id)}
              className="w-full flex items-center gap-3 px-4 py-3 active:bg-hover hover:bg-hover/70 transition-colors text-left disabled:opacity-50"
            >
              <Avatar name={a.name} size={34} />
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

      <div className="mt-5 rounded-2xl bg-card dark:bg-elevated border border-line/70 overflow-hidden divide-y divide-line/70">
        <button type="button" onClick={() => { onClose(); navigate('/konto'); }} className="w-full flex items-center gap-3 px-4 h-12 text-left text-body text-ivory active:bg-hover hover:bg-hover/70">
          <Settings size={19} className="text-sage-muted" /> <span className="flex-1">Konto & Einstellungen</span> <ChevronRight size={18} className="text-sage-muted/60" />
        </button>
        <button type="button" onClick={() => { onClose(); onLogout(); }} className="w-full flex items-center gap-3 px-4 h-12 text-left text-body text-status-absent active:bg-hover hover:bg-hover/70">
          <LogOut size={19} /> Abmelden
        </button>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Konto und Rolle">
      <div className="dbz-backdrop absolute inset-0 bg-black/40 md:bg-black/10" onClick={onClose} />
      {/* Handy: Sheet */}
      <div ref={panelRef} className="md:hidden dbz-sheet absolute inset-x-0 bottom-0 rounded-t-[1.5rem] bg-bg dark:bg-card px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto shadow-float">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-sage-muted/30" aria-hidden="true" />
        <div className="flex items-center justify-between mb-4 px-1">
          <h2 className="text-title3 text-ivory">Konto</h2>
          <button onClick={onClose} aria-label="Schließen" className="grid place-items-center h-8 w-8 rounded-full bg-subtle text-sage-muted hover:text-ivory"><X size={16} strokeWidth={2.5} /></button>
        </div>
        {body}
      </div>
      {/* iPad/Mac: Menü neben der Seitenleiste */}
      <div
        className={`hidden md:block dbz-pop absolute bottom-3 w-[22rem] max-h-[80vh] overflow-y-auto rounded-2xl bg-bg dark:bg-card border border-line/70 p-3 shadow-float left-[6rem] ${collapsed ? 'lg:left-[6rem]' : 'lg:left-[17.5rem]'}`}
      >
        {body}
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
      .then(() => navigate(clean, { replace: true }))
      .catch(() => navigate(clean, { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, user?.id]);
  return null;
}
