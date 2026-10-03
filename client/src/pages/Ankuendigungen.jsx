import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Megaphone, Plus, Trash2, AlertTriangle, CheckCheck, SmilePlus, X } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, Spinner, useToast, useBackToClose } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';
import { lastSeenLabel } from '../lib/format.js';

const REACTIONS = ['❤️', '👍', '👎', '😂', '🤲', '😮'];

const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];
const ADMIN = ['super_admin', 'leitung'];
const ROLE_OPTIONS = [
  ['schueler', 'Schüler'], ['eltern', 'Eltern'], ['klassenlehrer', 'Lehrer'],
  ['klassensprecher', 'Klassensprecher'],
];
const fmt = (iso) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

export default function Ankuendigungen() {
  const { user } = useAuth();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [showForm, setShowForm] = useState(false);

  // Das Öffnen markiert Ankündigungen als gelesen -> Badges/Zähler aktualisieren.
  const load = () => api.get('/announcements').then((d) => { setList(d.announcements); window.dispatchEvent(new Event('dbz:notifications')); });
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    try { await api.del(`/announcements/${id}`); toast.push('Gelöscht', 'success'); load(); }
    catch (err) { toast.push(err.message, 'error'); }
  };

  const isManager = MANAGER.includes(user.role);
  const [readersOf, setReadersOf] = useState(null);
  const react = async (id, emoji) => {
    try {
      const { announcement } = await api.post(`/announcements/${id}/react`, { emoji });
      setList((l) => l.map((x) => (x.id === id ? announcement : x)));
    } catch (err) { toast.push(err.message, 'error'); }
  };

  return (
    <AppLayout title="Ankündigungen">
      {isManager && (
        <div className="flex justify-end mb-4">
          <Button onClick={() => setShowForm((s) => !s)}><Plus size={18} /> Neue Ankündigung</Button>
        </div>
      )}
      {showForm && <NewForm user={user} onDone={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />}

      {!list ? <Spinner /> : list.length === 0 ? (
        <Card className="p-8 text-center text-sage-muted">
          <Megaphone size={32} className="mx-auto mb-3 opacity-50" />
          Noch keine Ankündigungen.
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 items-start">
          {list.map((a) => (
            <Card key={a.id} className={`p-5 ${a.priority === 'high' ? 'border-status-late/40' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.priority === 'high' && <AlertTriangle size={16} className="text-status-late" />}
                    <h3 className="text-ivory">{a.title}</h3>
                    <Badge tone="neutral">{a.audienceLabel}</Badge>
                  </div>
                  <div className="text-xs text-sage-muted mt-1">{a.fromLabel}{a.authorName ? ` · ${a.authorName}` : ''} · {fmt(a.createdAt)}</div>
                </div>
                {(a.authorId === user.id || ADMIN.includes(user.role)) && (
                  <button onClick={() => remove(a.id)} className="text-status-absent p-1 shrink-0" aria-label="Löschen"><Trash2 size={16} /></button>
                )}
              </div>
              <p className="text-sage mt-3 whitespace-pre-line">{a.body}</p>
              <ReactionBar a={a} onReact={(e) => react(a.id, e)} />
              {a.readStats && (
                <button type="button" onClick={() => setReadersOf(a)} className="mt-2 text-xs text-mint inline-flex items-center gap-1 hover:underline">
                  <CheckCheck size={14} /> Gelesen von {a.readStats.read}/{a.readStats.total}
                </button>
              )}
            </Card>
          ))}
        </div>
      )}
      {readersOf && <ReadersSheet a={readersOf} onClose={() => setReadersOf(null)} />}
    </AppLayout>
  );
}

// Emoji-Reaktionen wie bei WhatsApp: eine Reaktion pro Person, erneutes
// Antippen nimmt sie zurück.
function ReactionBar({ a, onReact }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(a.reactions || {});
  return (
    <div className="mt-3 flex items-center gap-1.5 flex-wrap">
      {entries.map(([e, r]) => (
        <button key={e} type="button" onClick={() => onReact(e)} aria-pressed={r.mine}
          className={['text-sm px-2 py-0.5 rounded-full border transition active:scale-95', r.mine ? 'bg-mint/15 border-mint/40 text-mint' : 'bg-subtle border-line text-sage-muted'].join(' ')}>
          {e} {r.count}
        </button>
      ))}
      {open ? (
        <span className="inline-flex gap-1 bg-card border border-line rounded-full px-2 py-0.5 shadow-sm">
          {REACTIONS.map((e) => (
            <button key={e} type="button" onClick={() => { onReact(e); setOpen(false); }} className="text-lg hover:scale-125 transition" aria-label={`Mit ${e} reagieren`}>{e}</button>
          ))}
        </span>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="p-1 text-sage-muted hover:text-ivory" aria-label="Reagieren"><SmilePlus size={18} /></button>
      )}
    </div>
  );
}

// Wer hat gelesen (nur Mitarbeitende).
function ReadersSheet({ a, onClose }) {
  const [rows, setRows] = useState(null);
  useBackToClose(true, onClose); // Zurück-Taste schließt nur diese Liste
  useEffect(() => { api.get(`/announcements/${a.id}/readers`).then((d) => setRows(d.readers)).catch(() => setRows([])); }, [a.id]);
  const read = (rows || []).filter((r) => r.readAt);
  const unread = (rows || []).filter((r) => !r.readAt);
  // Portal an <body>: sonst liegt die Ansicht im scrollenden Seitenbereich
  // fest und wird abgeschnitten statt den Bildschirm zu überdecken.
  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 lg:inset-0 lg:m-auto lg:h-fit lg:max-w-md lg:rounded-2xl rounded-t-2xl bg-card border-t lg:border border-line p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg text-ivory truncate">Gelesen: {a.title}</h2>
          <button onClick={onClose} aria-label="Schließen" className="text-sage hover:text-ivory p-1"><X size={20} /></button>
        </div>
        {!rows ? <Spinner /> : (
          <div className="space-y-4">
            <section>
              <div className="text-xs uppercase tracking-wide text-sage-muted mb-1">Noch nicht gelesen ({unread.length})</div>
              <ul className="divide-y divide-line">{unread.map((r) => <li key={r.id} className="py-1.5 text-sm flex justify-between gap-2"><span className="text-ivory truncate">{r.name} <span className="text-[11px] text-sage-muted">{r.roleLabel}</span></span><span className="text-[11px] text-sage-muted shrink-0">online {lastSeenLabel(r.lastSeenAt)}</span></li>)}</ul>
            </section>
            <section>
              <div className="text-xs uppercase tracking-wide text-sage-muted mb-1">Gelesen ({read.length})</div>
              <ul className="divide-y divide-line">{read.map((r) => <li key={r.id} className="py-1.5 text-sm flex justify-between gap-2"><span className="text-ivory truncate">{r.name} {r.reaction}</span><span className="text-[11px] text-sage-muted shrink-0">{fmt(r.readAt)}</span></li>)}</ul>
            </section>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function NewForm({ user, onDone, onCancel }) {
  const toast = useToast();
  const isAdmin = ADMIN.includes(user.role);
  const [classes, setClasses] = useState([]);
  const [f, setF] = useState({ title: '', body: '', priority: 'normal', audienceType: isAdmin ? 'all' : 'class', classId: '', role: 'schueler' });

  useEffect(() => {
    api.get('/classes').then((d) => {
      // Lehrkraft/Vertretung sieht nur die EIGENEN Klassen; Leitung/Admin alle.
      const visible = isAdmin ? d.classes : d.classes.filter((c) => (user.classIds || []).includes(c.id));
      setClasses(visible);
      setF((x) => ({ ...x, classId: visible[0]?.id || '' }));
    });
  }, []);

  const submit = async () => {
    let audience = { type: 'all' };
    if (f.audienceType === 'class') audience = { type: 'class', classId: f.classId };
    else if (f.audienceType === 'role') audience = { type: 'role', role: f.role };
    else if (f.audienceType === 'online') audience = { type: 'classType', classType: 'online' };
    else if (f.audienceType === 'presence') audience = { type: 'classType', classType: 'presence' };
    // Lehrkraft ohne Auswahl: immer die eigene Klasse.
    if (!isAdmin) audience = { type: 'class', classId: f.classId };
    try {
      await api.post('/announcements', { title: f.title, body: f.body, priority: f.priority, audience });
      toast.push('Ankündigung veröffentlicht', 'success');
      onDone();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  return (
    <Card className="p-5 mb-4">
      <CardHeader title="Neue Ankündigung" icon={Megaphone} />
      <div className="p-4 space-y-3">
        <label className="block">
          <span className="text-sm text-sage">Titel</span>
          <input className="input mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-sm text-sage">Text</span>
          <textarea className="input mt-1" rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {isAdmin ? (
            <label className="block">
              <span className="text-sm text-sage">Zielgruppe</span>
              <select className="input mt-1" value={f.audienceType} onChange={(e) => setF({ ...f, audienceType: e.target.value })}>
                <option value="all">Ganze Koran-Schule</option>
                <option value="online">Nur Online-Klassen</option>
                <option value="presence">Nur Präsenz-Klassen</option>
                <option value="class">Bestimmte Klasse</option>
                <option value="role">Bestimmte Rolle</option>
              </select>
            </label>
          ) : (
            /* Lehrkraft: keine Auswahl – geht immer NUR an die eigene Klasse. */
            classes.length > 1 ? (
              <label className="block">
                <span className="text-sm text-sage">Klasse</span>
                <select className="input mt-1" value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            ) : (
              <div className="text-xs text-sage-muted self-end pb-2">Diese Ankündigung geht an deine Klasse{classes[0] ? ` „${classes[0].name}"` : ''}.</div>
            )
          )}
          {isAdmin && f.audienceType === 'class' && (
            <label className="block">
              <span className="text-sm text-sage">Klasse</span>
              <select className="input mt-1" value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          {isAdmin && f.audienceType === 'role' && (
            <label className="block">
              <span className="text-sm text-sage">Rolle</span>
              <select className="input mt-1" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-sage">
          <input type="checkbox" checked={f.priority === 'high'} onChange={(e) => setF({ ...f, priority: e.target.checked ? 'high' : 'normal' })} /> Wichtig (hervorheben)
        </label>
        <div className="flex gap-2">
          <Button onClick={submit}>Veröffentlichen</Button>
          <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
        </div>
      </div>
    </Card>
  );
}
