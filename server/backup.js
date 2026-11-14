// Datensicherung der DBZ-App.
//
// Der Datenbestand ist ein einziges Dokument, das bei jeder Änderung
// überschrieben wird -- ohne Sicherung ließe sich ein Fehler oder eine
// versehentliche Löschung nie zurückholen. Deshalb:
//   - täglich EINE Momentaufnahme ("daily-JJJJ-MM-TT"), die letzten 30 bleiben;
//   - vor jeder Massenlöschung eine weitere ("event-…"), die letzten 20 bleiben.
//
// Ablage: mit Supabase in einem eigenen PRIVATEN Bucket (dauerhaft, getrennt
// von den Uploads der Nutzer), sonst lokal unter data/backups (Entwicklung,
// Tests). Gespeichert wird gzip-komprimiert (JSON schrumpft auf rund ein Zehntel).
// Der Demo-Sandkasten wird nie gesichert.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { db, inSandbox, useSupabase, isSupabaseDegraded } from './store.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = process.env.SUPABASE_BACKUP_BUCKET || 'dbz-backups';
export const KEEP_DAILY = 30;
export const KEEP_EVENT = 20;
const NAME_RE = /^(daily|event)-[0-9A-Za-z-]{1,80}\.json\.gz$/;

const remote = () => useSupabase && !isSupabaseDegraded();
const headers = (extra = {}) => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, ...extra });
const localDir = () => path.join(db.dir, 'backups');
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const slug = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
  const body = res.ok ? '' : await res.text().catch(() => '');
  if (res.ok || res.status === 409 || /already exists|Duplicate/i.test(body)) { bucketReady = true; return; }
  throw new Error(`Sicherungs-Bucket nicht verfügbar (HTTP ${res.status})`);
}

async function put(name, bytes) {
  if (!remote()) {
    fs.mkdirSync(localDir(), { recursive: true });
    fs.writeFileSync(path.join(localDir(), name), bytes);
    return;
  }
  await ensureBucket();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/gzip', 'x-upsert': 'true' }),
    body: bytes,
  });
  if (!res.ok) throw new Error(`Sicherung nicht gespeichert (HTTP ${res.status})`);
}

async function remove(names) {
  if (!names.length) return;
  if (!remote()) {
    for (const n of names) fs.rmSync(path.join(localDir(), n), { force: true });
    return;
  }
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: names }),
  });
}

/** Alle Sicherungen, neueste zuerst: [{ name, kind, size, createdAt }]. */
export async function listBackups() {
  let rows = [];
  if (!remote()) {
    if (fs.existsSync(localDir())) {
      rows = fs.readdirSync(localDir()).map((name) => {
        const st = fs.statSync(path.join(localDir(), name));
        return { name, size: st.size, createdAt: st.mtime.toISOString() };
      });
    }
  } else {
    await ensureBucket();
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefix: '', limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!res.ok) throw new Error(`Sicherungen nicht lesbar (HTTP ${res.status})`);
    rows = (await res.json()).map((o) => ({
      name: o.name, size: o.metadata?.size ?? null, createdAt: o.updated_at || o.created_at || null,
    }));
  }
  return rows
    .filter((r) => NAME_RE.test(r.name))
    .map((r) => ({ ...r, kind: r.name.startsWith('daily-') ? 'daily' : 'event' }))
    .sort((a, b) => b.name.slice(b.name.indexOf('-')).localeCompare(a.name.slice(a.name.indexOf('-'))));
}

/** Inhalt einer Sicherung als Objekt (oder null). */
export async function loadBackup(name) {
  if (!NAME_RE.test(String(name))) return null;
  let bytes = null;
  if (!remote()) {
    const f = path.join(localDir(), name);
    if (fs.existsSync(f)) bytes = fs.readFileSync(f);
  } else {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`, { headers: headers() });
    if (res.ok) bytes = Buffer.from(await res.arrayBuffer());
  }
  if (!bytes) return null;
  return JSON.parse(zlib.gunzipSync(bytes).toString('utf8'));
}

async function prune() {
  const all = await listBackups();
  const old = [
    ...all.filter((b) => b.kind === 'daily').slice(KEEP_DAILY),
    ...all.filter((b) => b.kind === 'event').slice(KEEP_EVENT),
  ].map((b) => b.name);
  await remove(old);
}

/**
 * Legt eine Sicherung an. Der Stand wird SOFORT (synchron) festgehalten, das
 * Speichern läuft danach -- wer vor einer Löschung sichert, bekommt also den
 * Stand von davor, auch ohne auf das Ergebnis zu warten.
 * Rückgabe: Promise<{ ok, name } | { ok:false, error|skipped }>.
 */
export function backupNow(kind = 'event', label = '') {
  if (inSandbox()) return Promise.resolve({ ok: false, skipped: 'demo' });
  if (useSupabase && isSupabaseDegraded()) return Promise.resolve({ ok: false, skipped: 'notmodus' });
  let bytes;
  let name;
  try {
    if (!db.all('users').length) return Promise.resolve({ ok: false, skipped: 'leer' });
    bytes = zlib.gzipSync(Buffer.from(JSON.stringify(db.snapshot())));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    name = kind === 'daily' ? `daily-${dayKey()}.json.gz` : `event-${stamp}${slug(label) ? `-${slug(label)}` : ''}.json.gz`;
  } catch (err) {
    return Promise.resolve({ ok: false, error: err.message });
  }
  return put(name, bytes)
    .then(() => prune().catch((err) => console.error('[backup] Aufräumen fehlgeschlagen:', err.message)))
    .then(() => ({ ok: true, name }))
    .catch((err) => {
      console.error('[backup] fehlgeschlagen:', err.message);
      return { ok: false, error: err.message };
    });
}

/**
 * Tägliche Sicherung -- nur, wenn es für heute noch keine gibt. Der Server
 * startet im kostenlosen Tarif mehrmals täglich neu; die erste Sicherung des
 * Tages bleibt stehen und wird nicht von späteren Ständen überschrieben.
 */
export async function ensureDailyBackup() {
  try {
    if (inSandbox()) return { ok: false, skipped: 'demo' };
    const today = `daily-${dayKey()}.json.gz`;
    if ((await listBackups()).some((b) => b.name === today)) return { ok: true, name: today, existed: true };
    return await backupNow('daily');
  } catch (err) {
    console.error('[backup] tägliche Sicherung fehlgeschlagen:', err.message);
    return { ok: false, error: err.message };
  }
}
