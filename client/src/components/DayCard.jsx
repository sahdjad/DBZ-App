// Tageskarte auf der Startseite: islamisches Datum (Umm-al-Qura), Weiße Tage
// (13.–15. des Mondmonats, Sunna-Fasten), Freitag, wechselnder Hadith und die
// neuesten Ankündigungen als sanftes Laufband.
import { useEffect, useMemo, useState } from 'react';
import { Moon } from 'lucide-react';

// Bekannte, authentische Ahadith (Sahih) mit Quellenangabe. Übersetzung
// sinngemäß ins Deutsche.
export const HADITHS = [
  { t: 'Die Taten sind nur gemäß den Absichten, und jedem Menschen steht nur das zu, was er beabsichtigt hat.', s: 'Bukhari 1, Muslim 1907' },
  { t: 'Der Beste von euch ist, wer den Qurʼan lernt und ihn lehrt.', s: 'Bukhari 5027' },
  { t: 'Wer einen Weg beschreitet, um Wissen zu suchen, dem erleichtert Allah dadurch einen Weg ins Paradies.', s: 'Muslim 2699' },
  { t: 'Lest den Qurʼan, denn er wird am Tag der Auferstehung als Fürsprecher für die kommen, die ihn gelesen haben.', s: 'Muslim 804' },
  { t: 'Wer den Qurʼan gewandt liest, ist bei den edlen, gehorsamen Schreibern. Und wer ihn mit Mühe stockend liest, erhält doppelten Lohn.', s: 'Bukhari 4937, Muslim 798' },
  { t: 'Keiner von euch glaubt wirklich, bis er für seinen Bruder liebt, was er für sich selbst liebt.', s: 'Bukhari 13, Muslim 45' },
  { t: 'Wer an Allah und den Jüngsten Tag glaubt, der soll Gutes sprechen oder schweigen.', s: 'Bukhari 6018, Muslim 47' },
  { t: 'Die Taten, die Allah am meisten liebt, sind die beständigsten – auch wenn sie gering sind.', s: 'Bukhari 6464, Muslim 783' },
  { t: 'Dein Lächeln im Gesicht deines Bruders ist für dich eine Sadaqa.', s: 'Tirmidhi 1956' },
  { t: 'Wer einen Buchstaben aus dem Buch Allahs liest, dem wird dafür eine gute Tat angerechnet – und jede gute Tat zählt zehnfach.', s: 'Tirmidhi 2910' },
  { t: 'Macht es leicht und macht es nicht schwer; verkündet frohe Botschaft und schreckt nicht ab.', s: 'Bukhari 69, Muslim 1734' },
  { t: 'Die Reinheit ist die Hälfte des Glaubens.', s: 'Muslim 223' },
  { t: 'Der Starke ist nicht der, der andere niederringt, sondern der, der sich im Zorn beherrscht.', s: 'Bukhari 6114, Muslim 2609' },
];

