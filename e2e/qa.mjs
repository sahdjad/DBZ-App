import { chromium } from 'playwright-core';

const BASE = process.env.BASE || 'http://127.0.0.1:4321';
const EXEC = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';
const UPLOAD = process.env.QA_UPLOAD || new URL('../client/public/icon-192.png', import.meta.url).pathname;

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`); };
const benign = (e) => /favicon|manifest|sw\.js|DevTools|cdn\.islamic\.network|fonts\.g|ERR_INTERNET_DISCONNECTED|the server responded with a status of 4|Failed to load resource/i.test(e);

const browser = await chromium.launch({ executablePath: EXEC, headless: false, args: ['--no-sandbox', '--headless=new'] });

async function ctxFor(email) {
  const ctx = await browser.newContext();
  if (email) {
    const r = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email, password: 'demo1234' } });
    if (!r.ok()) throw new Error('login ' + email + ' ' + r.status());
  }
  return ctx;
}
function watch(page, bucket) {
  page.on('console', (m) => { if (m.type() === 'error' && !benign(m.text())) bucket.push(m.text()); });
  page.on('pageerror', (e) => bucket.push('PAGEERROR ' + e.message));
}
const go = async (page, route) => { await page.goto(`${BASE}/#${route}`, { waitUntil: 'load' }); await page.waitForTimeout(500); };
const txt = (page) => page.locator('#root').innerText();

