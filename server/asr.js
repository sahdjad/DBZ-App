// Modell-Dateien für die On-Device-Qur'an-Spracherkennung (NVIDIA
// FastConformer, Qur'an-Feinabstimmung aus dem MIT-Projekt Tilawa,
// github.com/yazinsai/tilawa; Modell unter NVIDIA CC-BY-4.0).
//
// Der Server lädt die Dateien beim ersten Abruf EINMAL von der offiziellen
// Release, prüft die SHA-256-Prüfsumme (Schutz vor manipulierten/defekten
// Downloads) und liefert sie danach selbst aus -- mit langer Cache-Dauer,
// damit Handys sie nur einmal laden. Die Erkennung selbst läuft vollständig
// im Browser des Geräts; es wird nie Audio an den Server geschickt.
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RELEASE = 'https://github.com/yazinsai/tilawa/releases/download/v0.2.0';
export const ASR_FILES = {
  model: { name: 'fastconformer_full_mixed.onnx', size: 88307366, sha256: '4767182cd92975869f81a7e32700b14ca2b04e8dc97a15ff220a8697f4639488', type: 'application/octet-stream' },
  vocab: { name: 'vocab.json', size: 21062, sha256: 'c55877f3bff8bc3aaefc160e8c2fb88cb349088d092513d40210ccfe535e671b', type: 'application/json' },
};

const DIR = process.env.DBZ_ASR_DIR || path.join(os.tmpdir(), 'dbz-asr');
const inflight = new Map();

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

async function download(def, target, fetchImpl) {
  const tmp = `${target}.${process.pid}.part`;
  const res = await fetchImpl(`${RELEASE}/${def.name}`, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Download ${def.name} fehlgeschlagen (${res.status})`);
  const out = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!out.write(value)) await new Promise((r) => out.once('drain', r));
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  const digest = await sha256File(tmp);
  if (digest !== def.sha256) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`Prüfsumme von ${def.name} stimmt nicht`);
  }
  fs.renameSync(tmp, target);
}

/** Lokaler Pfad der Datei; lädt sie beim ersten Mal herunter (parallel sicher). */
export async function ensureAsrFile(key, fetchImpl = globalThis.fetch) {
  const def = ASR_FILES[key];
  if (!def) throw new Error('Unbekannte Datei');
  const target = path.join(DIR, def.name);
  if (fs.existsSync(target) && fs.statSync(target).size === def.size) return target;
  if (!inflight.has(key)) {
    fs.mkdirSync(DIR, { recursive: true });
    inflight.set(key, download(def, target, fetchImpl).finally(() => inflight.delete(key)));
  }
  await inflight.get(key);
  return target;
}
