import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, Plus, Trash2 } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, StatusBadge, Spinner, useToast } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];

export default function Pruefungen() {
  const { user } = useAuth();
  return <AppLayout title="Prüfungen">{MANAGER.includes(user.role) ? <ManagerView /> : <StudentView />}</AppLayout>;
}

function StudentView() {
  const [list, setList] = useState(null);
  useEffect(() => { api.get('/exams').then((d) => setList(d.exams)); }, []);
  if (!list) return <Spinner />;
  if (!list.length) return <Card className="p-6 text-sage-muted">Aktuell sind keine Prüfungen verfügbar.</Card>;
  return (
    <div className="space-y-3">
      {list.map((e) => (
        <Link key={e.id} to={`/pruefung/${e.id}`}>
          <Card className="p-4 hover:bg-hover transition flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-ivory truncate">{e.title}</div>
              <div className="text-xs text-sage-muted">{e.subjectName || 'Prüfung'} · {e.questionCount} Fragen</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {e.result && <span className="font-mono text-sm text-mint-light">{e.result.total}/{e.result.max}</span>}
              <StatusBadge status={e.studentStatus === 'open' ? 'not_opened' : e.studentStatus} />
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function ManagerView() {
  const [list, setList] = useState(null);
  const [creating, setCreating] = useState(false);
  const load = () => api.get('/exams').then((d) => setList(d.exams));
  useEffect(() => { load(); }, []);

  if (creating) return <CreateExam onDone={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />;
  if (!list) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setCreating(true)}><Plus size={18} /> Neue Prüfung</Button></div>
      {list.length === 0 ? (
        <Card className="p-6 text-sage-muted">Noch keine Prüfungen erstellt.</Card>
      ) : (
        list.map((e) => (
          <Link key={e.id} to={`/pruefung/${e.id}`}>
            <Card className="p-4 hover:bg-hover transition flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-ivory truncate">{e.title}</div>
                <div className="text-xs text-sage-muted">{e.className} · {e.subjectName || 'Prüfung'} · {e.questionCount} Fragen</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge tone={e.status === 'published' ? 'present' : 'neutral'}>{e.status === 'published' ? 'Veröffentlicht' : 'Entwurf'}</Badge>
                {e.pendingGrading > 0 && <Badge tone="late">{e.pendingGrading} zu bewerten</Badge>}
              </div>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}

function CreateExam({ onDone, onCancel }) {
  const toast = useToast();
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [meta, setMeta] = useState({ classId: '', subjectId: '', title: '', description: '', passPercentage: 50 });
  const [questions, setQuestions] = useState([blankQuestion()]);

  useEffect(() => {
    api.get('/classes').then((d) => { setClasses(d.classes); setMeta((m) => ({ ...m, classId: d.classes[0]?.id || '' })); });
    api.get('/subjects').then((d) => setSubjects(d.subjects));
  }, []);

  const save = async (publish) => {
    try {
      const payload = {
        ...meta,
        passPercentage: Number(meta.passPercentage),
        questions: questions.map((q) => ({
          type: q.type,
          prompt: q.prompt,
          points: Number(q.points),
          options: q.type === 'text' ? [] : q.options.map((o) => ({ text: o.text })),
          correct: q.type === 'text' ? [] : q.correct,
        })),
      };
      const { exam } = await api.post('/exams', payload);
      if (publish) await api.post(`/exams/${exam.id}/publish`);
      toast.push(publish ? 'Prüfung veröffentlicht' : 'Entwurf gespeichert', 'success');
      onDone();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <CardHeader title="Neue Prüfung" icon={GraduationCap} />
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Titel"><input className="input" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></Field>
          <Field label="Bestehensgrenze (%)"><input type="number" className="input" value={meta.passPercentage} onChange={(e) => setMeta({ ...meta, passPercentage: e.target.value })} /></Field>
          <Field label="Klasse">
            <select className="input" value={meta.classId} onChange={(e) => setMeta({ ...meta, classId: e.target.value })}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Fach">
            <select className="input" value={meta.subjectId} onChange={(e) => setMeta({ ...meta, subjectId: e.target.value })}>
              <option value="">– Fach –</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2"><Field label="Beschreibung"><textarea className="input" rows={2} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} /></Field></div>
        </div>
      </Card>

      {questions.map((q, i) => (
        <QuestionEditor key={i} q={q} index={i}
          onChange={(nq) => setQuestions((arr) => arr.map((x, j) => (j === i ? nq : x)))}
          onRemove={() => setQuestions((arr) => arr.filter((_, j) => j !== i))} />
      ))}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setQuestions((arr) => [...arr, blankQuestion()])}><Plus size={18} /> Frage hinzufügen</Button>
        <div className="flex-1" />
        <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
        <Button variant="outline" onClick={() => save(false)}>Entwurf</Button>
        <Button onClick={() => save(true)}>Veröffentlichen</Button>
      </div>
    </div>
  );
}

function blankQuestion() {
  return { type: 'single', prompt: '', points: 1, options: [{ text: '' }, { text: '' }], correct: [] };
}

function QuestionEditor({ q, index, onChange, onRemove }) {
  const setType = (type) => onChange({ ...q, type, correct: [], options: type === 'text' ? [] : q.options.length ? q.options : [{ text: '' }, { text: '' }] });
  const toggleCorrect = (i) => {
    if (q.type === 'single') onChange({ ...q, correct: [i] });
    else onChange({ ...q, correct: q.correct.includes(i) ? q.correct.filter((x) => x !== i) : [...q.correct, i] });
  };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-sm text-sage-muted">Frage {index + 1}</span>
        <div className="flex items-center gap-2">
          <select className="input py-1.5 w-auto text-sm" value={q.type} onChange={(e) => setType(e.target.value)}>
            <option value="single">Einfachauswahl</option>
            <option value="multi">Mehrfachauswahl</option>
            <option value="text">Freitext</option>
          </select>
          <input type="number" className="input py-1.5 w-16 text-sm" value={q.points} onChange={(e) => onChange({ ...q, points: e.target.value })} title="Punkte" />
          <button onClick={onRemove} className="text-status-absent p-1.5" aria-label="Frage entfernen"><Trash2 size={16} /></button>
        </div>
      </div>
      <textarea className="input" rows={2} placeholder="Fragetext" value={q.prompt} onChange={(e) => onChange({ ...q, prompt: e.target.value })} />
      {q.type !== 'text' && (
        <div className="mt-3 space-y-2">
          {q.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <button onClick={() => toggleCorrect(i)} className={['h-6 w-6 rounded border grid place-items-center text-xs', q.correct.includes(i) ? 'bg-mint border-mint text-sidebar' : 'border-black/15 text-transparent'].join(' ')} title="Als richtig markieren">✓</button>
              <input className="input py-1.5" placeholder={`Option ${i + 1}`} value={o.text} onChange={(e) => onChange({ ...q, options: q.options.map((x, j) => (j === i ? { text: e.target.value } : x)) })} />
              {q.options.length > 2 && <button onClick={() => onChange({ ...q, options: q.options.filter((_, j) => j !== i), correct: q.correct.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c)) })} className="text-status-absent p-1"><Trash2 size={14} /></button>}
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => onChange({ ...q, options: [...q.options, { text: '' }] })}><Plus size={14} /> Option</Button>
        </div>
      )}
    </Card>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-sm text-sage">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
