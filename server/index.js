// Express-Einstiegspunkt der DBZ-App. In Produktion liefert der Server
// zusätzlich das gebaute Frontend (client/dist) und die API auf einem Port aus.

import { createApp } from './app.js';
import { seed } from './seed.js';
import { scheduleMaintenance } from './maintenance.js';

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

await seed();
const app = createApp();

app.listen(PORT, () => {
  console.log(`DBZ-App läuft auf Port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  scheduleMaintenance();
});
