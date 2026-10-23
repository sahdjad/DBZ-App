import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, GraduationCap, UserCheck, Scale } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api, peek } from '../lib/api.js';
import { Card, Spinner, Section, ListGroup, ListRow, Stat } from '../components/ui.jsx';

function rateColor(r) {
  if (r === null || r === undefined) return 'text-sage-muted';
  if (r >= 90) return 'text-status-present';
  if (r >= 75) return 'text-status-late';
  return 'text-status-absent';
}

export default function Leitung() {
  const navigate = useNavigate();
  const [d, setD] = useState(() => peek('/leadership/overview'));

  useEffect(() => { api.get('/leadership/overview').then(setD).catch(() => setD(null)); }, []);

  if (!d) return <AppLayout title="Leitung" wide><Spinner /></AppLayout>;
  const { counts, penalties, classes } = d;
  const hasPending = counts.pendingUsers > 0 || penalties.pendingApprovals > 0;

  return (
    <AppLayout title="Leitung" wide>
      <div className="md:grid md:grid-cols-2 md:gap-x-8 items-start">
      {hasPending && (
        <Section title="Offene Vorgänge" className="mt-0">
          <ListGroup>
            {counts.pendingUsers > 0 && (
              <ListRow onClick={() => navigate('/admin?tab=pending')} icon={UserCheck} iconTone="late" title="Registrierungen freigeben" subtitle="Neue Konten warten" badge={counts.pendingUsers} chevron />
            )}
            {penalties.pendingApprovals > 0 && (
              <ListRow onClick={() => navigate('/strafen')} icon={Scale} iconTone="late" title="Strafen genehmigen" subtitle="Vom Klassensprecher erfasst" badge={penalties.pendingApprovals} chevron />
            )}
          </ListGroup>
        </Section>
      )}

      <Section title="Schule" className={hasPending ? '' : 'mt-0'}>
        <ListGroup>
          <ListRow onClick={() => navigate('/admin?tab=classes')} icon={Users} title="Klassen" value={counts.classes} chevron />
          <ListRow
            onClick={() => navigate('/admin?tab=users&rolle=schueler')}
            icon={GraduationCap}
            title="Schüler"
            subtitle={counts.unassignedStudents > 0 ? `${counts.unassignedStudents} ohne Klasse` : undefined}
            value={counts.students}
            chevron
          />
          <ListRow onClick={() => navigate('/admin?tab=users&rolle=eltern')} icon={UserCheck} title="Eltern" value={counts.parents} chevron />
          <ListRow onClick={() => navigate('/admin?tab=users&rolle=klassenlehrer')} icon={Users} title="Lehrkräfte" value={counts.teachers} chevron />
        </ListGroup>
        {counts.unassignedStudents > 0 && (
          <button type="button" onClick={() => navigate('/admin?tab=users&rolle=schueler&ohneKlasse=1')} className="mt-2 px-1 text-footnote text-status-late font-medium">
            {counts.unassignedStudents} Schüler ohne Klasse zuordnen →
          </button>
        )}
      </Section>

      <Section title="Strafen" className="md:mt-0" action={<button type="button" onClick={() => navigate('/strafen')} className="text-subhead text-mint-light dark:text-mint font-medium">Öffnen</button>}>
        <Card className="p-5 grid grid-cols-3 gap-4">
          <Stat label="Geldstrafen offen" value={`${penalties.openMoney} €`} tone={penalties.openMoney ? 'late' : undefined} />
          <Stat label="Seiten offen" value={penalties.openPages} tone={penalties.openPages ? 'late' : undefined} />
          <Stat label="Strafen gesamt" value={penalties.openCount} />
        </Card>
      </Section>

      <Section title="Je Klasse" className="md:col-span-2" footer="Anwesenheitsquote: grün ab 90 %, gelb ab 75 %.">
        {/* Handy: Liste, Computer: Tabelle */}
        <ListGroup className="md:hidden">
          {classes.map((c) => (
            <ListRow
              key={c.id}
              onClick={() => navigate(`/klassenliste?klasse=${c.id}`)}
              title={c.name}
              subtitle={[`${c.students} Schüler`, c.unexcused > 0 ? `${c.unexcused} unentschuldigt` : null, c.openMoney > 0 ? `${c.openMoney} €` : null, c.openPages > 0 ? `${c.openPages} S.` : null].filter(Boolean).join(' · ')}
              value={c.attendanceRate === null ? '–' : `${c.attendanceRate} %`}
              chevron
            />
          ))}
        </ListGroup>
        <Card className="hidden md:block overflow-x-auto">
          <table className="w-full text-subhead">
            <thead>
              <tr className="text-left text-footnote text-sage-muted border-b border-line/70">
                <th className="py-3 px-5 font-medium">Klasse</th>
                <th className="py-3 px-3 font-medium text-right">Schüler</th>
                <th className="py-3 px-3 font-medium text-right">Anwesenheit</th>
                <th className="py-3 px-3 font-medium text-right">Unentschuldigt</th>
                <th className="py-3 px-5 font-medium text-right">Offene Strafen</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.id} onClick={() => navigate(`/klassenliste?klasse=${c.id}`)} className="border-b border-line/70 last:border-0 hover:bg-hover/60 cursor-pointer">
                  <td className="py-3 px-5 text-ivory font-medium whitespace-nowrap">{c.name}</td>
                  <td className="py-3 px-3 text-right font-mono">{c.students}</td>
                  <td className={`py-3 px-3 text-right font-mono ${rateColor(c.attendanceRate)}`}>{c.attendanceRate === null ? '–' : `${c.attendanceRate} %`}</td>
                  <td className={`py-3 px-3 text-right font-mono ${c.unexcused > 0 ? 'text-status-absent' : 'text-sage-muted'}`}>{c.unexcused}</td>
                  <td className="py-3 px-5 text-right font-mono whitespace-nowrap">
                    {c.openMoney === 0 && c.openPages === 0 ? <span className="text-sage-muted">–</span> : (
                      <span className="text-status-late">{[c.openMoney > 0 && `${c.openMoney} €`, c.openPages > 0 && `${c.openPages} S.`].filter(Boolean).join(' · ')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>
      </div>
    </AppLayout>
  );
}