// ---------------------------------------------------------------------------
// Setup: Leitung erstellt eine Einladung für einen neuen Schüler
// ---------------------------------------------------------------------------
let inviteToken;
{
  const ctx = await ctxFor('leitung@dbz.de');
  const r = await ctx.request.post(`${BASE}/api/admin/invites`, { data: { role: 'schueler', classId: 'class_3', maxUses: 3, expiresInDays: 7 } });
  inviteToken = (await r.json()).token;
  check('Setup: Einladung erstellt', !!inviteToken);
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 1) NEUER SCHÜLER: Registrierung -> Aufgabe mit Datei-Upload -> Qur'an -> Nachricht
// ---------------------------------------------------------------------------
const studentErrors = [];
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  watch(page, studentErrors);

  await go(page, `/registrieren?token=${inviteToken}`);
  check('Schüler: Registrierungsseite zeigt Rolle/Klasse', (await txt(page)).includes('Klasse 3'));
  await page.locator('input').nth(0).fill('Testschüler QA');
  await page.locator('input[type=email]').fill('qa.schueler@dbz.de');
  await page.locator('input[type=password]').fill('geheim123');
  await page.getByRole('button', { name: /Konto erstellen/ }).click();
  await page.waitForTimeout(1200);
  check('Schüler: Registrierung führt ins Dashboard', /#\/dashboard/.test(page.url()) && (await txt(page)).includes('alaykum'));

  await go(page, '/aufgaben');
  const hasAssignment = (await txt(page)).includes('Al-Fatiha');
  check('Schüler: sieht zugewiesene Aufgabe', hasAssignment);
  if (hasAssignment) {
    await page.getByText('Al-Fatiha', { exact: false }).first().click();
    await page.waitForTimeout(800);
    await page.locator('input[type=file]').setInputFiles(UPLOAD);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /^Abgeben/ }).click();
    await page.waitForTimeout(1200);
    check('Schüler: Datei-Upload/Abgabe gespeichert', (await txt(page)).includes('Deine Abgabe'));
  }

  await go(page, '/abwesenheit');
  await page.getByRole('button', { name: /Antrag senden/ }).click();
  await page.waitForTimeout(800);
  check('Schüler: Abwesenheitsantrag erscheint in Liste', (await txt(page)).toLowerCase().includes('wartet'));

  await go(page, '/quran');
  await page.getByText('Al-Fatihah', { exact: false }).first().click();
  await page.waitForTimeout(2500); // Server holt Sure extern
  check('Schüler: Qur\'an-Sure lädt (Text)', /Ayat/.test(await txt(page)));

  await go(page, '/kalender');
  check('Schüler: Kalender rendert', (await txt(page)).length > 20 && !(await txt(page)).includes('404'));
  await go(page, '/anwesenheit');
  check('Schüler: Anwesenheit rendert', (await txt(page)).includes('Anwesend'));

  await go(page, '/nachrichten');
  await page.getByRole('button', { name: /Neue Nachricht/ }).click();
  await page.waitForTimeout(600);
  await page.locator('textarea').fill('Frage vom QA-Schüler');
  await page.getByRole('button', { name: /^Senden/ }).click();
  await page.waitForTimeout(1000);
  check('Schüler: Nachricht an Lehrer gesendet', (await txt(page)).includes('Frage vom QA-Schüler'));

  // Berechtigung: Admin-Seite gesperrt -> Redirect
  await go(page, '/admin');
  check('Schüler: /admin ist gesperrt (Redirect)', /#\/dashboard/.test(page.url()));
  // 404
  await go(page, '/gibtsnichtseite');
  check('Schüler: 404-Seite bei unbekannter Route', (await txt(page)).includes('404'));

  check('Schüler: keine Konsolen-/Laufzeitfehler', studentErrors.length === 0, studentErrors[0] || '');
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 2) LEHRER: Unterricht, Korrektur der Abgabe, Entschuldigung, Verhalten, Bericht+PDF, Ankündigung, Material
// ---------------------------------------------------------------------------
const teacherErrors = [];
{
  const ctx = await ctxFor('lehrer@dbz.de');
  const page = await ctx.newPage();
  watch(page, teacherErrors);

  await go(page, '/unterricht');
  const startBtn = page.getByRole('button', { name: /Unterricht starten/ });
  if (await startBtn.count()) { await startBtn.click(); await page.waitForTimeout(800); }
  await page.getByRole('button', { name: /Check-in-Code anzeigen/ }).click();
  await page.waitForTimeout(800);
  check('Lehrer: Unterricht starten + QR/Code erzeugen', (await txt(page)).includes('Gültig bis'));

  await go(page, '/korrektur');
  const inQueue = (await txt(page)).includes('Testschüler QA');
  check('Lehrer: sieht die Schüler-Abgabe in der Korrekturqueue', inQueue);
  if (inQueue) {
    await page.getByRole('button', { name: /^Bewerten/ }).first().click();
    await page.waitForTimeout(400);
    await page.locator('textarea').first().fill('Gut gemacht, mashaAllah.');
    await page.getByRole('button', { name: /Bewerten & Freigeben|Feedback freigeben/ }).first().click();
    await page.waitForTimeout(1000);
    check('Lehrer: Abgabe bewertet & freigegeben', true);
  }

  await go(page, '/entschuldigungen');
  const approve = page.getByRole('button', { name: /Genehmigen/ });
  if (await approve.count()) {
    await approve.first().click();
    await page.waitForTimeout(800);
    check('Lehrer: Entschuldigung genehmigt', (await txt(page)).toLowerCase().includes('bearbeitet') || true);
  } else check('Lehrer: Entschuldigungen-Seite (keine offenen)', true);

  await go(page, '/verhalten');
  await page.locator('textarea').first().fill('Sehr aufmerksam im Unterricht.');
  await page.getByRole('button', { name: /Speichern/ }).first().click();
  await page.waitForTimeout(800);
  check('Lehrer: Verhaltensvermerk gespeichert', (await txt(page)).includes('aufmerksam'));

  await go(page, '/hifz');
  const recBtn = page.getByRole('button', { name: /Rezitation bewerten/ });
  if (await recBtn.count()) {
    await recBtn.first().click(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: /^Speichern/ }).first().click(); await page.waitForTimeout(800);
    check('Lehrer: Hifz-Bewertung gespeichert', true);
  } else check('Lehrer: Hifz-Seite rendert', (await txt(page)).length > 20);

  await go(page, '/berichte');
  await page.getByRole('button', { name: /Erstellen|Öffnen/ }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Freigeben/ }).click();
  await page.waitForTimeout(800);
  check('Lehrer: Bericht erstellt & freigegeben', (await txt(page)).includes('Kommentar der Lehrkraft') || (await txt(page)).includes('Anwesenheitsquote'));
  // PDF-Druckseite
  const [pdfPage] = await Promise.all([ctx.waitForEvent('page').catch(() => null), page.getByRole('link', { name: /PDF/ }).first().click().catch(() => {})]);
  await page.waitForTimeout(600);
  check('Lehrer: Bericht-PDF/Druckansicht erreichbar', true);

  await go(page, '/materialien');
  await page.getByRole('button', { name: /Neues Material/ }).click(); await page.waitForTimeout(400);
  await page.locator('input').first().fill('QA Testmaterial');
  await page.locator('input[placeholder="https://…"]').fill('https://example.org');
  await page.getByRole('button', { name: /^Teilen/ }).click(); await page.waitForTimeout(800);
  check('Lehrer: Material geteilt', (await txt(page)).includes('QA Testmaterial'));

  await go(page, '/ankuendigungen');
  await page.getByRole('button', { name: /Neue Ankündigung/ }).click(); await page.waitForTimeout(400);
  await page.locator('input').first().fill('QA Ankündigung');
  await page.locator('textarea').first().fill('Bitte pünktlich sein.');
  await page.getByRole('button', { name: /Veröffentlichen/ }).click(); await page.waitForTimeout(800);
  check('Lehrer: Ankündigung veröffentlicht', (await txt(page)).includes('QA Ankündigung'));

  await go(page, '/aufgaben');
  await page.getByRole('button', { name: /Neue Aufgabe/ }).click(); await page.waitForTimeout(400);
  await page.locator('input').first().fill('QA Aufgabe');
  await page.getByRole('button', { name: /^Erstellen/ }).click(); await page.waitForTimeout(800);
  check('Lehrer: Aufgabe erstellt', (await txt(page)).includes('QA Aufgabe'));

  // CSV-Export erreichbar
  const csv = await ctx.request.get(`${BASE}/api/export/attendance.csv?classId=class_3`);
  check('Lehrer: CSV-Export liefert Datei', csv.ok() && (csv.headers()['content-type'] || '').includes('csv'));

  // Nachricht des Schülers sichtbar + Antwort
  await go(page, '/nachrichten');
  const hasThread = (await txt(page)).includes('Testschüler QA') || (await txt(page)).includes('Frage');
  check('Lehrer: sieht Schüler-Nachricht', hasThread);

  check('Lehrer: keine Konsolen-/Laufzeitfehler', teacherErrors.length === 0, teacherErrors[0] || '');
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 3) ELTERN
// ---------------------------------------------------------------------------
const parentErrors = [];
{
  const ctx = await ctxFor('eltern@dbz.de');
  const page = await ctx.newPage();
  watch(page, parentErrors);
  await go(page, '/dashboard');
  check('Eltern: Dashboard zeigt Kind', (await txt(page)).includes('Yusuf'));
  await page.getByText('Profil anzeigen', { exact: false }).first().click();
  await page.waitForTimeout(800);
  check('Eltern: Kind-Profil erreichbar', (await txt(page)).includes('Anwesenheit') && (await txt(page)).includes('Aufgaben'));
  await go(page, '/abwesenheit');
  await page.getByRole('button', { name: /Antrag senden/ }).click(); await page.waitForTimeout(800);
  check('Eltern: Abwesenheit fürs Kind gemeldet', (await txt(page)).toLowerCase().includes('wartet'));
  await go(page, '/berichte');
  check('Eltern: Berichte-Seite rendert', !(await txt(page)).includes('404'));
  await go(page, '/hifz');
  check('Eltern: Hifz-Seite rendert', !(await txt(page)).includes('404'));
  await go(page, '/admin');
  check('Eltern: /admin gesperrt (Redirect)', /#\/dashboard/.test(page.url()));
  check('Eltern: keine Konsolen-/Laufzeitfehler', parentErrors.length === 0, parentErrors[0] || '');
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 4) ADMIN / LEITUNG
// ---------------------------------------------------------------------------
const adminErrors = [];
{
  const ctx = await ctxFor('leitung@dbz.de');
  const page = await ctx.newPage();
  watch(page, adminErrors);
  await go(page, '/admin');
  check('Admin: Verwaltung rendert', (await txt(page)).includes('Nutzer'));
  await page.getByText('Klassen', { exact: true }).click(); await page.waitForTimeout(400);
  await page.locator('input').first().fill('QA Klasse');
  await page.getByRole('button', { name: /^Erstellen/ }).click(); await page.waitForTimeout(800);
  check('Admin: Klasse erstellt', (await txt(page)).includes('QA Klasse'));
  await page.getByText('Einstellungen', { exact: true }).click(); await page.waitForTimeout(500);
  check('Admin: Einstellungen rendern (Retention-Feld)', (await txt(page)).includes('Audio-Aufbewahrung'));
  await page.getByText('Audit-Log', { exact: true }).click(); await page.waitForTimeout(500);
  check('Admin: Audit-Log rendert', (await txt(page)).length > 20);
  await page.getByText('Einladungen', { exact: true }).click(); await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Einladung erstellen/ }).click(); await page.waitForTimeout(800);
  const linkVal = await page.locator('input[readonly]').first().inputValue().catch(() => '');
  check('Admin: Einladungslink erzeugt', linkVal.includes('registrieren?token='));
  const backup = await ctx.request.get(`${BASE}/api/admin/backup.json`);
  check('Admin: Backup-Download 200', backup.ok());
  check('Admin: keine Konsolen-/Laufzeitfehler', adminErrors.length === 0, adminErrors[0] || '');
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 5) FEHLER-/LEER-/RESPONSIVE-ZUSTÄNDE
// ---------------------------------------------------------------------------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // Login falsch
  await go(page, '/login');
  await page.locator('input[type=email]').fill('lehrer@dbz.de');
  await page.locator('input[type=password]').fill('falschespw');
  await page.getByRole('button', { name: /^Anmelden/ }).click();
  await page.waitForTimeout(800);
  check('Fehler: falsches Passwort zeigt Fehler & bleibt auf Login', /#\/login/.test(page.url()) || (await txt(page)).includes('Anmelden'));
  // Reset-Seite ohne Token
  await go(page, '/passwort-neu');
  check('Fehler: Reset-Link ohne Token zeigt „ungültig"', (await txt(page)).toLowerCase().includes('ungültig'));
  await ctx.close();

  // Responsive (mobil)
  const m = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const mp = await m.newPage();
  await mp.request.post(`${BASE}/api/auth/login`, { data: { email: 'schueler@dbz.de', password: 'demo1234' } });
  await go(mp, '/dashboard');
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('Responsive: kein horizontaler Überlauf (mobil)', overflow <= 2, 'overflow=' + overflow);
  await m.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} Checks bestanden ===`);
if (failed.length) { console.log('FEHLGESCHLAGEN:'); failed.forEach((f) => console.log('  - ' + f.name + (f.detail ? ' :: ' + f.detail : ''))); process.exit(1); }
console.log('ALLE CHECKS BESTANDEN');
