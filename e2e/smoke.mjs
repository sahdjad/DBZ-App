// Frontend-Smoke-Test: lädt als jede Demo-Rolle die wichtigsten Seiten in einem
// echten Chromium und prüft auf Render-, Laufzeit- und 404-Fehler.
//
// Voraussetzung: laufender Produktionsserver (npm run build && npm start) und
// eine Chromium-Binary. Nutzung:
//   npm i -D playwright-core
//   BASE=http://127.0.0.1:4000 \
//   PLAYWRIGHT_CHROMIUM=/pfad/zu/chromium \
//   node e2e/smoke.mjs
import { chromium } from 'playwright-core';

const BASE = process.env.BASE || 'http://127.0.0.1:4000';
const EXEC = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';

const ROLES = {
  'lehrer@dbz.de': ['/dashboard', '/ankuendigungen', '/nachrichten', '/unterricht', '/aufgaben', '/kalender', '/quran', '/hifz', '/pruefungen', '/materialien', '/korrektur', '/entschuldigungen', '/anwesenheit', '/verhalten', '/berichte', '/protokolle', '/benachrichtigungen', '/dbz-online', '/konto'],
  'schueler@dbz.de': ['/dashboard', '/aufgaben', '/checkin', '/kalender', '/quran', '/hifz', '/pruefungen', '/materialien', '/anwesenheit', '/verhalten', '/berichte', '/abwesenheit', '/protokolle', '/nachrichten', '/ankuendigungen', '/konto'],
  'eltern@dbz.de': ['/dashboard', '/ankuendigungen', '/nachrichten', '/kalender', '/quran', '/hifz', '/materialien', '/abwesenheit', '/verhalten', '/berichte', '/konto'],
  'leitung@dbz.de': ['/dashboard', '/ankuendigungen', '/nachrichten', '/admin', '/konto'],
  'sprecher@dbz.de': ['/dashboard', '/protokolle', '/aufgaben', '/checkin', '/pruefungen'],
};

const problems = [];
let checked = 0;

const browser = await chromium.launch({ executablePath: EXEC, headless: false, args: ['--no-sandbox', '--headless=new'] });

for (const [email, routes] of Object.entries(ROLES)) {
  const ctx = await browser.newContext();
  const login = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email, password: 'demo1234' } });
  if (!login.ok()) { problems.push(`LOGIN FAIL ${email}: ${login.status()}`); await ctx.close(); continue; }

  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  for (const route of routes) {
    errors.length = 0;
    await page.goto(`${BASE}/#${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    const text = (await page.locator('#root').innerText().catch(() => '')) || '';
    const rendered = text.trim().length > 15;
    const notFound = text.includes('Seite nicht gefunden') || text.includes('404');
    checked++;
    const relevant = errors.filter((e) => !/favicon|manifest|Download the React DevTools|sw\.js|ServiceWorker/i.test(e));
    if (!rendered) problems.push(`${email} ${route}: LEER gerendert`);
    if (notFound) problems.push(`${email} ${route}: 404-Seite`);
    if (relevant.length) problems.push(`${email} ${route}: ${relevant.slice(0, 2).join(' | ')}`);
  }
  await ctx.close();
}

await browser.close();

console.log(`\nGeprüft: ${checked} Seitenaufrufe über ${Object.keys(ROLES).length} Rollen`);
if (problems.length === 0) {
  console.log('OK – keine Render-, Laufzeit- oder 404-Fehler.');
} else {
  console.log(`FEHLER – ${problems.length} Problem(e):`);
  problems.forEach((p) => console.log('  - ' + p));
  process.exit(1);
}
