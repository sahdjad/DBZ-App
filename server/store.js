import { AsyncLocalStorage } from 'node:async_hooks';
// Gekapselter Datastore der DBZ-App.
//
// Die gesamte Persistenz läuft über dieses Modul. Die öffentliche API
// (all/insert/commit) ist bewusst klein und SYNCHRON gehalten, damit der
// restliche Code (api.js, seed.js, …) unverändert bleibt.
//
// Es gibt zwei austauschbare Backends – die Auswahl passiert automatisch:
//   1. Lokale Datei  (Standard, Entwicklung/Tests): data/db.json
//   2. Supabase       (Produktion, dauerhaft): der komplette Datenbestand wird
//      als ein JSON-Datensatz in der Tabelle `app_state` gespeichert. Aktiv,
//      sobald SUPABASE_URL und SUPABASE_SERVICE_KEY gesetzt sind.
//
// Der In-Memory-Cache (`cache`) bleibt in beiden Fällen die Quelle der Wahrheit
// zur Laufzeit; `persist()` schreibt ihn in das aktive Backend zurück.

import fs from 'fs';
import { createChunker, CHUNK_VERSION } from './chunkstore.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DBZ_DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

// --- Backend-Auswahl ---------------------------------------------------------
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || 'app_state';
const ROW_ID = process.env.SUPABASE_ROW_ID || 'dbz';
export const useSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);

// "Läuft dieses Deployment für echte Nutzer?" -- bisher fälschlich mit
// useSupabase gleichgesetzt (siehe IS_PRODUCTION in api.js). Das trifft NICHT
// zu, wenn ein echtes Deployment (wie dieses hier) ohne Supabase mit
// Datei-Speicherung läuft: dann wurden Demo-Konten weiter angelegt UND
// blieben für echte, gerade registrierte Nutzer sichtbar/erreichbar (z. B.
// die Klassenlehrkraft "Ustadh Yunus" in der Klassenliste). Ein Deployment
// mit Supabase gilt weiterhin automatisch als "live"; zusätzlich erlaubt
// DBZ_LIVE=1 das unabhängig vom Speicher-Backend explizit zu erzwingen.
export const isLiveDeployment = useSupabase || process.env.DBZ_LIVE === '1';

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Alle Collections der DBZ-Domäne. `all()` legt fehlende Arrays automatisch an,
// die Liste dient v.a. der Dokumentation und einem sauberen Reset.
const emptyDb = () => ({
  organizations: [],
  users: [], // inkl. Rollen, Klassenzuordnung, Eltern-Kind-Verknüpfung
  classes: [],
  sessions: [], // Unterrichtssitzungen (lesson_sessions)
  attendance: [], // attendance_records
  absence_requests: [],
  assignments: [],
  submissions: [],
  reviews: [], // submission_reviews
  extensions: [], // deadline_extensions
  protocols: [], // class_protocols
  behavior_records: [],
  penalties: [], // Strafen (Seiten/Geld): Klassensprecher erfasst -> Lehrer genehmigt
  events: [], // persönliche Kalendertermine (pro Nutzer)
  quran_goals: [],
  recitation_attempts: [],
  recitation_sessions: [], // KI-Rezitation: Übungsverläufe (nur Zahlen/Stellen, nie Audio)
  exams: [],
  exam_attempts: [],
  announcements: [],
  materials: [],
  material_annotations: [], // Lehrer-Notizen auf PDFs (Original bleibt unverändert)
  threads: [], // Direktnachrichten (mit eingebetteten messages)
  quran_marks: [], // pro Nutzer: zuletzt gelesen + Lesezeichen
  invites: [], // Einladungen (nur Token-Hash gespeichert)
  password_resets: [], // Passwort-Reset-Tokens (nur Hash)
  report_periods: [],
  assignment_proposals: [], // Aufgabenvorschläge des Klassensprechers (erst nach Bestätigung echte Aufgabe)
  student_reports: [],
  notifications: [],
  audit_logs: [],
  meta: { seeded: false },
});

let cache = null;
// true, wenn Supabase konfiguriert ist, aber beim Start nicht erreichbar war.
// Dann läuft der Server im Notmodus (lokal) weiter und schreibt NICHT nach
// Supabase zurück, damit dort vorhandene Daten nicht überschrieben werden.
let supabaseDegraded = false;
export function isSupabaseDegraded() {
  return supabaseDegraded;
}

// --- Supabase-Backend (REST/PostgREST über HTTPS) ----------------------------

function sbHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function sbLoad() {
  const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=eq.${encodeURIComponent(ROW_ID)}&select=data`;
  const res = await fetch(url, { headers: sbHeaders({ Accept: 'application/json' }) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase-Laden fehlgeschlagen (HTTP ${res.status}). ${body}`);
  }
  const rows = await res.json();
  if (Array.isArray(rows) && rows.length && rows[0].data) return rows[0].data;
  return null;
}

// Schutz gegen leeres Überschreiben: Hatte der geladene Bestand Nutzer und
// der zu speichernde hat keine mehr, stimmt etwas nicht (Programmfehler) --
// dann wird NICHT gespeichert. Eine gewollte Wiederherstellung setzt den Wert neu.
let knownUsers = 0;
async function sbSave(data) {
  const users = Array.isArray(data?.users) ? data.users.length : 0;
  if (knownUsers > 0 && users === 0) {
    console.error('[store] SCHUTZ: leerer Bestand würde vorhandene Daten überschreiben – Speichern verweigert.');
    return;
  }
  knownUsers = Math.max(knownUsers, users);
  const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ id: ROW_ID, data, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase-Speichern fehlgeschlagen (HTTP ${res.status}). ${body}`);
  }
}

// --- Aufgeteilte Ablage (siehe chunkstore.js) ---------------------------------
// Standard. Mit DBZ_STORE_LAYOUT=single bleibt es beim alten Ein-Dokument-
// Verfahren (Rückweg im Notfall; die alte Zeile wird nach der Umstellung nicht
// mehr geschrieben und bleibt als Stand vom Umstellungstag stehen).
const LAYOUT_SINGLE = process.env.DBZ_STORE_LAYOUT === 'single';
const chunker = createChunker({ prefix: `${ROW_ID}:` });
let chunked = false; // true, sobald der aufgeteilte Bestand geladen oder angelegt ist
const BATCH_BYTES = 3_000_000;
const PAGE = 200;

async function sbLoadRows() {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=like.${encodeURIComponent(`${ROW_ID}:*`)}&select=id,data&order=id&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, { headers: sbHeaders({ Accept: 'application/json' }) });
    if (!res.ok) throw new Error(`Supabase-Laden fehlgeschlagen (HTTP ${res.status}). ${await res.text().catch(() => '')}`);
    const page = await res.json();
    if (!Array.isArray(page)) throw new Error('Supabase-Laden fehlgeschlagen (unerwartete Antwort)');
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

/** Speichert Zeilen ({ id, json }) in Paketen; jedes Paket ist eine Transaktion. */
async function sbUpsertRows(rows) {
  const stamp = JSON.stringify(new Date().toISOString());
  let batch = [];
  let size = 0;
  const send = async () => {
    if (!batch.length) return;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}`, {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: `[${batch.join(',')}]`,
    });
    if (!res.ok) throw new Error(`Supabase-Speichern fehlgeschlagen (HTTP ${res.status}). ${await res.text().catch(() => '')}`);
    batch = [];
    size = 0;
  };
  for (const { id, json } of rows) {
    const row = `{"id":${JSON.stringify(id)},"data":${json},"updated_at":${stamp}}`;
    if (size + row.length > BATCH_BYTES) await send();
    batch.push(row);
    size += row.length;
  }
  await send();
}

/** Speichert nur die geänderten Blöcke. */
async function sbSaveChunks(data) {
  const users = Array.isArray(data?.users) ? data.users.length : 0;
  if (knownUsers > 0 && users === 0) {
    console.error('[store] SCHUTZ: leerer Bestand würde vorhandene Daten überschreiben – Speichern verweigert.');
    return;
  }
  knownUsers = Math.max(knownUsers, users);
  const p = chunker.plan(data);
  if (!p.changed.length) return;
  await sbUpsertRows(p.changed);
  chunker.commit(p);
}

/**
 * Einmalige Umstellung: Bestand in Blöcke schreiben, zurücklesen, vergleichen
 * und ERST DANN als "aufgeteilt" kennzeichnen. Die alte Ein-Dokument-Zeile
 * wird dabei nicht angefasst. Schlägt etwas fehl, bleibt es für diesen Lauf
 * beim alten Verfahren; beim nächsten Start wird es erneut versucht.
 */
