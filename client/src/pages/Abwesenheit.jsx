import { useEffect, useState } from 'react';
import { CalendarX, Send, MessageCircle } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, StatusBadge, Spinner, useToast } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

const fmtTime = (iso) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

// Rückfrage der Lehrkraft direkt in der App beantworten, statt außerhalb
// (WhatsApp/Telefon) zu klären. Antworten schickt den Antrag automatisch
// zurück auf "offen", damit die Lehrkraft erneut entscheidet.
function ReplyThread({ request, onSent }) {
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
    <div className="mt-2 rounded-lg border border-status-late/30 bg-status-late/5 p-3 space-y-2">
      {(request.comments || []).map((c) => (
        <div key={c.id} className="text-sm">
          <span className="text-ivory">{c.authorName}</span>
          <span className="text-[11px] text-sage-muted"> · {fmtTime(c.createdAt)}</span>
          <div className="text-sage">{c.body}</div>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <input
          className="input text-sm py-1.5"
          placeholder="Antworten …"
          aria-label="Antwort auf die Rückfrage"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <Button size="sm" onClick={send} disabled={busy || !body.trim()} aria-label="Antwort senden"><Send size={14} /></Button>
      </div>
    </div>
  );
}

const TYPES = [
  ['absent', 'Fehlt ganz'],
  ['late', 'Kommt später'],
  ['leave_early', 'Geht früher'],
  ['other', 'Sonstiges'],
];
const fmt = (iso) => new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' });

export default function Abwesenheit() {
  const { user } = useAuth();
  const toast = useToast();
  const [reasons, setReasons] = useState([]);
  const [children, setChildren] = useState([]);
  const [requests, setRequests] = useState(null);
  const [form, setForm] = useState({ studentId: '', requestType: 'absent', reasonCategory: 'krankheit', comment: '', sessionDate: '' });

  const load = () => api.get('/absence-requests').then((d) => setRequests(d.requests));
  useEffect(() => {
    api.get('/absence-reasons').then((d) => setReasons(d.reasons));
    load();
    if (user.role === 'eltern') {
      api.get('/dashboard').then((d) => {
        setChildren(d.children || []);
        setForm((f) => ({ ...f, studentId: d.children?.[0]?.id || '' }));
      });
    }
  }, []);

  const [touched, setTouched] = useState(false);
  // Wie server/api.js: Grußformeln zählen nicht als Inhalt (sonst reicht
  // "As-salamu alaikum ..." als Lückenfüller ohne echte Begründung).
  const MIN_WORDS = 5;
  const GREETING_FILLER_RE = /\b(as-?salamu?\s*alaikum\S*|wa\s*alaikum\s*(as-?)?salam\S*|salamun\S*|hallo|hi|guten\s+(morgen|tag|abend)|liebe[r]?\s+\S+|sehr\s+geehrte[r]?\s+\S+|mit\s+freundlichen\s+gr[uü][sß]+en|liebe\s+gr[uü][sß]e|vielen\s+dank|danke\s*(schön)?|bitte|mfg|lg|gr[uü][sß]e?)\b/gi;
  const meaningfulWords = (form.comment || '').replace(GREETING_FILLER_RE, ' ').split(/[^a-zA-ZäöüÄÖÜß]+/).filter((w) => w.length >= 3).length;
  const commentTooShort = meaningfulWords < MIN_WORDS;
  // Hinweis nur zeigen, wenn schon (zu wenig) getippt wurde oder abgesendet wird.
  const showShort = commentTooShort && (touched || (form.comment || '').trim().length > 0);
  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (commentTooShort) { toast.push(`Bitte kurz begründen, was los ist (mind. ${MIN_WORDS} aussagekräftige Wörter).`, 'error'); return; }
    try {
      await api.post('/absence-requests', form);
      toast.push('Antrag gesendet', 'success');
      setForm((f) => ({ ...f, comment: '' }));
      setTouched(false);
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  return (
    <AppLayout title="Abwesenheit melden">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <CardHeader title="Neue Meldung" subtitle="Die Lehrkraft entscheidet über die Entschuldigung" icon={CalendarX} />
          <form onSubmit={submit} className="p-4 space-y-3">
            {user.role === 'eltern' && (
              <label className="block">
                <span className="text-sm text-sage">Kind</span>
                <select className="input mt-1" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} required>
                  {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            <label className="block">
              <span className="text-sm text-sage">Art</span>
              <select className="input mt-1" value={form.requestType} onChange={(e) => setForm({ ...form, requestType: e.target.value })}>
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-sage">Grund</span>
                <select className="input mt-1" value={form.reasonCategory} onChange={(e) => setForm({ ...form, reasonCategory: e.target.value })}>
                  {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-sage">Datum</span>
                <input type="date" className="input mt-1" value={form.sessionDate} onChange={(e) => setForm({ ...form, sessionDate: e.target.value })} />
              </label>
            </div>
            <label className="block">
              <span className="text-sm text-sage">Begründung <span className="text-status-absent">*</span></span>
              <textarea
                className={`input mt-1 ${showShort ? 'border-status-absent ring-1 ring-status-absent' : ''}`}
                rows={3}
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
                placeholder="z. B. Assalamu alaikum, mein Kind ist heute krank und kann leider nicht kommen …"
              />
              {/* Der Zähler wird NICHT dauerhaft angezeigt. Erst wenn schon etwas
                  (zu kurz) geschrieben wurde bzw. beim Absenden, kommt der Hinweis. */}
              {showShort && (
                <p className="text-[11px] text-status-absent mt-1">
                  Bitte etwas ausführlicher – eine Grußformel allein reicht nicht, die Lehrkraft muss den Grund nachvollziehen können.
                </p>
              )}
            </label>
            <Button type="submit"><Send size={18} /> Antrag senden</Button>
          </form>
        </Card>

        <Card className="p-5">
          <CardHeader title="Meine Meldungen" />
          <div className="divide-y divide-line">
            {!requests ? <Spinner /> : requests.length === 0 ? (
              <p className="p-4 text-sage-muted text-sm">Noch keine Meldungen.</p>
            ) : requests.map((r) => (
              <div key={r.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-ivory text-sm">{TYPES.find((t) => t[0] === r.requestType)?.[1]} · {r.reasonCategory}</div>
                    <div className="text-xs text-sage-muted">{r.sessionDate ? fmt(r.sessionDate) : fmt(r.createdAt)}{r.comment ? ` · ${r.comment}` : ''}</div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                {r.status === 'needs_info' && (
                  <>
                    <p className="text-xs text-status-late mt-2 inline-flex items-center gap-1"><MessageCircle size={13} /> Die Lehrkraft hat eine Rückfrage – bitte antworten:</p>
                    <ReplyThread request={r} onSent={load} />
                  </>
                )}
                {r.status !== 'needs_info' && (r.comments || []).length > 0 && (
                  <ReplyThread request={r} onSent={load} />
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
