// Handy-Gefühl wie eine installierte App (Skill „mobile-native“): Statusleiste
// passt zur Kopfzeile, Felder lösen auf dem iPhone keinen Zoom aus, Antippen
// reagiert sofort, Zoomen bleibt erlaubt (Barrierefreiheit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');

function fakeDom() {
  const meta = { content: '#07382E', setAttribute(k, v) { this[k] = v; } };
  const classes = new Set();
  globalThis.document = {
    documentElement: { classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } },
    querySelector: (sel) => (sel === 'meta[name="theme-color"]' ? meta : null),
  };
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  globalThis.window = { dispatchEvent() {} };
  return { meta, classes };
}

test('Statusleistenfarbe folgt der Kopfzeile in Hell und Dunkel', async () => {
  const { meta, classes } = fakeDom();
  const { setThemePref, HEADER_COLORS } = await import('../theme.js');
  const hex = (rgb) => '#' + rgb.split(/\s+/).map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
  const headers = [...css.matchAll(/--header-bg:\s*([\d ]+);/g)].map((m) => hex(m[1].trim()));
  assert.deepEqual(headers, [HEADER_COLORS.light, HEADER_COLORS.dark]);
  assert.match(html, new RegExp(`name="theme-color" content="${HEADER_COLORS.light}"`));

  setThemePref('dark');
  assert.equal(meta.content, HEADER_COLORS.dark);
  assert.ok(classes.has('dark'));
  setThemePref('light');
  assert.equal(meta.content, HEADER_COLORS.light);
  assert.ok(!classes.has('dark'));
});

test('Felder zoomen auf dem Handy nicht, Antippen ohne Verzögerung, Zoom bleibt erlaubt', () => {
  assert.match(css, /@media \(pointer: coarse\)\s*\{\s*:root :is\(input[^{]*textarea, select\)\s*\{\s*font-size: max\(16px, 1rem\)/);
  assert.match(css, /touch-action: manipulation/);
  assert.match(css, /-webkit-tap-highlight-color: transparent/);
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale/);
  assert.match(html, /viewport-fit=cover/);
});
