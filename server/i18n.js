// Englische Übersetzung für Push-Nachrichten – dasselbe Wörterbuch wie in der
// App (client/src/i18n/en.json). Fehlt die Datei, bleibt alles Deutsch.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTranslator } from '../client/src/i18n/translate.js';

let tr = (s) => s;
try {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '../client/src/i18n/en.json');
  tr = createTranslator(JSON.parse(fs.readFileSync(file, 'utf8')));
} catch (err) {
  console.warn('[i18n] Wörterbuch nicht geladen:', err.message);
}

export const LANGS = ['de', 'en'];
export const translateFor = (lang, s) => (lang === 'en' && s ? tr(s) : s);
