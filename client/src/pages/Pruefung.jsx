import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, GraduationCap, CheckCircle2, Clock, Send, ExternalLink } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, StatusBadge, Spinner, useToast } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];

export default function Pruefung() {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <AppLayout title="Prüfung">
      <button onClick={() => navigate('/pruefungen')} className="inline-flex items-center gap-2 text-sm text-sage-muted hover:text-ivory mb-4">
        <ArrowLeft size={16} /> Zu den Prüfungen
      </button>
      {MANAGER.includes(user.role) ? <ManagerExam /> : <StudentExam />}
    </AppLayout>
  );
}

// --- Schüler -----------------------------------------------------------------
function StudentExam() {
  const { id } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/exams/${id}`).then(setData);
  useEffect(() => {
    (async () => {
      const d = await api.get(`/exams/${id}`);
      setData(d);
      // Nur bei echten Frage-Prüfungen einen Versuch anlegen (Link-Prüfungen brauchen keinen).
      if (d.exam.questions?.length && (!d.attempt || d.attempt.status === 'in_progress')) {
        await api.post(`/exams/${id}/attempt`);
      }
    })();
    // eslint-disable-next-line
  }, [id]);

  if (!data) return <Spinner />;
  const { exam, attempt, passPercentage } = data;

  // Ergebnis (freigegeben)
  if (attempt && attempt.status === 'released') {
    const solById = Object.fromEntries((attempt.solutions || []).map((s) => [s.id, s.correct]));
    return (
      <Card className="p-5">
        <CardHeader
          title={exam.title}
          subtitle={`Ergebnis: ${attempt.total}/${attempt.max} Punkte (${attempt.percent}%)`}
          icon={GraduationCap}
          action={<Badge tone={attempt.passed ? 'present' : 'absent'}>{attempt.passed ? 'Bestanden' : 'Nicht bestanden'}</Badge>}
        />
        <div className="p-4 space-y-4">
          {exam.questions.map((q, i) => {
            const myAns = (attempt.answers || []).find((a) => a.questionId === q.id) || {};
            const correct = solById[q.id] || [];
            return (
              <div key={q.id} className="rounded-lg border border-black/10 p-3">
                <div className="text-ivory mb-2">{i + 1}. {q.prompt} <span className="text-xs text-sage-muted">({q.points} P)</span></div>
                {q.type === 'text' ? (
                  <p className="text-sage text-sm whitespace-pre-line">{myAns.text || '—'}{typeof myAns.awardedPoints === 'number' ? ` · ${myAns.awardedPoints}/${q.points} P` : ''}</p>
                ) : (
                  <div className="space-y-1">
                    {q.options.map((o) => {
                      const chosen = (myAns.selected || []).includes(o.id);
                      const isCorrect = correct.includes(o.id);
                      return (
                        <div key={o.id} className={['text-sm px-2 py-1 rounded flex items-center gap-2', isCorrect ? 'text-status-present' : chosen ? 'text-status-absent' : 'text-sage'].join(' ')}>
                          <span>{isCorrect ? '✓' : chosen ? '✗' : '·'}</span> {o.text}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    );
  }

  // Abgegeben, wartet auf Freigabe
  if (attempt && attempt.status === 'submitted') {
    return (
      <Card className="p-8 text-center">
        <Clock size={32} className="mx-auto mb-3 text-status-late" />
        <div className="text-ivory">Abgegeben</div>
        <p className="text-sage-muted text-sm mt-1">Deine Prüfung wurde eingereicht. Das Ergebnis wird nach der Korrektur freigegeben.</p>
      </Card>
    );
  }

  // Ablegen
  const setSingle = (qid, oid) => setAnswers({ ...answers, [qid]: { selected: [oid] } });
  const toggleMulti = (qid, oid) => {
    const cur = answers[qid]?.selected || [];
    setAnswers({ ...answers, [qid]: { selected: cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid] } });
  };
  const setText = (qid, text) => setAnswers({ ...answers, [qid]: { text } });

  const submit = async () => {
    setBusy(true);
    try {
      const payload = exam.questions.map((q) =>
        q.type === 'text'
          ? { questionId: q.id, text: answers[q.id]?.text || '' }
          : { questionId: q.id, selected: answers[q.id]?.selected || [] },
      );
      await api.post(`/exams/${id}/submit`, { answers: payload });
      toast.push('Prüfung abgegeben', 'success');
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <CardHeader title={exam.title} subtitle={exam.description} icon={GraduationCap} action={exam.questions.length > 0 ? <Badge tone="neutral">Bestehen ab {passPercentage}%</Badge> : null} />
      <div className="p-4 space-y-4">
        {exam.link && (
          <>
            <a href={exam.link} target="_blank" rel="noreferrer" className="block">
              <Button className="w-full"><ExternalLink size={18} /> Prüfung öffnen</Button>
            </a>
            {exam.questions.length === 0 && <p className="text-sm text-sage-muted text-center">Diese Prüfung findet extern statt – tippe oben auf „Prüfung öffnen".</p>}
          </>
        )}
        {exam.questions.map((q, i) => (
          <div key={q.id} className="rounded-lg border border-black/10 p-3">
            <div className="text-ivory mb-2">{i + 1}. {q.prompt} <span className="text-xs text-sage-muted">({q.points} P)</span></div>
            {q.type === 'text' ? (
              <textarea className="input" rows={3} value={answers[q.id]?.text || ''} onChange={(e) => setText(q.id, e.target.value)} />
            ) : (
              <div className="space-y-1.5">
                {q.options.map((o) => {
                  const sel = (answers[q.id]?.selected || []).includes(o.id);
                  return (
                    <button key={o.id} onClick={() => (q.type === 'single' ? setSingle(q.id, o.id) : toggleMulti(q.id, o.id))}
                      className={['w-full text-left px-3 py-2 rounded-lg border flex items-center gap-2', sel ? 'border-mint bg-mint/10 text-ivory' : 'border-black/10 text-sage hover:bg-black/5'].join(' ')}>
                      <span className={['h-4 w-4 grid place-items-center', q.type === 'single' ? 'rounded-full' : 'rounded', sel ? 'bg-mint text-sidebar' : 'border border-black/20'].join(' ')}>{sel ? '✓' : ''}</span>
                      {o.text}
                    </button>
                  );
                })}
                {q.type === 'multi' && <p className="text-[11px] text-sage-muted">Mehrere Antworten möglich</p>}
              </div>
            )}
          </div>
        ))}
        {exam.questions.length > 0 && (
          <Button onClick={submit} disabled={busy}><Send size={18} /> {busy ? 'Senden …' : 'Abgeben'}</Button>
        )}
      </div>
    </Card>
  );
}

// --- Lehrer ------------------------------------------------------------------
function ManagerExam() {
  const { id } = useParams();
  const toast = useToast();
  const [exam, setExam] = useState(null);
  const [attempts, setAttempts] = useState([]);

  const load = () => api.get(`/exams/${id}/attempts`).then((d) => { setExam(d.exam); setAttempts(d.attempts); });
  useEffect(() => { load(); }, [id]);

  const publish = async () => {
    await api.post(`/exams/${id}/publish`);
    toast.push('Veröffentlicht', 'success');
    load();
  };

  if (!exam) return <Spinner />;
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <CardHeader
          title={exam.title}
          subtitle={`${exam.questions.length} Fragen · Bestehen ab ${exam.passPercentage}%`}
          icon={GraduationCap}
          action={<Badge tone={exam.status === 'published' ? 'present' : 'neutral'}>{exam.status === 'published' ? 'Veröffentlicht' : 'Entwurf'}</Badge>}
        />
        {exam.status !== 'published' && <div className="p-4"><Button onClick={publish}>Veröffentlichen</Button></div>}
      </Card>

      <h3 className="text-sm text-sage-muted">Abgaben ({attempts.length})</h3>
      {attempts.length === 0 && <Card className="p-6 text-sage-muted">Noch keine Abgaben.</Card>}
      {attempts.map((att) => <GradeCard key={att.id} exam={exam} att={att} onDone={load} />)}
    </div>
  );
}

function GradeCard({ exam, att, onDone }) {
  const toast = useToast();
  const [awarded, setAwarded] = useState(() => {
    const init = {};
    (att.answers || []).forEach((a) => { if (typeof a.awardedPoints === 'number') init[a.questionId] = a.awardedPoints; });
    return init;
  });

  const grade = async (release) => {
    try {
      await api.post(`/attempts/${att.id}/grade`, { awarded, release });
      toast.push(release ? 'Bewertet & freigegeben' : 'Bewertung gespeichert', 'success');
      onDone();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-ivory">{att.studentName}</span>
        {att.status === 'released'
          ? <Badge tone="present">{att.total}/{att.max} freigegeben</Badge>
          : <StatusBadge status="submitted" />}
      </div>
      <div className="space-y-3">
        {exam.questions.map((q, i) => {
          const a = (att.answers || []).find((x) => x.questionId === q.id) || {};
          if (q.type === 'text') {
            return (
              <div key={q.id} className="rounded-lg border border-black/10 p-3">
                <div className="text-sm text-sage-muted mb-1">{i + 1}. {q.prompt} ({q.points} P)</div>
                <p className="text-sage text-sm whitespace-pre-line mb-2">{a.text || '—'}</p>
                <label className="text-xs text-sage-muted flex items-center gap-2">
                  Punkte:
                  <input type="number" min={0} max={q.points} className="input py-1 w-20 text-sm"
                    value={awarded[q.id] ?? ''} onChange={(e) => setAwarded({ ...awarded, [q.id]: e.target.value })} /> / {q.points}
                </label>
              </div>
            );
          }
          const correct = new Set(q.correct);
          const sel = new Set(a.selected || []);
          const ok = correct.size === sel.size && [...correct].every((c) => sel.has(c));
          return (
            <div key={q.id} className="rounded-lg border border-black/10 p-3">
              <div className="text-sm text-sage-muted mb-1 flex items-center gap-2">
                {i + 1}. {q.prompt} ({q.points} P)
                {ok ? <CheckCircle2 size={14} className="text-status-present" /> : <span className="text-status-absent text-xs">falsch</span>}
              </div>
              <div className="text-xs space-y-0.5">
                {q.options.map((o) => (
                  <div key={o.id} className={correct.has(o.id) ? 'text-status-present' : sel.has(o.id) ? 'text-status-absent' : 'text-sage-muted'}>
                    {correct.has(o.id) ? '✓' : sel.has(o.id) ? '✗' : '·'} {o.text}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {att.status !== 'released' && (
        <div className="flex gap-2 mt-3">
          <Button variant="outline" size="sm" onClick={() => grade(false)}>Speichern</Button>
          <Button size="sm" onClick={() => grade(true)}>Bewerten & Freigeben</Button>
        </div>
      )}
    </Card>
  );
}
