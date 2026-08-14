// Erstellt einmalig die DBZ-Organisation, die Pilot-Klasse 3 und Demo-Konten
// für jede Rolle inkl. etwas Beispielverlauf (Anwesenheit, Aufgaben).
//
// Demo-Zugänge (Passwort für alle: demo1234):
//   admin@dbz.de        System-Administrator
//   leitung@dbz.de      DBZ-Leitung
//   lehrer@dbz.de       Klassenlehrer (Klasse 3)
//   sprecher@dbz.de     Klassensprecher (Klasse 3)
//   schueler@dbz.de     Schüler (Yusuf)
//   eltern@dbz.de       Eltern (verknüpft mit Yusuf)

import { db, newId } from './store.js';
import { hashPassword } from './auth.js';
import { DEFAULT_ORG } from './content.js';
import { ROLES } from './rbac.js';
import { attendanceStatusFor } from './domain.js';

export async function seed() {
  if (db.meta.seeded) return;
  const pw = await hashPassword('demo1234');
  const now = new Date().toISOString();

  db.insert('organizations', { ...DEFAULT_ORG });

  const klasse3 = {
    id: 'class_3',
    organizationId: DEFAULT_ORG.id,
    name: 'Klasse 3',
    type: 'presence',
    language: 'de',
    weekday: 6, // Samstag
    startTime: '14:00',
    endTime: '18:00',
    active: true,
    createdAt: now,
  };
  db.insert('classes', klasse3);

  const mk = (id, name, email, role, extra = {}) => ({
    id,
    name,
    email,
    passwordHash: pw,
    role,
    classIds: [],
    childIds: [],
    status: 'active',
    createdAt: now,
    ...extra,
  });

  const admin = mk('user_admin', 'System-Administrator', 'admin@dbz.de', ROLES.SUPER_ADMIN);
  const leitung = mk('user_leitung', 'Br. Leitung', 'leitung@dbz.de', ROLES.LEITUNG);
  const lehrer = mk('user_lehrer', 'Ustadh Yunus', 'lehrer@dbz.de', ROLES.KLASSENLEHRER, {
    classIds: ['class_3'],
  });
  const student = mk('user_yusuf', 'Yusuf', 'schueler@dbz.de', ROLES.SCHUELER, {
    classIds: ['class_3'],
  });
  const student2 = mk('user_amina', 'Amina', 'amina@dbz.de', ROLES.SCHUELER, {
    classIds: ['class_3'],
  });
  const sprecher = mk('user_sprecher', 'Bilal', 'sprecher@dbz.de', ROLES.KLASSENSPRECHER, {
    classIds: ['class_3'],
  });
  const eltern = mk('user_eltern', 'Abu Yusuf', 'eltern@dbz.de', ROLES.ELTERN, {
    childIds: ['user_yusuf'],
  });

  [admin, leitung, lehrer, student, student2, sprecher, eltern].forEach((u) => db.insert('users', u));

  // Beispielhafte vergangene Sitzungen + Anwesenheit für aussagekräftige Statistik.
  const past = [
    { date: '2026-08-01', checkin: '14:02' }, // present
    { date: '2026-07-25', checkin: '14:12' }, // late
    { date: '2026-07-18', checkin: null, manual: 'excused' },
    { date: '2026-07-11', checkin: '14:01' }, // present
  ];
  for (const p of past) {
    const s = {
      id: newId('sess'),
      classId: 'class_3',
      subjectId: null,
      date: p.date,
      scheduledStart: `${p.date}T14:00:00.000Z`,
      scheduledEnd: `${p.date}T18:00:00.000Z`,
      status: 'ended',
      qr: null,
      startedAt: `${p.date}T14:00:00.000Z`,
      endedAt: `${p.date}T18:00:00.000Z`,
      createdAt: now,
    };
    db.insert('sessions', s);
    if (p.manual) {
      db.insert('attendance', {
        id: newId('att'),
        sessionId: s.id,
        classId: 'class_3',
        studentId: student.id,
        status: p.manual,
        checkInAt: null,
        minutesLate: 0,
        source: 'manual',
        confirmedBy: lehrer.id,
        note: null,
        updatedAt: now,
      });
    } else if (p.checkin) {
      const checkInAt = `${p.date}T${p.checkin}:00.000Z`;
      const { status, minutesLate } = attendanceStatusFor({
        checkInAt,
        scheduledStart: s.scheduledStart,
        lateAfterMinutes: DEFAULT_ORG.lateAfterMinutes,
      });
      db.insert('attendance', {
        id: newId('att'),
        sessionId: s.id,
        classId: 'class_3',
        studentId: student.id,
        status,
        checkInAt,
        minutesLate,
        source: 'qr',
        confirmedBy: null,
        note: null,
        updatedAt: now,
      });
    }
  }

  // Beispielaufgabe (Audio) für Klasse 3.
  const asg = {
    id: 'asg_demo',
    classId: 'class_3',
    subjectId: 'hifz',
    title: 'Surah Al-Fatiha – Rezitation aufnehmen',
    description:
      'Nimm deine Rezitation von Surah Al-Fatiha auf und achte auf die Tajwid-Regeln, die wir besprochen haben.',
    type: 'audio',
    opensAt: now,
    dueAt: '2026-08-16T18:00:00.000Z',
    targetType: 'class',
    targetStudentIds: [],
    createdBy: lehrer.id,
    createdAt: now,
  };
  db.insert('assignments', asg);

  // Demo-Prüfung (veröffentlicht) für Klasse 3.
  db.insert('exams', {
    id: 'exam_demo',
    classId: 'class_3',
    subjectId: 'aqidah',
    title: 'Kleines Quiz: Tawhid',
    description: 'Ein kurzes Quiz zu den Grundlagen des Tawhid.',
    passPercentage: 50,
    status: 'published',
    createdBy: lehrer.id,
    createdAt: now,
    questions: [
      {
        id: 'q0',
        type: 'single',
        prompt: 'Wie viele Kategorien des Tawhid werden klassisch genannt?',
        points: 1,
        options: [
          { id: 'o0_0', text: 'Zwei' },
          { id: 'o0_1', text: 'Drei' },
          { id: 'o0_2', text: 'Vier' },
        ],
        correct: ['o0_1'],
      },
      {
        id: 'q1',
        type: 'multi',
        prompt: 'Welche gehören zu den Kategorien des Tawhid? (mehrere)',
        points: 2,
        options: [
          { id: 'o1_0', text: 'Rububiyyah' },
          { id: 'o1_1', text: 'Uluhiyyah' },
          { id: 'o1_2', text: 'Asma wa Sifat' },
          { id: 'o1_3', text: 'Keine davon' },
        ],
        correct: ['o1_0', 'o1_1', 'o1_2'],
      },
      {
        id: 'q2',
        type: 'text',
        prompt: 'Erkläre kurz in eigenen Worten, was Tawhid bedeutet.',
        points: 3,
        options: [],
        correct: [],
      },
    ],
  });

  // Demo-Hifz-Ziel für Yusuf (die letzten drei Suren).
  db.insert('quran_goals', {
    id: 'goal_demo',
    studentId: student.id,
    studentName: student.name,
    classId: 'class_3',
    goalType: 'new_hifz',
    surahFrom: 112,
    ayahFrom: 1,
    surahTo: 114,
    ayahTo: 6,
    ayatCount: 15,
    dueAt: '2026-08-23T18:00:00.000Z',
    status: 'open',
    assignedBy: lehrer.id,
    createdAt: now,
  });

  // Berichtsperiode für die Probezeit (docs/PROJECT_DECISIONS: Probezeit bis Dezember).
  db.insert('report_periods', {
    id: 'period_probation',
    name: 'Probezeit (Sep–Dez)',
    reportType: 'probation',
    startsOn: '2026-09-01',
    endsOn: '2026-12-31',
    createdAt: now,
  });

  db.meta.seeded = true;
  db.commit();
}
