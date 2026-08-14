import { useEffect, useRef, useState } from 'react';
import { MessagesSquare, Plus, Send, ArrowLeft } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Avatar, Spinner, useToast } from '../components/ui.jsx';

const fmt = (iso) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

export default function Nachrichten() {
  const [view, setView] = useState('list'); // list | thread | new
  const [threads, setThreads] = useState(null);
  const [activeId, setActiveId] = useState(null);

  const loadThreads = () => api.get('/threads').then((d) => setThreads(d.threads));
  useEffect(() => { loadThreads(); }, []);

  const openThread = (id) => { setActiveId(id); setView('thread'); };

  return (
    <AppLayout title="Nachrichten">
      {view === 'list' && (
        <>
          <div className="flex justify-end mb-4"><Button onClick={() => setView('new')}><Plus size={18} /> Neue Nachricht</Button></div>
          {!threads ? <Spinner /> : threads.length === 0 ? (
            <Card className="p-8 text-center text-sage-muted">
              <MessagesSquare size={32} className="mx-auto mb-3 opacity-50" />
              Noch keine Nachrichten.
            </Card>
          ) : (
            <div className="space-y-2">
              {threads.map((t) => (
                <Card key={t.id} className="p-4 hover:bg-hover transition flex items-center gap-3 cursor-pointer" onClick={() => openThread(t.id)}>
                  <Avatar name={t.otherName} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ivory truncate">{t.otherName}</span>
                      <span className="text-[11px] text-sage-muted shrink-0">{t.lastAt ? fmt(t.lastAt) : ''}</span>
                    </div>
                    <div className="text-sm text-sage-muted truncate">{t.lastBody}</div>
                  </div>
                  {t.unread > 0 && <span className="min-w-5 h-5 px-1.5 grid place-items-center rounded-full bg-mint text-sidebar text-[11px] font-mono shrink-0">{t.unread}</span>}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {view === 'new' && <NewThread onCancel={() => setView('list')} onOpen={(id) => { loadThreads(); openThread(id); }} />}
      {view === 'thread' && <ThreadView id={activeId} onBack={() => { setView('list'); loadThreads(); }} />}
    </AppLayout>
  );
}

function NewThread({ onCancel, onOpen }) {
  const toast = useToast();
  const [contacts, setContacts] = useState(null);
  const [recipientId, setRecipientId] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    api.get('/message-contacts').then((d) => { setContacts(d.contacts); setRecipientId(d.contacts[0]?.id || ''); });
  }, []);

  const send = async () => {
    try {
      const { threadId } = await api.post('/threads', { recipientId, body });
      onOpen(threadId);
    } catch (err) { toast.push(err.message, 'error'); }
  };

  return (
    <Card className="p-5">
      <CardHeader title="Neue Nachricht" icon={MessagesSquare} />
      <div className="p-4 space-y-3">
        <button onClick={onCancel} className="inline-flex items-center gap-2 text-sm text-sage-muted hover:text-ivory">
          <ArrowLeft size={16} /> Zurück
        </button>
        {!contacts ? <Spinner /> : contacts.length === 0 ? (
          <p className="text-sage-muted text-sm">Keine erlaubten Gesprächspartner verfügbar.</p>
        ) : (
          <>
            <label className="block">
              <span className="text-sm text-sage">An</span>
              <select className="input mt-1" value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.roleLabel})</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-sage">Nachricht</span>
              <textarea className="input mt-1" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
            </label>
            <Button onClick={send} disabled={!body.trim()}><Send size={18} /> Senden</Button>
          </>
        )}
      </div>
    </Card>
  );
}

function ThreadView({ id, onBack }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [body, setBody] = useState('');
  const bottomRef = useRef(null);

  const load = () => api.get(`/threads/${id}`).then((d) => setData(d.thread));
  useEffect(() => {
    load();
    const t = setInterval(load, 6000); // leichte Live-Aktualisierung
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [data?.messages?.length]);

  const send = async () => {
    if (!body.trim()) return;
    try {
      await api.post(`/threads/${id}/messages`, { body });
      setBody('');
      load();
    } catch (err) { toast.push(err.message, 'error'); }
  };

  if (!data) return <Spinner />;
  return (
    <Card className="flex flex-col" style={{ height: 'calc(100vh - 220px)', minHeight: 360 }}>
      <div className="flex items-center gap-3 p-4 border-b border-white/10">
        <button onClick={onBack} className="text-sage hover:text-ivory"><ArrowLeft size={20} /></button>
        <Avatar name={data.otherName} size={36} />
        <span className="text-ivory">{data.otherName}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {data.messages.map((m) => {
          const mine = m.senderId === data.meId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={['max-w-[80%] rounded-2xl px-3.5 py-2', mine ? 'bg-mint text-sidebar rounded-br-sm' : 'bg-card border border-white/10 text-sage rounded-bl-sm'].join(' ')}>
                <p className="text-sm whitespace-pre-line">{m.body}</p>
                <div className={`text-[10px] mt-1 ${mine ? 'text-sidebar/70' : 'text-sage-muted'}`}>{fmt(m.createdAt)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-white/10 flex items-end gap-2">
        <textarea className="input flex-1 resize-none" rows={1} placeholder="Nachricht …" value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <Button onClick={send} disabled={!body.trim()}><Send size={18} /></Button>
      </div>
    </Card>
  );
}
