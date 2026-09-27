import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, ChevronRight, ListChecks, Trash2 } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, Button, Spinner, useToast, useSelection, useLongPress, SelectCheck, SelectionBar } from '../components/ui.jsx';
import { openNotification, notifyBadgeRefresh } from '../lib/notify.js';

const fmt = (iso) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
const dot = { info: 'bg-mint', warning: 'bg-status-late', danger: 'bg-status-absent' };

export default function Benachrichtigungen() {
  const [items, setItems] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();
  const selection = useSelection();

  const load = () => api.get('/notifications').then((d) => setItems(d.items));
  useEffect(() => { load(); }, []);

  const markAllRead = async () => {
    await api.post('/notifications/read');
    notifyBadgeRefresh();
    load();
  };

  const bulk = async (action) => {
    const ids = [...selection.ids];
    if (action === 'delete' && !window.confirm(`${ids.length} Benachrichtigung(en) löschen?`)) return;
    try {
      await api.post('/notifications/bulk', { ids, action });
      toast.push(action === 'read' ? 'Als gelesen markiert' : 'Gelöscht', 'success');
      selection.clear();
      notifyBadgeRefresh();
      load();
    } catch (err) { toast.push(err.message, 'error'); }
  };

  return (
    <AppLayout title="Benachrichtigungen">
      <div className="flex flex-wrap justify-end gap-2 mb-4">
        {items?.length > 0 && !selection.active && (
          <Button variant="outline" size="sm" onClick={() => selection.start()}><ListChecks size={16} /> Auswählen</Button>
        )}
        <Button variant="outline" size="sm" onClick={markAllRead}><CheckCheck size={16} /> Alle als gelesen</Button>
      </div>
      {!items ? <Spinner /> : items.length === 0 ? (
        <Card className="p-8 text-center text-sage-muted">
          <Bell size={32} className="mx-auto mb-3 opacity-50" />
          Keine Benachrichtigungen.
        </Card>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2 items-start">
          {items.map((n) => (
            <NotificationRow key={n.id} n={n} selection={selection} onOpen={() => openNotification(n, navigate)} />
          ))}
        </div>
      )}
      <SelectionBar
        selection={selection}
        allIds={(items || []).map((n) => n.id)}
        actions={[
          { label: 'Gelesen', icon: CheckCheck, onClick: () => bulk('read') },
          { label: 'Löschen', icon: Trash2, variant: 'danger', onClick: () => bulk('delete') },
        ]}
      />
    </AppLayout>
  );
}

function NotificationRow({ n, selection, onOpen }) {
  const longPress = useLongPress(() => selection.start(n.id));
  const selected = selection.has(n.id);
  return (
    <Card
      {...longPress}
      role="button"
      tabIndex={0}
      aria-pressed={selection.active ? selected : undefined}
      onClick={() => { if (longPress.wasLongPress()) return; if (selection.active) selection.toggle(n.id); else onOpen(); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (selection.active ? selection.toggle(n.id) : onOpen()); }}
      className={`p-4 flex items-start gap-3 cursor-pointer hover:bg-hover transition select-none ${selected ? 'border-mint/60 bg-mint/5' : n.read ? '' : 'border-mint/30'}`}
    >
      {selection.active ? <span className="mt-0.5"><SelectCheck checked={selected} /></span> : (
        <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${n.read ? 'bg-subtle' : dot[n.level] || 'bg-mint'}`} />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-ivory">{n.title}</div>
        <div className="text-sm text-sage">{n.body}</div>
        <div className="text-[11px] text-sage-muted mt-1">{fmt(n.createdAt)}</div>
      </div>
      {!selection.active && <ChevronRight size={18} className="text-sage-muted shrink-0 mt-1" aria-hidden="true" />}
    </Card>
  );
}
