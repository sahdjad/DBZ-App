import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MessagesSquare, Plus, Send, ArrowLeft, Paperclip, Mic, Square, X, SmilePlus, FileText, Undo2 } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { Card, CardHeader, Button, Avatar, Spinner, useToast } from '../components/ui.jsx';

const fmt = (iso) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
const REACTIONS = ['👍', '❤️', '🤲', '✅', '😊', '😮'];
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const RECALL_ROLES = ['klassenlehrer', 'vertretung', 'leitung', 'super_admin'];
// Badges/Zähler in der Navigation neu berechnen lassen.
const refreshBadges = () => window.dispatchEvent(new Event('dbz:notifications'));

export default function Nachrichten() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState(threadId ? 'thread' : 'list'); // list | thread | new
  const [threads, setThreads] = useState(null);
  const [activeId, setActiveId] = useState(threadId || null);

  const loadThreads = () => api.get('/threads').then((d) => { setThreads(d.threads); refreshBadges(); });
  useEffect(() => { loadThreads(); }, []);
  // Deep-Link aus einer Push-Benachrichtigung: direkt den Thread öffnen.
  useEffect(() => { if (threadId) { setActiveId(threadId); setView('thread'); } }, [threadId]);

  const openThread = (id) => { setActiveId(id); setView('thread'); };
  const backToList = () => { setView('list'); loadThreads(); if (threadId) navigate('/nachrichten'); };

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
                  {t.unread > 0 && <span className="min-w-5 h-5 px-1.5 grid place-items-center rounded-full bg-mint text-onaccent text-[11px] font-mono shrink-0">{t.unread}</span>}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {view === 'new' && <NewThread onCancel={() => setView('list')} onOpen={(id) => { loadThreads(); openThread(id); }} />}
      {view === 'thread' && <ThreadView id={activeId} onBack={backToList} />}
    </AppLayout>
  );
}

// --- Sprachaufnahme -----------------------------------------------------------
function useRecorder(onDone) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mr = useRef(null);
  const chunks = useRef([]);
  const timer = useRef(null);
  const stream = useRef(null);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onDone(null, new Error('Aufnahme wird auf diesem Gerät nicht unterstützt'));
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream.current);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        stream.current?.getTracks().forEach((t) => t.stop());
        if (rec._cancelled) return;
        const type = (rec.mimeType || 'audio/webm').split(';')[0];
        const ext = type.includes('mp4') || type.includes('m4a') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File(chunks.current, `sprachnachricht.${ext}`, { type });
        onDone(file);
      };
      mr.current = rec;
      rec.start();
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      onDone(null, err);
    }
  };
  const finish = (cancelled) => {
    if (!mr.current || !recording) return;
    mr.current._cancelled = cancelled;
    mr.current.stop();
    setRecording(false);
    clearInterval(timer.current);
  };
  return { recording, seconds, start, stop: () => finish(false), cancel: () => finish(true) };
}

