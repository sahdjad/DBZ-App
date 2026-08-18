import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Palette } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { Card, CardHeader } from '../components/ui.jsx';

// Farb-Konvention wie in verbreiteten Tadschwid-Mushafs.
const RULES = [
  {
    group: 'Nūn sākinah & Tanwīn',
    items: [
      { name: 'Iẓhār (Deutlich)', color: '#334155', desc: 'Nūn/Tanwīn deutlich aussprechen – vor den Kehllauten.', letters: 'ء ه ع ح غ خ' },
      { name: 'Idghām (Verschmelzung)', color: '#16A34A', desc: 'Nūn/Tanwīn verschmilzt in den Folgebuchstaben (mit/ohne Ghunnah).', letters: 'ي ر م ل و ن' },
      { name: 'Iqlāb (Umwandlung)', color: '#2563EB', desc: 'Nūn/Tanwīn wird vor bāʾ zu einem gehauchten mīm.', letters: 'ب' },
      { name: 'Ikhfāʾ (Verbergen)', color: '#DC2626', desc: 'Nūn/Tanwīn wird verborgen, mit Ghunnah gesprochen.', letters: 'ت ث ج د ذ ز س … (15)' },
    ],
  },
  {
    group: 'Mīm sākinah',
    items: [
      { name: 'Ikhfāʾ shafawī', color: '#DC2626', desc: 'Mīm vor bāʾ verborgen, mit Ghunnah.', letters: 'ب' },
      { name: 'Idghām shafawī', color: '#16A34A', desc: 'Mīm verschmilzt in ein folgendes mīm, mit Ghunnah.', letters: 'م' },
      { name: 'Iẓhār shafawī', color: '#334155', desc: 'Mīm bei allen übrigen Buchstaben deutlich.', letters: 'übrige' },
    ],
  },
  {
    group: 'Weitere Regeln',
    items: [
      { name: 'Qalqalah (Echo)', color: '#16A34A', desc: 'Leichtes „Zurückfedern" bei ruhendem Buchstaben.', letters: 'ق ط ب ج د' },
      { name: 'Ghunnah (Nasal)', color: '#CA8A04', desc: 'Nasaler Klang ~2 Zeitmaße bei betontem nūn/mīm (ّن ّم).', letters: ' نّ مّ' },
      { name: 'Madd (Dehnung)', color: '#7C3AED', desc: 'Vokaldehnung – kurz (2) bis lang (4–6 Zeitmaße).', letters: 'ا و ي' },
    ],
  },
];

export default function Tadschwid() {
  const navigate = useNavigate();
  return (
    <AppLayout title="Tadschwid-Regeln">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-sage-muted hover:text-ivory mb-4">
        <ArrowLeft size={16} /> Zurück
      </button>

      <Card className="p-5 mb-4">
        <CardHeader title="Farb-Legende" subtitle="So sind die Regeln in vielen Tadschwid-Mushafs eingefärbt" icon={Palette} />
        <div className="p-4 flex flex-wrap gap-2">
          {[
            ['#16A34A', 'Idghām / Qalqalah'],
            ['#DC2626', 'Ikhfāʾ'],
            ['#2563EB', 'Iqlāb'],
            ['#CA8A04', 'Ghunnah'],
            ['#7C3AED', 'Madd'],
            ['#334155', 'Iẓhār (deutlich)'],
          ].map(([c, l]) => (
            <span key={l} className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border border-black/10">
              <span className="h-3 w-3 rounded-full" style={{ background: c }} /> {l}
            </span>
          ))}
        </div>
      </Card>

      {RULES.map((g) => (
        <Card key={g.group} className="p-5 mb-4">
          <CardHeader title={g.group} />
          <div className="divide-y divide-black/5">
            {g.items.map((r) => (
              <div key={r.name} className="py-3 flex items-start gap-3">
                <span className="h-3 w-3 rounded-full mt-1.5 shrink-0" style={{ background: r.color }} />
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-ivory" style={{ color: r.color }}>{r.name}</span>
                    <span className="font-arabic text-lg text-sage" dir="rtl">{r.letters}</span>
                  </div>
                  <p className="text-sm text-sage-muted mt-0.5">{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <p className="text-[11px] text-sage-muted">
        Kurzreferenz zum Lernen. Tafsīr pro Ayah (as-Saʿdī arabisch, Ibn Kathīr englisch) findest du
        im Reader über das Tafsir-Symbol. Die automatische Farb-Einfärbung direkt im Text folgt später,
        sobald eine geprüfte Datenquelle feststeht.
      </p>
    </AppLayout>
  );
}
