// Sicherheits-Middleware der DBZ-App (ohne externe Abhängigkeiten).
// Setzt schützende HTTP-Header inkl. Content-Security-Policy. Da die App
// Minderjährigendaten verarbeitet, ist dies Produktionsanforderung.

// CSP: Alles nur von der eigenen Herkunft; Ausnahmen:
// - media-src erlaubt das Rezitator-Audio-CDN (Qur'an-Reader, <audio> im Browser)
// - style-src 'unsafe-inline' für React-Inline-Styles (z. B. Fortschrittsbalken)
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "worker-src 'self'",
  "connect-src 'self'",
  'media-src \'self\' https://cdn.islamic.network',
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