const HIJRI_NUM = 'en-US-u-ca-islamic-umalqura-nu-latn';
function hijriParts(d) {
  try {
    const parts = new Intl.DateTimeFormat(HIJRI_NUM, { day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(d);
    const get = (t) => Number(parts.find((p) => p.type === t)?.value);
    return { day: get('day'), month: get('month'), year: get('year') };
  } catch { return null; }
}
const HIJRI_MONTHS = ['Muharram', 'Safar', 'Rabīʿ al-awwal', 'Rabīʿ ath-thānī', 'Dschumādā al-ūlā', 'Dschumādā al-āchira', 'Radschab', 'Schaʿbān', 'Ramadan', 'Schawwāl', 'Dhū l-qaʿda', 'Dhū l-hiddscha'];

export function whiteDaysInfo(now = new Date()) {
  const h = hijriParts(now);
  if (!h) return null;
  if (h.day >= 13 && h.day <= 15) return { today: true, n: h.day - 12 };
  for (let i = 1; i <= 35; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12);
    const p = hijriParts(d);
    if (p?.day === 13) return { today: false, inDays: i, date: d };
  }
  return null;
}

// Kopf der Startseite: Begrüßung, islamisches Datum und ein Hadith. Auf
// iPad/Mac als grüne Fläche (.day-hero), auf dem Handy hell und schlicht:
// Begrüßung frei auf dem Hintergrund, Tag und Hadith in einer ruhigen Karte.
export default function DayHero({ name, subtitle }) {
  const now = new Date();
  const h = hijriParts(now);
  const arabic = useMemo(() => {
    try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(now); } catch { return ''; }
  }, []);
  const white = useMemo(() => whiteDaysInfo(now), []);
  const dayIndex = Math.floor(now.getTime() / 86400000);
  const [hi, setHi] = useState(dayIndex % HADITHS.length);
  useEffect(() => {
    const t = setInterval(() => setHi((x) => (x + 1) % HADITHS.length), 14000);
    return () => clearInterval(t);
  }, []);
  const isFriday = now.getDay() === 5;
  const ramadanIn = h && h.month === 8 ? (() => {
    for (let i = 1; i <= 31; i++) { const p = hijriParts(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12)); if (p?.month === 9) return i; }
    return null;
  })() : null;
  const hadith = HADITHS[hi];
  const chips = [
    white && (white.today ? `Heute ist Weißer Tag ${white.n}/3 – Fasten ist Sunna` : `Weiße Tage in ${white.inDays} Tag${white.inDays === 1 ? '' : 'en'}`),
    isFriday && 'Jumuʿa Mubārak – Sure Al-Kahf lesen',
    ramadanIn && `Ramadan in ca. ${ramadanIn} Tagen`,
  ].filter(Boolean);

  return (
    <section className="day-hero md:rounded-3xl px-1 md:px-7 md:py-6 text-ivory md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-8">
      {/* Begrüßung */}
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-footnote text-sage-muted">{now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <h2 className="mt-0.5 text-title2 md:text-title1 font-bold text-ivory leading-tight">
              <span className="block text-subhead md:text-body font-medium text-sage">As-salāmu ʿalaykum,</span>
              <span data-noi18n>{name}</span>
            </h2>
          </div>
          <p className="md:hidden font-arabic-ui text-body leading-none text-gold shrink-0 pt-5" lang="ar" dir="rtl">السلام عليكم</p>
        </div>
        {subtitle && <p className="mt-1 text-footnote text-sage-muted">{subtitle}</p>}
        <p className="hidden md:block mt-3 font-arabic-ui text-title3 text-gold text-left" lang="ar" dir="rtl">السلام عليكم</p>
      </div>

      {/* Islamischer Tag */}
      <div className="mt-4 -mx-1 rounded-2xl border border-line/70 bg-card shadow-card p-4 md:m-0 md:rounded-none md:border-0 md:border-l md:border-white/10 md:bg-transparent md:shadow-none md:p-0 md:pl-8 min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="flex items-center gap-2 min-w-0">
            <Moon size={15} className="text-gold shrink-0 self-center" aria-hidden="true" />
            {h && <span className="text-subhead font-medium text-ivory">{h.day}. {HIJRI_MONTHS[h.month - 1]} {h.year} n. H.</span>}
          </div>
          {arabic && <span className="font-arabic-ui text-footnote text-sage-muted" lang="ar" dir="rtl">{arabic}</span>}
        </div>
        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((c) => <span key={c} className="rounded-full bg-gold/10 md:bg-white/[0.08] px-2.5 py-0.5 text-caption font-medium text-gold">{c}</span>)}
          </div>
        )}
        <figure key={hi} className="dbz-fade-in mt-3">
          <blockquote className="font-serif text-footnote md:text-body leading-relaxed text-sage md:text-ivory/95 line-clamp-3 md:line-clamp-none">„{hadith.t}“</blockquote>
          <figcaption className="text-caption text-sage-muted mt-1">Hadith · {hadith.s}</figcaption>
        </figure>
      </div>
      <p className="sr-only">Datum nach Umm-al-Qura-Kalender, Abweichung von einem Tag möglich.</p>
    </section>
  );
}
