import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Printer, ArrowLeft, BookMarked } from 'lucide-react';
import { api } from '../lib/api.js';
import { Button, Spinner } from '../components/ui.jsx';

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'long' }) : '');

export default function PruefungDruck() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [org, setOrg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/exams/${id}`).then(setData).catch((e) => setError(e.message));
    api.get('/org').then((d) => setOrg(d.org)).catch(() => {});
  }, [id]);

  if (error) return <div className="min-h-screen grid place-items-center bg-bg text-status-absent p-6">{error}</div>;
  if (!data) return <div className="min-h-screen grid place-items-center bg-bg"><Spinner /></div>;

  const { exam, attempt } = data;
  const released = attempt && attempt.status === 'released';

  return (
    <div className="min-h-screen bg-bg py-8 px-4">
      <div className="no-print max-w-3xl mx-auto mb-4 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-sage-muted hover:text-ivory">
          <ArrowLeft size={16} /> Zurück
        </button>
        <Button onClick={() => window.print()}><Printer size={18} /> Drucken / als PDF speichern</Button>
      </div>

      <div className="print-page mx-auto max-w-3xl bg-white text-[#132a1e] rounded-xl shadow-xl overflow-hidden">
        <div className="bg-[#0f3d24] text-white px-8 py-6 flex items-center gap-4">
          <span className="grid place-items-center h-12 w-12 rounded-lg bg-subtle border border-line"><BookMarked size={26} /></span>
          <div>
            <div className="text-xl font-semibold">{org?.name || 'Deen Bildungszentrum'}</div>
            <div className="text-sm opacity-80">Prüfungsergebnis · {exam.title}</div>
          </div>
        </div>

        <div className="px-8 py-6">
          <div className="flex flex-wrap justify-between gap-4 border-b border-[#0f3d24]/15 pb-4 mb-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-[#132a1e]/50">Fach</div>
              <div className="font-semibold">{exam.subjectName || 'Prüfung'}</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-[#132a1e]/50">Datum</div>
              <div>{fmt(attempt?.releasedAt || attempt?.submittedAt || new Date().toISOString())}</div>
            </div>
          </div>

          {released ? (
            <>
              <div className="flex items-center justify-between mb-5">
                <div className="text-lg font-semibold">Ergebnis</div>
                <div className="text-right">
                  <div className="text-2xl font-bold tabular-nums text-[#0f3d24]">{attempt.total}/{attempt.max} · {attempt.percent}%</div>
                  <div className={attempt.passed ? 'text-[#166534]' : 'text-[#b91c1c]'}>{attempt.passed ? 'Bestanden' : 'Nicht bestanden'}</div>
                </div>
              </div>
              <div className="space-y-3">
                {exam.questions.map((q, i) => {
                  const myAns = (attempt.answers || []).find((a) => a.questionId === q.id) || {};
                  return (
                    <div key={q.id} className="border-b border-[#0f3d24]/10 pb-2">
                      <div className="text-sm font-medium">{i + 1}. {q.prompt} <span className="text-[#132a1e]/50">({q.points} P)</span></div>
                      <div className="text-sm text-[#132a1e]/80">
                        Antwort: {myAns.text || (myAns.selected?.length ? 'ausgewählt' : '—')}
                        {typeof myAns.awardedPoints === 'number' ? ` · ${myAns.awardedPoints}/${q.points} P` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-[#132a1e]/70">Für diese Prüfung liegt noch kein freigegebenes Ergebnis vor.</p>
          )}

          <div className="mt-12 flex justify-between gap-8">
            <div className="flex-1"><div className="border-t border-[#132a1e]/40 pt-1 text-xs text-[#132a1e]/60">Datum, Unterschrift Lehrkraft</div></div>
            <div className="flex-1"><div className="border-t border-[#132a1e]/40 pt-1 text-xs text-[#132a1e]/60">Kenntnisnahme Eltern</div></div>
          </div>
        </div>

        <div className="px-8 py-3 bg-[#f2f6f3] text-[11px] text-[#132a1e]/50 text-center">
          {org?.name || 'Deen Bildungszentrum'} · Erstellt in der DBZ-App.
        </div>
      </div>
    </div>
  );
}
