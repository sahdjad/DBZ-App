// Gemeinsamer JSON-Abruf für die quran.com-Provider (Seite, Audio, Tafsir,
// Tadschwid teilen sich dasselbe Kontingent bei quran.com). War bisher in
// jedem Provider einzeln dupliziert.
//
// Rückmeldung nach echtem Gerätetest: die ersten ein bis zwei Mushaf-Seiten
// laden, danach schlägt jede weitere Seite fehl. Jeder Seitenwechsel löst
// durch das Vorausladen der Nachbarseite eine zweite, fast gleichzeitige
// quran.com-Anfrage aus -- ein knappes Anfragelimit bei einem anonymen,
// kostenlosen Zugang würde genau so aussehen. Ohne Zugriff auf die echte API
// in dieser Sandbox lässt sich das nicht zweifelsfrei beweisen, deshalb zwei
// unabhängige, verlustfreie Absicherungen, die im Normalfall nichts kosten:
// 1) alle Anfragen an diese Funktion laufen serialisiert (nie zwei
//    gleichzeitig) mit einer kleinen Mindestpause dazwischen, statt dass
//    Seiten-Fetch und Nachbar-Prefetch sich gegenseitig ins Limit laufen;
// 2) bis zu zwei Wiederholungen bei 429 UND bei 5xx/Netzwerkfehlern
//    (Zeitüberschreitung, Verbindungsabbruch), mit steigender Wartezeit.
const MIN_GAP_MS = 200;
let queue = Promise.resolve();

function serialize(fn) {
  const run = queue.then(fn, fn);
  // Folgeanfragen erst nach der Mindestpause freigeben, unabhängig davon,
  // ob diese hier erfolgreich war oder fehlschlug.
  queue = run.then(
    () => new Promise((r) => setTimeout(r, MIN_GAP_MS)),
    () => new Promise((r) => setTimeout(r, MIN_GAP_MS)),
  );
  return run;
}

async function fetchOnce(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
  } finally {
    clearTimeout(t);
  }
}

export async function fetchJson(url, { timeoutMs = 12000 } = {}) {
  return serialize(async () => {
    const maxAttempts = 3;
    let lastErr;
    for (let i = 0; i < maxAttempts; i += 1) {
      let res;
      try {
        res = await fetchOnce(url, timeoutMs);
      } catch (err) {
        lastErr = err; // Netzwerkfehler/Timeout -- wie ein 5xx behandeln.
        if (i < maxAttempts - 1) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
        continue;
      }
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        lastErr = new Error(`HTTP ${res.status}`);
        if (i < maxAttempts - 1) {
          const retryAfter = Number(res.headers.get('retry-after'));
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 4000)
            : 800 * (i + 1);
          await new Promise((r) => setTimeout(r, waitMs));
        }
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
    throw lastErr || new Error('fetch fehlgeschlagen');
  });
}
