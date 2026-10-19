// Kern der Übersetzung (ohne Browser-Abhängigkeiten – auch vom Server genutzt).
// Wörterbuch: deutscher Originaltext -> Englisch. Muster: "{}" = Platzhalter.
const LETTER = /[A-Za-zÄÖÜäöüß]/;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function createTranslator(data) {
  const words = new Map(Object.entries(data.words || {}));
  const patterns = (data.patterns || []).map(([de, en]) => ({
    re: new RegExp(`^${de.split('{}').map(esc).join('([\\s\\S]+?)')}$`),
    en,
  }));
  const inner = (s) => {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    const hit = words.get(m[2].replace(/\s+/g, ' '));
    return hit === undefined ? s : m[1] + hit + m[3];
  };
  return function translate(str) {
    if (typeof str !== 'string' || !LETTER.test(str)) return str;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(str);
    const core = m[2].replace(/\s+/g, ' ');
    let out = words.get(core);
    // Groß-/Kleinschreibung am Anfang ausgleichen ("abgegeben" ~ "Abgegeben").
    if (out === undefined && core) {
      const first = core[0];
      const alt = first === first.toLowerCase() ? first.toUpperCase() + core.slice(1) : first.toLowerCase() + core.slice(1);
      const hit = words.get(alt);
      if (hit) out = first === first.toLowerCase() ? hit[0].toLowerCase() + hit.slice(1) : hit[0].toUpperCase() + hit.slice(1);
    }
    if (out === undefined) {
      for (const p of patterns) {
        const mm = p.re.exec(core);
        if (mm) { out = p.en.replace(/\{(\d)\}/g, (_, i) => inner(mm[Number(i)] ?? '')); break; }
      }
    }
    return out === undefined ? str : m[1] + out + m[3];
  };
}
