// Web-Push im Browser: Berechtigung, An-/Abmeldung, Status.
import { api } from './api.js';

const urlB64ToUint8 = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const base = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export function pushSupported() {
  return typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

// iOS/iPadOS erlaubt Web-Push nur, wenn die App zum Home-Bildschirm hinzugefügt
// wurde (installiert). Erkennung für einen passenden Hinweis.
export function iosNeedsInstall() {
  const ua = navigator.userAgent || '';
  const isIOS = /iP(hone|ad|od)/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
  return isIOS && !standalone && !pushSupported();
}

export async function getPushState() {
  if (!pushSupported()) return { supported: false, subscribed: false, permission: 'default' };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return { supported: true, subscribed: !!sub, permission: Notification.permission };
  } catch {
    return { supported: true, subscribed: false, permission: Notification.permission };
  }
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('Dieses Gerät unterstützt keine Benachrichtigungen.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt.');
  const status = await api.get('/push/status');
  if (!status.enabled || !status.publicKey) throw new Error('Push ist auf dem Server nicht aktiv.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8(status.publicKey),
    });
  }
  await api.post('/push/subscribe', { subscription: sub.toJSON() });
  return true;
}

export async function disablePush() {
  if (!pushSupported()) return true;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return true;
}
