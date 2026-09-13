import { useEffect, useState } from 'react';
import { CalendarX, Send } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, StatusBadge, Spinner, useToast } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

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
  const commentTooShort = (form.comment || '').trim().length < 30;
  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (commentTooShort) { toast.push('Bitte eine kurze Begründung mit mindestens 30 Zeichen angeben.', 'error'); return; }
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
              <span className="text-sm text-sage">Begründung <span className="text-status-absent">*</span> (mind. 30 Zeichen)</span>
              <textarea
                className={`input mt-1 ${touched && commentTooShort ? 'border-status-absent ring-1 ring-status-absent' : ''}`}
                rows={3}
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
                placeholder="z. B. Assalamu alaikum, mein Kind ist heute krank und kann leider nicht kommen …"
              />
              <div className="flex justify-between mt-1">
                {touched && commentTooShort
                  ? <span className="text-[11px] text-status-absent">Bitte mindestens 30 Zeichen – der Antrag kann sonst nicht gesendet werden.</span>
                  : <span className="text-[11px] text-sage-muted">Kurze, höfliche Begründung.</span>}
                <span className={`text-[11px] ${commentTooShort ? 'text-status-absent' : 'text-sage-muted'}`}>{(form.comment || '').trim().length}/30</span>
              </div>
            </label>
            <Button type="submit" disabled={commentTooShort}><Send size={18} /> Antrag senden</Button>
          </form>
        </Card>

        <Card className="p-5">
          <CardHeader title="Meine Meldungen" />
          <div className="divide-y divide-line">
            {!requests ? <Spinner /> : requests.length === 0 ? (
              <p className="p-4 text-sage-muted text-sm">Noch keine Meldungen.</p>
            ) : requests.map((r) => (
              <div key={r.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-ivory text-sm">{TYPES.find((t) => t[0] === r.requestType)?.[1]} · {r.reasonCategory}</div>
                  <div className="text-xs text-sage-muted">{r.sessionDate ? fmt(r.sessionDate) : fmt(r.createdAt)}{r.comment ? ` · ${r.comment}` : ''}</div>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
