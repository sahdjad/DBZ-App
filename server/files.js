// Datei-Ablage der DBZ-App (Uploads: Audio, PDF, Bilder).
//
// Zwei Backends, automatisch gewählt – analog zu store.js:
//   1. Nur lokal (Standard/Tests): Dateien liegen unter data/uploads.
//   2. Supabase Storage (Produktion): Dateien werden zusätzlich dauerhaft in
//      einem privaten Bucket gespeichert. Aktiv, sobald SUPABASE_URL und
//      SUPABASE_SERVICE_KEY gesetzt sind.
//
// Die lokale Platte dient dann nur noch als schneller Cache; Quelle der Wahrheit
// ist Supabase. Der Zugriff läuft immer serverseitig über unsere autorisierten
// Routen – der Bucket ist privat, Dateien sind nie öffentlich abrufbar.

import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from './store.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = process.env.SUPABASE_BUCKET || 'uploads';
export const useSupabaseFiles = Boolean(SUPABASE_URL && SUPABASE_KEY);

function headers(extra = {}) {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, ...extra };
}

function objectUrl(filename) {
  return `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(filename)}`;
}

/** Legt den privaten Bucket an, falls noch nicht vorhanden (idempotent). */
export async function ensureFileBucket() {
  if (!useSupabaseFiles) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 26214400 }),
    });
    if (res.ok) {
      console.log(`[files] Supabase-Bucket "${BUCKET}" angelegt`);
      return;
    }
    const body = await res.text().catch(() => '');
    if (res.status === 409 || /already exists|Duplicate|resource already exists/i.test(body)) {
      console.log(`[files] Supabase-Bucket "${BUCKET}" vorhanden`);
      return;
    }
    console.error('[files] Bucket-Anlage fehlgeschlagen:', res.status, body);
  } catch (err) {
    console.error('[files] Bucket-Anlage fehlgeschlagen:', err.message);
  }
}

/**
 * Lädt eine gerade per Multer gespeicherte Datei dauerhaft nach Supabase hoch.
 * `file` ist das Multer-File-Objekt (filename, mimetype). Best-effort: Fehler
 * werden geloggt, brechen den Upload-Vorgang aber nicht ab (lokale Kopie bleibt).
 */
export async function persistUpload(file) {
  if (!useSupabaseFiles || !file) return;
  try {
    const bytes = fs.readFileSync(path.join(UPLOAD_DIR, file.filename));
    const res = await fetch(objectUrl(file.filename), {
      method: 'POST',
      headers: headers({ 'Content-Type': file.mimetype || 'application/octet-stream', 'x-upsert': 'true' }),
      body: bytes,
    });
    if (!res.ok) {
      console.error('[files] Upload zu Supabase fehlgeschlagen:', res.status, await res.text().catch(() => ''));
    }
  } catch (err) {
    console.error('[files] Upload zu Supabase fehlgeschlagen:', err.message);
  }
}

/**
 * Liefert den Inhalt einer Datei als Buffer (oder null, wenn nicht auffindbar).
 * Zuerst lokaler Cache, dann Supabase. Von Supabase geladene Dateien werden
 * lokal zwischengespeichert, damit der nächste Zugriff schnell ist.
 */
export async function readFile(filename) {
  const local = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(local)) {
    try {
      return fs.readFileSync(local);
    } catch {
      /* weiter zu Supabase */
    }
  }
  if (!useSupabaseFiles) return null;
  try {
    const res = await fetch(objectUrl(filename), { headers: headers() });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    try {
      fs.writeFileSync(local, buf);
    } catch {
      /* Cache ist optional */
    }
    return buf;
  } catch {
    return null;
  }
}

/** Löscht eine Datei aus Supabase (best-effort). Lokale Kopie separat entfernen. */
export async function deleteFile(filename) {
  if (!useSupabaseFiles || !filename) return;
  try {
    await fetch(objectUrl(filename), { method: 'DELETE', headers: headers() });
  } catch (err) {
    console.error('[files] Löschen in Supabase fehlgeschlagen:', err.message);
  }
}
