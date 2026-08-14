import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Mic, Square, Upload, ArrowLeft, Paperclip, Play } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, StatusBadge, Spinner, useToast } from '../components/ui.jsx';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'offen');

export default function AufgabeDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]); // File[]
  const [busy, setBusy] = useState(false);

  // Audioaufnahme
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const load = () => api.get(`/assignments/${id}`).then(setData).catch((e) => toast.push(e.message, 'error'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `aufnahme-${Date.now()}.webm`, { type: 'audio/webm' });
        setFiles((f) => [...f, file]);
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast.push('Kein Mikrofonzugriff. Bitte Datei hochladen.', 'error');
    }
  };
  const stopRec = () => {
    recRef.current?.stop();
    clearInterval(timerRef.current);
    setRecording(false);
  };

  const submit = async () => {
    if (!text.trim() && files.length === 0) return toast.push('Bitte Text oder Datei hinzufügen', 'error');
    setBusy(true);
    try {
      const form = new FormData();
      if (text.trim()) form.set('text', text.trim());
      files.forEach((f) => form.append('files', f));
      await api.upload(`/assignments/${id}/submit`, form);
      toast.push('Abgabe gesendet', 'success');
      setText('');
      setFiles([]);
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <AppLayout title="Aufgabe"><Spinner /></AppLayout>;
  const a = data.assignment;
  const sub = data.submission;
  const review = data.review;
  const canSubmit = a.canSubmit;

  return (
    <AppLayout title="Aufgabe">
      <Link to="/aufgaben" className="inline-flex items-center gap-2 text-sm text-sage-muted hover:text-ivory mb-4">
        <ArrowLeft size={16} /> Zurück zu den Aufgaben
      </Link>

      <Card className="p-5 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-ivory">{a.title}</h2>
            <p className="text-xs text-sage-muted mt-1">{a.subjectName || 'Aufgabe'} · {a.type} · Frist {fmt(a.dueAt)}</p>
          </div>
          <StatusBadge status={a.studentStatus} />
        </div>
        {a.description && <p className="text-sage mt-3 whitespace-pre-line">{a.description}</p>}
      </Card>

      {sub && (
        <Card className="p-5 mb-4">
          <CardHeader title="Deine Abgabe" subtitle={`Abgegeben ${fmt(sub.submittedAt)}`} />
          <div className="p-4 space-y-3">
            {sub.text && <p className="text-sage whitespace-pre-line">{sub.text}</p>}
            {sub.files?.map((f) => (
              <a key={f.id} href={`/api/submissions/${sub.id}/file/${f.id}`} target="_blank" rel="noreferrer"
                 className="flex items-center gap-2 text-mint-light hover:underline text-sm">
                {f.mediaType?.startsWith('audio') ? <Play size={16} /> : <Paperclip size={16} />} {f.originalName}
              </a>
            ))}
            {review && (
              <div className="mt-3 rounded-lg border border-black/10 bg-white/[0.03] p-3">
                <div className="text-sm text-ivory mb-1">Feedback der Lehrkraft</div>
                {review.gradeLabel && <div className="text-sm text-mint-light">Bewertung: {review.gradeLabel}</div>}
                {review.feedbackText && <p className="text-sage text-sm whitespace-pre-line mt-1">{review.feedbackText}</p>}
                {(review.tajwid || review.pronunciation || review.fluency) && (
                  <div className="text-xs text-sage-muted mt-2 flex flex-wrap gap-3">
                    {review.tajwid != null && <span>Tajwid: {review.tajwid}</span>}
                    {review.pronunciation != null && <span>Aussprache: {review.pronunciation}</span>}
                    {review.fluency != null && <span>Flüssigkeit: {review.fluency}</span>}
                    {review.errorCount != null && <span>Fehler: {review.errorCount}</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {canSubmit ? (
        <Card className="p-5">
          <CardHeader title={sub ? 'Erneut abgeben / überarbeiten' : 'Abgabe'} icon={Upload} />
          <div className="p-4 space-y-4">
            {(a.type === 'audio' || a.type === 'quran' || a.type === 'mixed') && (
              <div className="rounded-lg border border-black/10 p-4">
                <div className="text-sm text-sage mb-2">Audio direkt aufnehmen</div>
                {!recording ? (
                  <Button onClick={startRec} variant="outline"><Mic size={18} /> Aufnahme starten</Button>
                ) : (
                  <Button onClick={stopRec} variant="danger"><Square size={18} /> Stopp ({seconds}s)</Button>
                )}
              </div>
            )}

            <label className="block">
              <span className="text-sm text-sage">Datei(en) hochladen (Audio, PDF, Bild – max. 25 MB)</span>
              <input type="file" multiple accept="audio/*,application/pdf,image/*"
                     onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files)])}
                     className="mt-1 block w-full text-sm text-sage file:mr-3 file:rounded-lg file:border-0 file:bg-mint file:px-3 file:py-2 file:text-sidebar" />
            </label>

            {files.length > 0 && (
              <ul className="text-sm text-sage-muted space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="truncate">{f.name} · {(f.size / 1024 / 1024).toFixed(2)} MB</span>
                    <button onClick={() => setFiles((arr) => arr.filter((_, j) => j !== i))} className="text-status-absent">entfernen</button>
                  </li>
                ))}
              </ul>
            )}

            {(a.type === 'text' || a.type === 'mixed') && (
              <label className="block">
                <span className="text-sm text-sage">Schriftliche Antwort</span>
                <textarea className="input mt-1" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
              </label>
            )}

            <Button onClick={submit} disabled={busy}><Upload size={18} /> {busy ? 'Senden …' : 'Abgeben'}</Button>
          </div>
        </Card>
      ) : (
        <Card className="p-5 text-sage-muted">Die Abgabefrist ist abgelaufen. Wende dich an deine Lehrkraft für eine Verlängerung.</Card>
      )}
    </AppLayout>
  );
}
