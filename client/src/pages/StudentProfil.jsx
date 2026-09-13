import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, BookOpen, Sparkles, ThumbsUp, AlertTriangle, Users, Scale } from 'lucide-react';
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
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : '–');
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
              <div>Versp. gesamt: <span className="text-ivory">{a.totalMinutesLate || 0} Min</span></div>
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

      {/* Verspätungen & Fehlzeiten im Einzelnachweis (wann genau, wie viele Minuten) */}
      {(a.records || []).some((r) => r.status !== 'present') && (
        <Card className="p-5 mt-4">
          <CardHeader title="Verspätungen & Fehlzeiten" subtitle="Wann genau und wie viele Minuten" icon={CalendarCheck} />
          <ul className="divide-y divide-line">
            {a.records.filter((r) => r.status !== 'present').map((r, i) => (
              <li key={i} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-ivory text-sm">{fmtDay(r.date)}</div>
                  {r.note && <div className="text-[11px] text-sage-muted">{r.note}</div>}
                </div>
                <div className="flex items-center gap-3">
                  {r.status === 'late' && r.minutesLate > 0 && (
                    <span className="font-mono text-status-late text-sm">{r.minutesLate} Min</span>
                  )}
                  <StatusBadge status={r.status} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

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

      {/* Strafen: offene (inkl. Zuschlag) + erledigte, mit Herkunft */}
      {MANAGER.includes(user.role) && <ProfilePenalties studentId={id} />}
    </AppLayout>
  );
}

function ProfilePenalties({ studentId }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.get(`/penalties?studentId=${studentId}`).then(setData).catch(() => setData({ penalties: [] })); }, [studentId]);
  if (!data) return null;
  const list = data.penalties || [];
  const s = data.summary || { pages: 0, money: 0 };
  const open = list.filter((p) => p.status === 'approved');
  const done = list.filter((p) => p.status === 'settled');
  const line = (p) => (
    <div key={p.id} className="py-2.5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm text-ivory">{p.type === 'money' ? `${p.effectiveAmount ?? p.amount} €` : `${p.effectiveAmount ?? p.amount} Seiten`}
          {p.overdue && <span className="ml-2 text-[11px] text-status-absent">überfällig</span>}
        </div>
        <div className="text-xs text-sage-muted">Grund: {p.reason} · {fmt(p.createdAt)}{p.createdByName ? ` · von ${p.createdByName}` : ''}</div>
      </div>
      <span className={`text-[11px] px-2 py-0.5 rounded-full ${p.status === 'settled' ? 'bg-status-present/15 text-status-present' : 'bg-status-late/15 text-status-late'}`}>{p.status === 'settled' ? 'erledigt' : 'offen'}</span>
    </div>
  );
  return (
    <Card className="p-5 mt-4">
      <CardHeader title="Strafen" subtitle={`Offen: ${s.money} € · ${s.pages} Seiten`} icon={Scale} />
      <div className="divide-y divide-line">
        {open.length === 0 && done.length === 0 ? (
          <p className="p-4 text-sage-muted text-sm">Keine Strafen.</p>
        ) : (
          [...open, ...done].map(line)
        )}
      </div>
    </Card>
  );
}
