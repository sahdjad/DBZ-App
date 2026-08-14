// Baut die Express-App (ohne listen), damit sie in Tests wiederverwendbar ist.

import express from 'express';
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
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use('/api', api);
  app.use('/api', (err, _req, res, _next) => {
    console.error('[api error]', err.message);
    res.status(err.status || 400).json({ error: err.message || 'Serverfehler' });
  });

  const dist = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    app.get('/', (_req, res) =>
      res.type('text').send('DBZ-App API läuft. Frontend im Dev-Modus unter Vite (npm run dev).'),
    );
  }
  return app;
}
