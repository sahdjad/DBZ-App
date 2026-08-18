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
  quran_goals: [],
  recitation_attempts: [],
  exams: [],
  exam_attempts: [],
  announcements: [],
  materials: [],
  threads: [], // Direktnachrichten (mit eingebetteten messages)
  quran_marks: [], // pro Nutzer: zuletzt gelesen + Lesezeichen
  invites: [], // Einladungen (nur Token-Hash gespeichert)
  password_resets: [], // Passwort-Reset-Tokens (nur Hash)
  report_periods: [],
  student_reports: [],
  notifications: [],
  audit_logs: [],
  meta: { seeded: false },
});

let cache = null;

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

async function sbSave(data) {
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

// Single-Flight-Writer: Es läuft immer nur EIN Schreibvorgang gleichzeitig.
// Kommen währenddessen weitere Änderungen, wird nach Abschluss genau einmal
// nachgespeichert (dirty-Flag). So geht nie ein Stand verloren und die Aufrufer
// (insert/commit) müssen nicht warten.
let writing = false;
let dirty = false;
export let lastPersistError = null;

async function drainWrites() {
  if (writing) return;
  writing = true;
  try {
    while (dirty) {
      dirty = false;
      try {
        await sbSave(cache);
        lastPersistError = null;
      } catch (err) {
        lastPersistError = err;
        dirty = true; // erneut versuchen
        console.error('[store]', err.message, '– neuer Versuch in 3s');
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  } finally {
    writing = false;
  }
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
    } catch {
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

function load() {
  if (cache) return cache;
  // Fallback für Codepfade, die vor initStore() zugreifen (z. B. Tests):
  // im Supabase-Modus starten wir leer, im Dateimodus lesen wir die Datei.
  cache = useSupabase ? emptyDb() : fileLoad();
  return cache;
}

function persist() {
  if (useSupabase) {
    scheduleSbFlush();
    return;
  }
  fileSave();
}

// --- Öffentliche API ---------------------------------------------------------

/**
 * Lädt den Datenbestand aus dem aktiven Backend in den Cache. MUSS beim
 * Serverstart vor jedem Datenzugriff einmal awaited werden (siehe index.js).
 */
export async function initStore() {
  if (cache) return cache;
  if (useSupabase) {
    ensureDirs(); // Upload-Ordner weiterhin lokal
    const data = await sbLoad(); // Fehler beim Laden = harter Startabbruch (Fail-Safe)
    if (data) {
      cache = { ...emptyDb(), ...data };
    } else {
      cache = emptyDb();
      scheduleSbFlush(); // ersten Datensatz anlegen
    }
    console.log('[store] Persistenz: Supabase');
  } else {
    cache = fileLoad();
    console.log('[store] Persistenz: lokale Datei');
  }
  return cache;
}

/** Schreibt ausstehende Änderungen und wartet, bis alles gespeichert ist. */
export async function flushStore() {
  if (!useSupabase) {
    if (cache) fileSave();
    return;
  }
  dirty = true;
  await drainWrites();
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
  /** Speicher-Backend als Text (für Diagnose/Health). */
  get backend() {
    return useSupabase ? 'supabase' : 'file';
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
