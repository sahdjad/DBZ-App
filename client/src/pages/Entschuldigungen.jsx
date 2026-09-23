import { useState, useEffect } from 'react';
import { ClipboardCheck, MessageCircle, Send } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, StatusBadge, Spinner, useToast } from '../components/ui.jsx';

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

function RequestRow({ r, decide, onCommentSent, defaultOpen }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const commentCount = (r.comments || []).length;
  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-ivory flex items-center gap-2 flex-wrap">
            {r.studentName} · {TYPE_LABEL[r.requestType]}
            {r.studentAbsences > 0 && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${r.studentAbsences >= 2 ? 'bg-status-late/15 text-status-late' : 'bg-subtle text-sage-muted'}`}>
                schon {r.studentAbsences}× abwesend
              </span>
            )}
          </div>
          <div className="text-xs text-sage-muted">Grund: {r.reasonCategory}{r.comment ? ` · ${r.comment}` : ''} · {r.sessionDate ? fmt(r.sessionDate) : fmt(r.createdAt)}</div>
        </div>
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

  const load = () => api.get('/absence-requests').then((d) => setList(d.requests));
  useEffect(() => { load(); }, []);

  const decide = async (id, decision) => {
    try {
      await api.post(`/absence-requests/${id}/decide`, { decision });
      toast.push('Entscheidung gespeichert', 'success');
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  if (!list) return <AppLayout title="Entschuldigungen"><Spinner /></AppLayout>;
  const pending = list.filter((r) => r.status === 'pending');
  const needsInfo = list.filter((r) => r.status === 'needs_info');
  const decided = list.filter((r) => !['pending', 'needs_info'].includes(r.status));

  return (
    <AppLayout title="Entschuldigungen">
      <Card className="p-5 mb-4">
        <CardHeader title="Offene Anträge" subtitle={`${pending.length} warten auf Entscheidung`} icon={ClipboardCheck} />
        <div className="divide-y divide-line px-1">
          {pending.length === 0 ? <p className="p-4 text-sage-muted text-sm">Keine offenen Anträge.</p> : pending.map((r) => (
            <RequestRow key={r.id} r={r} decide={decide} onCommentSent={load} />
          ))}
        </div>
      </Card>

      {needsInfo.length > 0 && (
        <Card className="p-5 mb-4 border-status-late/30">
          <CardHeader title="Rückfrage offen" subtitle="Wartet auf Antwort von Schüler/Eltern" icon={MessageCircle} />
          <div className="divide-y divide-line px-1">
            {needsInfo.map((r) => (
              <RequestRow key={r.id} r={r} decide={null} defaultOpen onCommentSent={load} />
            ))}
          </div>
        </Card>
      )}

      {decided.length > 0 && (
        <Card className="p-5">
          <CardHeader title="Bearbeitet" />
          <div className="grid gap-2 lg:grid-cols-2 items-start">
            {decided.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-subtle/40 px-3 py-2.5">
                <div className="text-sm">
                  <span className="text-ivory">{r.studentName}</span>
                  <span className="text-sage-muted"> · {TYPE_LABEL[r.requestType]} · {r.reasonCategory}</span>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </AppLayout>
  );
}