async function migrateToChunks() {
  if (LAYOUT_SINGLE || chunked || !cache) return false;
  try {
    const p = chunker.plan(cache);
    await sbUpsertRows(p.changed);
    // Reste eines früheren, abgebrochenen Versuchs leeren.
    let back = await sbLoadRows();
    const stale = back.filter((r) => !p.hashes.has(r.id) && r.id !== chunker.manifestId).map((r) => ({ id: r.id, json: '{"items":[]}' }));
    if (stale.length) { await sbUpsertRows(stale); back = await sbLoadRows(); }
    // Kontrolle mit einem eigenen Rechner, damit der Zustand des echten unberührt bleibt.
    const check = createChunker({ prefix: `${ROW_ID}:` }).assemble(back, { requireManifest: false }) || {};
    for (const [name, n] of Object.entries(p.counts)) {
      const got = Array.isArray(check[name]) ? check[name].length : -1;
      if (got !== n) throw new Error(`Kontrolle fehlgeschlagen: ${name} hat ${got} statt ${n} Einträge`);
      const ids = new Set(check[name].map((r) => r.id));
      if (cache[name].some((r) => r.id !== undefined && !ids.has(r.id))) throw new Error(`Kontrolle fehlgeschlagen: Einträge fehlen in ${name}`);
    }
    await sbUpsertRows([{ id: chunker.manifestId, json: JSON.stringify({ version: CHUNK_VERSION, chunkSize: chunker.chunkSize, migratedAt: new Date().toISOString(), counts: p.counts }) }]);
    chunker.commit(p);
    chunked = true;
    console.log(`[store] Ablage umgestellt: ${p.changed.length} Blöcke (alte Ein-Dokument-Zeile bleibt unverändert als Stand von heute)`);
    return true;
  } catch (err) {
    console.error('[store] Umstellung auf Blöcke nicht abgeschlossen – weiter mit einem Dokument:', err.message);
    return false;
  }
}

/** Lädt den Bestand: aufgeteilt, falls vorhanden, sonst das alte Dokument. */
async function loadRemote() {
  if (!LAYOUT_SINGLE) {
    const data = chunker.assemble(await sbLoadRows());
    if (data) { chunked = true; return data; }
  }
  chunked = false;
  const legacy = await sbLoad();
  // Rückweg aktiv: Die Blöcke gelten ab jetzt nicht mehr (Kennzeichen auf 0).
  // So lädt ein späterer normaler Start nie einen veralteten Block-Stand,
  // sondern stellt frisch vom Dokument um.
  if (LAYOUT_SINGLE) {
    await sbUpsertRows([{ id: chunker.manifestId, json: JSON.stringify({ version: 0, disabledAt: new Date().toISOString() }) }])
      .catch((err) => console.error('[store] Kennzeichen konnte nicht zurückgesetzt werden:', err.message));
  }
  return legacy;
}

// Single-Flight-Writer: Es läuft immer nur EIN Schreibvorgang gleichzeitig.
// Kommen währenddessen weitere Änderungen, wird nach Abschluss genau einmal
// nachgespeichert (dirty-Flag). So geht nie ein Stand verloren und die Aufrufer
// (insert/commit) müssen nicht warten.
let writing = false;
let dirty = false;
export let lastPersistError = null;

// Der laufende Schreibvorgang als Promise: wer wirklich warten muss (Herunter-
// fahren, Sicherung), wartet darauf -- auch wenn der Vorgang schon unterwegs ist.
const FLUSH_GAP_MS = 750;
// Wartezeit, die einen Prozess nicht am Beenden hindert (der Server läuft
// ohnehin weiter; beim Herunterfahren wird ausdrücklich gespeichert).
const pause = (ms) => new Promise((r) => { setTimeout(r, ms).unref?.(); });
let urgent = false;
let draining = null;
function drainWrites() {
  if (draining) return draining;
  writing = true;
  draining = (async () => {
    try {
      while (dirty) {
        dirty = false;
        try {
          await (chunked ? sbSaveChunks(cache) : sbSave(cache));
          lastPersistError = null;
          // Unter Last Änderungen bündeln: nach einem Speichervorgang kurz
          // warten, bevor der nächste beginnt (außer es wird ausdrücklich
          // gewartet, z. B. beim Herunterfahren).
          if (dirty && !urgent) await pause(FLUSH_GAP_MS);
        } catch (err) {
          lastPersistError = err;
          dirty = true; // erneut versuchen
          console.error('[store]', err.message, '– neuer Versuch in 3s');
          await pause(3000);
        }
      }
    } finally {
      writing = false;
      draining = null;
    }
  })();
  return draining;
}

function scheduleSbFlush() {
  dirty = true;
  drainWrites();
}

