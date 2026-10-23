// Schmaler Fetch-Wrapper für die DBZ-App-API.

// Kaltstart des kostenlosen Servers: Die erste Anfrage nach einer Pause kann
// bis zu ~1 Minute dauern. Dauert etwas länger als 4 s, meldet die App das
// sichtbar ("Server startet …"); bricht die Verbindung dabei ab ("Load
// failed"), wird ein Lesezugriff automatisch wiederholt.
let slowCount = 0;
const slowListeners = new Set();
export function onServerSlow(fn) {
  slowListeners.add(fn);
  fn(slowCount > 0);
  return () => slowListeners.delete(fn);
}
function setSlow(delta) {
  const before = slowCount > 0;
  slowCount = Math.max(0, slowCount + delta);
  const now = slowCount > 0;
  if (before !== now) slowListeners.forEach((fn) => fn(now));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Kurzzeit-Speicher für bereits geladene Seiten-Daten -------------------
// Wer eine Seite erneut öffnet, sieht sofort den letzten Stand (kein Lade-
// Kringel); die Seite lädt wie bisher im Hintergrund neu und aktualisiert sich.
// Sicherheit: nur im Arbeitsspeicher (nie dauerhaft), immer an EINE angemeldete
// Person gebunden (Wechsel/Abmelden leert ihn sofort), Anmelde-Daten werden nie
// gespeichert. Jede Änderung (POST/PATCH/DELETE) leert ihn ebenfalls -- danach
// sieht man nie einen veralteten Stand der eigenen Aktion.
const MAX_CACHED = 150;
const getCache = new Map();
let cacheOwner = null;
// Reine Lese-Markierungen (und die einmalige Zustimmung / Einführung) ändern
// keine angezeigten Daten -> leeren den Speicher nicht.
const KEEPS_CACHE = /^\/(notifications\/read-route|quran\/last-read|push\/|recitation-sessions|me\/(consent|guide)$)/;
export function setCacheOwner(id) {
  const next = id || null;
  if (next !== cacheOwner) { getCache.clear(); cacheOwner = next; }
}
/** Letzter geladener Stand eines GET-Pfads der aktuellen Person (oder null). */
export function peek(path) {
  if (!cacheOwner) return null;
  const hit = getCache.get(path);
  return hit && hit.owner === cacheOwner ? hit.data : null;
}
function remember(method, path, data, owner) {
  if (method !== 'GET') {
    if (!KEEPS_CACHE.test(path)) getCache.clear();
    return;
  }
  // Nur speichern, wenn die Anfrage noch von derselben Person stammt (eine
  // späte Antwort nach einem Kontowechsel wird verworfen).
  if (!owner || owner !== cacheOwner || path.startsWith('/auth') || data == null) return;
  getCache.delete(path);
  getCache.set(path, { owner: cacheOwner, data });
  if (getCache.size > MAX_CACHED) getCache.delete(getCache.keys().next().value);
}

async function request(method, path, body, isForm = false) {
  const owner = cacheOwner;
  const opts = {
    method,
    credentials: 'include',
    headers: {},
  };
  if (body && isForm) {
    opts.body = body; // FormData
  } else if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let marked = false;
  const slowTimer = setTimeout(() => { if (!marked) { marked = true; setSlow(1); } }, 4000);
  let res;
  try {
    const retries = method === 'GET' ? 3 : 0;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetch(`/api${path}`, opts);
        // 502/503/504 = Server wird gerade gestartet/neu ausgerollt
        if (method === 'GET' && [502, 503, 504].includes(res.status) && attempt < retries) {
          if (!marked) { marked = true; setSlow(1); }
          await sleep(2500 * (attempt + 1));
          continue;
        }
        break;
      } catch (err) {
        if (attempt >= retries || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
          const e = new Error(navigator.onLine === false ? 'Keine Internetverbindung' : 'Server nicht erreichbar – bitte gleich nochmal versuchen');
          e.network = true;
          throw e;
        }
        if (!marked) { marked = true; setSlow(1); }
        await sleep(2000 * (attempt + 1));
      }
    }
  } finally {
    clearTimeout(slowTimer);
    if (marked) setSlow(-1);
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    const e = new Error(data?.error || `Fehler ${res.status}`);
    e.status = res.status;
    if ([502, 503, 504].includes(res.status)) e.network = true;
    throw e;
  }
  remember(method, path, data, owner);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p, b) => request('DELETE', p, b),
  upload: (p, formData) => request('POST', p, formData, true),
  // Datei herunterladen, OHNE die App-Ansicht zu verlassen (wichtig auf iOS:
  // ein direkter <a href> zu einer Datei würde die Seite ersetzen).
  download: async (p, filename) => {
    const res = await fetch(`/api${p}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'export';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  },
};
