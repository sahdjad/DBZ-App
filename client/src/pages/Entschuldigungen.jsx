import { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, StatusBadge, Spinner, useToast } from '../components/ui.jsx';

const TYPE_LABEL = { absent: 'Fehlt', late: 'Später', leave_early: 'Früher', other: 'Sonstiges' };
const fmt = (iso) => new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' });

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
  const decided = list.filter((r) => r.status !== 'pending');

  return (
    <AppLayout title="Entschuldigungen">
      <Card className="p-5 mb-4">
        <CardHeader title="Offene Anträge" subtitle={`${pending.length} warten auf Entscheidung`} icon={ClipboardCheck} />
        <div className="divide-y divide-line">
          {pending.length === 0 ? <p className="p-4 text-sage-muted text-sm">Keine offenen Anträge.</p> : pending.map((r) => (
            <div key={r.id} className="py-3 flex items-start justify-between gap-3 flex-wrap">
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
              <div className="flex gap-2">
                <Button size="sm" onClick={() => decide(r.id, 'approve')}>Genehmigen</Button>
                <Button size="sm" variant="outline" onClick={() => decide(r.id, 'needs_info')}>Rückfrage</Button>
                <Button size="sm" variant="danger" onClick={() => decide(r.id, 'reject')}>Ablehnen</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

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
