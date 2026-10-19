// Sprachwahl Deutsch / English. Wechsel lädt die App neu (alle Texte in der
// neuen Sprache). Die Wahl wird auch am Konto gespeichert, damit
// Push-Nachrichten in derselben Sprache ankommen.
import { Languages } from 'lucide-react';
import { api } from '../lib/api.js';
import { getLang, setLang, LANGS } from '../i18n/index.js';

export async function chooseLang(lang, { saveToAccount = true } = {}) {
  if (saveToAccount) await api.patch('/me', { lang }).catch(() => {});
  setLang(lang);
}

export default function LanguageSwitch({ compact = false, saveToAccount = true }) {
  const current = getLang();
  return (
    <div data-noi18n className={`inline-flex items-center gap-1 rounded-xl border border-line p-1 ${compact ? 'text-xs' : 'text-sm'}`} role="group" aria-label="Sprache / Language">
      {compact && <Languages size={14} className="text-white/70 mx-1" aria-hidden="true" />}
      {LANGS.map(([code, label]) => (
        <button key={code} type="button" aria-pressed={current === code}
          onClick={() => current !== code && chooseLang(code, { saveToAccount })}
          className={`rounded-lg px-2.5 py-1 ${current === code ? 'bg-mint text-onaccent' : compact ? 'text-white/80 hover:bg-white/10' : 'text-sage hover:bg-hover'}`}>
          {compact ? code.toUpperCase() : label}
        </button>
      ))}
    </div>
  );
}
