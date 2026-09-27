// Tageskarte auf der Startseite: islamisches Datum (Umm-al-Qura), Weiße Tage
// (13.–15. des Mondmonats, Sunna-Fasten), Freitag, wechselnder Hadith und die
// neuesten Ankündigungen als sanftes Laufband.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Moon, Megaphone, Sparkles } from 'lucide-react';

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

export default function DayCard({ announcements = [] }) {
  const now = new Date();
  const h = hijriParts(now);
  const arabic = useMemo(() => {
    try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(now); } catch { return ''; }
  }, []);
  const white = useMemo(() => whiteDaysInfo(now), []);
  const dayIndex = Math.floor(now.getTime() / 86400000);
  const [hi, setHi] = useState(dayIndex % HADITHS.length);
  const [ai, setAi] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setHi((x) => (x + 1) % HADITHS.length), 12000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (announcements.length < 2) return undefined;
    const t = setInterval(() => setAi((x) => (x + 1) % announcements.length), 5000);
    return () => clearInterval(t);
  }, [announcements.length]);
  const isFriday = now.getDay() === 5;
  const ramadanIn = h && h.month === 8 ? (() => {
    for (let i = 1; i <= 31; i++) { const p = hijriParts(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12)); if (p?.month === 9) return i; }
    return null;
  })() : null;
  const ann = announcements[ai];
  const hadith = HADITHS[hi];

  return (
    <div className="day-card mb-5 rounded-2xl overflow-hidden border border-gold/30 text-[#f4efe2]">
      <div className="p-4 sm:p-5 grid gap-4 sm:grid-cols-[auto_1fr] items-start">
        <div className="flex sm:flex-col items-center sm:items-start gap-3 sm:gap-1 sm:min-w-[11rem]">
          <Moon size={22} className="text-[#d8c38a] shrink-0" aria-hidden="true" />
          <div>
            {arabic && <div className="font-arabic text-lg leading-tight" dir="rtl">{arabic}</div>}
            {h && <div className="text-xs text-[#cfe3d6]">{h.day}. {HIJRI_MONTHS[h.month - 1]} {h.year} n. H.</div>}
            <div className="text-[11px] text-[#9fb8a8]">{now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          </div>
        </div>
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap gap-2">
            {white && (
              <span className="chip">
                {white.today ? `Heute ist Weißer Tag ${white.n}/3 – Fasten ist Sunna` : `Weiße Tage in ${white.inDays} Tag${white.inDays === 1 ? '' : 'en'}`}
              </span>
            )}
            {isFriday && <span className="chip">Jumuʿa Mubārak – Sure Al-Kahf lesen</span>}
            {ramadanIn && <span className="chip">Ramadan in ca. {ramadanIn} Tagen</span>}
          </div>
          <figure key={hi} className="dbz-fade-in">
            <blockquote className="text-sm leading-relaxed">
              <Sparkles size={13} className="inline -mt-0.5 mr-1 text-[#d8c38a]" aria-hidden="true" />
              „{hadith.t}“
            </blockquote>
            <figcaption className="text-[11px] text-[#9fb8a8] mt-0.5">Hadith · {hadith.s}</figcaption>
          </figure>
        </div>
      </div>
      {ann && (
        <Link to="/ankuendigungen" className="flex items-center gap-2 px-4 py-2 bg-black/20 hover:bg-black/30 transition text-sm">
          <Megaphone size={15} className="text-[#d8c38a] shrink-0" />
          <span key={ann.id} className="truncate dbz-slide-in"><b className="font-medium">{ann.fromLabel || 'Ankündigung'}:</b> {ann.title}</span>
        </Link>
      )}
      <p className="sr-only">Datum nach Umm-al-Qura-Kalender, Abweichung von einem Tag möglich.</p>
    </div>
  );
}
