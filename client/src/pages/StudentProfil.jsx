import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, BookOpen, Sparkles, ThumbsUp, AlertTriangle, Users } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Ring, StatusBadge, Badge, Spinner } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];

function FamilyCodeCard({ studentId }) {
  const [code, setCode] = useState(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    api.get(`/students/${studentId}/family-code`).then((d) => setCode(d.code)).catch(() => setHidden(true));
  }, [studentId]);
  if (hidden) return null;
  return (
    <Card className="p-5 mt-4">
      <CardHeader title="Familien-Code" subtitle="Den Eltern geben, damit sie ihr Kind verknüpfen können" icon={Users} />
      <div className="p-4">
        {!code ? <Spinner /> : <span className="font-mono text-2xl tracking-[0.3em] text-ivory bg-subtle rounded-lg px-4 py-2">{code}</span>}
      </div>
    </Card>
  );
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' }) : 'offen');
const rate = (a) => (a.sessions ? Math.round(((a.present + a.late) / a.sessions) * 100) : 0);

export default function StudentProfil() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    api.get(`/students/${id}/profile`).then(setData).catch((e) => setError(e.message));
  }, [id]);

  if (error)
    return (
      <AppLayout title="Profil">
        <Card className="p-6 text-status-absent">{error}</Card>
      </AppLayout>
    );
  if (!data) return <AppLayout title="Profil"><Spinner /></AppLayout>;

  const a = data.attendance;
  return (
    <AppLayout title={data.student.name}>
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-sage-muted hover:text-ivory mb-4">
        <ArrowLeft size={16} /> Zurück
      </button>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Anwesenheit */}
        <Card className="p-5">
          <CardHeader title="Anwesenheit" icon={CalendarCheck} />
          <div className="p-4 flex items-center gap-4">
            <Ring value={rate(a)} size={84} stroke={8} label={`${rate(a)}%`} sublabel="Anwesend" />
            <div className="text-sm space-y-1">
              <div>Anwesend: <span className="text-ivory">{a.present}</span></div>
              <div>Verspätet: <span className="text-ivory">{a.late}</span></div>
              <div>Entschuldigt: <span className="text-ivory">{a.excused}</span></div>
              <div>Unentschuldigt: <span className="text-ivory">{a.unexcused}</span></div>
            </div>
          </div>
          <div className="px-4 pb-4 text-xs text-sage-muted">
            {data.student.classNames.join(', ')} · {a.sessions} Sitzungen
          </div>
        </Card>

        {/* Aufgaben */}
        <Card className="md:col-span-2 p-5">
          <CardHeader title="Aufgaben" icon={BookOpen} />
          <div className="divide-y divide-line">
            {data.assignments.length === 0 ? (
              <p className="p-4 text-sage-muted text-sm">Keine Aufgaben.</p>
            ) : (
              data.assignments.map((asg) => (
                <div key={asg.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-ivory truncate">{asg.title}</div>
                    <div className="text-xs text-sage-muted">
                      {asg.subjectName || 'Aufgabe'} · Frist {fmt(asg.dueAt)}
                      {asg.gradeLabel ? ` · ${asg.gradeLabel}` : ''}
                    </div>
                  </div>
                  <StatusBadge status={asg.status} />
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {MANAGER.includes(user.role) && <FamilyCodeCard studentId={id} />}

      {/* Verhalten */}
      <Card className="p-5 mt-4">
        <CardHeader title="Verhalten & Tarbiyah" icon={Sparkles} />
        <div className="divide-y divide-line">
          {data.behavior.length === 0 ? (
            <p className="p-4 text-sage-muted text-sm">Keine Vermerke.</p>
          ) : (
            data.behavior.map((r) => (
              <div key={r.id} className="py-3 flex items-start gap-3">
                {r.tone === 'negative' ? (
                  <AlertTriangle size={16} className="text-status-late mt-0.5" />
                ) : (
                  <ThumbsUp size={16} className="text-status-present mt-0.5" />
                )}
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone="neutral">{r.categoryLabel}</Badge>
                    <span className="text-xs text-sage-muted">{fmt(r.createdAt)}</span>
                  </div>
                  <p className="text-sage text-sm mt-1">{r.note}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </AppLayout>
  );
}
