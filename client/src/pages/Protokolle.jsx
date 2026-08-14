import { useEffect, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, StatusBadge, Spinner, useToast } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];
const fmt = (iso) => new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' });

export default function Protokolle() {
  const { user } = useAuth();
  const toast = useToast();
  const [protocols, setProtocols] = useState(null);
  const [session, setSession] = useState(null);
  const [content, setContent] = useState({ topics: '', homework: '', notes: '' });

  const load = () => api.get('/protocols').then((d) => setProtocols(d.protocols));
  useEffect(() => {
    load();
    if (user.role === 'klassensprecher') {
      api.get('/dashboard').then((d) => {
        setSession(d.todaySession);
        const existing = null;
        setContent((c) => existing || c);
      });
    }
  }, []);

  const isManager = MANAGER.includes(user.role);

  const saveDraft = async (submit) => {
    try {
      const { protocol } = await api.post(`/sessions/${session.id}/protocol`, { content, protocolType: 'unterricht' });
      if (submit) {
        await api.post(`/protocols/${protocol.id}/submit`);
        toast.push('Protokoll eingereicht', 'success');
      } else {
        toast.push('Entwurf gespeichert', 'success');
      }
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  const decide = async (id, decision) => {
    try {
      await api.post(`/protocols/${id}/approve`, { decision });
      toast.push(decision === 'approve' ? 'Protokoll freigegeben' : 'Zurückgegeben', 'success');
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  return (
    <AppLayout title="Protokolle">
      {user.role === 'klassensprecher' && session && (
        <Card className="p-5 mb-4">
          <CardHeader title="Protokoll für heute" subtitle={session.className} icon={ClipboardList} />
          <div className="p-4 space-y-3">
            <Field label="Behandelte Themen" value={content.topics} onChange={(v) => setContent({ ...content, topics: v })} />
            <Field label="Aufgegebene Hausaufgaben" value={content.homework} onChange={(v) => setContent({ ...content, homework: v })} />
            <Field label="Besondere Vorkommnisse" value={content.notes} onChange={(v) => setContent({ ...content, notes: v })} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => saveDraft(false)}>Entwurf speichern</Button>
              <Button onClick={() => saveDraft(true)}>Zur Bestätigung einreichen</Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <CardHeader title="Protokolle" subtitle="Erst nach Lehrerbestätigung offiziell" icon={ClipboardList} />
        <div className="divide-y divide-black/5">
          {!protocols ? <Spinner /> : protocols.length === 0 ? (
            <p className="p-4 text-sage-muted text-sm">Noch keine Protokolle.</p>
          ) : protocols.map((p) => (
            <div key={p.id} className="py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-sage-muted">{fmt(p.createdAt)} · {p.protocolType}</div>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-2 text-sm space-y-1">
                {p.content?.topics && <p className="text-sage"><span className="text-ivory">Themen:</span> {p.content.topics}</p>}
                {p.content?.homework && <p className="text-sage"><span className="text-ivory">Hausaufgaben:</span> {p.content.homework}</p>}
                {p.content?.notes && <p className="text-sage"><span className="text-ivory">Vorkommnisse:</span> {p.content.notes}</p>}
              </div>
              {isManager && p.status === 'submitted' && (
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => decide(p.id, 'approve')}>Freigeben</Button>
                  <Button size="sm" variant="outline" onClick={() => decide(p.id, 'return')}>Zurückgeben</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </AppLayout>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="text-sm text-sage">{label}</span>
      <textarea className="input mt-1" rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
