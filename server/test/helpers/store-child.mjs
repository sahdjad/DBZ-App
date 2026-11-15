// Startet den Datenspeicher in einem eigenen Prozess (= ein „Serverstart") und
// führt eine kleine Aktion aus. Ausgabe: eine JSON-Zeile mit dem Ergebnis.
// Aufruf: node store-child.mjs <aktion>   (Umgebung: SUPABASE_URL usw.)
const action = process.argv[2] || 'read';
const { initStore, flushStore, db } = await import('../../store.js');
await initStore();
const out = { layout: db.layout, backend: db.backend };
if (action === 'add-note') {
  db.insert('notifications', { id: `n_neu_${Date.now()}`, userId: 'u1', title: 'neu', read: false, createdAt: new Date().toISOString() });
  await flushStore();
} else if (action === 'edit-first-user') {
  db.all('users')[0].name = 'Geändert';
  db.commit();
  await flushStore();
} else if (action === 'delete-class') {
  db.all('classes').splice(0, 1);
  db.commit();
  await flushStore();
} else if (action === 'noop-commit') {
  db.commit();
  await flushStore();
}
const snap = db.snapshot();
out.counts = Object.fromEntries(Object.entries(snap).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));
out.userNames = snap.users.map((u) => u.name);
out.noteIds = snap.notifications.map((n) => n.id);
out.classNames = snap.classes.map((c) => c.name);
out.meta = snap.meta;
console.log(`RESULT ${JSON.stringify(out)}`);
process.exit(0);
