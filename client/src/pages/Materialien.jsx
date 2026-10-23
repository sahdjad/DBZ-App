import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FolderOpen, Plus, FileText, Link2 as LinkIcon, ExternalLink, Trash2, UploadCloud, Pencil, X, PenLine, Image as ImageIcon, Check,
  Folder, ChevronLeft, ChevronRight, ArrowDown,
} from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api, peek } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, Spinner, useToast, FileAttachment } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';
import { scrollBehavior } from '../lib/scroll.js';

const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];
const ADMIN = ['super_admin', 'leitung'];
const fmt = (iso) => new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' });
const NO_SUBJECT = 'Ohne Fach';
const subjectKey = (name) => (name || NO_SUBJECT).trim().toLocaleLowerCase('de');
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const NEW_DAYS = 7;
const isNew = (iso) => iso && Date.now() - new Date(iso).getTime() < NEW_DAYS * 864e5;
const SubjectSuggestions = createContext([]);

export default function Materialien() {
  const { user } = useAuth();
  const toast = useToast();
  const [list, setList] = useState(() => peek('/materials')?.materials ?? null);
  const [subjects, setSubjects] = useState(() => peek('/subjects')?.subjects ?? []);
  const [mode, setMode] = useState(null); // null | 'new' | 'bulk'
  // Geöffnetes Fach steht in der Adresse (?fach=…), damit „Zurück“ (Wischgeste,
  // Android-Taste) wieder zur Fächer-Übersicht führt.
  const [params, setParams] = useSearchParams();
  const activeSubject = params.get('fach');
  const openSubject = (id) => { setMode(null); setParams(id ? { fach: id } : {}); window.scrollTo(0, 0); };

  const load = () => api.get('/materials').then((d) => setList(d.materials)).catch((e) => { setList([]); toast.push(e.message, 'error'); });
  useEffect(() => { load(); api.get('/subjects').then((d) => setSubjects(d.subjects)).catch(() => {}); }, []);

  const isManager = MANAGER.includes(user.role);

  // Fach-Vorschläge: Standardfächer + alles, was schon frei eingetragen wurde.
  const subjectSuggestions = useMemo(() => {
    const seen = new Map();
    for (const s of subjects) seen.set(subjectKey(s.name), s.name);
    for (const m of list || []) if (m.subjectName) seen.set(subjectKey(m.subjectName), m.subjectName);
    return [...seen.values()].sort((a, b) => a.localeCompare(b, 'de'));
  }, [subjects, list]);

  // Nach Fach gruppiert; innerhalb eines Fachs steht das Älteste oben und das
  // Neueste ganz unten (wie ein Ordner, der übers Jahr wächst).
  const groups = useMemo(() => {
    if (!list) return [];
    const map = new Map();
    for (const m of list) {
      const key = subjectKey(m.subjectName);
      if (!map.has(key)) map.set(key, { id: key, name: m.subjectName || NO_SUBJECT, items: [] });
      map.get(key).items.push(m);
    }
    const arr = [...map.values()];
    for (const g of arr) {
      g.items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      g.files = g.items.reduce((n, m) => n + (m.files || []).length, 0);
      g.last = g.items.reduce((d, m) => ((m.updatedAt || m.createdAt) > d ? m.updatedAt || m.createdAt : d), '');
      g.fresh = g.items.filter((m) => isNew(m.createdAt)).length;
    }
    arr.sort((a, b) => (a.id === subjectKey(NO_SUBJECT)) - (b.id === subjectKey(NO_SUBJECT)) || a.name.localeCompare(b.name, 'de'));
    return arr;
  }, [list]);

  const group = activeSubject ? groups.find((g) => g.id === activeSubject) : null;
  const presetSubject = group && group.id !== subjectKey(NO_SUBJECT) ? group.name : '';

  const replace = (m) => setList((prev) => prev.map((x) => (x.id === m.id ? m : x)));
  const remove = async (m) => {
    if (!window.confirm(`„${m.title}“ mit allen Dateien löschen?`)) return;
    try { await api.del(`/materials/${m.id}`); toast.push('Gelöscht', 'success'); setList((prev) => prev.filter((x) => x.id !== m.id)); }
    catch (err) { toast.push(err.message, 'error'); }
  };
  const created = (m) => {
    setMode(null);
    setList((prev) => [...(prev || []), m]);
    openSubject(subjectKey(m.subjectName));
  };

  const forms = (
    <>
      {mode === 'new' && <NewBlockForm user={user} initialSubject={presetSubject} onDone={created} onCancel={() => setMode(null)} />}
      {mode === 'bulk' && <BulkForm user={user} initialSubject={presetSubject} onDone={() => { setMode(null); load(); }} onCancel={() => setMode(null)} />}
    </>
  );

  return (
    <AppLayout title="Materialien">
      <SubjectSuggestions.Provider value={subjectSuggestions}>
        {!list ? <Spinner /> : group ? (
          // ---- Ein Fach geöffnet: Einträge vom Ältesten (oben) zum Neuesten (unten)
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <button onClick={() => openSubject(null)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 -ml-2 text-sm text-mint hover:bg-subtle">
                <ChevronLeft size={18} /> Alle Fächer
              </button>
            </div>
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h2 data-noi18n={group.id !== subjectKey(NO_SUBJECT) ? '' : undefined} className="font-display text-2xl text-ivory break-words">{group.name}</h2>
                <p className="text-xs text-sage-muted mt-0.5">
                  {group.items.length} {group.items.length === 1 ? 'Eintrag' : 'Einträge'} · {group.files} {group.files === 1 ? 'Datei' : 'Dateien'} · Älteste oben, Neueste unten
                </p>
              </div>
              {group.items.length > 3 && (
                <button
                  onClick={() => document.getElementById('mat-end')?.scrollIntoView({ behavior: scrollBehavior(), block: 'end' })}
                  className="inline-flex items-center gap-1 text-xs text-mint hover:underline"
                >
                  <ArrowDown size={14} /> Zum Neuesten
                </button>
              )}
            </div>
            <ol className="space-y-3">
              {group.items.map((m, i) => (
                <li key={m.id}>
                  <MaterialBlock m={m} index={i + 1} onChange={replace} onDelete={() => remove(m)} />
                </li>
              ))}
            </ol>
            <div id="mat-end" />
            {isManager && !mode && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button onClick={() => setMode('new')}><Plus size={18} /> Neuen Eintrag hinzufügen</Button>
                <Button variant="outline" onClick={() => setMode('bulk')}><UploadCloud size={18} /> Viele Dateien einzeln</Button>
              </div>
            )}
            {forms}
          </div>
        ) : (
          // ---- Übersicht: Fächer als Ordner
          <>
            {isManager && (
              <div className="flex justify-end gap-2 mb-4 flex-wrap">
                <Button variant="outline" onClick={() => setMode((m) => (m === 'bulk' ? null : 'bulk'))}><UploadCloud size={18} /> Viele einzeln</Button>
                <Button onClick={() => setMode((m) => (m === 'new' ? null : 'new'))}><Plus size={18} /> Neuer Block</Button>
              </div>
            )}
            {forms}
            {list.length === 0 ? (
              <Card className="p-8 text-center text-sage-muted">
                <FolderOpen size={32} className="mx-auto mb-3 opacity-50" />
                Noch keine Materialien. Hier erscheinen Dateien und Links, die deine Klasse zum Lernen bereitgestellt bekommt{isManager ? ' – oben rechts hochladen.' : '.'}
              </Card>
            ) : (
              <>
                <p className="text-sm text-sage-muted mb-3">Fach antippen, um die Dateien zu sehen.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => openSubject(g.id)}
                      className="group text-left rounded-2xl border border-line/70 bg-card p-4 flex items-center gap-3 shadow-card hover:border-mint/50 hover:bg-subtle/50 transition"
                    >
                      <span className="grid place-items-center h-12 w-12 shrink-0 rounded-xl bg-mint/15 text-mint">
                        <Folder size={24} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span data-noi18n={g.id !== subjectKey(NO_SUBJECT) ? '' : undefined} className="font-medium text-ivory truncate">{g.name}</span>
                          {g.fresh > 0 && <Badge tone="mint">{g.fresh} neu</Badge>}
                        </span>
                        <span className="block text-xs text-sage-muted mt-0.5">
                          {g.items.length} {g.items.length === 1 ? 'Eintrag' : 'Einträge'} · {g.files} {g.files === 1 ? 'Datei' : 'Dateien'}
                        </span>
                        <span className="block text-caption text-sage-muted">Zuletzt {fmt(g.last)}</span>
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-sage-muted group-hover:text-mint" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </SubjectSuggestions.Provider>
    </AppLayout>
  );
}

function fileIcon(f) {
  return String(f.mediaType || '').startsWith('image') ? ImageIcon : FileText;
}

function MaterialBlock({ m, index, onChange, onDelete }) {
  const [editing, setEditing] = useState(false);
  const files = m.files || [];
  const changed = m.updatedAt && m.updatedAt.slice(0, 10) !== m.createdAt.slice(0, 10);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0">
          <span className="grid place-items-center h-9 w-9 rounded-lg bg-mint/15 text-mint shrink-0 text-sm font-semibold tabular-nums">{index}</span>
          <div className="min-w-0">
            <div className="text-ivory font-medium break-words">{m.title} {isNew(m.createdAt) && <Badge tone="mint">Neu</Badge>}</div>
            <div className="text-xs text-sage-muted">
              {m.className} · {fmt(m.createdAt)}{changed ? ` · ergänzt ${fmt(m.updatedAt)}` : ''}{m.createdByName ? ` · ${m.createdByName}` : ''}
            </div>
          </div>
        </div>
        {m.canEdit && !editing && (
          <div className="flex shrink-0 gap-1">
            <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg text-sage hover:bg-subtle" aria-label="Bearbeiten"><Pencil size={16} /></button>
            <button onClick={onDelete} className="p-1.5 rounded-lg text-status-absent hover:bg-subtle" aria-label="Löschen"><Trash2 size={16} /></button>
          </div>
        )}
      </div>

      {editing ? (
        <EditBlock m={m} onSaved={(nm) => onChange(nm)} onClose={() => setEditing(false)} />
      ) : (
        <>
          {m.description && <p data-noi18n className="text-sage text-sm mt-2 whitespace-pre-line">{m.description}</p>}
          {m.body && <p data-noi18n className="text-sage text-sm mt-2 whitespace-pre-line rounded-lg bg-subtle border border-line p-3">{m.body}</p>}
          {m.url && (
            <a href={m.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-mint-light text-sm hover:underline break-all">
              <LinkIcon size={14} /> {m.url.replace(/^https?:\/\//, '').slice(0, 60)} <ExternalLink size={13} />
            </a>
          )}
          {files.length > 0 && (
            <ul className="mt-3 space-y-2">
              {files.map((f) => {
                const isPdf = f.mediaType === 'application/pdf' || /\.pdf$/i.test(f.name || '');
                return (
                  <li key={f.id} className={String(f.mediaType || '').startsWith('image') ? '' : 'flex items-center gap-2 flex-wrap rounded-lg border border-line px-3 py-2'}>
                    <FileAttachment
                      url={f.url}
                      name={f.name}
                      mediaType={f.mediaType}
                      icon={fileIcon(f)}
                      notesPath={isPdf ? `/materials/${m.id}/files/${f.id}/annotations` : null}
                      canAnnotate={isPdf && m.canEdit}
                    />
                    {f.annotations > 0 && <Badge tone="mint"><PenLine size={11} className="inline -mt-0.5" /> mit Notizen</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

// Dateien sammeln: mehrere auf einmal auswählen, einzeln wieder entfernen.
function FilePicker({ files, setFiles, label = 'Dateien hinzufügen' }) {
  const inputRef = useRef(null);
  const add = (list) => {
    const arr = Array.from(list || []);
    setFiles((prev) => {
      const key = (f) => `${f.name}:${f.size}`;
      const have = new Set(prev.map(key));
      return [...prev, ...arr.filter((f) => !have.has(key(f)))];
    });
    if (inputRef.current) inputRef.current.value = '';
  };
  const total = files.reduce((s, f) => s + f.size, 0);
  return (
    <div>
      <input ref={inputRef} type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={(e) => add(e.target.files)} />
      <button type="button" onClick={() => inputRef.current?.click()} className="w-full rounded-xl border-2 border-dashed border-line px-4 py-4 text-sm text-sage hover:bg-subtle flex items-center justify-center gap-2">
        <UploadCloud size={18} /> {label} <span className="text-sage-muted">(PDF/Bild, mehrere möglich)</span>
      </button>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}:${f.size}`} className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-sm">
              <FileText size={15} className="text-mint shrink-0" />
              <span className="min-w-0 flex-1 truncate text-ivory">{f.name}</span>
              <span className="text-xs text-sage-muted shrink-0">{mb(f.size)}</span>
              <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="p-1 text-sage-muted hover:text-status-absent" aria-label="Entfernen"><X size={15} /></button>
            </li>
          ))}
          <li className="text-xs text-sage-muted px-1">{files.length} Datei{files.length === 1 ? '' : 'en'} · {mb(total)}</li>
        </ul>
      )}
    </div>
  );
}

// Fach frei eintippen ODER einen Vorschlag antippen (Standardfächer + schon
// benutzte). Antippen ersetzt den Text; erneutes Antippen leert ihn.
function SubjectInput({ value, onChange }) {
  const suggestions = useContext(SubjectSuggestions);
  const cur = subjectKey(value);
  return (
    <div className="block sm:col-span-2">
      <label className="block">
        <span className="text-sm text-sage">Fach / Thema</span>
        <input className="input mt-1" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Vorschlag antippen oder selbst eintragen" maxLength={60} />
      </label>
      {suggestions.length > 0 && (
        <div className="mt-2 flex gap-1.5 flex-wrap">
          {suggestions.map((s) => {
            const on = value.trim() && subjectKey(s) === cur;
            return (
              <button
                key={s}
                type="button"
                onClick={() => onChange(on ? '' : s)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${on ? 'border-mint bg-mint text-white' : 'border-line text-sage hover:bg-subtle'}`}
              >
                {s}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Neuer Block: ein Thema mit beliebig vielen Dateien (z. B. Biografie +
// Hausaufgabe + Lösung), optional Link und Text.
function NewBlockForm({ user, initialSubject = '', onDone, onCancel }) {
  const toast = useToast();
  const isAdmin = ADMIN.includes(user.role);
  const [classes, setClasses] = useState([]);
  const [f, setF] = useState({ title: '', description: '', classId: '', subjectName: initialSubject, url: '', body: '' });
  const [files, setFiles] = useState([]);
  const [extra, setExtra] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/classes').then((d) => { setClasses(d.classes); setF((x) => ({ ...x, classId: d.classes[0]?.id || '' })); });
  }, []);

  const submit = async () => {
    if (!f.title.trim()) return toast.push('Bitte einen Titel eingeben', 'error');
    if (!files.length && !f.url.trim() && !f.body.trim()) return toast.push('Bitte mindestens eine Datei, einen Link oder einen Text hinzufügen', 'error');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('title', f.title.trim());
      fd.set('description', f.description);
      if (f.classId) fd.set('classId', f.classId);
      if (f.subjectName.trim()) fd.set('subjectName', f.subjectName.trim());
      if (f.url.trim()) fd.set('url', f.url.trim());
      if (f.body.trim()) fd.set('body', f.body.trim());
      files.forEach((file) => fd.append('files', file));
      const res = await api.upload('/materials', fd);
      toast.push('Material geteilt', 'success');
      onDone(res.material);
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5 mb-4">
      <CardHeader title="Neuer Block" subtitle="Ein Thema mit allen zugehörigen Dateien – z. B. Text, Hausaufgabe und Lösung zusammen" icon={FolderOpen} />
      <div className="space-y-3">
        <label className="block">
          <span className="text-sm text-sage">Titel</span>
          <input className="input mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="z. B. Biografie Abu Bakr" maxLength={160} />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SubjectInput value={f.subjectName} onChange={(v) => setF({ ...f, subjectName: v })} />
          <label className="block">
            <span className="text-sm text-sage">Klasse</span>
            <select className="input mt-1" value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}>
              {isAdmin && <option value="">Schulweit</option>}
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-sm text-sage">Beschreibung (optional)</span>
          <textarea className="input mt-1" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </label>
        <FilePicker files={files} setFiles={setFiles} />
        {!extra ? (
          <button type="button" onClick={() => setExtra(true)} className="text-sm text-mint-light hover:underline">+ Link oder Text hinzufügen</button>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            <label className="block">
              <span className="text-sm text-sage">Link (optional, z. B. YouTube)</span>
              <input className="input mt-1" placeholder="https://…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm text-sage">Text (optional)</span>
              <textarea className="input mt-1" rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
            </label>
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy}><UploadCloud size={18} /> {busy ? 'Lädt hoch …' : 'Teilen'}</Button>
          <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
        </div>
      </div>
    </Card>
  );
}

// Nachträglich bearbeiten: Texte ändern, Dateien ergänzen oder entfernen.
function EditBlock({ m, onSaved, onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ title: m.title, description: m.description || '', subjectName: m.subjectName || '', url: m.url || '', body: m.body || '' });
  const [newFiles, setNewFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      let res = await api.patch(`/materials/${m.id}`, f);
      if (newFiles.length) {
        const fd = new FormData();
        newFiles.forEach((file) => fd.append('files', file));
        res = await api.upload(`/materials/${m.id}/files`, fd);
      }
      onSaved(res.material);
      toast.push(newFiles.length ? 'Gespeichert – Dateien ergänzt' : 'Gespeichert', 'success');
      onClose();
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeFile = async (file) => {
    if (!window.confirm(`„${file.name}“ aus diesem Block entfernen?`)) return;
    try {
      const res = await api.del(`/materials/${m.id}/files/${file.id}`);
      onSaved(res.material);
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      <label className="block">
        <span className="text-sm text-sage">Titel</span>
        <input className="input mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={160} />
      </label>
      <SubjectInput value={f.subjectName} onChange={(v) => setF({ ...f, subjectName: v })} />
      <label className="block">
        <span className="text-sm text-sage">Beschreibung</span>
        <textarea className="input mt-1" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </label>
      <label className="block">
        <span className="text-sm text-sage">Link (optional)</span>
        <input className="input mt-1" placeholder="https://…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
      </label>
      <label className="block">
        <span className="text-sm text-sage">Text (optional)</span>
        <textarea className="input mt-1" rows={2} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      </label>
      {(m.files || []).length > 0 && (
        <div>
          <span className="text-sm text-sage">Dateien in diesem Block</span>
          <ul className="mt-1 space-y-1.5">
            {m.files.map((file) => (
              <li key={file.id} className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-sm">
                <FileText size={15} className="text-mint shrink-0" />
                <span className="min-w-0 flex-1 truncate text-ivory">{file.name}</span>
                <button type="button" onClick={() => removeFile(file)} className="p-1 text-sage-muted hover:text-status-absent" aria-label="Datei entfernen"><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <FilePicker files={newFiles} setFiles={setNewFiles} label="Weitere Dateien hinzufügen" />
      <div className="flex gap-2">
        <Button onClick={save} disabled={busy}><Check size={18} /> {busy ? 'Speichert …' : 'Speichern'}</Button>
        <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
      </div>
    </div>
  );
}

// Massen-Upload: viele PDFs/Bilder auf einmal, jede Datei wird ein eigener
// Block (Titel = Dateiname) -- z. B. für ein Archiv alter Protokolle.
function BulkForm({ user, initialSubject = '', onDone, onCancel }) {
  const toast = useToast();
  const isAdmin = ADMIN.includes(user.role);
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [subjectName, setSubjectName] = useState(initialSubject);
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/classes').then((d) => { setClasses(d.classes); setClassId(d.classes[0]?.id || ''); });
  }, []);

  const submit = async () => {
    if (files.length === 0) return toast.push('Bitte Dateien auswählen', 'error');
    setBusy(true);
    try {
      const fd = new FormData();
      if (classId) fd.set('classId', classId);
      if (subjectName.trim()) fd.set('subjectName', subjectName.trim());
      if (description.trim()) fd.set('description', description.trim());
      files.forEach((f) => fd.append('files', f));
      const res = await api.upload('/materials/bulk', fd);
      toast.push(`${res.count} Datei${res.count === 1 ? '' : 'en'} hochgeladen`, 'success');
      onDone();
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5 mb-4">
      <CardHeader title="Viele Dateien einzeln" subtitle="Jede Datei wird ein eigener Eintrag (Titel = Dateiname). Für ein Thema mit mehreren Dateien: „Neuer Block“." icon={UploadCloud} />
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-sage">Klasse</span>
            <select className="input mt-1" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {isAdmin && <option value="">Schulweit</option>}
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <SubjectInput value={subjectName} onChange={setSubjectName} />
        </div>
        <label className="block">
          <span className="text-sm text-sage">Beschreibung für alle (optional)</span>
          <input className="input mt-1" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="z. B. Protokolle Oktober" />
        </label>
        <FilePicker files={files} setFiles={setFiles} label="Dateien auswählen" />
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy || files.length === 0}><UploadCloud size={18} /> {busy ? 'Lädt hoch …' : 'Alle hochladen'}</Button>
          <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
        </div>
      </div>
    </Card>
  );
}
