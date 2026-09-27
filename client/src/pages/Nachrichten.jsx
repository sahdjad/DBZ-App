import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MessagesSquare, Plus, Send, ArrowLeft, Paperclip, Mic, Square, X, SmilePlus, FileText, Undo2, CheckCheck, Check, Trash2, ListChecks, Megaphone, Users, Inbox, Search } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { Card, CardHeader, Button, Avatar, Spinner, useToast, ImageAttachment, FileAttachment, useSelection, useLongPress, SelectCheck, SelectionBar } from '../components/ui.jsx';
import { lastSeenLabel } from '../lib/format.js';

const fmt = (iso) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
const REACTIONS = ['👍', '❤️', '🤲', '✅', '😊', '😮'];
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const RECALL_ROLES = ['klassenlehrer', 'vertretung', 'leitung', 'super_admin'];
// Mitarbeitende: Postfächer, Rundnachrichten, Lesebestätigung, Löschen.
const STAFF_ROLES = RECALL_ROLES;
// Badges/Zähler in der Navigation neu berechnen lassen.
const refreshBadges = () => window.dispatchEvent(new Event('dbz:notifications'));

export default function Nachrichten() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState(threadId ? 'thread' : 'list'); // list | thread | new
  const [threads, setThreads] = useState(null);
  const [activeId, setActiveId] = useState(threadId || null);
  const { user } = useAuth();
  const isStaff = STAFF_ROLES.includes(user?.role);
  const [broadcastId, setBroadcastId] = useState(null);

  const loadThreads = () => api.get('/threads').then((d) => { setThreads(d.threads); refreshBadges(); });
  useEffect(() => { loadThreads(); }, []);
  // Deep-Link aus einer Push-Benachrichtigung: direkt den Thread öffnen.
  useEffect(() => { if (threadId) { setActiveId(threadId); setView('thread'); } }, [threadId]);

  const openThread = (id) => { setActiveId(id); setView('thread'); };
  const toast = useToast();
  const selection = useSelection();
  const bulk = async (action) => {
    const ids = [...selection.ids];
    if (action === 'delete' && !window.confirm(`${ids.length} Chat(s) für dich löschen? Die anderen Beteiligten behalten den Verlauf. Kommt eine neue Nachricht, erscheint der Chat wieder.`)) return;
    try {
      await api.post('/threads/bulk', { ids, action });
      toast.push(action === 'read' ? 'Als gelesen markiert' : 'Chats gelöscht', 'success');
      selection.clear();
      loadThreads();
    } catch (err) { toast.push(err.message, 'error'); }
  };
  const backToList = () => { setView('list'); setBroadcastId(null); loadThreads(); if (threadId) navigate('/nachrichten'); };

  return (
    <AppLayout title="Nachrichten">
      {view === 'list' && (
        <>
          <div className="flex justify-end gap-2 mb-4">
            {threads?.length > 0 && !selection.active && (
              <Button variant="outline" onClick={() => selection.start()}><ListChecks size={18} /> Auswählen</Button>
            )}
            <Button onClick={() => setView('new')}><Plus size={18} /> Neue Nachricht</Button>
          </div>
          {isStaff && <BroadcastList onOpen={(id) => { setBroadcastId(id); setView('broadcast'); }} />}
          {!threads ? <Spinner /> : threads.length === 0 ? (
            <Card className="p-8 text-center text-sage-muted">
              <MessagesSquare size={32} className="mx-auto mb-3 opacity-50" />
              Noch keine Nachrichten.
            </Card>
          ) : (
            <div className="space-y-2">
              {threads.map((t) => (
                <ThreadRow key={t.id} t={t} selection={selection} onOpen={() => openThread(t.id)}>
                  <Avatar name={t.otherName} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ivory truncate">{t.otherName}{t.inboxLabel && <span className="ml-2 text-[11px] text-sage-muted">{t.inboxLabel}</span>}</span>
                      <span className="text-[11px] text-sage-muted shrink-0">{t.lastAt ? fmt(t.lastAt) : ''}</span>
                    </div>
                    <div className="text-sm text-sage-muted truncate">{t.lastBody}</div>
                  </div>
                  {t.unread > 0 && <span className="min-w-5 h-5 px-1.5 grid place-items-center rounded-full bg-mint text-onaccent text-[11px] font-mono shrink-0">{t.unread}</span>}
                </ThreadRow>
              ))}
            </div>
          )}
          <SelectionBar
            selection={selection}
            allIds={(threads || []).map((t) => t.id)}
            actions={[
              { label: 'Gelesen', icon: CheckCheck, onClick: () => bulk('read') },
              // Schüler/Eltern dürfen Verläufe nicht löschen.
              ...(isStaff ? [{ label: 'Löschen', icon: Trash2, variant: 'danger', onClick: () => bulk('delete') }] : []),
            ]}
          />
        </>
      )}

      {view === 'new' && <NewThread onCancel={() => setView('list')} onOpen={(id) => { loadThreads(); openThread(id); }} onBroadcast={(id) => { setBroadcastId(id); setView('broadcast'); }} />}
      {view === 'broadcast' && <BroadcastDetail id={broadcastId} onBack={backToList} onOpenThread={openThread} />}
      {view === 'thread' && <ThreadView id={activeId} onBack={backToList} />}
    </AppLayout>
  );
}

