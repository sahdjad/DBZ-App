import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, GraduationCap, CheckCircle2, Clock, Send, ExternalLink, Printer, Mic, Square, Paperclip, FileText, Trash2 } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, StatusBadge, Spinner, useToast, ImageAttachment } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';
import { useRecorder, mmss } from '../lib/recorder.js';

const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];

// Datei anzeigen: Audio abspielbar, Bild in App-interner Vorschau, sonst als
// Öffnen/Download-Link.
function FileView({ url, file }) {
  const mediaType = String(file.mediaType || '');
  if (mediaType.startsWith('audio')) return <audio controls preload="none" className="w-full mt-1" src={url} />;
  if (mediaType.startsWith('image')) return <ImageAttachment url={url} alt={file.originalName} className="mt-1" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-mint-light hover:underline mt-1">
      <FileText size={15} /> {file.originalName || 'Datei öffnen'}
    </a>
  );
}

// Aufgaben-Anhänge einer Prüfung (Audio/PDF) rendern.
function ExamAttachments({ examId, files }) {
  if (!files?.length) return null;
  return (
    <div className="rounded-lg border border-mint/25 bg-mint/[0.04] p-3 space-y-2">
      <div className="text-[11px] text-sage-muted">Aufgabe</div>
      {files.map((f) => <FileView key={f.id} file={f} url={`/api/exams/${examId}/file/${f.id}`} />)}
    </div>
  );
}

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