// --- Eingabezeile (Text + Bild/Datei + Sprachnachricht) -----------------------
function Composer({ onSend, autoFocus }) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);
  const rec = useRecorder((f, err) => {
    if (err) return toast.push(err.message, 'error');
    if (f) setFile(f);
  });

  const pickKind = (f) => (f?.type?.startsWith('image') ? 'image' : f?.type?.startsWith('audio') ? 'audio' : 'file');

  const submit = async () => {
    if (!body.trim() && !file) return;
    setBusy(true);
    try {
      await onSend({ body: body.trim(), file });
      setBody('');
      setFile(null);
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 border-t border-line">
      {file && (
        <div className="mb-2 flex items-center gap-2 text-sm bg-subtle rounded-lg px-3 py-2">
          <span className="text-sage">
            {pickKind(file) === 'image' ? '📷 Bild' : pickKind(file) === 'audio' ? '🎤 Sprachnachricht' : `📎 ${file.name}`}
          </span>
          <button className="ml-auto text-sage-muted hover:text-status-absent" onClick={() => setFile(null)} aria-label="Anhang entfernen"><X size={16} /></button>
        </div>
      )}

      {rec.recording ? (
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-status-absent"><span className="w-2.5 h-2.5 rounded-full bg-status-absent animate-pulse" /> Aufnahme … {mmss(rec.seconds)}</span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={rec.cancel}>Abbrechen</Button>
          <Button size="sm" onClick={rec.stop}><Square size={16} /> Fertig</Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <input ref={fileInput} type="file" accept="image/*,audio/*,application/pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ''; }} />
          <button className="p-2 text-sage hover:text-ivory" onClick={() => fileInput.current?.click()} aria-label="Datei anhängen" title="Bild/Datei anhängen"><Paperclip size={20} /></button>
          <button className="p-2 text-sage hover:text-ivory" onClick={rec.start} aria-label="Sprachnachricht aufnehmen" title="Sprachnachricht"><Mic size={20} /></button>
          <textarea className="input flex-1 resize-none" rows={1} placeholder="Nachricht …" value={body} autoFocus={autoFocus}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
          <Button onClick={submit} disabled={busy || (!body.trim() && !file)}><Send size={18} /></Button>
        </div>
      )}
    </div>
  );
}

function NewThread({ onCancel, onOpen }) {
  const toast = useToast();
  const [contacts, setContacts] = useState(null);
  const [recipientId, setRecipientId] = useState('');

  useEffect(() => {
    api.get('/message-contacts').then((d) => { setContacts(d.contacts); setRecipientId(d.contacts[0]?.id || ''); });
  }, []);

  const send = async ({ body, file }) => {
    const fd = new FormData();
    fd.set('recipientId', recipientId);
    if (body) fd.set('body', body);
    if (file) fd.set('file', file, file.name || 'anhang');
    const { threadId } = await api.upload('/threads', fd);
    onOpen(threadId);
  };

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-line flex items-center gap-3">
        <button onClick={onCancel} className="text-sage hover:text-ivory"><ArrowLeft size={20} /></button>
        <span className="text-ivory">Neue Nachricht</span>
      </div>
      <div className="p-4">
        {!contacts ? <Spinner /> : contacts.length === 0 ? (
          <p className="text-sage-muted text-sm">Keine erlaubten Gesprächspartner verfügbar.</p>
        ) : (
          <label className="block">
            <span className="text-sm text-sage">An</span>
            <select className="input mt-1" value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.roleLabel})</option>)}
            </select>
          </label>
        )}
      </div>
      {contacts && contacts.length > 0 && <Composer onSend={send} autoFocus />}
    </Card>
  );
}

function Attachment({ threadId, m }) {
  const url = `/api/threads/${threadId}/messages/${m.id}/file`;
  if (!m.file) return null;
  if (m.file.kind === 'image')
    return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={m.file.originalName} className="rounded-lg max-h-64 mt-1" /></a>;
  if (m.file.kind === 'audio')
    return <audio src={url} controls preload="none" className="mt-1 w-56 max-w-full" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-2 underline">
      <FileText size={16} /> {m.file.originalName}
    </a>
  );
}

