import { useEffect, useState } from 'react';
import { CheckSquare, EyeOff, ListChecks } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, StatusBadge, Spinner, useToast, FileAttachment, useSelection, useLongPress, SelectCheck, SelectionBar } from '../components/ui.jsx';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export default function Korrektur() {
  const [list, setList] = useState(null);
  const toast = useToast();
  const selection = useSelection();
  const load = () => api.get('/review-queue').then((d) => setList(d.submissions));
  const hide = async (ids) => {
    try {
      await api.post('/review-queue/hide', { ids });
      toast.push(`${ids.length} Abgabe(n) ausgeblendet – Bewertungen und Statistiken bleiben erhalten`, 'success');
      selection.clear();
      load();
    } catch (err) { toast.push(err.message, 'error'); }
  };
  useEffect(() => { load(); }, []);

  if (!list) return <AppLayout title="Korrektur"><Spinner /></AppLayout>;
  const open = list.filter((s) => s.status === 'submitted');
  const done = list.filter((s) => s.status !== 'submitted');

  return (
    <AppLayout title="Korrektur">
      <Card className="p-5 mb-4">
        <CardHeader title="Offene Abgaben" subtitle={`${open.length} warten auf Korrektur`} icon={CheckSquare} />
      </Card>
      <div className="space-y-3">
        {open.length === 0 && <Card className="p-6 text-sage-muted">Keine offenen Abgaben.</Card>}
        {open.map((s) => <ReviewCard key={s.id} sub={s} onDone={load} />)}
      </div>

      {done.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-8 mb-2">
            <h3 className="text-sm text-sage-muted">Bereits bewertet ({done.length})</h3>
            {!selection.active && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => selection.start()}><ListChecks size={15} /> Auswählen</Button>
                <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Alle ${done.length} bewerteten Abgaben aus dieser Liste ausblenden? Bewertungen und Statistiken bleiben erhalten.`)) hide(done.map((s) => s.id)); }}>
                  <EyeOff size={15} /> Alle ausblenden
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {done.map((s) => <DoneRow key={s.id} s={s} selection={selection} />)}
          </div>
          <SelectionBar
            selection={selection}
            allIds={done.map((s) => s.id)}
            actions={[{ label: 'Ausblenden', icon: EyeOff, onClick: () => hide([...selection.ids]) }]}
          />
        </>
      )}
    </AppLayout>
  );
}

function DoneRow({ s, selection }) {
  const longPress = useLongPress(() => selection.start(s.id));
  const selected = selection.has(s.id);
  return (
    <Card
      {...longPress.handlers}
      onClick={() => { if (longPress.wasLongPress()) return; if (selection.active) selection.toggle(s.id); }}
      className={`p-3 flex items-center justify-between gap-3 select-none ${selection.active ? 'cursor-pointer' : ''} ${selected ? 'border-mint/60 bg-mint/5' : ''}`}
    >
      {selection.active && <SelectCheck checked={selected} />}
      <div className="text-sm min-w-0 flex-1 truncate"><span className="text-ivory">{s.studentName}</span> <span className="text-sage-muted">· {s.assignmentTitle}</span></div>
      <StatusBadge status={s.status} />
    </Card>
  );
}

function ReviewCard({ sub, onDone }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ outcome: 'passed', gradeLabel: '', feedbackText: '', tajwid: '', pronunciation: '', fluency: '', memorization: '', errorCount: '' });

  const save = async () => {
    try {
      await api.post(`/submissions/${sub.id}/review`, form);
      toast.push('Bewertung gespeichert', 'success');
      onDone();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-ivory">{sub.studentName}</div>
          <div className="text-xs text-sage-muted">{sub.assignmentTitle} · {sub.className} · {fmt(sub.submittedAt)}</div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>{open ? 'Schließen' : 'Bewerten'}</Button>
      </div>

      {sub.text && <p className="text-sage text-sm mt-3 whitespace-pre-line">{sub.text}</p>}
      {sub.files?.length > 0 && (
        <div className="mt-3 space-y-2">
          {sub.files.map((f) => (
            <div key={f.id}><FileAttachment url={`/api/submissions/${sub.id}/file/${f.id}`} name={f.originalName} mediaType={f.mediaType} /></div>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-4 border-t border-line pt-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[['tajwid', 'Tajwid'], ['pronunciation', 'Aussprache'], ['fluency', 'Flüssigkeit'], ['memorization', 'Hifz'], ['errorCount', 'Fehler']].map(([k, l]) => (
              <label key={k} className="block">
                <span className="text-[11px] text-sage-muted">{l}</span>
                <input type="number" className="input py-1.5" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-sage">Bewertung/Note (optional)</span>
              <input className="input mt-1" value={form.gradeLabel} onChange={(e) => setForm({ ...form, gradeLabel: e.target.value })} placeholder="z. B. sehr gut" />
            </label>
            <label className="block">
              <span className="text-sm text-sage">Ergebnis</span>
              <select className="input mt-1" value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })}>
                <option value="passed">Bestanden</option>
                <option value="revision">Überarbeiten</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-sm text-sage">Textfeedback</span>
            <textarea className="input mt-1" rows={3} value={form.feedbackText} onChange={(e) => setForm({ ...form, feedbackText: e.target.value })} />
          </label>
          <Button onClick={save}>Feedback freigeben</Button>
        </div>
      )}
    </Card>
  );
}
