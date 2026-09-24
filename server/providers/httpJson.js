// Gemeinsamer JSON-Abruf für die quran.com-Provider (Seite, Audio, Tafsir,
// Tadschwid teilen sich dasselbe Kontingent bei quran.com). War bisher in
// jedem Provider einzeln dupliziert.
//
// Wiederholt EINMAL bei HTTP 429 (Too Many Requests) -- Rückmeldung nach
// echtem Gerätetest: die ersten einbis zwei Mushaf-Seiten laden, danach
// schlägt jede weitere Seite fehl. Jeder Seitenwechsel löst durch das
// Vorausladen der Nachbarseiten mehrere quran.com-Anfragen gleichzeitig aus
// -- ein knappes Anfragelimit bei einem anonymen, kostenlosen Zugang würde
// genau so aussehen. Ohne Zugriff auf die echte API in dieser Sandbox lässt
// sich das nicht zweifelsfrei beweisen, aber ein einmaliger, kurzer
// Wiederholungsversuch ist eine sichere, verlustfreie Absicherung: sie
// kostet im Normalfall nichts und hilft genau in diesem Fall.
export async function fetchJson(url, { timeoutMs = 12000 } = {}) {
  const attempt = async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      return res;
    } finally {
      clearTimeout(t);
    }
  };
  let res = await attempt();
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 4000) : 1200;
    await new Promise((r) => setTimeout(r, waitMs));
    res = await attempt();
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
