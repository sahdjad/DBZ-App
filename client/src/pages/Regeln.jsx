import { useEffect, useState } from 'react';
import { BookText, Scale, Pencil, Save, X } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, Spinner, useToast } from '../components/ui.jsx';

export default function Regeln() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [classId, setClassId] = useState('');

  const load = (cid) => {
    const q = cid ? `?classId=${cid}` : '';
    api.get(`/rules${q}`).then((d) => { setData(d); setClassId(d.classId || ''); }).catch(() => setData({ error: true }));
  };
  useEffect(() => { load(); }, []);

  if (!data) return <AppLayout title="Regeln & Strafen"><Spinner /></AppLayout>;

  return (
    <AppLayout title="Regeln & Strafen">
      <div className="space-y-4">
        {data.classes?.length > 1 && (
          <select className="input w-auto" value={classId} onChange={(e) => { setClassId(e.target.value); setData(null); load(e.target.value); }}>
            {data.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <RulesCard data={data} onReload={() => load(classId)} toast={toast} />
        <CatalogCard data={data} onReload={() => load(classId)} toast={toast} />
      </div>
    </AppLayout>
  );
}

// --- Klassenregeln (Freitext) ------------------------------------------------
function RulesCard({ data, onReload, toast }) {
  const [edit, setEdit] = useState(false);
  const [scope, setScope] = useState('class'); // 'class' | 'school'
  const [text, setText] = useState(data.rules.text);
  const [busy, setBusy] = useState(false);
  const canEdit = data.canEditClass || data.canEditSchool;

  const start = () => { setText(data.rules.text); setScope(data.canEditClass ? 'class' : 'school'); setEdit(true); };
  const save = async () => {
    setBusy(true);
    try {
      if (scope === 'school') await apiPut('/rules/text', { text });
      else await apiPut(`/rules/text/${data.classId}`, { text });
      toast.push('Regeln gespeichert', 'success');
      setEdit(false);
      onReload();
    } catch (err) { toast.push(err.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <Card className="p-5">
      <CardHeader title="Klassenregeln" subtitle={data.className || 'Koran-Schule'} icon={BookText}
        action={canEdit && !edit ? <Button size="sm" variant="outline" onClick={start}><Pencil size={15} /> Bearbeiten</Button> : null} />
      <div className="p-4">
        {edit ? (
          <div className="space-y-3">
            <ScopePicker data={data} scope={scope} setScope={setScope} />
            <textarea className="input" rows={16} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={busy}><Save size={15} /> Speichern</Button>
              <Button size="sm" variant="ghost" onClick={() => setEdit(false)}><X size={15} /> Abbrechen</Button>
            </div>
          </div>
        ) : (
          <>
            {data.rules.isClassSpecific && <Badge tone="present">Eigene Regeln dieser Klasse</Badge>}
            <p className="text-sage text-sm whitespace-pre-line mt-2 leading-relaxed">{data.rules.text}</p>
          </>
        )}
      </div>
    </Card>
  );
}

// --- Strafenkatalog ----------------------------------------------------------
function CatalogCard({ data, onReload, toast }) {
  const [edit, setEdit] = useState(false);
  const [scope, setScope] = useState('class');
  const [vals, setVals] = useState({}); // itemId -> consequence (nur beim Bearbeiten)
  const [busy, setBusy] = useState(false);
  const canEdit = data.canEditClass || data.canEditSchool;

  const start = () => {
    const init = {};
    data.catalog.forEach((cat) => cat.items.forEach((it) => { init[it.id] = it.consequence; }));
    setVals(init);
    setScope(data.canEditClass ? 'class' : 'school');
    setEdit(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      // Nur Abweichungen von der geerbten Ebene senden (hält Overrides minimal).
      const overrides = {};
      data.catalog.forEach((cat) => cat.items.forEach((it) => {
        const base = scope === 'school' ? it.defaultConsequence : (it.schoolConsequence ?? it.defaultConsequence);
        const v = (vals[it.id] || '').trim();
        if (v && v !== base) overrides[it.id] = v;
      }));
      if (scope === 'school') await apiPut('/rules/catalog', { overrides });
      else await apiPut(`/rules/catalog/${data.classId}`, { overrides });
      toast.push('Strafenkatalog gespeichert', 'success');
      setEdit(false);
      onReload();
    } catch (err) { toast.push(err.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <Card className="p-5">
      <CardHeader title="Strafenkatalog" subtitle="Was passiert bei welchem Verstoß" icon={Scale}
        action={canEdit && !edit ? <Button size="sm" variant="outline" onClick={start}><Pencil size={15} /> Anpassen</Button> : null} />
      <div className="p-4 space-y-5">
        {edit && <ScopePicker data={data} scope={scope} setScope={setScope} />}
        {data.catalog.map((cat) => (
          <div key={cat.id}>
            <div className="text-ivory font-medium">{cat.title}</div>
            <div className="divide-y divide-line mt-1">
              {cat.items.map((it) => (
                <div key={it.id} className="py-2 flex items-start justify-between gap-3">
                  <span className="text-sm text-sage flex-1">{it.label}</span>
                  {edit ? (
                    <input className="input py-1 text-sm w-44 sm:w-56" value={vals[it.id] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [it.id]: e.target.value }))} />
                  ) : (
                    <span className="text-sm font-medium text-mint-light text-right shrink-0 inline-flex items-center gap-1">
                      {it.consequence}
                      {it.classConsequence != null && <Badge tone="present">Klasse</Badge>}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {cat.note && <p className="text-[11px] text-sage-muted mt-1">{cat.note}</p>}
          </div>
        ))}
        {edit && (
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy}><Save size={15} /> Speichern</Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(false)}><X size={15} /> Abbrechen</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// Umfang der Änderung: nur diese Klasse oder schulweit (je nach Rechten).
function ScopePicker({ data, scope, setScope }) {
  if (!(data.canEditClass && data.canEditSchool)) {
    return (
      <p className="text-[11px] text-sage-muted">
        Änderungen gelten {data.canEditSchool ? 'für die ganze Koran-Schule' : `nur für die Klasse „${data.className}"`}.
      </p>
    );
  }
  return (
    <div className="inline-flex items-center gap-1 text-xs">
      <span className="text-sage-muted mr-1">Gilt für</span>
      {[['class', `nur „${data.className}"`], ['school', 'ganze Koran-Schule']].map(([v, l]) => (
        <button key={v} type="button" onClick={() => setScope(v)}
          className={['px-2.5 py-1 rounded-md border', scope === v ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage-muted'].join(' ')}>{l}</button>
      ))}
    </div>
  );
}

// Kleiner PUT-Helfer (die api-lib hat post/patch/del – PUT ergänzen wir hier).
async function apiPut(path, body) {
  const res = await fetch(`/api${path}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error(d?.error || `Fehler ${res.status}`);
  return d;
}
