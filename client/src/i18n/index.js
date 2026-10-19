// Sprache der App (Deutsch/Englisch). Die Oberfläche ist auf Deutsch
// geschrieben; bei Englisch übersetzt ein Wörterbuch jeden angezeigten Text
// (auch Meldungen vom Server). Arabischer Qur'an-Text und Inhalte von Nutzern
// (markiert mit data-noi18n) bleiben unverändert.
import { createTranslator } from './translate.js';

const KEY = 'dbz-lang';
export const LANGS = [['de', 'Deutsch'], ['en', 'English']];

export function getLang() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'de' || v === 'en') return v;
  } catch { /* egal */ }
  const nav = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || 'de';
  return String(nav).toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function setLang(lang, { reload = true } = {}) {
  try { localStorage.setItem(KEY, lang); } catch { /* egal */ }
  if (reload) window.location.reload();
}

let translate = (s) => s;
export const t = (s) => translate(s);

const SKIP = 'script,style,textarea,code,pre,[data-noi18n],[lang="ar"],[contenteditable="true"]';
const SKIP_ATTR = '[data-noi18n],[lang="ar"]';
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const written = new WeakMap();

function doText(node) {
  const v = node.nodeValue;
  if (!v || written.get(node) === v) return;
  const p = node.parentElement;
  if (!p || p.closest(SKIP)) return;
  const out = translate(v);
  if (out !== v) { written.set(node, out); node.nodeValue = out; }
}
function doAttrs(el) {
  if (el.closest(SKIP_ATTR)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) { const out = translate(v); if (out !== v) el.setAttribute(a, out); }
  }
  if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit') && el.value) {
    const out = translate(el.value); if (out !== el.value) el.value = out;
  }
}
function walk(root) {
  if (root.nodeType === 3) return doText(root);
  if (root.nodeType !== 1) return;
  doAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = w.nextNode();
  while (n) { if (n.nodeType === 3) doText(n); else doAttrs(n); n = w.nextNode(); }
}

// Datums-/Zahlenformate: Code nutzt 'de-DE' -> bei Englisch 'en-GB'.
function patchLocales() {
  const fix = (loc) => (loc === undefined || /^de(-|$)/i.test(String(loc)) ? 'en-GB' : loc);
  for (const m of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']) {
    const orig = Date.prototype[m];
    Date.prototype[m] = function (loc, opts) { return orig.call(this, fix(loc), opts); };
  }
  const num = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (loc, opts) { return num.call(this, fix(loc), opts); };
  for (const fn of ['alert', 'confirm', 'prompt']) {
    const orig = window[fn]?.bind(window);
    if (orig) window[fn] = (msg, ...rest) => orig(translate(String(msg ?? '')), ...rest);
  }
}

// Vor dem ersten Rendern aufrufen.
export async function initI18n() {
  const lang = getLang();
  document.documentElement.lang = lang;
  if (lang !== 'en') return;
  try {
    const data = (await import('./en.json')).default;
    translate = createTranslator(data);
  } catch { return; }
  patchLocales();
  const start = () => {
    walk(document.body);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doAttrs(m.target);
        else m.addedNodes.forEach(walk);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    if (document.title) document.title = translate(document.title);
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
}
