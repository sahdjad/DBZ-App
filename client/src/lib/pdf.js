// pdf.js (Mozilla) wird erst geladen, wenn wirklich ein PDF geöffnet wird.
// "legacy"-Build: läuft auch auf älteren iPhones/iPads. Schriften, CMaps und
// WebAssembly-Decoder liegen unter /pdfjs/ (siehe vite.config.js).
let pdfjsPromise = null;

export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    }).catch((err) => {
      pdfjsPromise = null;
      throw err;
    });
  }
  return pdfjsPromise;
}

export const PDF_OPTIONS = {
  isEvalSupported: false, // CSP: kein eval()
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  enableXfa: false,
};

// Datei mit Fortschritt laden (für die Ladeanzeige).
export async function fetchBytes(url, onProgress) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(res.status === 404 ? 'Datei nicht gefunden' : res.status === 403 ? 'Kein Zugriff auf diese Datei' : `Laden fehlgeschlagen (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total || !res.body.getReader) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const out = new Uint8Array(total);
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (got + value.length > out.length) {
      // Content-Length war zu klein (z. B. Kompression) -> sicher weitermachen
      const bigger = new Uint8Array(Math.max(out.length * 2, got + value.length));
      bigger.set(out.subarray(0, got));
      return finishGrow(reader, bigger, got, value, onProgress);
    }
    out.set(value, got);
    got += value.length;
    onProgress?.(Math.min(1, got / total));
  }
  return got === out.length ? out : out.subarray(0, got);
}

async function finishGrow(reader, buf, got, first, onProgress) {
  let b = buf;
  let n = got;
  const push = (v) => {
    if (n + v.length > b.length) {
      const nb = new Uint8Array(Math.max(b.length * 2, n + v.length));
      nb.set(b.subarray(0, n));
      b = nb;
    }
    b.set(v, n);
    n += v.length;
  };
  push(first);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    push(value);
    onProgress?.(0.99);
  }
  return b.subarray(0, n);
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function canShareFile(file) {
  try {
    return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
  } catch {
    return false;
  }
}

// "Speichern unter": Teilen-Menü des Systems (iOS: "In Dateien sichern",
// andere Apps, AirDrop ...). Liefert false, wenn es das nicht gibt.
export async function shareFile(file) {
  if (!canShareFile(file)) return false;
  try {
    await navigator.share({ files: [file], title: file.name });
  } catch (err) {
    if (err?.name !== 'AbortError') throw err;
  }
  return true;
}

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Auf iPhone/iPad ersetzt ein Download in der installierten App die Ansicht
// (ohne Zurück) -- dort nur über das Teilen-Menü speichern.
export const downloadIsSafe = () => !isIOS();
