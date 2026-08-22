// Web-Push (Browser-Benachrichtigungen) OHNE externe Abhängigkeit.
//
// Implementiert die nötigen Standards mit Node-Bordmitteln (node:crypto):
//   - VAPID (RFC 8292): signierter ES256-JWT als Absendernachweis
//   - Nutzlast-Verschlüsselung aes128gcm (RFC 8188/8291): ECDH P-256 + HKDF
//
// Schlüssel werden bei Bedarf einmalig erzeugt und im Store (mit)gesichert, so
// dass sie über Neustarts/Deployments stabil bleiben. Optional per Umgebung
// (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT) vorgebbar.

import crypto from 'node:crypto';
import { db, newId } from './store.js';

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (str) => Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

let vapid = null; // { publicB64, privateKey: KeyObject, subject }

function privateKeyFromJwk(jwk) {
  return crypto.createPrivateKey({ key: jwk, format: 'jwk' });
}

function loadOrCreateVapid() {
  if (vapid) return vapid;
  const subject = process.env.VAPID_SUBJECT || 'mailto:info@deenbildungszentrum.de';

  // 1) Aus Umgebung (Public = roher Punkt b64url, Private = d b64url)
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    const rawPub = unb64url(process.env.VAPID_PUBLIC_KEY);
    const jwk = {
      kty: 'EC', crv: 'P-256',
      x: b64url(rawPub.subarray(1, 33)), y: b64url(rawPub.subarray(33, 65)),
      d: b64url(unb64url(process.env.VAPID_PRIVATE_KEY)),
    };
    vapid = { publicB64: process.env.VAPID_PUBLIC_KEY, privateKey: privateKeyFromJwk(jwk), subject };
    return vapid;
  }

  // 2) Aus Store, sonst einmalig erzeugen und persistieren.
  let rec = db.all('push_keys')[0];
  if (!rec) {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = privateKey.export({ format: 'jwk' }); // { kty, crv, x, y, d }
    const rawPub = Buffer.concat([Buffer.from([4]), unb64url(jwk.x), unb64url(jwk.y)]);
    rec = { id: 'vapid', jwk, publicB64: b64url(rawPub), createdAt: new Date().toISOString() };
    db.insert('push_keys', rec);
  }
  vapid = { publicB64: rec.publicB64, privateKey: privateKeyFromJwk(rec.jwk), subject };
  return vapid;
}

export function getPublicKeyB64() {
  return loadOrCreateVapid().publicB64;
}
export function pushConfigured() {
  if (process.env.PUSH_DISABLED === '1') return false;
  try { loadOrCreateVapid(); return true; } catch { return false; }
}

// --- VAPID-Autorisierung ------------------------------------------------------
function vapidAuth(endpoint) {
  const { publicB64, privateKey, subject } = loadOrCreateVapid();
  const aud = new URL(endpoint).origin;
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64url(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const signingInput = `${header}.${payload}`;
  const sig = crypto.sign('sha256', Buffer.from(signingInput), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return { authorization: `vapid t=${signingInput}.${b64url(sig)}, k=${publicB64}` };
}

// --- Nutzlast-Verschlüsselung (aes128gcm) ------------------------------------
export function encryptPayload(plaintext, p256dhB64, authB64) {
  const uaPublic = unb64url(p256dhB64); // Client-Public (65 Byte)
  const authSecret = unb64url(authB64); // 16 Byte
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey(); // Server-Ephemeral-Public (65 Byte)
  const shared = ecdh.computeSecret(uaPublic); // ECDH-Geheimnis (32 Byte)
  const salt = crypto.randomBytes(16);

  // RFC 8291: IKM = HKDF(salt=auth_secret, ikm=shared, info="WebPush: info"||0||ua||as, 32)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  // RFC 8188: CEK/NONCE aus IKM + random salt
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12));

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const data = Buffer.concat([Buffer.from(plaintext), Buffer.from([0x02])]); // ein Record, Delimiter 0x02
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  // Header (RFC 8188): salt(16) | rs(4) | idlen(1) | keyid(as_public) | ciphertext
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, ciphertext]);
}

async function sendPush(sub, payloadObj) {
  const { authorization } = vapidAuth(sub.endpoint);
  const body = encryptPayload(Buffer.from(JSON.stringify(payloadObj), 'utf8'), sub.p256dh, sub.auth);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      TTL: '86400',
      Urgency: 'normal',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      Authorization: authorization,
    },
    body,
  });
}

// --- Abo-Verwaltung -----------------------------------------------------------
export function saveSubscription(userId, subscription) {
  const endpoint = subscription?.endpoint;
  const keys = subscription?.keys;
  if (!endpoint || !keys?.p256dh || !keys?.auth) return null;
  const arr = db.all('push_subscriptions');
  const existing = arr.find((s) => s.endpoint === endpoint);
  if (existing) {
    existing.userId = userId; existing.p256dh = keys.p256dh; existing.auth = keys.auth; existing.updatedAt = new Date().toISOString();
    db.commit();
    return existing;
  }
  const rec = { id: newId('push'), userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, createdAt: new Date().toISOString() };
  db.insert('push_subscriptions', rec);
  return rec;
}
export function removeSubscription(endpoint) {
  const arr = db.all('push_subscriptions');
  const i = arr.findIndex((s) => s.endpoint === endpoint);
  if (i >= 0) { arr.splice(i, 1); db.commit(); return true; }
  return false;
}
export function hasSubscription(userId) {
  return db.all('push_subscriptions').some((s) => s.userId === userId);
}

// Best-effort-Versand an alle Geräte eines Nutzers. Nie werfen; abgelaufene
// Abos (404/410) werden entfernt.
export async function pushToUser(userId, payload) {
  if (!pushConfigured()) return;
  const subs = db.all('push_subscriptions').filter((s) => s.userId === userId);
  if (!subs.length) return;
  const gone = [];
  await Promise.all(subs.map(async (s) => {
    try {
      const res = await sendPush(s, payload);
      if (res.status === 404 || res.status === 410) gone.push(s.id);
    } catch { /* Netz-/Servicefehler ignorieren */ }
  }));
  if (gone.length) {
    const arr = db.all('push_subscriptions');
    for (const id of gone) { const i = arr.findIndex((x) => x.id === id); if (i >= 0) arr.splice(i, 1); }
    db.commit();
  }
}
