// Sprachwahl Deutsch / English. Wechsel lädt die App neu (alle Texte in der
// neuen Sprache). Die Wahl wird auch am Konto gespeichert, damit
// Push-Nachrichten in derselben Sprache ankommen.
import { Languages } from 'lucide-react';
import { api } from '../lib/api.js';
import { getLang, setLang, LANGS } from '../i18n/index.js';
import { Segmented } from './ui.jsx';

export async function chooseLang(lang, { saveToAccount = true } = {}) {
  if (saveToAccount) await api.patch('/me', { lang }).catch(() => {});
  setLang(lang);
}

export default function LanguageSwitch({ compact = false, saveToAccount = true }) {
  const current = getLang();
  if (compact) {
    return (
      <div data-noi18n className="inline-flex items-center gap-0.5 rounded-full bg-black/25 backdrop-blur p-0.5 text-caption font-semibold" role="group" aria-label="Sprache / Language">
        <Languages size={14} className="text-white/70 mx-1.5" aria-hidden="true" />
        {LANGS.map(([code]) => (
          <button key={code} type="button" aria-pressed={current === code}
            onClick={() => current !== code && chooseLang(code, { saveToAccount })}
            className={`rounded-full px-2.5 py-1 ${current === code ? 'bg-white text-[#07382E]' : 'text-white/85 hover:bg-white/10'}`}>
            {code.toUpperCase()}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div data-noi18n>
      <Segmented className="w-full" options={LANGS.map(([code, label]) => [code, label])} value={current} onChange={(code) => code !== current && chooseLang(code, { saveToAccount })} />
    </div>
  );
}
