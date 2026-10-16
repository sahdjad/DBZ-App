import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Mic, Square, Upload, ArrowLeft, Paperclip, Play, Pause, Send, Camera, AlertTriangle, Info, Trash2, Pencil, FolderOpen } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, StatusBadge, Spinner, useToast, FileAttachment } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';
import { AssignmentEditForm } from '../components/AssignmentEditForm.jsx';

const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' });
const localDay = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Audio-Dateien aus der Dateien-App, Sprachmemos, WhatsApp-/Telegram-
// Sprachnachrichten: die Endungen ausdrücklich nennen, sonst graut das
// iPhone z. B. .opus-Dateien in der Auswahl aus.
const AUDIO_ACCEPT = 'audio/*,.m4a,.mp3,.wav,.aac,.ogg,.oga,.opus,.amr,.3gp,.caf,.webm,.flac';
const AUDIO_EXT = /\.(m4a|mp3|wav|aac|ogg|oga|opus|amr|3gp|caf|webm|flac)$/i;
const isAudio = (f) => String(f.type).startsWith('audio') || AUDIO_EXT.test(f.name || '');
const MAX_MB = 25;

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'offen');

export default function AufgabeDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { user } = useAuth();
  const [proposing, setProposing] = useState(false);
  const [data, setData] = useState(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]); // File[]
  const [busy, setBusy] = useState(false);

  // Audioaufnahme
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const stopResolveRef = useRef(null);
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const cameraInputRef = useRef(null);
  const audioInputRef = useRef(null);
  // Dateien hinzufügen – zu große gleich hier abfangen (verständliche Meldung).
  const addFiles = (list) => {
    const arr = Array.from(list || []);
    const tooBig = arr.filter((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig.length) toast.push(`„${tooBig[0].name}" ist größer als ${MAX_MB} MB`, 'error');
    const ok = arr.filter((f) => f.size <= MAX_MB * 1024 * 1024);
    if (ok.length) setFiles((f) => [...f, ...ok]);
  };

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
        stream.getTracks().forEach((t) => t.stop());
        if (stopResolveRef.current) { stopResolveRef.current(file); stopResolveRef.current = null; }
        else setFiles((f) => [...f, file]);
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
      setPaused(false);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast.push('Kein Mikrofonzugriff. Bitte Datei hochladen.', 'error');
    }
  };
  // Wie bei WhatsApp: Aufnahme pausieren und weitermachen.
  const togglePause = () => {
    const rec = recRef.current;
    if (!rec || typeof rec.pause !== 'function') return;
    if (rec.state === 'recording') {
      rec.pause();
      clearInterval(timerRef.current);
      setPaused(true);
    } else if (rec.state === 'paused') {
      rec.resume();
      timerRef.current = setInterval(() => setSeconds((x) => x + 1), 1000);
      setPaused(false);
    }
  };
  // Stopp: Aufnahme landet in der Liste (anhören, dann abgeben).
  // Mit `asFile` liefert sie die Datei direkt zurück (für "Senden").
  const stopRec = (asFile = false) => new Promise((resolve) => {
    const rec = recRef.current;
    clearInterval(timerRef.current);
    setRecording(false);
    setPaused(false);
    if (!rec || rec.state === 'inactive') return resolve(null);
    if (asFile) stopResolveRef.current = resolve; else resolve(null);
    rec.stop();
  });
  // Senden direkt aus der Aufnahme heraus: stoppen + sofort abgeben.
  const stopAndSend = async () => {
    const file = await stopRec(true);
    if (file) submit([file]);
  };
  const canPause = typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.prototype?.pause === 'function';
  const mmss = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;

  const submit = async (extra = []) => {
    const all = [...files, ...(Array.isArray(extra) ? extra : [])];
    if (!text.trim() && all.length === 0) return toast.push('Bitte Text oder Datei hinzufügen', 'error');
    setBusy(true);
    try {
      const form = new FormData();
      if (text.trim()) form.set('text', text.trim());
      all.forEach((f) => form.append('files', f));
      await api.upload(`/assignments/${id}/submit`, form);
      toast.push('Abgabe gesendet', 'success');
      setText('');
      setFiles([]);
      load();
    } catch (err) {
      // Aufnahme nicht verlieren: bleibt in der Liste für einen neuen Versuch.
      if (Array.isArray(extra) && extra.length) setFiles((f) => [...f, ...extra]);
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
  const isWrittenType = ['text', 'file', 'mixed'].includes(a.type);
  const otherToday = isAudioType ? (a.otherAudioToday || []) : [];
  const otherWritten = isWrittenType ? (a.otherWrittenToday || []) : [];
  const blockedToday = otherToday.length > 0 && a.audioDayRule === 'block';
  const blockedWritten = otherWritten.length > 0 && a.audioDayRule === 'block';
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
        {/* Klassensprecher: Fehler in der Hausaufgabe melden -> Lehrkraft bestätigt. */}
        {user?.role === 'klassensprecher' && !proposing && (
          <button type="button" onClick={() => setProposing(true)} className="mt-3 inline-flex items-center gap-1.5 text-xs text-sage-muted hover:text-ivory">
            <Pencil size={13} /> Fehler? Korrektur vorschlagen
          </button>
        )}
        {proposing && (
          <div className="mt-4 border-t border-line pt-4">
            <div className="text-sm text-ivory mb-2">Korrektur vorschlagen – die Lehrkraft bestätigt sie</div>
            <AssignmentEditForm assignment={a} withNote submitLabel="Vorschlag senden"
              onCancel={() => setProposing(false)}
              onSubmit={async (edits, note) => {
                if (!Object.keys(edits).length && !note) { toast.push('Du hast nichts geändert', 'error'); return; }
                try {
                  await api.post(`/assignments/${a.id}/change-proposal`, { ...edits, note });
                  toast.push('Korrektur an die Lehrkraft gesendet', 'success');
                  setProposing(false);
                } catch (err) { toast.push(err.message, 'error'); }
              }} />
          </div>
        )}
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
            {otherWritten.length > 0 && (
              <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${blockedWritten ? 'border-status-absent/50 bg-status-absent/10 text-status-absent' : 'border-gold/50 bg-gold/10 text-sage'}`}>
                <AlertTriangle size={16} className={`shrink-0 mt-0.5 ${blockedWritten ? '' : 'text-gold'}`} />
                <span>
                  {blockedWritten
                    ? `Du hast heute schon die schriftliche Hausaufgabe „${otherWritten.join('“, „')}“ abgegeben. Pro Tag nur eine schriftliche Hausaufgabe – bitte an einem anderen Tag.`
                    : `Du hast heute schon „${otherWritten.join('“, „')}“ schriftlich abgegeben. Normal ist eine pro Tag – wenn du jetzt abgibst, sieht deine Lehrkraft das markiert.`}
                </span>
              </div>
            )}
            {isAudioType && !blockedToday && (
              <div className="rounded-lg border border-line p-4">
                <div className="text-sm text-sage mb-2">Audio aufnehmen oder hochladen</div>
                {!recording ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={startRec} variant="outline" disabled={busy}><Mic size={18} /> Aufnahme starten</Button>
                      <Button onClick={() => audioInputRef.current?.click()} variant="outline" disabled={busy}><FolderOpen size={18} /> Audio-Datei wählen</Button>
                    </div>
                    <input ref={audioInputRef} type="file" multiple accept={AUDIO_ACCEPT} className="hidden"
                           onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                    <p className="text-[11px] text-sage-muted leading-snug">
                      Schon aufgenommen? Wähle die Datei aus der Dateien-App oder den Sprachmemos. Sprachnachricht aus WhatsApp:
                      Nachricht lange drücken → Teilen → „In Dateien sichern“ und dann hier auswählen.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className={`h-2.5 w-2.5 rounded-full ${paused ? 'bg-gold' : 'bg-status-absent animate-pulse'}`} />
                      <span className="text-ivory tabular-nums">{mmss(seconds)}</span>
                      <span className="text-sage-muted">{paused ? 'pausiert' : 'nimmt auf …'}</span>
                    </div>
                    {/* Alle drei Knöpfe nebeneinander – Senden direkt neben Stopp. */}
                    <div className={`grid gap-2 ${canPause ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      {canPause && (
                        <Button onClick={togglePause} variant="outline" className="!px-1.5 !gap-1.5" aria-label={paused ? 'Weiter aufnehmen' : 'Pause'}>
                          {paused ? <><Mic size={16} className="shrink-0" /> Weiter</> : <><Pause size={16} className="shrink-0" /> Pause</>}
                        </Button>
                      )}
                      <Button onClick={() => stopRec(false)} variant="outline" className="!px-1.5 !gap-1.5" aria-label="Stopp"><Square size={16} className="shrink-0" /> Stopp</Button>
                      <Button onClick={stopAndSend} disabled={busy} className="!px-1.5 !gap-1.5" aria-label="Senden"><Send size={16} className="shrink-0" /> Senden</Button>
                    </div>
                    <p className="text-[11px] text-sage-muted">Stopp = erst anhören, dann abgeben · Senden = sofort abgeben</p>
                  </div>
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
                     onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            </div>

            <label className="block">
              <span className="text-sm text-sage">Datei(en) hochladen (Audio, PDF, Bild – max. 25 MB)</span>
              <input type="file" multiple accept={`${AUDIO_ACCEPT},application/pdf,image/*`}
                     onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
                     className="mt-1 block w-full text-sm text-sage file:mr-3 file:rounded-lg file:border-0 file:bg-mint file:px-3 file:py-2 file:text-onaccent" />
            </label>

            {files.length > 0 && (
              <ul className="text-sm text-sage-muted space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="rounded-lg border border-line p-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{f.name.startsWith('aufnahme-') ? `Aufnahme ${i + 1}` : f.name} · {(f.size / 1024 / 1024).toFixed(2)} MB</span>
                      <button onClick={() => setFiles((arr) => arr.filter((_, j) => j !== i))} className="text-status-absent inline-flex items-center gap-1"><Trash2 size={14} /> entfernen</button>
                    </div>
                    {isAudio(f) && <PendingAudio file={f} />}
                  </li>
                ))}
              </ul>
            )}

            {(a.type === 'text' || a.type === 'mixed') && !blockedWritten && (
              <label className="block">
                <span className="text-sm text-sage">Schriftliche Antwort</span>
                <textarea className="input mt-1" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
              </label>
            )}

            <Button onClick={() => submit()} disabled={busy || recording || (blockedToday && files.some(isAudio)) || (blockedWritten && (text.trim() || files.some((f) => !isAudio(f))))}><Upload size={18} /> {busy ? 'Senden …' : 'Abgeben'}</Button>
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

// Vorschau einer noch nicht abgegebenen Aufnahme (anhören vor dem Abgeben).
function PendingAudio({ file }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? <audio controls src={url} className="w-full h-10" preload="metadata" /> : null;
}
