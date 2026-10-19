// App-Guide: Schritt-für-Schritt-Einführung je Rolle. Wird beim ersten
// Öffnen gezeigt und ist jederzeit unter „Hilfe & Anleitung" abrufbar.
// GUIDE_VERSION erhöhen, wenn sich Inhalte stark ändern -> alle sehen sie neu.
export const GUIDE_VERSION = 1;

const welcome = (text) => ({ icon: 'hand', title: 'As-salāmu ʿalaikum!', text });
const finish = {
  icon: 'help',
  title: 'Fertig – viel Erfolg!',
  text: 'Diese Anleitung findest du jederzeit wieder im Menü unter „Hilfe & Anleitung". Dort stehen auch Antworten auf häufige Fragen.',
};
const numbers = {
  icon: 'bell',
  title: 'Zahlen im Menü',
  text: 'Eine Zahl an einem Menüpunkt (z. B. „Protokolle 2") zeigt neue Meldungen in diesem Bereich. Öffnest du ihn, verschwindet die Zahl. So geht nichts unter.',
};
const homescreen = {
  icon: 'phone',
  title: 'Als App auf dem Handy',
  text: 'iPhone: in Safari auf „Teilen" → „Zum Home-Bildschirm". Android: im Browser-Menü „App installieren". Nur so kommen Push-Nachrichten zuverlässig an.',
};

const studentCore = [
  { icon: 'home', title: 'Start', to: '/dashboard', text: 'Auf der Startseite siehst du deine offenen Hausaufgaben, deine Anwesenheit und die nächsten Termine.' },
  { icon: 'qr', title: 'Einchecken', to: '/checkin', text: 'Im Unterricht scannst du unter „Einchecken" den QR-Code der Lehrkraft. Damit bist du als anwesend eingetragen – pünktlich sein lohnt sich.' },
  { icon: 'mic', title: 'Hausaufgaben abgeben', to: '/aufgaben', text: 'Öffne unter „Aufgaben" die Hausaufgabe. „Aufnahme starten": mit Pause/Weiter aufnehmen, „Stopp" = erst anhören, „Senden" = sofort abgeben. Schon aufgenommen? „Audio-Datei wählen" (Sprachmemos, WhatsApp: Teilen → „In Dateien sichern").' },
  { icon: 'calendar', title: 'Regeln für Hausaufgaben', text: 'Pro Tag nur eine Hausaufgabe derselben Art (eine Audio- und eine schriftliche am selben Tag sind ok). Zur selben Hausaufgabe darfst du am selben Tag mehrere Aufnahmen schicken. Nach der Frist ist die Abgabe gesperrt.' },
  { icon: 'absence', title: 'Abwesenheit melden', to: '/abwesenheit', text: 'Krank oder verhindert? Melde es unter „Abwesenheit melden" möglichst vor dem Unterricht – mit einem kurzen, ehrlichen Grund.' },
  { icon: 'chat', title: 'Nachrichten', to: '/nachrichten', text: 'Unter „Nachrichten" schreibst du deiner Klassenleitung oder der DBZ-Leitung. Ankündigungen der Schule findest du unter „Ankündigungen".' },
  { icon: 'book', title: "Qur'an & Hifz", to: '/quran', text: "Im Qur'an-Bereich kannst du lesen und auswendig rezitieren – die App erkennt deine Rezitation und deckt die Wörter auf. Deinen Fortschritt siehst du unter „Hifz & Muraja'ah\"." },
];

