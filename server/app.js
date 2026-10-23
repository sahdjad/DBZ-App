// Baut die Express-App (ohne listen), damit sie in Tests wiederverwendbar ist.

import './tz.js';
import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import api from './api.js';
import { securityHeaders } from './security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  // Hinter einem Reverse-Proxy (z. B. Render): korrekte Client-IP für Rate-Limiting.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(securityHeaders);
  // Komprimierung (Brotli/gzip) für Text: JS, CSS, HTML, JSON -- beim ersten
  // Start werden so statt ~450 KB nur ~120 KB übertragen (gemessen). Audio,
  // Bilder, PDFs und das Sprachmodell sind schon komprimiert bzw. werden per
  // Range-Anfrage geladen und bleiben unberührt (Teil-Anfragen nie komprimieren,
  // sonst passt Content-Range nicht mehr -- wichtig für Safari/iOS-Wiedergabe).
  app.use(compression({ threshold: 1024, filter: (req, res) => !req.headers.range && compression.filter(req, res) }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Aktuelle App-Version (Build-Kennung des ausgelieferten Frontends) -- die
  // App fragt das regelmäßig ab und aktualisiert sich selbst.
  const versionFile = path.join(__dirname, '..', 'client', 'dist', 'version.json');
  app.get('/api/version', (_req, res) => {
    let build = 'dev';
    try { build = JSON.parse(fs.readFileSync(versionFile, 'utf8')).build || 'dev'; } catch { /* Dev ohne Build */ }
    res.set('Cache-Control', 'no-store').json({ build });
  });

  app.use('/api', api);
  app.use('/api', (err, _req, res, _next) => {
    console.error('[api error]', err.message);
    res.status(err.status || 400).json({ error: err.message || 'Serverfehler' });
  });

  const dist = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    // Dateien mit Inhalts-Hash im Namen (/assets/…) ändern sich nie -> ein Jahr
    // im Browser behalten. Einstieg (index.html), Service Worker und Version
    // immer frisch prüfen; übrige Dateien (Logo, Schriften, Qur'an-Index) einen Tag.
    app.use(express.static(dist, {
      setHeaders(res, file) {
        const rel = path.relative(dist, file).replace(/\\/g, '/');
        // assets/: Inhalts-Hash im Namen; mushaf/qpc-v2/: Ausgabe im Pfad -- beide unveränderlich.
        if (rel.startsWith('assets/') || rel.startsWith('mushaf/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else if (/^(index\.html|sw\.js|version\.json|manifest\.webmanifest)$/.test(rel)) res.setHeader('Cache-Control', 'no-cache');
        else res.setHeader('Cache-Control', 'public, max-age=86400');
      },
    }));
    app.get('*', (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(dist, 'index.html')); });
  } else {
    app.get('/', (_req, res) =>
      res.type('text').send('DBZ-App API läuft. Frontend im Dev-Modus unter Vite (npm run dev).'),
    );
  }
  return app;
}
