import { createPortal } from 'react-dom';
import { useState, useEffect, useMemo } from 'react';
import { ClipboardCheck, MessageCircle, Send, X, ChevronRight } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, StatusBadge, Spinner, useToast, ClassFolders, useBackToClose } from '../components/ui.jsx';

const TYPE_LABEL = { absent: 'Fehlt', late: 'Später', leave_early: 'Früher', other: 'Sonstiges' };
const fmt = (iso) => new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' });
const fmtTime = (iso) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

// Rückfrage-Thread direkt am Antrag – statt die Klärung außerhalb der App
// (WhatsApp/Telefon) zu machen und danach manuell nachzukorrigieren.
function CommentThread({ request, onSent }) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.post(`/absence-requests/${request.id}/comments`, { body: body.trim() });
      setBody('');
      onSent();
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-line bg-subtle/40 p-3 space-y-2">
      {(request.comments || []).map((c) => (
        <div key={c.id} className={`text-sm ${c.isManager ? '' : 'text-mint-light'}`}>
          <span className="text-ivory">{c.authorName}</span>
          <span className="text-[11px] text-sage-muted"> · {fmtTime(c.createdAt)}</span>
          <div className="text-sage">{c.body}</div>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <input
          className="input text-sm py-1.5"
          placeholder="Rückfrage / Antwort schreiben …"
          aria-label="Rückfrage oder Antwort schreiben"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <Button size="sm" onClick={send} disabled={busy || !body.trim()} aria-label="Senden"><Send size={14} /></Button>
      </div>
    </div>
  );
}

function RequestRow({ r, decide, onCommentSent, defaultOpen, onShow }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const commentCount = (r.comments || []).length;
  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {/* Antippen öffnet den Antrag mit der kompletten Nachricht. */}
        <button type="button" onClick={() => onShow(r)} className="min-w-0 flex-1 text-left rounded-lg -m-1 p-1 hover:bg-hover" aria-label={`Antrag von ${r.studentName} ganz anzeigen`}>
          <div className="text-ivory flex items-center gap-2 flex-wrap">
            {r.studentName} · {TYPE_LABEL[r.requestType]}
            {r.studentAbsences > 0 && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${r.studentAbsences >= 2 ? 'bg-status-late/15 text-status-late' : 'bg-subtle text-sage-muted'}`}>
                schon {r.studentAbsences}× abwesend
              </span>
            )}
          </div>
          <div className="text-xs text-sage-muted line-clamp-2">Grund: {r.reasonCategory}{r.comment ? ` · ${r.comment}` : ''} · {r.sessionDate ? fmt(r.sessionDate) : fmt(r.createdAt)}</div>
          <div className="text-[11px] text-mint mt-0.5 inline-flex items-center gap-0.5">Ganze Nachricht ansehen <ChevronRight size={12} /></div>
        </button>
        <div className="flex gap-2 items-center">
          <button onClick={() => setOpen((o) => !o)} className="text-xs text-sage-muted inline-flex items-center gap-1 hover:text-ivory">
            <MessageCircle size={14} /> {commentCount > 0 ? commentCount : ''}
          </button>
          {decide && (
            <>
              <Button size="sm" onClick={() => decide(r.id, 'approve')}>Genehmigen</Button>
              <Button size="sm" variant="outline" onClick={() => decide(r.id, 'needs_info')}>Rückfrage</Button>
              <Button size="sm" variant="danger" onClick={() => decide(r.id, 'reject')}>Ablehnen</Button>
            </>
          )}
        </div>
      </div>
      {open && <CommentThread request={r} onSent={onCommentSent} />}
    </div>
  );
}

export default function Entschuldigungen() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [shownId, setShownId] = useState(null);

  const load = () => api.get('/absence-requests').then((d) => setList(d.requests));
  useEffect(() => { load(); }, []);

  const decide = async (id, decision) => {
    try {
      await api.post(`/absence-requests/${id}/decide`, { decision });
      toast.push('Entscheidung gespeichert', 'success');
      setShownId(null);
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  if (!list) return <AppLayout title="Entschuldigungen"><Spinner /></AppLayout>;
  // Leitung/Admin: nur Einsicht, nach Klassen geordnet (entscheiden tut die Lehrkraft).
  if (list.length && list.every((r) => r.readOnly)) return <ReadOnlyOverview list={list} />;
  const pending = list.filter((r) => r.status === 'pending');
  const needsInfo = list.filter((r) => r.status === 'needs_info');
  const decided = list.filter((r) => !['pending', 'needs_info'].includes(r.status));

  return (
    <AppLayout title="Entschuldigungen">
      <Card className="p-5 mb-4">
        <CardHeader title="Offene Anträge" subtitle={`${pending.length} warten auf Entscheidung`} icon={ClipboardCheck} />
        <div className="divide-y divide-line px-1">
          {pending.length === 0 ? <p className="p-4 text-sage-muted text-sm">Keine offenen Anträge.</p> : pending.map((r) => (
            <RequestRow key={r.id} r={r} decide={decide} onCommentSent={load} onShow={(x) => setShownId(x.id)} />
          ))}
        </div>
      </Card>

      {needsInfo.length > 0 && (
        <Card className="p-5 mb-4 border-status-late/30">
          <CardHeader title="Rückfrage offen" subtitle="Wartet auf Antwort von Schüler/Eltern" icon={MessageCircle} />
          <div className="divide-y divide-line px-1">
            {needsInfo.map((r) => (
              <RequestRow key={r.id} r={r} decide={null} defaultOpen onCommentSent={load} onShow={(x) => setShownId(x.id)} />
            ))}
          </div>
        </Card>
      )}

      {decided.length > 0 && (
        <Card className="p-5">
          <CardHeader title="Bearbeitet" />
          <div className="grid gap-2 lg:grid-cols-2 items-start">
            {decided.map((r) => (
              <button type="button" key={r.id} onClick={() => setShownId(r.id)} className="text-left flex items-center justify-between gap-3 rounded-lg border border-line bg-subtle/40 px-3 py-2.5 hover:bg-hover">
                <div className="text-sm">
                  <span className="text-ivory">{r.studentName}</span>
                  <span className="text-sage-muted"> · {TYPE_LABEL[r.requestType]} · {r.reasonCategory}</span>
                </div>
                <StatusBadge status={r.status} />
              </button>
            ))}
          </div>
        </Card>
      )}
      {shownId && list.find((r) => r.id === shownId) && (
        <RequestSheet
          r={list.find((r) => r.id === shownId)}
          decide={list.find((r) => r.id === shownId).status === 'pending' ? decide : null}
          onCommentSent={load}
          onClose={() => setShownId(null)}
        />
      )}
    </AppLayout>
  );
}

// Übersicht für Leitung/Admin: je Klasse, wer sich entschuldigt hat und wie
// die Lehrkraft entschieden hat -- ohne Freitext und ohne Entscheidungsknöpfe.
function ReadOnlyOverview({ list }) {
  const [cls, setCls] = useState(null);
  const groups = useMemo(() => {
    const m = new Map();
    list.forEach((r) => {
      const g = m.get(r.classId) || { id: r.classId, name: r.className, items: [] };
      g.items.push(r);
      m.set(r.classId, g);
    });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true })).map((g) => {
      const open = g.items.filter((r) => r.status === 'pending' || r.status === 'needs_info').length;
      return { ...g, count: g.items.length, hint: open ? `${open} offen bei der Lehrkraft` : 'alles entschieden', tone: open ? 'warn' : null };
    });
  }, [list]);
  const current = groups.find((g) => g.id === cls);
  return (
    <AppLayout title="Entschuldigungen">
      <p className="text-sm text-sage-muted mb-4">Über Entschuldigungen entscheidet die Klassenlehrkraft. Hier siehst du nur, wer sich entschuldigt hat und wie entschieden wurde.</p>
      <ClassFolders groups={groups} selected={cls} onSelect={setCls} />
      {current && (
        <div className="grid gap-2 lg:grid-cols-2 items-start">
          {current.items.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-3 py-2.5">
              <div className="text-sm min-w-0">
                <div className="text-ivory truncate">{r.studentName}</div>
                <div className="text-xs text-sage-muted">{TYPE_LABEL[r.requestType]} · {r.reasonCategory} · {r.sessionDate ? fmt(r.sessionDate) : fmt(r.createdAt)}</div>
              </div>
              <StatusBadge status={r.status} />
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}

// Vollansicht eines Antrags: komplette Nachricht gut lesbar, Verlauf der
// Rückfragen und – solange offen – die Entscheidungs-Knöpfe.
function RequestSheet({ r, decide, onCommentSent, onClose }) {
  useBackToClose(true, onClose); // Zurück-Taste schließt nur diese Ansicht
  // Portal an <body>: sonst liegt die Ansicht im scrollenden Seitenbereich
  // fest und wird abgeschnitten statt den Bildschirm zu überdecken.
  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 lg:inset-0 lg:m-auto lg:h-fit lg:max-w-lg lg:rounded-2xl rounded-t-2xl bg-card border-t lg:border border-line p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[88vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg text-ivory">{r.studentName}</h2>
            <div className="text-xs text-sage-muted">{TYPE_LABEL[r.requestType]} · {r.sessionDate ? fmt(r.sessionDate) : fmt(r.createdAt)}{r.className ? ` · ${r.className}` : ''}</div>
          </div>
          <button onClick={onClose} aria-label="Schließen" className="text-sage hover:text-ivory p-1 shrink-0"><X size={20} /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <StatusBadge status={r.status} />
          <span className="text-xs px-2 py-0.5 rounded-full bg-subtle text-sage">Grund: {r.reasonCategory}</span>
          {r.studentAbsences > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-status-late/15 text-status-late">schon {r.studentAbsences}× abwesend</span>}
        </div>
        <div className="rounded-xl border border-line bg-subtle/40 p-4">
          <div className="text-[11px] uppercase tracking-wide text-sage-muted mb-1">Nachricht</div>
          <p className="text-base text-ivory leading-relaxed whitespace-pre-wrap break-words">{r.comment || '– keine Nachricht –'}</p>
          <div className="text-[11px] text-sage-muted mt-2">Gesendet {fmtTime(r.createdAt)}</div>
        </div>
        {(r.comments?.length > 0 || decide || r.status === 'needs_info') && (
          <div className="mt-3">
            <div className="text-[11px] uppercase tracking-wide text-sage-muted mb-1">Rückfragen</div>
            <CommentThread request={r} onSent={onCommentSent} />
          </div>
        )}
        {decide && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Button onClick={() => decide(r.id, 'approve')}>Genehmigen</Button>
            <Button variant="outline" onClick={() => decide(r.id, 'needs_info')}>Rückfrage</Button>
            <Button variant="danger" onClick={() => decide(r.id, 'reject')}>Ablehnen</Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
