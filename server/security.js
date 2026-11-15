// Sicherheits-Middleware der DBZ-App (ohne externe Abhängigkeiten).
// Setzt schützende HTTP-Header inkl. Content-Security-Policy. Da die App
// Minderjährigendaten verarbeitet, ist dies Produktionsanforderung.

// CSP: Alles nur von der eigenen Herkunft; Ausnahmen:
// - media-src erlaubt die Rezitator-Audio-CDNs (Qur'an-Reader, <audio> im Browser):
//   quranicaudio.com (durchgehende Sure-Aufnahmen) und islamic.network (Reserve)
// - style-src 'unsafe-inline' für React-Inline-Styles (z. B. Fortschrittsbalken)
// - script-src 'wasm-unsafe-eval': nötig, damit die On-Device-Spracherkennung
//   (WebAssembly, onnxruntime-web) kompilieren darf. Erlaubt ausdrücklich KEIN
//   JavaScript-eval(), nur das Kompilieren von WebAssembly-Modulen.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "connect-src 'self'",
  "media-src 'self' https://download.quranicaudio.com https://*.quranicaudio.com https://cdn.islamic.network",
].join('; ');

export function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  // Kamera (QR-Check-in) und Mikrofon (Audio-Hausaufgaben) nur für eigene Herkunft.
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

/**
 * Einfacher, speicherbasierter Fehlversuchs-Zähler für den Login.
 * Zählt NUR fehlgeschlagene Versuche je Schlüssel; erfolgreiche Logins löschen den
 * Zähler. Kein externer Store nötig (Pilot, eine Instanz).
 */
export function createLoginThrottle({ max = 8, windowMs = 10 * 60 * 1000 } = {}) {
  const fails = new Map();
  return {
    blocked(key) {
      const rec = fails.get(key);
      if (!rec) return false;
      if (Date.now() > rec.reset) {
        fails.delete(key);
        return false;
      }
      return rec.count >= max;
    },
    fail(key) {
      const now = Date.now();
      const rec = fails.get(key);
      if (!rec || now > rec.reset) fails.set(key, { count: 1, reset: now + windowMs });
      else rec.count += 1;
    },
    succeed(key) {
      fails.delete(key);
    },
  };
}

/**
 * Einfache Mengenbegrenzung je Schlüssel (z. B. Absender-Adresse oder Konto):
 * höchstens `max` Aufrufe je Zeitfenster. `hit(key)` zählt und meldet, ob der
 * Aufruf noch erlaubt ist. Speicherbasiert (eine Instanz), räumt sich selbst auf.
 */
export function createRateLimit({ max, windowMs }) {
  const hits = new Map();
  const sweep = () => { const now = Date.now(); for (const [k, r] of hits) if (now > r.reset) hits.delete(k); };
  return {
    hit(key) {
      const now = Date.now();
      if (hits.size > 5000) sweep();
      const rec = hits.get(key);
      if (!rec || now > rec.reset) { hits.set(key, { count: 1, reset: now + windowMs }); return true; }
      rec.count += 1;
      return rec.count <= max;
    },
    /** Sekunden bis zum Ende des Fensters (für Retry-After). */
    retryAfter(key) {
      const rec = hits.get(key);
      return rec ? Math.max(1, Math.ceil((rec.reset - Date.now()) / 1000)) : 1;
    },
    reset(key) { hits.delete(key); },
  };
}
