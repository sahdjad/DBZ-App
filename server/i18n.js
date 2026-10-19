// Übersetzung für Push-Nachrichten (Englisch/Französisch) – dieselben
// Wörterbücher wie in der App (client/src/i18n/*.json). Fehlt eine Datei,
// bleibt alles Deutsch.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTranslator } from '../client/src/i18n/translate.js';

export const LANGS = ['de', 'en', 'fr'];
const tr = {};
for (const lang of LANGS.slice(1)) {
  try {
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), `../client/src/i18n/${lang}.json`);
    tr[lang] = createTranslator(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    console.warn(`[i18n] Wörterbuch ${lang} nicht geladen:`, err.message);
  }
}
export const translateFor = (lang, s) => (tr[lang] && s ? tr[lang](s) : s);
