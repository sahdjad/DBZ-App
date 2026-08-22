import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Printer, ArrowLeft, BookMarked } from 'lucide-react';
import { api } from '../lib/api.js';
import { Button, Spinner } from '../components/ui.jsx';
import { gradeLabel, avgLabel } from '../lib/grades.js';

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'long' }) : '');
const rate = (a) => (a.sessions ? Math.round(((a.present + a.late) / a.sessions) * 100) : 0);

export default function BerichtDruck() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [org, setOrg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/reports/${id}`).then((d) => setReport(d.report)).catch((e) => setError(e.message));
    api.get('/subjects').then((d) => setSubjects(d.subjects)).catch(() => {});
    api.get('/org').then((d) => setOrg(d.org)).catch(() => {});
  }, [id]);

  if (error) return <div className="min-h-screen grid place-items-center bg-bg text-status-absent p-6">{error}</div>;
  if (!report) return <div className="min-h-screen grid place-items-center bg-bg"><Spinner /></div>;

  const d = report.data;
  const rows = [
    ['Anwesenheitsquote', `${rate(d.attendance)} %`],
    ['Unterrichtstage erfasst', d.attendance.sessions],
    ['Anwesend', d.attendance.present],
    ['Verspätet', d.attendance.late],
    ['Entschuldigt gefehlt', d.attendance.excused],
    ['Unentschuldigt gefehlt', d.attendance.unexcused],
    ['Ø Verspätung (Minuten)', d.attendance.avgMinutesLate],
    ['Hausaufgaben bestanden', `${d.homework.passed} / ${d.homework.total}`],
    ['Hausaufgaben verpasst', d.homework.missed],
    ['Positive Vermerke', d.behavior.positive],
    ['Hinweise (Verhalten)', d.behavior.hinweis],
  ];

  return (
    <div className="min-h-screen bg-bg py-8 px-4">
      {/* Steuerleiste (nicht drucken) */}
      <div className="no-print max-w-3xl mx-auto mb-4 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-sage-muted hover:text-ivory">
          <ArrowLeft size={16} /> Zurück
        </button>
        <Button onClick={() => window.print()}><Printer size={18} /> Drucken / als PDF speichern</Button>
      </div>

      {/* A4-Dokument (weiß, druckbar) */}
      <div className="print-page mx-auto max-w-3xl bg-white text-[#132a1e] rounded-xl shadow-xl overflow-hidden">
        <div className="bg-[#0f3d24] text-white px-8 py-6 flex items-center gap-4">
          <span className="grid place-items-center h-12 w-12 rounded-lg bg-subtle border border-line">
            <BookMarked size={26} />
          </span>
          <div>
            <div className="text-xl font-semibold">{org?.name || 'Deen Bildungszentrum'}</div>
            <div className="text-sm opacity-80">Schülerbericht · {report.periodName}</div>
          </div>
        </div>

        <div className="px-8 py-6">
          <div className="flex flex-wrap justify-between gap-4 border-b border-[#0f3d24]/15 pb-4 mb-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-[#132a1e]/50">Schüler/in</div>
              <div className="text-lg font-semibold">{report.studentName}</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-[#132a1e]/50">Ausgestellt am</div>
              <div>{fmt(report.releasedAt || report.createdAt)}</div>
            </div>
          </div>

          {/* Fachnoten + Gesamtdurchschnitt */}
          {(() => {
            const graded = (report.grades || []).filter((g) => g.grade != null);
            if (!graded.length && report.effectiveAverage == null) return null;
            const nameOf = (gid) => subjects.find((s) => s.id === gid)?.name || gid;
            return (
              <div className="mb-6">
                <div className="text-xs uppercase tracking-wide text-[#132a1e]/50 mb-2">Noten</div>
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {graded.map((g) => (
                      <tr key={g.subject} className="border-b border-[#0f3d24]/10">
                        <td className="py-2 pr-4">{nameOf(g.subject)}</td>
                        <td className="py-2 text-right font-semibold tabular-nums w-24">{gradeLabel(g.grade)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-[#0f3d24]/30">
                      <td className="py-2 pr-4 font-semibold">Gesamtdurchschnitt</td>
                      <td className="py-2 text-right font-bold text-lg tabular-nums text-[#0f3d24]">{avgLabel(report.effectiveAverage)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()}

          <div className="text-xs uppercase tracking-wide text-[#132a1e]/50 mb-2">Kennzahlen</div>
          <table className="w-full text-sm border-collapse">
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label} className="border-b border-[#0f3d24]/10">
                  <td className="py-2 pr-4 text-[#132a1e]/70">{label}</td>
                  <td className="py-2 text-right font-medium tabular-nums">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {report.teacherComment && (
            <div className="mt-6">
              <div className="text-xs uppercase tracking-wide text-[#132a1e]/50 mb-1">Kommentar der Lehrkraft</div>
              <p className="whitespace-pre-line leading-relaxed">{report.teacherComment}</p>
            </div>
          )}

          <div className="mt-12 flex justify-between gap-8">
            <div className="flex-1">
              <div className="border-t border-[#132a1e]/40 pt-1 text-xs text-[#132a1e]/60">Datum, Unterschrift Lehrkraft</div>
            </div>
            <div className="flex-1">
              <div className="border-t border-[#132a1e]/40 pt-1 text-xs text-[#132a1e]/60">Kenntnisnahme Eltern</div>
            </div>
          </div>
        </div>

        <div className="px-8 py-3 bg-[#f2f6f3] text-[11px] text-[#132a1e]/50 text-center">
          {org?.name || 'Deen Bildungszentrum'} · Dieser Bericht wurde digital in der DBZ-App erstellt.
        </div>
      </div>
    </div>
  );
}