const GUIDES = {
  schueler: {
    label: 'Schüler',
    steps: [welcome('In einer Minute zeigen wir dir das Wichtigste der DBZ-App.'), ...studentCore, numbers, homescreen, finish],
  },
  klassensprecher: {
    label: 'Klassensprecher',
    steps: [
      welcome('Als Klassensprecher bist du Schüler – mit ein paar Extra-Aufgaben. Hier das Wichtigste.'),
      ...studentCore,
      { icon: 'protocol', title: 'Protokolle schreiben', to: '/protokolle', text: 'Schreibe nach dem Unterricht das Protokoll (Themen, Hausaufgaben, Besonderes) und reiche es zur Bestätigung ein. Du kannst es auch später noch korrigieren – die Klasse bekommt dann „Protokoll aktualisiert".' },
      { icon: 'lightbulb', title: 'Aufgaben vorschlagen', to: '/aufgaben', text: 'Unter „Aufgaben" kannst du Hausaufgaben vorschlagen. Bei einem Fehler in einer Hausaufgabe: „Fehler? Korrektur vorschlagen". Die Lehrkraft bestätigt beides, erst dann sieht es die Klasse.' },
      numbers, homescreen, finish,
    ],
  },
  eltern: {
    label: 'Eltern',
    steps: [
      welcome('Hier sehen Sie, wie Sie Ihr Kind mit der DBZ-App begleiten.'),
      { icon: 'link', title: 'Kind verknüpfen', to: '/konto', text: 'Unter „Konto" geben Sie den Familien-Code Ihres Kindes ein. Den Code findet Ihr Kind in seinem eigenen Konto.' },
      { icon: 'absence', title: 'Abwesenheit melden', to: '/abwesenheit', text: 'Ist Ihr Kind krank oder verhindert, melden Sie es unter „Abwesenheit melden" – am besten vor dem Unterricht.' },
      { icon: 'chart', title: 'Fortschritt ansehen', to: '/berichte', text: "Zeugnisse, Hifz-Fortschritt, Verhalten und Strafen Ihres Kindes finden Sie in den jeweiligen Bereichen im Menü." },
      { icon: 'chat', title: 'Kontakt', to: '/nachrichten', text: 'Unter „Nachrichten" erreichen Sie die Klassenleitung und die DBZ-Leitung. Termine stehen im „Kalender".' },
      numbers, homescreen, finish,
    ],
  },
  lehrer: {
    label: 'Lehrkräfte',
    steps: [
      welcome('In zwei Minuten durch die wichtigsten Werkzeuge für Ihre Klasse.'),
      { icon: 'qr', title: 'Unterricht & Anwesenheit', to: '/unterricht', text: 'Unter „Unterricht" starten Sie die Stunde und zeigen den QR-Code – die Schüler checken damit ein. Anwesenheit lässt sich auch nachträglich unter „Anwesenheit" korrigieren.' },
      { icon: 'mic', title: 'Hausaufgaben aufgeben', to: '/aufgaben', text: '„Neue Aufgabe": Art (Audio, Text …) und Frist wählen – mit Schnellwahl „Samstag 12:00" oder „Bis zum nächsten Unterricht". Mit dem Stift ✏️ lässt sich eine Aufgabe später korrigieren. Vorschläge des Klassensprechers bestätigen Sie oben in der Liste.' },
      { icon: 'calendar', title: 'Eine Hausaufgabe pro Tag', to: '/aufgaben', text: 'Unter Aufgaben → „Regeln: eine Hausaufgabe pro Tag" legen Sie fest, ob mehrere Hausaufgaben derselben Art an einem Tag rot markiert, gesperrt oder erlaubt sind – für die Klasse oder einzelne Schüler.' },
      { icon: 'check', title: 'Korrektur', to: '/korrektur', text: '„Nach Schülern" zeigt pro Woche „x von y". Rot = Frist vorbei und nicht abgegeben – mit Filter „Nur zeigen, wer nicht abgegeben hat". Antippen öffnet Audios und „Bewerten".' },
      { icon: 'absence', title: 'Entschuldigungen', to: '/entschuldigungen', text: 'Abwesenheitsmeldungen annehmen, ablehnen oder per Rückfrage in der App klären.' },
      { icon: 'protocol', title: 'Protokolle', to: '/protokolle', text: 'Protokolle selbst schreiben (auch rückwirkend) oder die des Klassensprechers bestätigen. Wird ein freigegebenes Protokoll geändert, bekommt die Klasse automatisch Bescheid.' },
      { icon: 'users', title: 'Klassenliste', to: '/klassenliste', text: 'Kennzahlen je Schüler, Klassensprecher ernennen, Verhalten und Strafen – alles für Ihre Klasse an einem Ort.' },
      numbers, homescreen, finish,
    ],
  },
  leitung: {
    label: 'Leitung & Admin',
    steps: [
      welcome('Ein kurzer Überblick über die Werkzeuge der DBZ-Leitung.'),
      { icon: 'chart', title: 'Leitungs-Überblick', to: '/leitung', text: 'Unter „Leitung" sehen Sie die Kennzahlen aller Klassen auf einen Blick. Die Kacheln führen direkt in den jeweiligen Bereich.' },
      { icon: 'users', title: 'Verwaltung', to: '/admin', text: 'Nutzer anlegen und einladen, neue Anmeldungen freischalten, Rollen vergeben (auch mehrere pro Person), Klassen und Lehrkräfte zuordnen.' },
      { icon: 'check', title: 'Nach Klassen einsehen', to: '/abgaben', text: 'Abgaben, Entschuldigungen und Protokolle sind nach Klassen geordnet. Sie sehen alles – entschieden und bewertet wird von der Lehrkraft der Klasse.' },
      { icon: 'chat', title: 'Ankündigungen & Nachrichten', to: '/ankuendigungen', text: 'Ankündigungen an alle oder nur an Präsenz- bzw. Online-Klassen. Nachrichten werden über das gemeinsame Postfach der Leitung beantwortet.' },
      { icon: 'shield', title: 'Sicherheit', to: '/admin', text: 'In der Verwaltung können Sie ein Backup herunterladen und im Protokoll (Audit-Log) nachsehen, wer was geändert hat.' },
      numbers, homescreen, finish,
    ],
  },
};

