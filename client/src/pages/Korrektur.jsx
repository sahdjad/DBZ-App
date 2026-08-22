import { useEffect, useState } from 'react';
import { CheckSquare, Paperclip, Play } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, StatusBadge, Spinner, useToast } from '../components/ui.jsx';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export default function Korrektur() {
  const [list, setList] = useState(null);
  const load = () => api.get('/review-queue').then((d) => setList(d.submissions));
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
          <h3 className="text-sm text-sage-muted mt-8 mb-2">Bereits bewertet</h3>
          <div className="space-y-2">
            {done.map((s) => (
              <Card key={s.id} className="p-3 flex items-center justify-between gap-3">
                <div className="text-sm"><span className="text-ivory">{s.studentName}</span> <span className="text-sage-muted">· {s.assignmentTitle}</span></div>
                <StatusBadge status={s.status} />
              </Card>
            ))}
          </div>
        </>
      )}
    </AppLayout>
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
            f.mediaType?.startsWith('audio') ? (
              <audio key={f.id} controls src={`/api/submissions/${sub.id}/file/${f.id}`} className="w-full h-9" />
            ) : (
              <a key={f.id} href={`/api/submissions/${sub.id}/file/${f.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-mint-light text-sm hover:underline">
                <Paperclip size={16} /> {f.originalName}
              </a>
            )
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
