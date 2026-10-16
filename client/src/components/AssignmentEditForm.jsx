// Gemeinsame Bausteine für Hausaufgaben-Formulare: Fristen-Schnellwahl und
// das Formular zum nachträglichen Bearbeiten (Lehrkraft direkt,
// Klassensprecher als Korrekturvorschlag).
import { useState } from 'react';
import { Button } from './ui.jsx';

// "YYYY-MM-DDTHH:MM" für <input type="datetime-local"> in Ortszeit.
export const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Fristen-Schnellwahl: nächster Samstag 12:00 bzw. Beginn des nächsten
// Unterrichts der Klasse. Die Lehrkraft kann danach frei ändern.
function nextWeekdayAt(weekday, hhmm) {
  const [h, m] = String(hhmm || '12:00').split(':').map(Number);
  const now = new Date();
  const d = new Date(now);
  d.setHours(h || 0, m || 0, 0, 0);
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
  if (d <= now) d.setDate(d.getDate() + 7);
  return d.toISOString();
}

export function DuePresets({ klass, onPick }) {
  const presets = [['Samstag 12:00', nextWeekdayAt(6, '12:00')]];
  if (klass && typeof klass.weekday === 'number' && klass.startTime) presets.push(['Bis zum nächsten Unterricht', nextWeekdayAt(klass.weekday, klass.startTime)]);
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {presets.map(([l, iso]) => (
        <button key={l} type="button" onClick={() => onPick(toLocalInput(iso))}
          className="rounded-full border border-line px-2.5 py-1 text-xs text-sage hover:bg-hover">{l}</button>
      ))}
    </div>
  );
}

export const TYPE_OPTIONS = [['audio', 'Audio'], ['text', 'Text'], ['file', 'Datei'], ['quran', "Qur'an"], ['mixed', 'Gemischt']];

// Formular zum Bearbeiten. `onSubmit` bekommt nur die geänderten Felder
// (Frist als ISO-Zeitpunkt) und – bei `withNote` – eine Begründung.
export function AssignmentEditForm({ assignment, klass, subjects, withNote = false, submitLabel = 'Speichern', onSubmit, onCancel }) {
  const [f, setF] = useState({
    title: assignment.title || '',
    description: assignment.description || '',
    type: assignment.type || 'mixed',
    subjectId: assignment.subjectId || '',
    dueAt: toLocalInput(assignment.dueAt),
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    const edits = {};
    if (f.title.trim() !== (assignment.title || '')) edits.title = f.title.trim();
    if (f.description !== (assignment.description || '')) edits.description = f.description;
    if (f.type !== assignment.type) edits.type = f.type;
    if (subjects && (f.subjectId || '') !== (assignment.subjectId || '')) edits.subjectId = f.subjectId || null;
    if (f.dueAt !== toLocalInput(assignment.dueAt)) edits.dueAt = f.dueAt ? new Date(f.dueAt).toISOString() : null;
    setBusy(true);
    try { await onSubmit(edits, f.note.trim()); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="text-sm text-sage">Titel</span>
        <input className="input mt-1" value={f.title} onChange={(e) => set('title', e.target.value)} required />
      </label>
      <label className="block">
        <span className="text-sm text-sage">Beschreibung</span>
        <textarea className="input mt-1" rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-sage">Art</span>
          <select className="input mt-1" value={f.type} onChange={(e) => set('type', e.target.value)}>
            {TYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {subjects && (
          <label className="block">
            <span className="text-sm text-sage">Fach</span>
            <select className="input mt-1" value={f.subjectId} onChange={(e) => set('subjectId', e.target.value)}>
              <option value="">– Fach –</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className="text-sm text-sage">Frist</span>
          <input type="datetime-local" className="input mt-1" value={f.dueAt} onChange={(e) => set('dueAt', e.target.value)} />
          <DuePresets klass={klass} onPick={(v) => set('dueAt', v)} />
        </label>
      </div>
      {withNote && (
        <label className="block">
          <span className="text-sm text-sage">Was war falsch? (für die Lehrkraft, optional)</span>
          <input className="input mt-1" value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="z. B. falsche Seitenzahl" />
        </label>
      )}
      <div className="flex gap-2 flex-wrap">
        <Button type="submit" disabled={busy || !f.title.trim()}>{busy ? 'Speichert …' : submitLabel}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Abbrechen</Button>
      </div>
    </form>
  );
}
