// Wiederverwendbare, token-basierte UI-Komponenten.
import { createContext, useContext, useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Link as RouterLink } from 'react-router-dom';
import { X, CheckCircle2, AlertTriangle, Info, ArrowLeft, Download, Paperclip, ChevronRight, ChevronLeft } from 'lucide-react';

const cx = (...c) => c.filter(Boolean).join(' ');

// --- Button ------------------------------------------------------------------
// loading=true zeigt einen Spinner, setzt aria-busy und deaktiviert den Button
// automatisch (verhindert doppelte Übermittlung bei Formularen).
// Varianten: primary (gefüllt), outline (getönt, sekundär), ghost (nur Text),
// gold (Besonderes), danger (zerstörerisch).
export function Button({
  as: Tag = 'button',
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  disabled,
  ...props
}) {
  const base =
    'inline-flex items-center justify-center gap-1.5 font-semibold rounded-xl select-none transition-[background-color,opacity,transform] duration-150 active:scale-[0.97] active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-40 disabled:pointer-events-none';
  const sizes = {
    sm: 'text-footnote px-3 min-h-[2rem]',
    md: 'text-subhead px-4 min-h-[2.75rem]',
    lg: 'text-body px-5 min-h-[3.125rem]',
  };
  const variants = {
    primary: 'bg-mint text-onaccent hover:opacity-90',
    outline: 'bg-mint/[0.09] text-mint-light hover:bg-mint/[0.14] dark:text-mint',
    ghost: 'text-mint-light hover:bg-hover dark:text-mint',
    gold: 'bg-gold text-white hover:opacity-90 dark:text-sidebar',
    danger: 'bg-status-absent/10 text-status-absent hover:bg-status-absent/15',
  };
  return (
    <Tag
      className={cx(base, sizes[size], variants[variant], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span className="h-3.5 w-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin motion-reduce:animate-none shrink-0" aria-hidden="true" />}
      {children}
    </Tag>
  );
}

// --- Card ---------------------------------------------------------------------
// Eine ruhige Fläche: weiß auf Off-White, Haarlinie statt Schatten-Wolke.
export function Card({ className = '', children, ...props }) {
  return (
    <div
      className={cx('bg-card border border-line/70 rounded-2xl shadow-card', className)}
      {...props}
    >
      {children}
    </div>
  );
}

// Kopf einer Karte: Titel (+ Untertitel), optional Symbol und Aktion rechts.
// Kein eigener Innenabstand – die Karte bestimmt den Rand.
export function CardHeader({ title, subtitle, icon: Icon, action }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="flex items-start gap-2.5 min-w-0">
        {Icon && (
          <span className="mt-[0.15rem] text-mint-light dark:text-mint shrink-0">
            <Icon size={18} strokeWidth={2} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-body font-semibold leading-snug text-ivory">{title}</h3>
          {subtitle && <p className="text-footnote text-sage-muted mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// --- Section: Überschrift über einer Gruppe (wie iOS „Grouped“-Listen) -------
export function Section({ title, action, children, className = '', footer }) {
  return (
    <section className={cx('mt-7 first:mt-0', className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-3 mb-2 px-1">
          {title && <h2 className="text-title3 font-semibold text-ivory">{title}</h2>}
          {action}
        </div>
      )}
      {children}
      {footer && <p className="text-footnote text-sage-muted mt-2 px-1">{footer}</p>}
    </section>
  );
}

// --- Gruppierte Liste (iOS inset grouped) -----------------------------------
export function ListGroup({ children, className = '' }) {
  return (
    <div className={cx('bg-card border border-line/70 rounded-2xl shadow-card overflow-hidden divide-y divide-line/70', className)}>
      {children}
    </div>
  );
}

// Eine Zeile: Symbol (getöntes Quadrat), Titel, Untertitel, Wert rechts,
// Chevron bei Navigation. `to` (Link) oder `onClick`.
export function ListRow({ as: Tag, to, onClick, icon: Icon, iconTone = 'mint', title, subtitle, value, badge, chevron, danger, className = '', children, ...props }) {
  const tones = {
    mint: 'bg-mint/10 text-mint-light dark:text-mint',
    gold: 'bg-gold/15 text-gold',
    late: 'bg-status-late/12 text-status-late',
    absent: 'bg-status-absent/10 text-status-absent',
    excused: 'bg-status-excused/12 text-status-excused',
    present: 'bg-status-present/12 text-status-present',
    neutral: 'bg-subtle text-sage-muted',
  };
  const interactive = Boolean(to || onClick || Tag);
  const Comp = Tag || (to ? LinkProxy : onClick ? 'button' : 'div');
  return (
    <Comp
      to={to}
      onClick={onClick}
      type={Comp === 'button' ? 'button' : undefined}
      className={cx('w-full flex items-center gap-3 px-4 py-3 min-h-[3rem] text-left', interactive && 'transition-colors active:bg-hover hover:bg-hover/60', className)}
      {...props}
    >
      {Icon && (
        <span className={cx('grid place-items-center h-8 w-8 rounded-[0.6rem] shrink-0', tones[iconTone] || tones.mint)}>
          <Icon size={17} strokeWidth={2} aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cx('block text-body leading-snug', danger ? 'text-status-absent' : 'text-ivory')}>{title}</span>
        {subtitle && <span className="block text-footnote text-sage-muted mt-0.5">{subtitle}</span>}
        {children}
      </span>
      {value != null && <span className="shrink-0 text-subhead text-sage-muted font-mono">{value}</span>}
      {badge > 0 && <CountBadge n={badge} />}
      {(chevron ?? Boolean(to)) && <ChevronRight size={18} className="shrink-0 text-sage-muted/60" aria-hidden="true" />}
    </Comp>
  );
}

function LinkProxy(props) { return <RouterLink {...props} />; }

export function CountBadge({ n, className = '' }) {
  if (!n) return null;
  return (
    <span className={cx('min-w-[1.375rem] h-[1.375rem] px-1.5 grid place-items-center rounded-full bg-status-absent text-white text-caption font-semibold font-mono', className)}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

// --- Segmented Control (iOS) -----------------------------------------------
// options: [[value, label, count?]]
export function Segmented({ options, value, onChange, className = '', size = 'md' }) {
  return (
    <div className={cx('inline-grid grid-flow-col auto-cols-fr max-w-full rounded-[0.7rem] bg-subtle p-0.5 border border-line/60', className)} role="tablist">
      {options.map(([v, label, count]) => {
        const on = v === value;
        return (
          <button
            key={String(v)}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(v)}
            className={cx(
              'relative min-w-0 rounded-[0.55rem] px-2.5 font-medium leading-tight transition-all duration-200',
              size === 'sm' ? 'py-1.5 text-footnote' : 'py-[0.4rem] text-subhead',
              on ? 'bg-card text-ivory shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)] dark:bg-moss' : 'text-sage-muted hover:text-ivory',
            )}
          >
            {label}{count ? <span className="ml-1 text-status-absent font-mono">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

// --- Schalter (iOS) -----------------------------------------------------------
export function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative inline-flex h-[1.9rem] w-[3.1rem] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40',
        checked ? 'bg-status-present' : 'bg-sage-muted/30')}
    >
      <span className={cx('absolute top-[0.125rem] h-[1.65rem] w-[1.65rem] rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.2)] transition-transform duration-200',
        checked ? 'translate-x-[1.325rem]' : 'translate-x-[0.125rem]')} />
    </button>
  );
}

// --- Leerer Zustand ---------------------------------------------------------
export function EmptyState({ icon: Icon, title, text, action, className = '' }) {
  return (
    <div className={cx('flex flex-col items-center text-center px-6 py-10', className)}>
      {Icon && <span className="grid place-items-center h-12 w-12 rounded-full bg-subtle text-sage-muted mb-3"><Icon size={22} aria-hidden="true" /></span>}
      {title && <p className="text-body font-semibold text-ivory">{title}</p>}
      {text && <p className="text-subhead text-sage-muted mt-1 max-w-sm">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// --- Kennzahl ----------------------------------------------------------------
export function Stat({ label, value, tone, hint }) {
  const tones = { present: 'text-status-present', late: 'text-status-late', absent: 'text-status-absent', excused: 'text-status-excused' };
  return (
    <div className="min-w-0">
      <div className={cx('text-title1 font-semibold font-mono leading-none', tones[tone] || 'text-ivory')}>{value}</div>
      <div className="text-footnote text-sage-muted mt-1.5 leading-snug">{label}</div>
      {hint && <div className="text-caption text-sage-muted/80">{hint}</div>}
    </div>
  );
}

// --- Badge --------------------------------------------------------------------
// Ruhige Status-Pille: Satzschreibung, keine Großbuchstaben-Schreibmaschine.
export function Badge({ tone = 'mint', children, className = '' }) {
  const tones = {
    mint: 'bg-mint/10 text-mint-light dark:text-mint',
    present: 'bg-status-present/12 text-status-present',
    late: 'bg-status-late/12 text-status-late',
    incomplete: 'bg-status-incomplete/12 text-status-incomplete',
    excused: 'bg-status-excused/12 text-status-excused',
    absent: 'bg-status-absent/10 text-status-absent',
    neutral: 'bg-subtle text-sage-muted',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap text-caption font-semibold px-2 py-[0.2rem] rounded-full',
        tones[tone] || tones.mint,
        className,
      )}
    >
      {children}
    </span>
  );
}

// --- Progress -----------------------------------------------------------------
export function Progress({ value = 0, className = '' }) {
  return (
    <div
      className={cx('h-1.5 rounded-full bg-subtle overflow-hidden', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-mint transition-all duration-700"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

// --- Ring (kreisförmiger Fortschritt) ----------------------------------------
export function Ring({ value = 0, size = 64, stroke = 6, label, sublabel }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, Math.max(0, value)) / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--c-subtle))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--c-present))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-ivory text-subhead font-semibold">{label ?? `${value}%`}</span>
        {sublabel && <span className="text-[0.625rem] text-sage-muted">{sublabel}</span>}
      </div>
    </div>
  );
}

// --- Avatar -------------------------------------------------------------------
export function Avatar({ name = '', size = 40, light = false }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      className={cx('rounded-full font-semibold flex items-center justify-center shrink-0 select-none', light ? 'bg-[#f3efe2] text-[#07382E]' : 'bg-gradient-to-b from-[#3d7a64] to-[#1f5443] text-white')}
      style={{ width: size, height: size, fontSize: size * 0.38, letterSpacing: '0.02em' }}
      aria-hidden="true"
    >
      {initials || '·'}
    </div>
  );
}

// --- Toast --------------------------------------------------------------------
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const remove = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (message, tone = 'success') => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t, { id, message, tone }]);
      setTimeout(() => remove(id), 4000);
    },
    [remove],
  );
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[min(24rem,calc(100vw-2rem))] pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)' }}>
        {toasts.map((t) => {
          const Icon = t.tone === 'error' ? AlertTriangle : t.tone === 'info' ? Info : CheckCircle2;
          const color =
            t.tone === 'error' ? 'text-status-absent' : t.tone === 'info' ? 'text-mint-light' : 'text-status-present';
          return (
            <div
              key={t.id}
              role="status"
              className="dbz-toast pointer-events-auto bg-card/95 dark:bg-elevated/95 backdrop-blur-xl border border-line/70 rounded-2xl px-4 py-3 flex items-start gap-3 shadow-float"
            >
              <Icon size={18} className={cx('mt-0.5 shrink-0', color)} aria-hidden="true" />
              <p className="text-subhead text-ivory flex-1">{t.message}</p>
              <button onClick={() => remove(t.id)} className="text-sage-muted hover:text-ivory" aria-label="Schließen">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext) || { push: () => {} };
}

// --- Helfer: Statusanzeige (DBZ-Anwesenheitsstatus) --------------------------
export function StatusBadge({ status }) {
  const map = {
    present: { tone: 'present', label: 'Anwesend' },
    late: { tone: 'late', label: 'Verspätet' },
    excused: { tone: 'excused', label: 'Entschuldigt' },
    unexcused: { tone: 'absent', label: 'Unentschuldigt' },
    left_early: { tone: 'late', label: 'Früher gegangen' },
    remote: { tone: 'mint', label: 'Online' },
    other: { tone: 'neutral', label: 'Sonstiges' },
    open: { tone: 'neutral', label: 'Offen' },
    // Hausaufgaben-/Antragsstatus
    passed: { tone: 'present', label: 'Bestanden' },
    revision_required: { tone: 'late', label: 'Überarbeiten' },
    submitted: { tone: 'mint', label: 'Abgegeben' },
    not_opened: { tone: 'neutral', label: 'Offen' },
    missed: { tone: 'absent', label: 'Verpasst' },
    pending: { tone: 'late', label: 'Wartet' },
    approved: { tone: 'present', label: 'Genehmigt' },
    rejected: { tone: 'absent', label: 'Abgelehnt' },
    needs_info: { tone: 'late', label: 'Rückfrage' },
    draft: { tone: 'neutral', label: 'Entwurf' },
    returned: { tone: 'late', label: 'Zurückgegeben' },
  };
  const s = map[status] || { tone: 'neutral', label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

// --- Reveal-Wrapper (Scroll-Animation) ---------------------------------------
export function Reveal({ children, className = '', delay = 0 }) {
  const [el, setEl] = useState(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [el]);
  return (
    <div
      ref={setEl}
      className={cx('reveal', visible && 'is-visible', className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// Lade-Anzeige im DBZ-Stil: kleines Logo mit kreisendem Ring und
// wechselnden, freundlichen Hinweisen statt eines nüchternen "Lädt …".
const LOAD_LINES = ['Einen Moment …', 'Bismillah …', 'Gleich geht\u2019s los …', 'Daten werden geholt …'];
export function Spinner({ label }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (label !== undefined) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % LOAD_LINES.length), 1600);
    return () => clearInterval(t);
  }, [label]);
  const text = label !== undefined ? label : LOAD_LINES[i];
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-sage-muted" role="status" aria-live="polite">
      <span className="dbz-loader" aria-hidden="true"><img src="/logo.png" alt="" /></span>
      {text && <span key={text} className="text-footnote dbz-fade-in">{text}</span>}
    </div>
  );
}

// Platzhalter-Zeilen, solange nur ein Teil einer Seite lädt (Liste,
// Tagesübersicht): ruhiger als der Logo-Kringel, gleiche Höhe wie der
// spätere Inhalt -- dadurch springt nichts, wenn die Daten ankommen.
// `bare`: ohne eigenen Rahmen (innerhalb einer Karte).
export function SkeletonRows({ rows = 3, bare = false, className = '' }) {
  return (
    <div className={cx('overflow-hidden divide-y divide-line/70', !bare && 'bg-card border border-line/70 rounded-2xl', className)} role="status" aria-busy="true" aria-label="Wird geladen">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5" aria-hidden="true">
          <span className="skeleton h-2.5 w-2.5 rounded-full" />
          <div className="flex-1 space-y-2">
            <span className="skeleton block h-3 rounded" style={{ width: `${62 - (i % 3) * 14}%` }} />
            <span className="skeleton block h-2.5 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Hardware-/Gesten-"Zurück" (Android-Zurücktaste, iOS-Wischgeste) soll eine
// offene Vorschau schließen statt die ganze installierte App zu verlassen:
// beim Öffnen einen eigenen Verlaufseintrag anlegen; "Zurück" entfernt genau
// diesen Eintrag und schließt die Vorschau. Schließen per Knopf räumt den
// Eintrag wieder auf (history.back), damit kein toter Eintrag zurückbleibt.
// Globale Verwaltung: EIN Verlaufseintrag für offene Overlays (auch wenn
// mehrere gestapelt sind). Schließen per Knopf geht nur dann einen Schritt
// zurück, wenn der Overlay-Eintrag wirklich oben liegt -- und das verzögert,
// damit ein sofortiges Wieder-Öffnen (z. B. React-StrictMode, Wechsel
// zwischen zwei Dialogen) den Eintrag weiterverwendet statt ihn zu verlieren.
// Sonst ging die App im Test eine Seite zu weit zurück.
const overlayStack = [];
let pendingBacks = 0;
let backTimer = null;
let popListening = false;
const onOverlayEntry = () => window.history.state?.dbzOverlay === true;
function onGlobalPop() {
  if (pendingBacks > 0) { pendingBacks--; return; }
  if (onOverlayEntry()) return; // z. B. Vorwärts-Navigation zurück auf den Eintrag
  const top = overlayStack.pop();
  if (top) { top.closedByBack = true; top.close(); }
}
// escape: false -> Escape behandelt der Aufrufer selbst (z. B. Vollbild-Leser).
// Escape schließt immer nur das OBERSTE offene Fenster.
export function useBackToClose(open, onClose, { escape = true } = {}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    if (!popListening) { window.addEventListener('popstate', onGlobalPop); popListening = true; }
    if (backTimer) { clearTimeout(backTimer); backTimer = null; }
    if (!onOverlayEntry()) {
      try { window.history.pushState({ ...(window.history.state || {}), dbzOverlay: true }, ''); } catch { /* egal */ }
    }
    const entry = { closedByBack: false, close: () => closeRef.current() };
    overlayStack.push(entry);
    const onKey = (e) => { if (escape && e.key === 'Escape' && overlayStack[overlayStack.length - 1] === entry) closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = overlayStack.indexOf(entry);
      if (i >= 0) overlayStack.splice(i, 1);
      if (entry.closedByBack || overlayStack.length) return;
      backTimer = setTimeout(() => {
        backTimer = null;
        if (!overlayStack.length && onOverlayEntry()) {
          pendingBacks++;
          try { window.history.back(); } catch { pendingBacks--; }
        }
      }, 30);
    };
  }, [open]);
}

// Vollbild-Vorschau innerhalb der App (kein neuer Tab: in der installierten
// Handy-App gibt es keine echten Tabs -- ein neues Fenster ersetzte dort die
// App, und "zurück" verließ die ganze App). Deutlicher "Zurück"-Knopf oben
// links, Schließen per Tippen daneben, Zurück-Taste oder Escape.
export function PreviewOverlay({ title, onClose, children, downloadUrl, downloadName }) {
  useBackToClose(true, onClose);
  // Per Portal direkt in <body>: sonst begrenzt ein Vorfahr (Transform/
  // Scroll-Container) "position: fixed", und Kopf-/Fußleiste lägen darüber.
  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={title || 'Vorschau'}>
      <div className="flex items-center justify-between gap-2 px-3 text-white" style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)', paddingBottom: '0.5rem' }}>
        <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-sm text-white hover:bg-white/25">
          <ArrowLeft size={18} /> Zurück
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-sm text-white/80">{title}</span>
        {downloadUrl ? (
          <a href={downloadUrl} download={downloadName || true} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-sm text-white hover:bg-white/25">
            <Download size={16} /> Speichern
          </a>
        ) : <span className="w-10" />}
      </div>
      <div className="relative flex-1 min-h-0" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ImageAttachment({ url, alt = '', className = '' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx('block', className)}>
        <img src={url} alt={alt} className="rounded-lg max-h-64" />
      </button>
      {open && (
        <PreviewOverlay title={alt || 'Bild'} onClose={() => setOpen(false)} downloadUrl={url} downloadName={alt || undefined}>
          <div className="absolute inset-0 flex items-center justify-center p-2" onClick={() => setOpen(false)}>
            <img src={url} alt={alt} className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
          </div>
        </PreviewOverlay>
      )}
    </>
  );
}

// PDF-Ansicht (pdf.js) erst bei Bedarf laden -- hält das Haupt-Bundle klein.
const PdfViewer = lazy(() => import('./PdfViewer.jsx'));

// Beliebiger Anhang: Bild -> Bildvorschau, Audio -> Player, PDF -> In-App-
// Dokumentansicht (direkt offen, mit Zurück und Speichern/Teilen), sonst
// Vorschau mit "Speichern" (öffnet nie einen neuen Tab).
// `notesPath`/`canAnnotate`: Notizen der Lehrkraft auf dem PDF (Materialien).
export function FileAttachment({ url, name, mediaType = '', className = '', icon: Icon = Paperclip, notesPath = null, canAnnotate = false, label = null }) {
  const [open, setOpen] = useState(false);
  const type = String(mediaType || '');
  if (type.startsWith('image')) return <ImageAttachment url={url} alt={name} className={className} />;
  if (type.startsWith('audio')) return <audio controls preload="none" src={url} className={cx('w-full max-w-sm h-10', className)} />;
  const isPdf = type === 'application/pdf' || /\.pdf$/i.test(name || '');
  const close = () => setOpen(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx('inline-flex items-center gap-2 text-mint-light text-sm hover:underline text-left', className)}>
        <Icon size={16} className="shrink-0" /> <span className="break-all">{label || name || 'Datei öffnen'}</span>
      </button>
      {open && isPdf && (
        <Suspense fallback={<PdfLoading onClose={close} />}>
          <PdfViewer url={url} name={name || 'Dokument'} onClose={close} notesPath={notesPath} canAnnotate={canAnnotate} />
        </Suspense>
      )}
      {open && !isPdf && (
        <PreviewOverlay title={name || 'Datei'} onClose={close} downloadUrl={url} downloadName={name}>
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-white/80 text-sm">
            <div>
              <p className="mb-4">Für diese Datei gibt es keine Vorschau.</p>
              <a href={url} download={name || true} className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-white"><Download size={16} /> Datei speichern</a>
            </div>
          </div>
        </PreviewOverlay>
      )}
    </>
  );
}

function PdfLoading({ onClose }) {
  return (
    <PreviewOverlay title="PDF" onClose={onClose}>
      <div className="absolute inset-0 grid place-items-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-mint" />
      </div>
    </PreviewOverlay>
  );
}

// --- Mehrfachauswahl (wie in WhatsApp/Telegram) -------------------------------
// Auswahlmodus über "Auswählen" oder langes Drücken auf einen Eintrag; im
// Auswahlmodus schaltet ein Tippen die Markierung um. Die Aktionsleiste
// erscheint unten (über der Handy-Navigation).
export function useSelection() {
  const [active, setActive] = useState(false);
  const [ids, setIds] = useState(() => new Set());
  const toggle = useCallback((id) => setIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  const start = useCallback((id) => { setActive(true); if (id != null) setIds(new Set([id])); }, []);
  const clear = useCallback(() => { setActive(false); setIds(new Set()); }, []);
  const setAll = useCallback((all) => setIds(new Set(all)), []);
  return { active, ids, count: ids.size, has: (id) => ids.has(id), toggle, start, clear, setAll };
}

// Langes Drücken (500 ms) auf Touch-Geräten, Rechtsklick am Computer.
export function useLongPress(onLong, ms = 500) {
  const timer = useRef(null);
  const fired = useRef(false);
  const cancel = () => { clearTimeout(timer.current); timer.current = null; };
  return {
    handlers: {
      onTouchStart: () => { fired.current = false; cancel(); timer.current = setTimeout(() => { fired.current = true; onLong(); }, ms); },
      onTouchEnd: cancel,
      onTouchMove: cancel,
      onContextMenu: (e) => { e.preventDefault(); fired.current = true; onLong(); },
    },
    // Verhindert, dass nach dem langen Drücken zusätzlich ein "Tippen" ausgelöst wird.
    wasLongPress: () => { const f = fired.current; fired.current = false; return f; },
  };
}

export function SelectCheck({ checked }) {
  return (
    <span
      aria-hidden="true"
      className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition',
        checked ? 'border-mint bg-mint text-onaccent' : 'border-line')}
    >
      {checked && <CheckCircle2 size={14} strokeWidth={3} />}
    </span>
  );
}

export function SelectionBar({ selection, allIds, actions }) {
  if (!selection.active) return null;
  const allSelected = allIds.length > 0 && selection.count === allIds.length;
  return (
    <>
    {/* Platzhalter: so lassen sich auch die letzten Einträge über die feste Leiste scrollen. */}
    <div className="h-28" aria-hidden="true" />
    <div className="fixed inset-x-0 z-40 px-3 bottom-[calc(var(--dbz-tabbar-h,0px)+0.5rem)] md:bottom-4 md:left-[5.5rem] lg:left-[17rem]">
      <div className="mx-auto max-w-3xl rounded-2xl border border-line/70 bg-card/95 backdrop-blur-xl shadow-float p-2 flex flex-wrap items-center gap-2">
        <span className="px-2 text-subhead font-semibold text-ivory">{selection.count} ausgewählt</span>
        <Button size="sm" variant="ghost" onClick={() => (allSelected ? selection.setAll([]) : selection.setAll(allIds))}>
          {allSelected ? 'Keine' : 'Alle'}
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a.label} size="sm" variant={a.variant || 'outline'} disabled={!selection.count || a.disabled} onClick={a.onClick}>
              {a.icon && <a.icon size={15} />} {a.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={selection.clear}><X size={15} /> Abbrechen</Button>
        </div>
      </div>
    </div>
    </>
  );
}

// Auswahl-Dialog mit mehreren klar beschriebenen Möglichkeiten (z. B.
// "nur ausblenden" vs. "endgültig löschen"). options: [{ key, label,
// description, variant }]. onChoose(key) | onClose().
export function ChoiceDialog({ title, message, options, onChoose, onClose }) {
  useBackToClose(true, onClose);
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dbz-backdrop absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="dbz-sheet relative w-full max-w-md rounded-3xl bg-card dark:bg-elevated p-5 shadow-float" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        <h3 className="text-title3 text-ivory text-center">{title}</h3>
        {message && <p className="mt-1 text-subhead text-sage-muted text-center">{message}</p>}
        <div className="mt-4 grid gap-2">
          {options.map((o) => (
            <button
              key={o.key}
              onClick={() => onChoose(o.key)}
              className={cx('rounded-2xl p-3.5 text-left transition active:scale-[0.99]',
                o.variant === 'danger' ? 'bg-status-absent/[0.07] hover:bg-status-absent/10' : 'bg-subtle hover:bg-hover')}
            >
              <span className={cx('block font-semibold text-body', o.variant === 'danger' ? 'text-status-absent' : 'text-ivory')}>{o.label}</span>
              {o.description && <span className="block text-footnote text-sage-muted mt-0.5">{o.description}</span>}
            </button>
          ))}
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// --- Klassen-Ordner (Leitung/Admin) ------------------------------------------
// Ordnung für viele Klassen: erst die Klassen als Kacheln, ein Tipp öffnet die
// Einträge der Klasse. `groups`: [{ id, name, count, hint, tone }].
export function ClassFolders({ groups, selected, onSelect, emptyText = 'Noch keine Klassen angelegt.', extra = null }) {
  const current = groups.find((g) => g.id === selected);
  if (current) {
    return (
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={() => onSelect(null)} className="inline-flex items-center gap-0.5 -ml-1.5 pr-2 py-1 text-body text-mint-light dark:text-mint active:opacity-60"><ChevronLeft size={22} /> Klassen</button>
        <h2 className="text-title3 text-ivory truncate">{current.name}</h2>
        {current.hint && <span className="text-footnote text-sage-muted">{current.hint}</span>}
      </div>
    );
  }
  if (!groups.length && !extra) return <Card className="p-8 text-center text-sage-muted">{emptyText}</Card>;
  return (
    <div className="mb-5 space-y-3">
      {extra}
      <ListGroup>
        {groups.map((g) => (
          <ListRow
            key={g.id}
            onClick={() => onSelect(g.id)}
            title={g.name}
            subtitle={g.hint}
            value={g.count != null && g.tone !== 'warn' ? g.count : undefined}
            badge={g.tone === 'warn' ? g.count : undefined}
            chevron
          />
        ))}
      </ListGroup>
    </div>
  );
}
