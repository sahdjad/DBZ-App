// Gekapselter JSON-Datastore der DBZ-App.
//
// Die gesamte Persistenz läuft über dieses Modul. Die öffentliche API
// (all/insert/commit) ist bewusst klein gehalten, damit ein späterer Umstieg
// auf Supabase/Postgres nur dieses Modul betrifft (siehe docs/INTEGRATIONS.md,
// "StorageProvider / Provider-Abstraktion").

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DBZ_DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

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

function load() {
  ensureDirs();
  if (cache) return cache;
  if (fs.existsSync(DB_FILE)) {
    try {
      cache = { ...emptyDb(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) };
    } catch {
      cache = emptyDb();
    }
  } else {
    cache = emptyDb();
  }
  return cache;
}

function persist() {
  ensureDirs();
  fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2));
}

// --- Öffentliche API ---------------------------------------------------------

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
