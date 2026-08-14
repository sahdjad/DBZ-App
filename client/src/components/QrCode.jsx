import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

/**
 * Rendert einen scanbaren QR-Code für einen Textwert (hier: den Check-in-Token).
 * Dunkle Module auf hellem Grund für beste Scanbarkeit; im DBZ-Grün gehalten.
 */
export function QrImage({ value, size = 220 }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, {
      margin: 2,
      width: size,
      color: { dark: '#08150dff', light: '#F6FAF8ff' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(''));
    return () => {
      alive = false;
    };
  }, [value, size]);
  if (!src) return <div style={{ width: size, height: size }} className="rounded-lg bg-white/10 animate-pulse" />;
  return <img src={src} width={size} height={size} alt="QR-Code zum Einchecken" className="rounded-lg" />;
}

/** Prüft, ob der native BarcodeDetector QR-Codes lesen kann. */
export async function qrScanSupported() {
  if (!('BarcodeDetector' in window)) return false;
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats();
    return formats.includes('qr_code');
  } catch {
    return false;
  }
}

/**
 * Kamera-basierter QR-Scanner. Ruft onResult(text) beim ersten Treffer auf.
 * Nutzt die native BarcodeDetector-API (Android Chrome/Chromium). Wird sie nicht
 * unterstützt, sollte der Aufrufer die manuelle Code-Eingabe anbieten.
 */
export function QrScanner({ onResult, onError }) {
  const videoRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    let detector;
    let stopped = false;

    (async () => {
      try {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video);
            if (codes.length) {
              const value = codes[0].rawValue;
              stop();
              onResult(value);
              return;
            }
          } catch {
            /* einzelne Frames können fehlschlagen – weiter versuchen */
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        onError?.(err);
      }
    })();

    function stop() {
      stopped = true;
      setActive(false);
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }

    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black">
      <video ref={videoRef} playsInline muted className="w-full aspect-square object-cover" />
      {active && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-40 w-40 rounded-lg border-2 border-mint/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
      )}
    </div>
  );
}
