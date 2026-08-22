/* Service Worker der DBZ-App – schlanke Offline-Strategie.
 *
 * - Qur'an-Leseinhalte (/api/quran/... GET: Suren, Seiten, Audio-Zeitmarken,
 *   Tadschwid, Tafsir/Übersetzung, Lesezeichen) werden zwischengespeichert:
 *   online immer frisch, offline aus dem letzten Stand – ohne Fehlermeldung.
 *   Beim erneuten Verbinden aktualisiert sich alles automatisch im Hintergrund.
 * - Alle anderen /api/-Aufrufe laufen immer über das Netzwerk (Auth, aktuelle,
 *   veränderliche Daten – nie cachen).
 * - Navigationen (HTML) network-first mit Cache-Fallback (App startet offline).
 * - Statische Assets inkl. Qur'an-Schrift cache-first (schnell, offline da).
 */
const CACHE = 'dbz-cache-v5'; // App-Shell + statische Assets (wird bei Updates ersetzt)
const DATA = 'dbz-quran-v1'; // Qur'an-Leseinhalte (bleibt bestehen -> offline verfügbar)
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/fonts/UthmanicHafs.woff2'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL).catch(() => {})).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  const keep = [CACHE, DATA];
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Qur'an-Leseinhalte, die offline nützlich sind (unveränderliche Inhalte +
// persönliche Marken). Mutationen sind POST/DELETE und werden nie gecacht.
function isQuranReadPath(pathname) {
  return (
    pathname.startsWith('/api/quran/surahs') ||
    pathname.startsWith('/api/quran/surah/') ||
    pathname.startsWith('/api/quran/page/') ||
    pathname.startsWith('/api/quran/surah-page/') ||
    pathname.startsWith('/api/quran/audio/') ||
    pathname.startsWith('/api/quran/tajweed/') ||
    pathname.startsWith('/api/quran/tafsir/') ||
    pathname.startsWith('/api/quran/tafsir-editions') ||
    pathname.startsWith('/api/quran/reciters') ||
    pathname.startsWith('/api/quran/me')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Fremd-Hosts (z. B. Audio-CDN) unangetastet

  // Qur'an-Leseinhalte: network-first (frisch, wenn online), Fallback auf Cache.
  if (url.pathname.startsWith('/api/quran/') && isQuranReadPath(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.status === 200) { const copy = res.clone(); caches.open(DATA).then((c) => c.put(request, copy)); }
          return res;
        })
        .catch(() => caches.match(request, { cacheName: DATA }).then((c) => c || caches.match(request))),
    );
    return;
  }

  // Übrige API: immer Netzwerk (nie cachen).
  if (url.pathname.startsWith('/api/')) return;

  // Navigationen: network-first, Fallback auf gecachte App-Shell.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  // Statische Assets (JS/CSS/Icons/Schrift): cache-first, sonst laden und cachen.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        }),
    ),
  );
});
