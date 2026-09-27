// Abgaben-Übersicht für Leitung/Admin: nur ansehen, geordnet nach Klasse und
// Aufgabe. Korrigiert wird ausschließlich von der Lehrkraft der Klasse.
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, StatusBadge, Spinner, FileAttachment, ClassFolders } from '../components/ui.jsx';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '');

function AssignmentGroup({ title, dueAt, subs }) {
  const [open, setOpen] = useState(false);
  const reviewed = subs.filter((s) => s.status !== 'submitted').length;
  return (
    <Card className="p-0 overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-hover">
        <div className="min-w-0">
          <div className="text-ivory font-medium truncate">{title}</div>
          <div className="text-xs text-sage-muted">{subs.length} Abgabe(n) · {reviewed} bewertet{dueAt ? ` · Frist ${fmt(dueAt)}` : ''}</div>
        </div>
        {open ? <ChevronUp size={16} className="text-sage-muted shrink-0" /> : <ChevronDown size={16} className="text-sage-muted shrink-0" />}
      </button>
      {open && (
        <ul className="divide-y divide-line border-t border-line">
          {subs.map((s) => (
            <li key={s.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-ivory">{s.studentName}</span>
                <span className="flex items-center gap-2 text-xs text-sage-muted">{fmt(s.submittedAt)} <StatusBadge status={s.status} /></span>
              </div>
              {s.text && <p className="text-sm text-sage whitespace-pre-wrap">{s.text}</p>}
              {s.files?.map((f) => (
                <div key={f.id}><FileAttachment url={`/api/submissions/${s.id}/file/${f.id}`} name={f.originalName} mediaType={f.mediaType} /></div>
              ))}
              {s.review?.comment && <p className="text-xs text-sage-muted">Rückmeldung der Lehrkraft: {s.review.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function Abgaben() {
  const [subs, setSubs] = useState(null);
  const [classes, setClasses] = useState([]);
  const [cls, setCls] = useState(null);
  useEffect(() => {
    api.get('/review-queue').then((d) => setSubs(d.submissions)).catch(() => setSubs([]));
    api.get('/classes').then((d) => setClasses(d.classes)).catch(() => {});
  }, []);
  const groups = useMemo(() => classes.map((c) => {
    const n = (subs || []).filter((s) => s.classId === c.id);
    const open = n.filter((s) => s.status === 'submitted').length;
    return { id: c.id, name: c.name, count: n.length, hint: n.length ? `${open} noch nicht bewertet` : 'noch keine Abgaben', tone: open ? 'warn' : null };
  }), [classes, subs]);
  const byAssignment = useMemo(() => {
    const m = new Map();
    (subs || []).filter((s) => s.classId === cls).forEach((s) => {
      const g = m.get(s.assignmentId) || { id: s.assignmentId, title: s.assignmentTitle || 'Aufgabe', dueAt: s.assignmentDueAt, subs: [] };
      g.subs.push(s);
      m.set(s.assignmentId, g);
    });
    return [...m.values()].sort((a, b) => String(b.dueAt || '').localeCompare(String(a.dueAt || '')));
  }, [subs, cls]);
  return (
    <AppLayout title="Abgaben">
      <p className="text-sm text-sage-muted mb-4">Alle abgegebenen Hausaufgaben, geordnet nach Klasse. Bewerten tut die Lehrkraft der Klasse – hier nur zum Ansehen.</p>
      {!subs ? <Spinner /> : (
        <>
          <ClassFolders groups={groups} selected={cls} onSelect={setCls} />
          {cls && (byAssignment.length === 0
            ? <Card className="p-6 text-sm text-sage-muted">In dieser Klasse wurde noch nichts abgegeben.</Card>
            : <div className="space-y-3">{byAssignment.map((g) => <AssignmentGroup key={g.id} {...g} />)}</div>)}
        </>
      )}
    </AppLayout>
  );
}
