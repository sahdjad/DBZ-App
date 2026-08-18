// Express-Einstiegspunkt der DBZ-App. In Produktion liefert der Server
// zusätzlich das gebaute Frontend (client/dist) und die API auf einem Port aus.

import { createApp } from './app.js';
import { seed } from './seed.js';
import { scheduleMaintenance } from './maintenance.js';
import { initStore, flushStore } from './store.js';

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
await seed();
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`DBZ-App läuft auf Port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  scheduleMaintenance();
});

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