function ThreadRow({ t, selection, onOpen, children }) {
  const longPress = useLongPress(() => selection.start(t.id));
  const selected = selection.has(t.id);
  return (
    <Card
      {...longPress.handlers}
      role="button"
      tabIndex={0}
      aria-pressed={selection.active ? selected : undefined}
      className={`p-4 hover:bg-hover transition flex items-center gap-3 cursor-pointer select-none ${selected ? 'border-mint/60 bg-mint/5' : ''}`}
      onClick={() => { if (longPress.wasLongPress()) return; if (selection.active) selection.toggle(t.id); else onOpen(); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (selection.active ? selection.toggle(t.id) : onOpen()); }}
    >
      {selection.active && <SelectCheck checked={selected} />}
      {children}
    </Card>
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
          <Button onClick={submit} disabled={busy || (!body.trim() && !file)} aria-label="Nachricht senden" title="Senden"><Send size={18} /></Button>
        </div>
      )}
    </div>
  );
}

function NewThread({ onCancel, onOpen, onBroadcast }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [recipientId, setRecipientId] = useState('');
  const [mode, setMode] = useState('box'); // box | person | broadcast (nur Mitarbeitende)
  const [asBox, setAsBox] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get('/message-contacts').then((d) => {
      setData(d);
      if (d.contacts?.length) setRecipientId(d.contacts[0].id);
      else if (d.boxes?.length) setRecipientId(d.boxes[0].id);
      setAsBox(d.sendAs?.[0]?.key || '');
    });
  }, []);

  const staff = Boolean(data?.sendAs);
  const send = async ({ body, file }) => {
    const fd = new FormData();
    if (body) fd.set('body', body);
    if (file) fd.set('file', file, file.name || 'anhang');
    if (asBox) fd.set('asBox', asBox);
    if (mode === 'broadcast' && staff) {
      if (!recipientId.startsWith('bc:')) throw new Error('Bitte eine Empfängergruppe wählen');
      fd.set('target', recipientId);
      const { broadcast } = await api.upload('/broadcasts', fd);
      toast.push(`Rundnachricht an ${broadcast.total} Personen gesendet`, 'success');
      onBroadcast(broadcast.id);
      return;
    }
    if (!recipientId) throw new Error('Bitte einen Empfänger wählen');
    fd.set('recipientId', recipientId);
    const { threadId } = await api.upload('/threads', fd);
    onOpen(threadId);
  };
  const switchMode = (m) => {
    setMode(m);
    const first = m === 'box' ? data.boxes[0]?.id : m === 'broadcast' ? data.broadcasts[0]?.id : '';
    setRecipientId(first || '');
  };

  const people = (data?.people || []).filter((p) => !q.trim() || [p.name, ...(p.classNames || [])].some((x) => x.toLowerCase().includes(q.trim().toLowerCase())));
  const Choice = ({ c, extra }) => (
    <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition ${recipientId === c.id ? 'border-mint bg-mint/5' : 'border-line hover:bg-hover'}`}>
      <input type="radio" name="recipient" className="mt-1" checked={recipientId === c.id} onChange={() => setRecipientId(c.id)} />
      <span className="min-w-0">
        <span className="block text-ivory font-medium">{c.name}</span>
        {(c.description || extra) && <span className="block text-xs text-sage-muted mt-0.5">{c.description || extra}</span>}
      </span>
    </label>
  );

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-line flex items-center gap-3">
        <button onClick={onCancel} className="text-sage hover:text-ivory" aria-label="Abbrechen"><ArrowLeft size={20} /></button>
        <span className="text-ivory">Neue Nachricht</span>
      </div>
      <div className="p-4 space-y-3">
        {!data ? <Spinner /> : !staff ? (
          data.contacts.length === 0 ? (
            <p className="text-sage-muted text-sm">Gerade ist niemand erreichbar.</p>
          ) : (
            // Schüler/Eltern: Rollen-Postfächer mit Zuständigkeit, damit klar
            // ist, wen man für welches Anliegen anschreibt.
            <fieldset>
              <legend className="text-sm text-sage mb-2">An wen möchtest du schreiben?</legend>
              <div className="grid gap-2">{data.contacts.map((c) => <Choice key={c.id} c={c} />)}</div>
            </fieldset>
          )
        ) : (
          <>
            <div className="flex gap-2 flex-wrap" role="tablist">
              <Button size="sm" variant={mode === 'box' ? 'primary' : 'outline'} onClick={() => switchMode('box')}><Inbox size={15} /> Postfach</Button>
              <Button size="sm" variant={mode === 'person' ? 'primary' : 'outline'} onClick={() => switchMode('person')}><Users size={15} /> Schüler / Eltern</Button>
              {data.broadcasts.length > 0 && <Button size="sm" variant={mode === 'broadcast' ? 'primary' : 'outline'} onClick={() => switchMode('broadcast')}><Megaphone size={15} /> Rundnachricht</Button>}
            </div>
            {data.sendAs.length > 1 && (
              <label className="block">
                <span className="text-sm text-sage">Absender</span>
                <select className="input mt-1" value={asBox} onChange={(e) => setAsBox(e.target.value)}>
                  {data.sendAs.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </label>
            )}
            <p className="text-xs text-sage-muted">Du schreibst als <b>{data.sendAs.find((x) => x.key === asBox)?.label || 'Postfach'}</b> – Empfänger sehen nicht deinen Namen, nur das Postfach.</p>
            {mode === 'box' && <div className="grid gap-2 sm:grid-cols-2">{data.boxes.map((c) => <Choice key={c.id} c={c} />)}</div>}
            {mode === 'person' && (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-sage-muted" />
                  <input className="input pl-9" placeholder="Name oder Klasse suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <div className="grid gap-2 sm:grid-cols-2 max-h-72 overflow-y-auto dbz-scroll">
                  {people.slice(0, 200).map((c) => <Choice key={c.id} c={c} extra={[c.roleLabel, ...(c.classNames || [])].join(' · ')} />)}
                  {people.length === 0 && <p className="text-sm text-sage-muted">Niemand gefunden.</p>}
                </div>
              </div>
            )}
            {mode === 'broadcast' && (
              <div className="space-y-2">
                <p className="text-xs text-sage-muted">Jede Person bekommt die Nachricht einzeln – Antworten kommen als eigener Chat zurück, niemand sieht die Antworten der anderen.</p>
                <div className="grid gap-2 sm:grid-cols-2">{data.broadcasts.map((c) => <Choice key={c.id} c={c} extra={`${c.count} Empfänger`} />)}</div>
              </div>
            )}
          </>
        )}
      </div>
      {data && (data.contacts.length > 0 || staff) && <Composer onSend={send} autoFocus={!staff} />}
    </Card>
  );
}

// Gesendete Rundnachrichten (nur Mitarbeitende) mit Lese-Zähler.
function BroadcastList({ onOpen }) {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { api.get('/broadcasts').then((d) => setList(d.broadcasts)).catch(() => setList([])); }, []);
  if (!list?.length) return null;
  return (
    <Card className="p-0 mb-3 overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-hover" aria-expanded={open}>
        <Megaphone size={18} className="text-mint" />
        <span className="text-ivory flex-1">Rundnachrichten</span>
        <span className="text-xs text-sage-muted">{list.length}</span>
      </button>
      {open && (
        <ul className="divide-y divide-line border-t border-line">
          {list.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => onOpen(b.id)} className="w-full text-left px-4 py-3 hover:bg-hover">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-ivory truncate">{b.targetLabel}</span>
                  <span className="text-[11px] text-sage-muted shrink-0">{fmt(b.createdAt)}</span>
                </div>
                <div className="text-xs text-sage-muted truncate">{b.body || '📎 Anhang'}</div>
                <div className="text-[11px] text-mint mt-0.5">gelesen {b.read}/{b.total}{b.replies ? ` · ${b.replies} Antwort(en)` : ''}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function BroadcastDetail({ id, onBack, onOpenThread }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.get(`/broadcasts/${id}`).then(setData).catch(() => setData(null)); }, [id]);
  if (!data) return <Spinner />;
  const b = data.broadcast;
  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-line flex items-center gap-3">
        <button onClick={onBack} className="text-sage hover:text-ivory" aria-label="Zurück"><ArrowLeft size={20} /></button>
        <div className="min-w-0">
          <div className="text-ivory truncate">Rundnachricht: {b.targetLabel}</div>
          <div className="text-[11px] text-sage-muted">als {b.fromLabel} · {fmt(b.createdAt)} · gelesen {b.read}/{b.total}</div>
        </div>
      </div>
      {b.body && <p className="p-4 text-sm text-sage whitespace-pre-line border-b border-line">{b.body}</p>}
      <ul className="divide-y divide-line">
        {data.recipients.map((r) => (
          <li key={r.id}>
            <button type="button" disabled={!r.threadId} onClick={() => onOpenThread(r.threadId)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-hover">
              <Avatar name={r.name} size={30} />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ivory truncate">{r.name} <span className="text-[11px] text-sage-muted">{r.roleLabel}</span></div>
                <div className="text-[11px] text-sage-muted">zuletzt online: {lastSeenLabel(r.lastSeenAt)}</div>
              </div>
              {r.readAt
                ? <span className="text-[11px] text-mint inline-flex items-center gap-1"><CheckCheck size={14} /> {fmt(r.readAt)}</span>
                : <span className="text-[11px] text-sage-muted inline-flex items-center gap-1"><Check size={14} /> ungelesen</span>}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Attachment({ threadId, m }) {
  const url = `/api/threads/${threadId}/messages/${m.id}/file`;
  if (!m.file) return null;
  if (m.file.kind === 'image')
    return <ImageAttachment url={url} alt={m.file.originalName} className="mt-1" />;
  if (m.file.kind === 'audio')
    return <audio src={url} controls preload="none" className="mt-1 w-56 max-w-full" />;
  return (
    <FileAttachment url={url} name={m.file.originalName} mediaType={m.file.mediaType} icon={FileText} className="mt-1 !text-inherit underline" />
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
        <button onClick={onBack} className="text-sage hover:text-ivory" aria-label="Zurück zur Übersicht"><ArrowLeft size={20} /></button>
        <Avatar name={data.otherName} size={36} />
        <div className="min-w-0">
          <div className="text-ivory truncate">{data.otherName}</div>
          <div className="text-[11px] text-sage-muted truncate">
            {'lastSeenAt' in data ? `zuletzt online: ${lastSeenLabel(data.lastSeenAt)} · ` : ''}{data.subtitle}
          </div>
        </div>
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
              {!mine && data.group && (
                <div className="text-[11px] text-sage-muted mb-0.5 px-1">{m.senderName}</div>
              )}
              {m.broadcast && <div className="text-[10px] text-sage-muted mb-0.5 px-1 inline-flex items-center gap-1"><Megaphone size={11} /> Rundnachricht</div>}
              <div className="group flex items-end gap-1.5 max-w-[85%]">
                {mine && <ReactButton onClick={() => setPicker(picker === m.id ? null : m.id)} />}
                <div className={['rounded-2xl px-3.5 py-2', mine ? 'bg-mint text-onaccent rounded-br-sm' : 'bg-card border border-line text-sage rounded-bl-sm'].join(' ')}>
                  {m.body && <p className="text-sm whitespace-pre-line">{m.body}</p>}
                  <Attachment threadId={id} m={m} />
                  <div className={`text-[10px] mt-1 flex items-center gap-1 ${mine ? 'text-onaccent/70 justify-end' : 'text-sage-muted'}`}>
                    {fmt(m.createdAt)}
                    {/* Lesebestätigung: nur für Mitarbeitende (Server liefert sie Schülern/Eltern nicht). */}
                    {mine && m.read && (m.read.seen
                      ? <span title={m.read.at ? `gelesen ${fmt(m.read.at)}` : 'gelesen'} className="inline-flex"><CheckCheck size={13} /></span>
                      : <span title="noch nicht gelesen" className="inline-flex opacity-70"><Check size={13} /></span>)}
                  </div>
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
