// Zeitzone der Schule. Unterrichtszeiten ("14:00") sind deutsche Ortszeit --
// Render & Co. laufen aber in UTC, sonst begänne der Unterricht rechnerisch
// zwei Stunden später (Sommerzeit) und Verspätungen wären falsch. Muss als
// ERSTES Modul geladen werden (siehe index.js/app.js).
if (!process.env.TZ) process.env.TZ = process.env.SCHOOL_TZ || 'Europe/Berlin';
