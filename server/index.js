// Express-Einstiegspunkt der DBZ-App. In Produktion liefert der Server
// zusätzlich das gebaute Frontend (client/dist) und die API auf einem Port aus.

import './tz.js';
import { createApp } from './app.js';
import { seed, removeLegacyDemoAccounts } from './seed.js';
import { scheduleMaintenance } from './maintenance.js';
import { initStore, flushStore } from './store.js';
import { ensureFileBucket } from './files.js';

const PORT = process.env.PORT || 4000;

// Produktions-Fail-Safe: niemals mit fehlendem/schwachem JWT-Schlüssel starten.
if (process.env.NODE_ENV === 'production') {
  const s = process.env.JWT_SECRET || '';
  if (s.length < 16 || s.includes('dev-secret')) {
    console.error(
      'FATAL: JWT_SECRET fehlt oder ist zu schwach. In Produktion einen langen, ' +
        'zufälligen Wert setzen (z. B. `openssl rand -base64 48`).',
    );
    process.exit(1);
  }
}

// Datenbestand aus dem aktiven Backend (Supabase oder lokale Datei) laden,
// bevor irgendein Code darauf zugreift.
await initStore();
await ensureFileBucket(); // Datei-Bucket (Supabase Storage) sicherstellen
await seed();
removeLegacyDemoAccounts();
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`DBZ-App läuft auf Port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  scheduleMaintenance();
  scheduleKeepAwake();
});

// OPTIONAL (standardmäßig AUS): Der kostenlose Render-Tarif legt den Server
// nach ~15 Minuten ohne Aufrufe schlafen; der erste Aufruf danach dauert bis
// zu einer Minute. Mit KEEP_AWAKE=1 ruft sich der Server alle 10 Minuten
// selbst über seine öffentliche Adresse auf und bleibt wach.
// KEEP_AWAKE_HOURS=6-23 begrenzt das auf diese Uhrzeiten (Europe/Berlin),
// damit nachts Ruhe ist und Freistunden gespart werden.
function scheduleKeepAwake() {
  const base = process.env.KEEP_AWAKE_URL || process.env.RENDER_EXTERNAL_URL;
  if (process.env.KEEP_AWAKE !== '1' || !base) return;
  const [from, to] = String(process.env.KEEP_AWAKE_HOURS || '0-24').split('-').map(Number);
  const ping = () => {
    const h = new Date().getHours();
    if (Number.isFinite(from) && Number.isFinite(to) && !(h >= from && h < to)) return;
    fetch(`${base.replace(/\/$/, '')}/api/health`).catch(() => {});
  };
  setInterval(ping, 10 * 60 * 1000).unref?.();
  console.log(`[keep-awake] aktiv (${from}-${to} Uhr)`);
}

// Sauberes Herunterfahren (z. B. Render-Redeploy sendet SIGTERM): letzte
// Änderungen noch dauerhaft speichern, dann beenden.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} empfangen – speichere und beende…`);
  try {
    await flushStore();
  } catch (err) {
    console.error('[shutdown] Speichern fehlgeschlagen:', err.message);
  }
  server.close(() => process.exit(0));
  // Notausstieg, falls offene Verbindungen das Schließen blockieren.
  setTimeout(() => process.exit(0), 5000).unref?.();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
