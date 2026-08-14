// EmailProvider – austauschbare E-Mail-Anbindung (docs/INTEGRATIONS.md §5).
//
// Ohne Konfiguration läuft der "log"-Modus: E-Mails werden protokolliert, nicht
// versendet (Pilot/Dev). Wird EMAIL_API_URL gesetzt, werden E-Mails per HTTP-API
// (z. B. Resend/Postmark/eigener Webhook) versendet – kein zusätzliches npm-Paket.
//
// ENV:
//   EMAIL_API_URL   HTTP-Endpunkt, der { from, to, subject, text, html } als JSON annimmt
//   EMAIL_API_KEY   optionaler Bearer-Token
//   EMAIL_FROM      Absender (Standard: "DBZ <no-reply@deen-bildungszentrum>")

export const emailMode = () => (process.env.EMAIL_API_URL ? 'http' : 'log');

export async function sendEmail({ to, subject, text, html }) {
  const from = process.env.EMAIL_FROM || 'DBZ <no-reply@deen-bildungszentrum>';
  if (emailMode() === 'http') {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(process.env.EMAIL_API_URL, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'content-type': 'application/json',
          ...(process.env.EMAIL_API_KEY ? { authorization: `Bearer ${process.env.EMAIL_API_KEY}` } : {}),
        },
        body: JSON.stringify({ from, to, subject, text, html: html || undefined }),
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { ok: true, provider: 'http' };
    } catch (err) {
      console.error('[email] Versand fehlgeschlagen:', err.message);
      return { ok: false, error: err.message, provider: 'http' };
    }
  }
  // log-Modus: nicht versenden, nur protokollieren
  console.log(`[email:log] an=${to} betreff="${subject}"\n${text}`);
  return { ok: true, provider: 'log' };
}
