import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Mic, Square, Upload, ArrowLeft, Paperclip, Play, Camera, AlertTriangle, Info } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, StatusBadge, Spinner, useToast, FileAttachment } from '../components/ui.jsx';

const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' });
const localDay = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

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
  const cameraInputRef = useRef(null);

  const load = () => api.get(`/assignments/${id}`).then(setData).catch((e) => toast.push(e.message, 'error'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Vom Browser unterstütztes Format wählen (Safari/iOS kann kein webm!).
      const pick = ['audio/mp4', 'audio/aac', 'audio/webm'].find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t));
      const rec = pick ? new MediaRecorder(stream, { mimeType: pick }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const type = (rec.mimeType || 'audio/mp4').split(';')[0];
        const ext = type.includes('mp4') || type.includes('aac') || type.includes('m4a') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(chunksRef.current, { type });
        const file = new File([blob], `aufnahme-${Date.now()}.${ext}`, { type });
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
  const isAudioType = ['audio', 'quran', 'mixed'].includes(a.type);
  // Andere Audio-Hausaufgabe heute schon abgegeben? Je nach Lehrer-Einstellung
  // gesperrt ("block") oder nur für die Lehrkraft rot markiert ("mark").
  const otherToday = isAudioType ? (a.otherAudioToday || []) : [];
  const blockedToday = otherToday.length > 0 && a.audioDayRule === 'block';
  // Abgegebene Dateien nach Tag gruppieren (mehrere Aufnahmen pro Tag erlaubt).
  const fileDays = [];
  (sub?.files || []).filter((f) => !f.deleted).forEach((f) => {
    const day = f.day || localDay(f.uploadedAt || sub.submittedAt);
    const g = fileDays.find((x) => x.day === day);
    if (g) g.files.push(f); else fileDays.push({ day, files: [f] });
  });

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
            {fileDays.map((g) => (
              <div key={g.day} className="space-y-2">
                {fileDays.length > 1 && <div className="text-[11px] font-bold uppercase tracking-wider text-mint">{fmtDay(g.day)}</div>}
                {g.files.map((f) => (
                  <div key={f.id}><FileAttachment url={`/api/submissions/${sub.id}/file/${f.id}`} name={f.originalName} mediaType={f.mediaType} /></div>
                ))}
              </div>
            ))}
            {review && (
              <div className="mt-3 rounded-lg border border-line bg-subtle p-3">
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
            {isAudioType && a.audioToday && (
              <div className="flex items-start gap-2 rounded-lg border border-mint/40 bg-mint/10 p-3 text-sm text-sage">
                <Info size={16} className="shrink-0 mt-0.5 text-mint" />
                <span>Du kannst heute noch weitere Aufnahmen zu dieser Hausaufgabe hinzufügen (z. B. wenn eine Aufnahme abgebrochen ist). Ab morgen ist die Abgabe abgeschlossen.</span>
              </div>
            )}
            {otherToday.length > 0 && (
              <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${blockedToday ? 'border-status-absent/50 bg-status-absent/10 text-status-absent' : 'border-gold/50 bg-gold/10 text-sage'}`}>
                <AlertTriangle size={16} className={`shrink-0 mt-0.5 ${blockedToday ? '' : 'text-gold'}`} />
                <span>
                  {blockedToday
                    ? `Du hast heute schon „${otherToday.join('“, „')}“ abgegeben. Pro Tag nur eine Hausaufgabe – bitte nimm diese an einem anderen Tag auf.`
                    : `Du hast heute schon „${otherToday.join('“, „')}“ abgegeben. Normal ist eine Hausaufgabe pro Tag – wenn du jetzt abgibst, sieht deine Lehrkraft das markiert.`}
                </span>
              </div>
            )}
            {isAudioType && !blockedToday && (
              <div className="rounded-lg border border-line p-4">
                <div className="text-sm text-sage mb-2">Audio direkt aufnehmen</div>
                {!recording ? (
                  <Button onClick={startRec} variant="outline"><Mic size={18} /> Aufnahme starten</Button>
                ) : (
                  <Button onClick={stopRec} variant="danger"><Square size={18} /> Stopp ({seconds}s)</Button>
                )}
              </div>
            )}

            <div className="rounded-lg border border-line p-4">
              <div className="text-sm text-sage mb-2">Foto direkt aufnehmen (z. B. ein Hausaufgabenblatt)</div>
              <Button onClick={() => cameraInputRef.current?.click()} variant="outline">
                <Camera size={18} /> Foto aufnehmen
              </Button>
              {/* capture="environment" öffnet auf dem Handy direkt die Kamera
                  (Rückkamera) statt erst die Datei-/Galerieauswahl -- kein
                  Umweg über "erst in Fotos speichern, dann Datei suchen". */}
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                     onChange={(e) => { if (e.target.files.length) setFiles((f) => [...f, ...Array.from(e.target.files)]); e.target.value = ''; }} />
            </div>

            <label className="block">
              <span className="text-sm text-sage">Datei(en) hochladen (Audio, PDF, Bild – max. 25 MB)</span>
              <input type="file" multiple accept="audio/*,application/pdf,image/*"
                     onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files)])}
                     className="mt-1 block w-full text-sm text-sage file:mr-3 file:rounded-lg file:border-0 file:bg-mint file:px-3 file:py-2 file:text-onaccent" />
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

            <Button onClick={submit} disabled={busy || (blockedToday && files.some((f) => String(f.type).startsWith('audio')))}><Upload size={18} /> {busy ? 'Senden …' : 'Abgeben'}</Button>
          </div>
        </Card>
      ) : (
        <Card className="p-5 text-sage-muted">
          {a.locked
            ? 'Deine Abgabe wurde gesendet und ist jetzt gesperrt. Für Korrekturen wende dich an deine Lehrkraft – sie kann die Abgabe zurücksetzen oder die Frist verlängern.'
            : 'Die Abgabefrist ist abgelaufen. Wende dich an deine Lehrkraft für eine Verlängerung.'}
        </Card>
      )}
    </AppLayout>
  );
}