// Schüler-Antwort abgeben (Audio aufnehmen oder Datei/PDF hochladen).
function ResponseUploader({ examId, onDone }) {
  const toast = useToast();
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const rec = useRecorder((f, err) => { if (err) return toast.push(err.message, 'error'); if (f) setFiles((a) => [...a, f]); });

  const send = async () => {
    if (!files.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      await api.upload(`/exams/${examId}/response`, fd);
      toast.push('Abgabe gesendet', 'success');
      setFiles([]);
      onDone();
    } catch (err) { toast.push(err.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-line p-3 space-y-2">
      <div className="text-sm text-sage">Deine Abgabe (Audio-Rezitation oder Datei)</div>
      {rec.recording ? (
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-status-absent text-sm"><span className="w-2.5 h-2.5 rounded-full bg-status-absent animate-pulse" /> Aufnahme … {mmss(rec.seconds)}</span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={rec.cancel}>Abbrechen</Button>
          <Button size="sm" onClick={rec.stop}><Square size={15} /> Fertig</Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={rec.start}><Mic size={15} /> Aufnehmen</Button>
          <input ref={inputRef} type="file" accept="audio/*,application/pdf,image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setFiles((a) => [...a, f]); e.target.value = ''; }} />
          <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()}><Paperclip size={15} /> Datei</Button>
          {files.length > 0 && <Button size="sm" onClick={send} disabled={busy}><Send size={15} /> Abgeben</Button>}
        </div>
      )}
      {files.map((f, i) => (
        <div key={i} className="flex items-center gap-2 text-sm bg-subtle rounded-lg px-3 py-1.5">
          <span className="text-sage">{f.type?.startsWith('audio') ? '🎤 Aufnahme' : `📎 ${f.name}`}</span>
          <button className="ml-auto text-sage-muted hover:text-status-absent" onClick={() => setFiles((a) => a.filter((_, j) => j !== i))} aria-label="Entfernen"><Trash2 size={15} /></button>
        </div>
      ))}
    </div>
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
          subtitle={attempt.total != null ? `Ergebnis: ${attempt.total}${attempt.max ? '/' + attempt.max : ''} Punkte${typeof attempt.percent === 'number' ? ` (${attempt.percent}%)` : ''}` : 'Korrigiert'}
          icon={GraduationCap}
          action={typeof attempt.passed === 'boolean' ? <Badge tone={attempt.passed ? 'present' : 'absent'}>{attempt.passed ? 'Bestanden' : 'Nicht bestanden'}</Badge> : null}
        />
        <div className="px-4 pt-4 space-y-3">
          {exam.questions.length > 0 && <Button as={Link} to={`/pruefung/${id}/druck`} variant="outline" size="sm"><Printer size={16} /> PDF / Drucken</Button>}
          <ExamAttachments examId={id} files={exam.files} />
          {(attempt.responseFiles || []).length > 0 && (
            <div className="rounded-lg border border-line p-3 space-y-1">
              <div className="text-[11px] text-sage-muted">Deine Abgabe</div>
              {attempt.responseFiles.map((f) => <FileView key={f.id} file={f} url={`/api/attempts/${attempt.id}/file/${f.id}`} />)}
            </div>
          )}
          {attempt.feedback && (
            <div className="rounded-lg border border-mint/30 bg-mint/[0.05] p-3 text-sm text-sage">
              <span className="text-[11px] text-sage-muted block mb-1">Rückmeldung der Lehrkraft</span>{attempt.feedback}
            </div>
          )}
          {attempt.correctedFile && (
            <div className="rounded-lg border border-line p-3">
              <div className="text-[11px] text-sage-muted">Korrigierte Datei</div>
              <FileView file={attempt.correctedFile} url={`/api/attempts/${attempt.id}/file/${attempt.correctedFile.id}`} />
            </div>
          )}
        </div>
        <div className="p-4 space-y-4">
          {exam.questions.map((q, i) => {
            const myAns = (attempt.answers || []).find((a) => a.questionId === q.id) || {};
            const correct = solById[q.id] || [];
            return (
              <div key={q.id} className="rounded-lg border border-line p-3">
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
      <Card className="p-5">
        <CardHeader title={exam.title} subtitle={exam.description} icon={GraduationCap} />
        <div className="p-4 space-y-3">
          <ExamAttachments examId={id} files={exam.files} />
          {(attempt.responseFiles || []).length > 0 && (
            <div className="rounded-lg border border-line p-3 space-y-1">
              <div className="text-[11px] text-sage-muted">Deine Abgabe</div>
              {attempt.responseFiles.map((f) => <FileView key={f.id} file={f} url={`/api/attempts/${attempt.id}/file/${f.id}`} />)}
            </div>
          )}
          <div className="text-center text-sage-muted text-sm inline-flex items-center gap-2 justify-center w-full">
            <Clock size={18} className="text-status-late" /> Abgegeben – das Ergebnis kommt nach der Korrektur.
          </div>
          {/* Weitere Datei/Aufnahme nachreichen ist erlaubt. */}
          <ResponseUploader examId={id} onDone={load} />
        </div>
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
        <ExamAttachments examId={id} files={exam.files} />
        {(exam.files?.length > 0 || exam.questions.length === 0) && !exam.link && (
          <ResponseUploader examId={id} onDone={load} />
        )}
        {exam.link && (
          <>
            <a href={exam.link} target="_blank" rel="noreferrer" className="block">
              <Button className="w-full"><ExternalLink size={18} /> Prüfung öffnen</Button>
            </a>
            {exam.questions.length === 0 && <p className="text-sm text-sage-muted text-center">Diese Prüfung findet extern statt – tippe oben auf „Prüfung öffnen".</p>}
          </>
        )}
        {exam.questions.map((q, i) => (
          <div key={q.id} className="rounded-lg border border-line p-3">
            <div className="text-ivory mb-2">{i + 1}. {q.prompt} <span className="text-xs text-sage-muted">({q.points} P)</span></div>
            {q.type === 'text' ? (
              <textarea className="input" rows={3} value={answers[q.id]?.text || ''} onChange={(e) => setText(q.id, e.target.value)} />
            ) : (
              <div className="space-y-1.5">
                {q.options.map((o) => {
                  const sel = (answers[q.id]?.selected || []).includes(o.id);
                  return (
                    <button key={o.id} onClick={() => (q.type === 'single' ? setSingle(q.id, o.id) : toggleMulti(q.id, o.id))}
                      className={['w-full text-left px-3 py-2 rounded-lg border flex items-center gap-2', sel ? 'border-mint bg-mint/10 text-ivory' : 'border-line text-sage hover:bg-subtle'].join(' ')}>
                      <span className={['h-4 w-4 grid place-items-center', q.type === 'single' ? 'rounded-full' : 'rounded', sel ? 'bg-mint text-onaccent' : 'border border-line'].join(' ')}>{sel ? '✓' : ''}</span>
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
        <div className="px-4 pb-4 space-y-3">
          {exam.files?.length > 0 && <ExamAttachments examId={id} files={exam.files} />}
          {exam.status !== 'published' && <Button onClick={publish}>Veröffentlichen</Button>}
        </div>
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
      {(att.responseFiles || []).length > 0 && (
        <div className="rounded-lg border border-mint/25 bg-mint/[0.04] p-3 space-y-1 mb-3">
          <div className="text-[11px] text-sage-muted">Abgabe des Schülers</div>
          {att.responseFiles.map((f) => <FileView key={f.id} file={f} url={`/api/attempts/${att.id}/file/${f.id}`} />)}
        </div>
      )}
      <div className="space-y-3">
        {exam.questions.map((q, i) => {
          const a = (att.answers || []).find((x) => x.questionId === q.id) || {};
          if (q.type === 'text') {
            return (
              <div key={q.id} className="rounded-lg border border-line p-3">
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
            <div key={q.id} className="rounded-lg border border-line p-3">
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
      {exam.questions.length === 0 ? (
        <div className="mt-3"><ReturnForm att={att} onDone={onDone} /></div>
      ) : att.status !== 'released' ? (
        <div className="flex gap-2 mt-3">
          <Button variant="outline" size="sm" onClick={() => grade(false)}>Speichern</Button>
          <Button size="sm" onClick={() => grade(true)}>Bewerten & Freigeben</Button>
        </div>
      ) : null}
    </Card>
  );
}

// Korrigiert zurückgeben (Datei-/Audio-Prüfung): Punkte + Rückmeldung + optional
// korrigierte Datei.
function ReturnForm({ att, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ points: att.total ?? '', maxPoints: att.max ?? '', feedback: att.feedback ?? '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const send = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      if (f.points !== '' && f.points != null) fd.append('points', f.points);
      if (f.maxPoints !== '' && f.maxPoints != null) fd.append('maxPoints', f.maxPoints);
      fd.append('feedback', f.feedback || '');
      if (file) fd.append('file', file);
      await api.upload(`/attempts/${att.id}/return`, fd);
      toast.push('Korrigiert zurückgegeben', 'success');
      onDone();
    } catch (err) { toast.push(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-lg border border-line p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="text-[11px] text-sage-muted">Punkte</span>
          <input type="number" min={0} className="input py-1.5" value={f.points} onChange={(e) => setF({ ...f, points: e.target.value })} /></label>
        <label className="block"><span className="text-[11px] text-sage-muted">von (max.)</span>
          <input type="number" min={0} className="input py-1.5" value={f.maxPoints} onChange={(e) => setF({ ...f, maxPoints: e.target.value })} /></label>
      </div>
      <label className="block"><span className="text-sm text-sage">Rückmeldung / Kritik</span>
        <textarea rows={2} className="input mt-1" value={f.feedback} onChange={(e) => setF({ ...f, feedback: e.target.value })} /></label>
      <div className="flex items-center gap-2 flex-wrap">
        <input ref={inputRef} type="file" accept="audio/*,application/pdf,image/*" className="hidden"
          onChange={(e) => { const x = e.target.files?.[0]; if (x) setFile(x); e.target.value = ''; }} />
        <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()}><Paperclip size={15} /> Korrigierte Datei</Button>
        {file && <span className="text-xs text-sage">📎 {file.name}</span>}
        <div className="flex-1" />
        <Button size="sm" onClick={send} disabled={busy}><Send size={15} /> Zurückgeben</Button>
      </div>
    </div>
  );
}
