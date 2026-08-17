// Wiederverwendbare, token-basierte UI-Komponenten.
import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

const cx = (...c) => c.filter(Boolean).join(' ');

// --- Button ------------------------------------------------------------------
export function Button({
  as: Tag = 'button',
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}) {
  const base =
    'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-300 focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50 disabled:pointer-events-none';
  const sizes = {
    sm: 'text-sm px-3 py-1.5',
    md: 'text-sm px-4 py-2.5',
    lg: 'text-base px-6 py-3',
  };
  const variants = {
    primary:
      'bg-mint text-sidebar border border-mint-light/40 hover:bg-mint-light shadow-[0_0_0_1px_rgba(134,210,172,0.15)]',
    outline:
      'border border-black/15 text-ivory bg-white/0 hover:bg-black/[0.05] hover:border-black/20',
    ghost: 'text-sage hover:text-ivory hover:bg-black/[0.05]',
    danger: 'border border-status-absent/40 text-status-absent hover:bg-status-absent/10',
  };
  return (
    <Tag className={cx(base, sizes[size], variants[variant], className)} {...props}>
      {children}
    </Tag>
  );
}

// --- Card ---------------------------------------------------------------------
export function Card({ className = '', children, ...props }) {
  return (
    <div
      className={cx(
        'bg-card border border-black/10 rounded-xl transition-all duration-300',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, icon: Icon, action }) {
  return (
    <div className="flex items-start justify-between gap-4 p-5 border-b border-black/10">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 text-mint">
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
          </span>
        )}
        <div>
          <h3 className="text-lg leading-tight">{title}</h3>
          {subtitle && <p className="text-sm text-sage-muted mt-1">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

// --- Badge --------------------------------------------------------------------
export function Badge({ tone = 'mint', children, className = '' }) {
  const tones = {
    mint: 'bg-mint/15 text-mint-light border-mint/25',
    present: 'bg-status-present/15 text-status-present border-status-present/30',
    late: 'bg-status-late/15 text-status-late border-status-late/30',
    incomplete: 'bg-status-incomplete/15 text-status-incomplete border-status-incomplete/30',
    excused: 'bg-status-excused/15 text-status-excused border-status-excused/30',
    absent: 'bg-status-absent/15 text-status-absent border-status-absent/30',
    neutral: 'bg-black/[0.05] text-sage border-black/10',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wide px-2.5 py-1 rounded-md border',
        tones[tone],
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
      className={cx('h-2 rounded-full bg-black/10 overflow-hidden', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-mint to-mint-light transition-all duration-700"
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
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#5DBA8C"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-ivory text-sm font-semibold">{label ?? `${value}%`}</span>
        {sublabel && <span className="text-[10px] text-sage-muted">{sublabel}</span>}
      </div>
    </div>
  );
}

// --- Avatar -------------------------------------------------------------------
export function Avatar({ name = '', size = 40 }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      className="rounded-full bg-moss border border-black/10 text-mint-light font-mono font-semibold flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
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
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]">
        {toasts.map((t) => {
          const Icon = t.tone === 'error' ? AlertTriangle : t.tone === 'info' ? Info : CheckCircle2;
          const color =
            t.tone === 'error' ? 'text-status-absent' : t.tone === 'info' ? 'text-mint-light' : 'text-status-present';
          return (
            <div
              key={t.id}
              role="status"
              className="animate-fade-up bg-card border border-black/10 rounded-lg p-3.5 flex items-start gap-3 shadow-lg"
            >
              <Icon size={18} className={cx('mt-0.5 shrink-0', color)} aria-hidden="true" />
              <p className="text-sm text-sage flex-1">{t.message}</p>
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

export function Spinner({ label = 'Lädt …' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sage-muted" role="status">
      <span className="h-5 w-5 rounded-full border-2 border-black/15 border-t-mint animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