// --- Datei-Backend -----------------------------------------------------------

function fileLoad() {
  ensureDirs();
  if (fs.existsSync(DB_FILE)) {
    try {
      return { ...emptyDb(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) };
    } catch (err) {
      // Beschädigte Datei NICHT stillschweigend überschreiben: Kopie aufheben.
      const keep = `${DB_FILE}.beschaedigt-${Date.now()}`;
      try { fs.copyFileSync(DB_FILE, keep); } catch { /* best effort */ }
      console.error(`[store] WARNUNG: ${DB_FILE} ist nicht lesbar (${err.message}). Kopie: ${keep}. Start mit leerem Bestand.`);
      return emptyDb();
    }
  }
  return emptyDb();
}

function fileSave() {
  ensureDirs();
  fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2));
}

// --- Interne Helfer ----------------------------------------------------------

// --- Demo-Sandkasten -----------------------------------------------------------
// Demo-Zugänge (für Vorführungen / Interessenten) arbeiten auf einem EIGENEN,
// flüchtigen Datenbestand nur im Arbeitsspeicher: nichts davon wird
// gespeichert, es gibt keinerlei Zugriff auf echte Daten, und echte Nutzer
// sehen nie etwas davon. Umgeschaltet wird pro Anfrage über AsyncLocalStorage
// (siehe runInSandbox in api.js) -- aller Code nutzt weiterhin einfach `db`.
const sandboxAls = new AsyncLocalStorage();
let sandboxCache = null;
export const inSandbox = () => sandboxAls.getStore()?.sandbox === true;
export function runInSandbox(fn) {
  return sandboxAls.run({ sandbox: true }, fn);
}
/** Verwirft den kompletten Demo-Datenbestand (wird danach neu befüllt). */
export function resetSandbox() {
  sandboxCache = null;
}

function load() {
  if (inSandbox()) {
    if (!sandboxCache) sandboxCache = emptyDb();
    return sandboxCache;
  }
  if (cache) return cache;
  // Fallback für Codepfade, die vor initStore() zugreifen (z. B. Tests):
  // im Supabase-Modus starten wir leer, im Dateimodus lesen wir die Datei.
  cache = useSupabase ? emptyDb() : fileLoad();
  return cache;
}

function persist() {
  if (inSandbox()) return; // Demo-Daten werden nie gespeichert
  if (useSupabase && !supabaseDegraded) {
    scheduleSbFlush();
    return;
  }
  // Datei-Modus ODER Supabase-Notmodus: lokal speichern. Im Notmodus schützt
  // das die echten Supabase-Daten vor Überschreiben mit leerem/Demostand.
  try {
    fileSave();
  } catch (err) {
    console.error('[store] Lokales Speichern fehlgeschlagen:', err.message);
  }
}

// --- Öffentliche API ---------------------------------------------------------

/**
 * Lädt den Datenbestand aus dem aktiven Backend in den Cache. MUSS beim
 * Serverstart vor jedem Datenzugriff einmal awaited werden (siehe index.js).
 */
