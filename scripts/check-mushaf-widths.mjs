// Konsistenzprüfung der Zeilen aller 604 Muṣḥaf-Seiten mit den echten
// KFGQPC-Seitenschriften: Die Glyphen sind dem Druck entnommen, jede gedruckte
// Zeile ergibt mit ihnen dieselbe Breite. Steht ein Wort in der falschen Zeile,
// wird eine Zeile deutlich zu lang und die Nachbarzeile zu kurz (> 6 %).
// Zentrierte Zeilen (Seite 1–2, Sure-Enden) sind ausgenommen.
//
//   npx playwright@1 install-deps   (falls nötig)
//   node scripts/check-mushaf-widths.mjs  [Pfad zu playwright, falls nicht global]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'public', 'mushaf', 'qpc-v2');
const pw = process.argv[2] ? await import(pathToFileURL(process.argv[2]).href) : await import('playwright');
const LIMIT = 0.06;

const server = http.createServer((req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><meta charset="utf-8"><body>'); }
  const file = path.join(root, decodeURIComponent(req.url));
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', 'font/woff2');
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await pw.chromium.launch();
const page = await browser.newPage();
await page.goto(`${base}/`);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const problems = [];
let checked = 0;
let worst = 0;
for (let p = 1; p <= 604; p++) {
  const d = JSON.parse(fs.readFileSync(path.join(root, 'pages', `${String(p).padStart(3, '0')}.json`), 'utf8'));
  const lines = d.lines.filter((l) => l.type === 'text' && !l.c);
  if (!lines.length) continue;
  const widths = await page.evaluate(async ([n, glyphs]) => {
    const ff = new FontFace(`p${n}`, `url(/fonts/p${String(n).padStart(3, '0')}.woff2)`);
    document.fonts.add(await ff.load());
    return glyphs.map((g) => {
      const el = document.createElement('span');
      el.style.cssText = `font-family:p${n};font-size:100px;white-space:nowrap;position:absolute`;
      el.textContent = g;
      document.body.appendChild(el);
      const w = el.getBoundingClientRect().width;
      el.remove();
      return w;
    });
  }, [p, lines.map((l) => l.words.map((w) => w.g).join('').replace(/\s/g, ''))]);
  const m = median(widths);
  widths.forEach((w, i) => {
    const dev = (w - m) / m;
    checked++;
    worst = Math.max(worst, Math.abs(dev));
    if (Math.abs(dev) > LIMIT) problems.push(`Seite ${p} Zeile ${lines[i].n}: ${(dev * 100).toFixed(1)} %`);
  });
}
await browser.close();
server.close();
if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`FEHLER: ${problems.length} Zeilen weichen mehr als ${LIMIT * 100} % ab`);
  process.exit(1);
}
console.log(`OK: ${checked} Zeilen auf 604 Seiten, größte Abweichung ${(worst * 100).toFixed(1)} %`);
