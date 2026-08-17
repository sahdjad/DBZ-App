import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

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
  if (!src) return <div style={{ width: size, height: size }} className="rounded-lg bg-black/10 animate-pulse" />;
  return <img src={src} width={size} height={size} alt="QR-Code zum Einchecken" className="rounded-lg" />;
}

/**
 * Kamera-Scannen ist überall möglich, wo die Kamera per getUserMedia verfügbar ist
 * (inkl. iOS-Safari). Die eigentliche QR-Erkennung übernimmt jsQR im Browser.
 */
export async function qrScanSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

async function makeBarcodeDetector() {
  try {
    if (!('BarcodeDetector' in window)) return null;
    const formats = await window.BarcodeDetector.getSupportedFormats();
    if (!formats.includes('qr_code')) return null;
    return new window.BarcodeDetector({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

/**
 * Kamera-basierter QR-Scanner. Ruft onResult(text) beim ersten Treffer auf.
 * Nutzt – wo vorhanden – die native BarcodeDetector-API (Android Chrome), sonst
 * jsQR als plattformübergreifende Erkennung (auch iOS/Safari).
 */
export function QrScanner({ onResult, onError }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    let stopped = false;

    const stop = () => {
      stopped = true;
      setActive(false);
      clearTimeout(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();

        const detector = await makeBarcodeDetector();
        const canvas = canvasRef.current || document.createElement('canvas');
        canvasRef.current = canvas;

        const tick = async () => {
          if (stopped) return;
          let value = null;
          try {
            if (detector) {
              const codes = await detector.detect(video);
              if (codes.length) value = codes[0].rawValue;
            } else if (video.videoWidth) {
              // Bild herunterskalieren für flüssige Erkennung.
              const w = Math.min(video.videoWidth, 640);
              const h = Math.round((video.videoHeight / video.videoWidth) * w);
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              ctx.drawImage(video, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              const found = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
              if (found?.data) value = found.data;
            }
          } catch {
            /* einzelne Frames können fehlschlagen – weiter versuchen */
          }
          if (value) {
            stop();
            onResult(value);
            return;
          }
          timerRef.current = setTimeout(tick, detector ? 120 : 180);
        };
        tick();
      } catch (err) {
        onError?.(err);
      }
    })();

    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative rounded-xl overflow-hidden border border-black/10 bg-black">
      <video ref={videoRef} playsInline muted className="w-full aspect-square object-cover" />
      {active && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-40 w-40 rounded-lg border-2 border-mint/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
      )}
    </div>
  );
}