export const GUIDE_ROLES = ['schueler', 'klassensprecher', 'eltern', 'lehrer', 'leitung'];
export function guideKeyFor(role) {
  if (role === 'klassenlehrer' || role === 'vertretung') return 'lehrer';
  if (role === 'super_admin' || role === 'leitung') return 'leitung';
  return GUIDES[role] ? role : 'schueler';
}
export const guideFor = (key) => GUIDES[key] || GUIDES.schueler;

// Häufige Fragen (für alle Rollen).
export const FAQ = [
  { q: 'Wie lege ich die App auf den Home-Bildschirm?', a: 'iPhone: die App in Safari öffnen → „Teilen" → „Zum Home-Bildschirm". Android: im Chrome-Menü „App installieren" bzw. „Zum Startbildschirm hinzufügen".' },
  { q: 'Ich bekomme keine Push-Nachrichten.', a: 'Unter „Konto" → Benachrichtigungen einschalten. Auf dem iPhone funktionieren Push-Nachrichten nur, wenn die App auf dem Home-Bildschirm liegt.' },
  { q: 'Wie lade ich eine WhatsApp-Sprachnachricht als Hausaufgabe hoch?', a: 'In WhatsApp die Sprachnachricht lange drücken → „Teilen" → „In Dateien sichern". Dann in der Hausaufgabe „Audio-Datei wählen" und die Datei auswählen.' },
  { q: 'Ich habe mein Passwort vergessen.', a: 'Auf der Anmeldeseite „Passwort vergessen" wählen oder die DBZ-Leitung bitten, das Passwort zurückzusetzen.' },
  { q: 'Wie lösche ich mein Konto?', a: 'Unter „Konto" → „Konto löschen". Zur Sicherheit braucht es dein Passwort und das Wort LÖSCHEN.' },
  { q: 'Die App lädt beim ersten Öffnen lange.', a: 'Der Server schläft nach einer Weile ein und braucht beim ersten Aufruf bis zu einer Minute zum Aufwachen. Danach ist die App wieder schnell.' },
];
