import { useRef, useState } from 'react';

// Sprach-/Audioaufnahme über die MediaRecorder-API. Liefert am Ende eine File
// (webm/m4a/ogg je nach Gerät). Wird für Nachrichten und Hifz-Abgaben genutzt.
export function useRecorder(onDone) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mr = useRef(null);
  const chunks = useRef([]);
  const timer = useRef(null);
  const stream = useRef(null);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onDone(null, new Error('Aufnahme wird auf diesem Gerät nicht unterstützt'));
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream.current);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        stream.current?.getTracks().forEach((t) => t.stop());
        if (rec._cancelled) return;
        const type = (rec.mimeType || 'audio/webm').split(';')[0];
        const ext = type.includes('mp4') || type.includes('m4a') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        onDone(new File(chunks.current, `aufnahme.${ext}`, { type }));
      };
      mr.current = rec;
      rec.start();
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      onDone(null, err);
    }
  };
  const finish = (cancelled) => {
    if (!mr.current || !recording) return;
    mr.current._cancelled = cancelled;
    mr.current.stop();
    setRecording(false);
    clearInterval(timer.current);
  };
  return { recording, seconds, start, stop: () => finish(false), cancel: () => finish(true) };
}

export const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
