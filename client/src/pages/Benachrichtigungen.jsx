import { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, Button, Spinner } from '../components/ui.jsx';

const fmt = (iso) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
const dot = { info: 'bg-mint', warning: 'bg-status-late', danger: 'bg-status-absent' };

export default function Benachrichtigungen() {
  const [items, setItems] = useState(null);

  const load = () => api.get('/notifications').then((d) => setItems(d.items));
  useEffect(() => { load(); }, []);

  const markRead = async () => {
    await api.post('/notifications/read');
    load();
  };

  return (
    <AppLayout title="Benachrichtigungen">
      <div className="flex justify-end mb-4">
        <Button variant="outline" size="sm" onClick={markRead}><CheckCheck size={16} /> Alle als gelesen</Button>
      </div>
      {!items ? <Spinner /> : items.length === 0 ? (
        <Card className="p-8 text-center text-sage-muted">
          <Bell size={32} className="mx-auto mb-3 opacity-50" />
          Keine Benachrichtigungen.
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Card key={n.id} className={`p-4 flex items-start gap-3 ${n.read ? '' : 'border-mint/30'}`}>
              <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${n.read ? 'bg-white/20' : dot[n.level] || 'bg-mint'}`} />
              <div className="min-w-0 flex-1">
                <div className="text-ivory">{n.title}</div>
                <div className="text-sm text-sage">{n.body}</div>
                <div className="text-[11px] text-sage-muted mt-1">{fmt(n.createdAt)}</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
