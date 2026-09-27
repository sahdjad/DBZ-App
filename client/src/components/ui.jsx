// Wiederverwendbare, token-basierte UI-Komponenten.
import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertTriangle, Info, ArrowLeft, Download, Paperclip } from 'lucide-react';

const cx = (...c) => c.filter(Boolean).join(' ');

// --- Button ------------------------------------------------------------------
// loading=true zeigt einen Spinner, setzt aria-busy und deaktiviert den Button
// automatisch (verhindert doppelte Übermittlung bei Formularen).
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
    'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50 disabled:pointer-events-none';
  const sizes = {
    sm: 'text-sm px-3 py-1.5',
    md: 'text-sm px-4 py-2.5 min-h-[46px]',
    lg: 'text-base px-6 py-3 min-h-[48px]',
  };
  const variants = {
    // Primär: tiefes Waldgrün, elfenbeinfarbene Schrift, weiche Tiefe.
    primary: 'bg-mint text-onaccent shadow-sm hover:bg-mint-light',
    // Sekundär: helle Fläche, feiner grüner Rand, dunkelgrüne Schrift.
    outline: 'bg-card border border-mint/30 text-mint hover:bg-hover',
    ghost: 'text-sage hover:text-ivory hover:bg-subtle',
    // Besondere Aktionen: dezenter Gold-Akzent mit dunkelgrüner Schrift.
    gold: 'bg-gold text-sidebar shadow-sm hover:brightness-[1.06]',
    danger: 'border border-status-absent/40 text-status-absent hover:bg-status-absent/10',
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
export function Card({ className = '', children, ...props }) {
  return (
    <div
      className={cx(
        'bg-card border border-line rounded-2xl shadow-[0_1px_2px_rgb(6_45_31/0.04),0_8px_24px_-16px_rgb(6_45_31/0.12)] transition-all duration-300',
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
    <div className="flex items-start justify-between gap-4 p-5 border-b border-line">
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
    neutral: 'bg-subtle text-sage border-line',
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
      className={cx('h-2 rounded-full bg-subtle overflow-hidden', className)}
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
      className="rounded-full bg-moss border border-line text-mint-light font-mono font-semibold flex items-center justify-center shrink-0"
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
              className="animate-fade-up bg-card border border-line rounded-lg p-3.5 flex items-start gap-3 shadow-lg"
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
      <span className="h-5 w-5 rounded-full border-2 border-line border-t-mint animate-spin" />
      <span className="text-sm">{label}</span>
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
export function useBackToClose(open, onClose) {
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
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
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

// Beliebiger Anhang: Bild -> Bildvorschau, Audio -> Player, PDF -> In-App-
// Dokumentansicht, sonst Vorschau mit "Speichern" (öffnet nie einen neuen Tab).
export function FileAttachment({ url, name, mediaType = '', className = '', icon: Icon = Paperclip }) {
  const [open, setOpen] = useState(false);
  const type = String(mediaType || '');
  if (type.startsWith('image')) return <ImageAttachment url={url} alt={name} className={className} />;
  if (type.startsWith('audio')) return <audio controls preload="none" src={url} className={cx('w-full max-w-sm h-10', className)} />;
  const isPdf = type === 'application/pdf' || /\.pdf$/i.test(name || '');
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx('inline-flex items-center gap-2 text-mint-light text-sm hover:underline text-left', className)}>
        <Icon size={16} className="shrink-0" /> <span className="break-all">{name || 'Datei öffnen'}</span>
      </button>
      {open && (
        <PreviewOverlay title={name || 'Datei'} onClose={() => setOpen(false)} downloadUrl={url} downloadName={name}>
          {isPdf ? (
            <iframe src={url} title={name || 'Dokument'} className="absolute inset-0 h-full w-full bg-white" />
          ) : (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-white/80 text-sm">
              <div>
                <p className="mb-4">Für diese Datei gibt es keine Vorschau.</p>
                <a href={url} download={name || true} className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-white"><Download size={16} /> Datei speichern</a>
              </div>
            </div>
          )}
        </PreviewOverlay>
      )}
    </>
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
    <div className="fixed inset-x-0 z-40 px-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-4 lg:left-64">
      <div className="mx-auto max-w-3xl rounded-2xl border border-line bg-card shadow-lg p-2 flex flex-wrap items-center gap-2">
        <span className="px-2 text-sm text-ivory">{selection.count} ausgewählt</span>
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
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-xl" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        <h3 className="text-lg text-ivory">{title}</h3>
        {message && <p className="mt-1 text-sm text-sage">{message}</p>}
        <div className="mt-4 grid gap-2">
          {options.map((o) => (
            <button
              key={o.key}
              onClick={() => onChoose(o.key)}
              className={cx('rounded-xl border p-3 text-left transition',
                o.variant === 'danger' ? 'border-status-absent/40 hover:bg-status-absent/10' : 'border-line hover:bg-hover')}
            >
              <span className={cx('block font-medium', o.variant === 'danger' ? 'text-status-absent' : 'text-ivory')}>{o.label}</span>
              {o.description && <span className="block text-xs text-sage-muted mt-0.5">{o.description}</span>}
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
        <Button variant="outline" size="sm" onClick={() => onSelect(null)}><ArrowLeft size={16} /> Alle Klassen</Button>
        <h2 className="text-lg text-ivory truncate">{current.name}</h2>
        {current.hint && <span className="text-xs text-sage-muted">{current.hint}</span>}
      </div>
    );
  }
  if (!groups.length && !extra) return <Card className="p-8 text-center text-sage-muted">{emptyText}</Card>;
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-4">
      {extra}
      {groups.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => onSelect(g.id)}
          className="group text-left rounded-2xl border border-line bg-card p-4 hover:border-mint/40 hover:bg-hover transition-all duration-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-ivory font-medium truncate">{g.name}</span>
            {g.count != null && (
              <span className={cx('text-xs font-mono px-2 py-0.5 rounded-full', g.tone === 'warn' ? 'bg-status-late/15 text-status-late' : 'bg-mint/10 text-mint')}>{g.count}</span>
            )}
          </div>
          {g.hint && <div className="text-xs text-sage-muted mt-1 truncate">{g.hint}</div>}
        </button>
      ))}
    </div>
  );
}