export async function initStore() {
  if (cache) return cache;
  if (useSupabase) {
    ensureDirs(); // Upload-Ordner/lokaler Cache weiterhin lokal
    // Mehrere Versuche: ein pausiertes Supabase-Free-Projekt braucht einige
    // Sekunden zum Aufwachen, DNS-Aussetzer sind meist nur kurz.
    let data = null;
    let loaded = false;
    const MAX_TRIES = 5;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      try {
        data = await loadRemote();
        loaded = true;
        break;
      } catch (err) {
        console.error(`[store] Supabase-Laden fehlgeschlagen (Versuch ${attempt}/${MAX_TRIES}): ${err.message}`);
        if (attempt < MAX_TRIES) await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    if (loaded) {
      if (data) {
        cache = { ...emptyDb(), ...data };
        knownUsers = cache.users.length;
      } else {
        cache = emptyDb();
      }
      await migrateToChunks(); // einmalig; danach werden nur geänderte Blöcke gespeichert
      if (!data && !chunked) scheduleSbFlush(); // ersten Datensatz anlegen
      console.log(`[store] Persistenz: Supabase (${chunked ? 'aufgeteilt' : 'ein Dokument'})`);
    } else {
      // Supabase dauerhaft nicht erreichbar (häufig: pausiertes Free-Projekt).
      // NICHT abstürzen – im Notmodus lokal weiterlaufen. Es wird bewusst NICHT
      // nach Supabase geschrieben, damit dort vorhandene Daten erhalten bleiben.
      supabaseDegraded = true;
      cache = emptyDb(); // bewusst leer: im Notmodus werden keine echten Anfragen bedient
      scheduleRecovery();
      console.error(
        '[store] WARNUNG: Supabase nicht erreichbar – Server startet im NOTMODUS ' +
          '(lokale, nicht dauerhafte Speicherung). Bitte das Supabase-Projekt ' +
          'reaktivieren (Free-Projekte pausieren nach ~1 Woche Inaktivität) und neu deployen.',
      );
    }
  } else {
    cache = fileLoad();
    console.log('[store] Persistenz: lokale Datei');
  }
  return cache;
}

// Notmodus verlassen: regelmäßig erneut laden. Sobald Supabase antwortet, wird
// der echte Bestand übernommen und der Server arbeitet normal weiter -- ohne
// Neustart. Was im Notmodus im Speicher stand (nichts Echtes), wird verworfen.
const RECOVERY_EVERY_MS = Number(process.env.DBZ_RECOVERY_MS) || 20000;
let recoveryTimer = null;
function scheduleRecovery() {
  if (recoveryTimer) return;
  recoveryTimer = setInterval(async () => {
    try {
      const data = await loadRemote();
      const local = cache;
      cache = data ? { ...emptyDb(), ...data } : { ...emptyDb(), ...local };
      knownUsers = cache.users.length;
      supabaseDegraded = false;
      clearInterval(recoveryTimer);
      recoveryTimer = null;
      console.log('[store] Supabase wieder erreichbar – Notmodus beendet, Persistenz: Supabase');
      await migrateToChunks();
      if (!data && !chunked) scheduleSbFlush();
    } catch {
      /* weiter warten */
    }
  }, RECOVERY_EVERY_MS);
  recoveryTimer.unref?.();
}

/** Schreibt ausstehende Änderungen und wartet, bis alles gespeichert ist. */
export async function flushStore() {
  if (!useSupabase || supabaseDegraded) {
    if (cache) {
      try {
        fileSave();
      } catch (err) {
        console.error('[store] Lokales Speichern fehlgeschlagen:', err.message);
      }
    }
    return;
  }
  dirty = true;
  urgent = true;
  try {
    await drainWrites();
    // Lief beim Aufruf schon ein Vorgang, kann danach noch etwas offen sein.
    while (dirty) await drainWrites();
  } finally {
    urgent = false;
  }
}

export const db = {
  /** Liefert eine Collection (Array) als veränderbare Referenz. */
  all(collection) {
    const data = load();
    if (!Array.isArray(data[collection])) data[collection] = [];
    return data[collection];
  },
  /** Fügt ein Element hinzu und speichert. */
  insert(collection, item) {
    this.all(collection).push(item);
    persist();
    return item;
  },
  /** Schreibt Änderungen, die direkt am Collection-Array vorgenommen wurden. */
  commit() {
    persist();
  },
  get meta() {
    return load().meta;
  },
  /** Vollständige Kopie des Datenbestands (für Backups/Export). */
  snapshot() {
    return JSON.parse(JSON.stringify(load()));
  },
  /**
   * Ersetzt den gesamten Datenbestand (Wiederherstellung aus einer Sicherung).
   * Nur für echte Daten, nie im Demo-Sandkasten.
   */
  restore(data) {
    if (inSandbox()) throw new Error('Im Demo-Modus nicht möglich');
    if (!data || typeof data !== 'object' || !Array.isArray(data.users) || !data.users.length)
      throw new Error('Sicherung ist leer oder beschädigt');
    cache = { ...emptyDb(), ...JSON.parse(JSON.stringify(data)) };
    knownUsers = 0; // gewollter Ersatz des Bestands
    persist();
  },
  /** Speicher-Backend als Text (für Diagnose/Health). */
  get backend() {
    if (useSupabase) return supabaseDegraded ? 'supabase-degraded' : 'supabase';
    return 'file';
  },
  /** Ablageform in Supabase: 'chunks' (aufgeteilt) oder 'single' (ein Dokument). */
  get layout() {
    return useSupabase ? (chunked ? 'chunks' : 'single') : 'file';
  },
  /** Pfad der Datenbankdatei (für Backups). */
  get file() {
    return DB_FILE;
  },
  get dir() {
    return DATA_DIR;
  },
  /** Nur für Tests: setzt den In-Memory-Cache und die Datei zurück. */
  __resetForTests() {
    cache = emptyDb();
    persist();
  },
};

export function newId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