function ThreadView({ id, onBack }) {
  const toast = useToast();
  const { user } = useAuth();
  const canRecall = RECALL_ROLES.includes(user?.role);
  const [data, setData] = useState(null);
  const [picker, setPicker] = useState(null); // messageId, für Reaktions-Auswahl
  const bottomRef = useRef(null);

  // Das Öffnen markiert den Thread als gelesen -> Zähler/Badges aktualisieren.
  const load = () => api.get(`/threads/${id}`).then((d) => { setData(d.thread); refreshBadges(); });
  useEffect(() => {
    load();
    const t = setInterval(load, 6000); // leichte Live-Aktualisierung
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [data?.messages?.length]);

  const send = async ({ body, file }) => {
    if (file) {
      const fd = new FormData();
      if (body) fd.set('body', body);
      fd.set('file', file, file.name || 'anhang');
      await api.upload(`/threads/${id}/messages`, fd);
    } else {
      await api.post(`/threads/${id}/messages`, { body });
    }
    load();
  };

  const react = async (mid, emoji) => {
    setPicker(null);
    try {
      await api.post(`/threads/${id}/messages/${mid}/react`, { emoji });
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  const recall = async (mid) => {
    if (!window.confirm('Diese Nachricht wirklich zurückrufen? Empfänger sehen dann nur einen Hinweis.')) return;
    try {
      await api.post(`/threads/${id}/messages/${mid}/recall`, {});
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  if (!data) return <Spinner />;
  const meId = data.meId;

  return (
    <Card className="flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 220px)', minHeight: 380 }}>
      <div className="flex items-center gap-3 p-4 border-b border-line">
        <button onClick={onBack} className="text-sage hover:text-ivory"><ArrowLeft size={20} /></button>
        <Avatar name={data.otherName} size={36} />
        <span className="text-ivory">{data.otherName}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {data.messages.map((m) => {
          const mine = m.senderId === meId;
          const reactionEntries = Object.entries(m.reactions || {}).filter(([, ids]) => ids.length);
          if (m.recalled) {
            return (
              <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <div className="max-w-[85%] rounded-2xl px-3.5 py-2 bg-subtle border border-dashed border-line text-sage-muted italic text-sm flex items-center gap-2">
                  <Undo2 size={14} /> Diese Nachricht wurde zurückgerufen
                </div>
                <div className="text-[10px] mt-1 text-sage-muted">{fmt(m.createdAt)}</div>
              </div>
            );
          }
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <div className="group flex items-end gap-1.5 max-w-[85%]">
                {mine && <ReactButton onClick={() => setPicker(picker === m.id ? null : m.id)} />}
                <div className={['rounded-2xl px-3.5 py-2', mine ? 'bg-mint text-onaccent rounded-br-sm' : 'bg-card border border-line text-sage rounded-bl-sm'].join(' ')}>
                  {m.body && <p className="text-sm whitespace-pre-line">{m.body}</p>}
                  <Attachment threadId={id} m={m} />
                  <div className={`text-[10px] mt-1 ${mine ? 'text-onaccent/70' : 'text-sage-muted'}`}>{fmt(m.createdAt)}</div>
                </div>
                {!mine && <ReactButton onClick={() => setPicker(picker === m.id ? null : m.id)} />}
              </div>

              {mine && canRecall && (
                <button onClick={() => recall(m.id)} className="mt-1 text-[11px] text-sage-muted hover:text-status-absent inline-flex items-center gap-1">
                  <Undo2 size={12} /> Zurückrufen
                </button>
              )}

              {picker === m.id && (
                <div className="mt-1 flex gap-1 bg-card border border-line rounded-full px-2 py-1 shadow-soft">
                  {REACTIONS.map((e) => (
                    <button key={e} onClick={() => react(m.id, e)} className="text-lg hover:scale-125 transition">{e}</button>
                  ))}
                </div>
              )}

              {reactionEntries.length > 0 && (
                <div className="flex gap-1 mt-1">
                  {reactionEntries.map(([e, ids]) => (
                    <button key={e} onClick={() => react(m.id, e)}
                      className={['text-xs px-2 py-0.5 rounded-full border', ids.includes(meId) ? 'bg-mint/15 border-mint/40 text-mint' : 'bg-subtle border-line text-sage-muted'].join(' ')}>
                      {e} {ids.length}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <Composer onSend={send} />
    </Card>
  );
}

function ReactButton({ onClick }) {
  return (
    <button onClick={onClick} className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition text-sage-muted hover:text-ivory p-1" aria-label="Reagieren">
      <SmilePlus size={16} />
    </button>
  );
}
