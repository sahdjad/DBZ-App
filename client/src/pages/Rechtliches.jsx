// Impressum und Datenschutzerklärung -- öffentlich (ohne Anmeldung) erreichbar,
// auch als Link für App Store / Play Store. Die Vereinsangaben kommen vom Server
// (/api/legal, in den Einstellungen änderbar); leere Felder erscheinen nicht.
// Die Texte beschreiben, was die App tatsächlich tut (Stand siehe unten). Bei
// neuen Diensten oder Datenarten hier nachziehen und rechtlich prüfen lassen.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const STAND = 'November 2026';

function useLegal() {
  const [legal, setLegal] = useState(null);
  useEffect(() => {
    fetch('/api/legal').then((r) => r.json()).then((d) => setLegal(d.legal)).catch(() => setLegal({}));
  }, []);
  return legal;
}

function Page({ title, children }) {
  return (
    <div className="min-h-dvh bg-[rgb(var(--c-bg))]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <Link to="/" className="inline-flex items-center gap-1.5 text-subhead text-mint-light dark:text-mint hover:underline"><ArrowLeft size={16} /> Zur App</Link>
        <article className="legal mt-4 rounded-2xl bg-card border border-line/70 shadow-card p-5 sm:p-8 text-body text-sage" data-noi18n lang="de">
          <h1 className="text-title1 font-bold text-ivory">{title}</h1>
          {children}
        </article>
        <p className="mt-4 text-center text-footnote text-sage-muted" data-noi18n>
          <Link to="/impressum" className="hover:underline">Impressum</Link>
          <span className="mx-2">·</span>
          <Link to="/datenschutz" className="hover:underline">Datenschutz</Link>
        </p>
      </div>
    </div>
  );
}

const H2 = ({ children }) => <h2 className="mt-7 mb-2 text-title3 font-semibold text-ivory">{children}</h2>;
const H3 = ({ children }) => <h3 className="mt-4 mb-1 text-headline font-semibold text-ivory">{children}</h3>;
const P = ({ children }) => <p className="mt-2 leading-relaxed">{children}</p>;
const UL = ({ children }) => <ul className="mt-2 list-disc pl-5 space-y-1 leading-relaxed">{children}</ul>;

function Address({ legal }) {
  return (
    <p className="mt-2 leading-relaxed">
      {legal.orgName}<br />
      {legal.street}<br />
      {legal.zip} {legal.city}{legal.country ? <><br />{legal.country}</> : null}
    </p>
  );
}

function Contact({ legal }) {
  if (!legal.email && !legal.phone) return null;
  return (
    <p className="mt-2 leading-relaxed">
      {legal.email && <>E-Mail: <a className="text-mint-light dark:text-mint underline" href={`mailto:${legal.email}`}>{legal.email}</a><br /></>}
      {legal.phone && <>Telefon: {legal.phone}</>}
    </p>
  );
}

export function Impressum() {
  const legal = useLegal();
  if (!legal) return <Page title="Impressum" />;
  return (
    <Page title="Impressum">
      <H2>Angaben gemäß § 5 DDG</H2>
      <Address legal={legal} />
      {legal.representative && <P>Vertreten durch: {legal.representative}</P>}
      {legal.register && <P>Registereintrag: {legal.register}</P>}
      {(legal.email || legal.phone) && <H2>Kontakt</H2>}
      <Contact legal={legal} />
      <H2>Verantwortlich für den Inhalt</H2>
      <P>{legal.representative || legal.orgName}, Anschrift wie oben.</P>
      <H2>Hinweis</H2>
      <P>
        Diese App ist die interne Schulplattform des Vereins für Schülerinnen und Schüler, Eltern, Lehrkräfte und
        Leitung. Für Inhalte externer Links (z. B. soziale Netzwerke) sind ausschließlich deren Betreiber verantwortlich.
      </P>
      <P>
        Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </P>
    </Page>
  );
}

export function Datenschutz() {
  const legal = useLegal();
  if (!legal) return <Page title="Datenschutzerklärung" />;
  const contact = legal.privacyContact || legal.email;
  return (
    <Page title="Datenschutzerklärung">
      <P>Stand: {STAND}</P>

      <H2>1. Verantwortlicher</H2>
      <Address legal={legal} />
      {legal.representative && <P>Vertreten durch: {legal.representative}</P>}
      <Contact legal={legal} />
      {legal.privacyContact && legal.privacyContact !== legal.email && <P>Für Datenschutzanfragen: {legal.privacyContact}</P>}

      <H2>2. Worum es geht</H2>
      <P>
        Die DBZ-App ist die Schulplattform unserer Koranschule. Sie dient dem Unterricht und der Verwaltung:
        Anwesenheit, Hausaufgaben und Abgaben, Bewertungen, Prüfungen, Nachrichten und Ankündigungen sowie der
        Verwaltung von Klassen und Konten. Es gibt keine Werbung, kein Tracking und keine Analyse-Werkzeuge
        Dritter. Daten werden nicht verkauft.
      </P>

      <H2>3. Welche Daten wir verarbeiten</H2>
      <H3>Konto</H3>
      <UL>
        <li>Name, E-Mail-Adresse, Passwort (nur verschlüsselt als Prüfwert gespeichert), Rolle, Klasse, Schülernummer</li>
        <li>Zeitpunkt der letzten Nutzung (nur für Lehrkräfte und Leitung sichtbar)</li>
      </UL>
      <H3>Angaben bei der Anmeldung</H3>
      <UL>
        <li>Vor- und Nachname, Geburtsdatum, Geschlecht, Anschrift, Telefonnummer</li>
        <li>Angaben zu Erziehungsberechtigten (Name, Telefon, E-Mail) und zur Zahlungsweise (Selbstzahler ja/nein); Bankdaten werden in der App nicht gespeichert</li>
      </UL>
      <H3>Unterricht und Schulbetrieb</H3>
      <UL>
        <li>Anwesenheit (anwesend, verspätet, entschuldigt, unentschuldigt), Check-in-Zeitpunkt</li>
        <li>Abmeldungen und Entschuldigungen mit Begründung (dabei kann es sich um Gesundheitsangaben handeln, z. B. „krank“)</li>
        <li>Hausaufgaben und Abgaben: Texte, Dateien, Fotos und Audioaufnahmen von Rezitationen</li>
        <li>Bewertungen, Rückmeldungen, Prüfungen, Lernziele (Hifz), Übungsverläufe, Aktivitäten</li>
        <li>Verhaltensvermerke und Strafen</li>
        <li>Klassenverlauf (Eintritt, Klassenwechsel, Austritt mit Datum)</li>
      </UL>
      <H3>Kommunikation</H3>
      <UL>
        <li>Nachrichten, Ankündigungen und Benachrichtigungen in der App</li>
        <li>bei aktivierten Push-Mitteilungen: eine technische Adresse des Push-Dienstes Ihres Geräts</li>
      </UL>
      <H3>Technische Daten</H3>
      <UL>
        <li>beim Aufruf der App verarbeitet unser Hosting-Anbieter technisch notwendige Verbindungsdaten (u. a. IP-Adresse, Zeitpunkt, aufgerufene Adresse) in Server-Protokollen</li>
        <li>ein Protokoll wichtiger Verwaltungsvorgänge (wer hat wann was geändert), damit Änderungen nachvollziehbar bleiben</li>
      </UL>

      <H2>4. Zwecke und Rechtsgrundlagen</H2>
      <UL>
        <li><b className="text-ivory">Unterricht und Mitgliedschaft</b> (Art. 6 Abs. 1 lit. b DSGVO): Durchführung des Unterrichts, Klassen- und Anwesenheitsverwaltung, Hausaufgaben, Bewertungen, Kommunikation zwischen Schule, Schülern und Eltern.</li>
        <li><b className="text-ivory">Religiöser Bezug</b> (Art. 9 Abs. 2 lit. d DSGVO): Die Teilnahme an einer Koranschule kann Rückschlüsse auf die Religion zulassen. Wir verarbeiten diese Daten als religiös ausgerichteter, nicht gewinnorientierter Verein ausschließlich für unsere Mitglieder und Schüler und geben sie ohne Einwilligung nicht nach außen weiter.</li>
        <li><b className="text-ivory">Gesundheitsangaben in Entschuldigungen</b> (Art. 9 Abs. 2 lit. a DSGVO): nur, wenn Sie oder Ihre Erziehungsberechtigten sie freiwillig angeben.</li>
        <li><b className="text-ivory">Sicherheit und Betrieb</b> (Art. 6 Abs. 1 lit. f DSGVO): Schutz vor Missbrauch (z. B. Begrenzung von Anmeldeversuchen), Datensicherungen, Protokoll von Verwaltungsvorgängen.</li>
        <li><b className="text-ivory">Einwilligung</b> (Art. 6 Abs. 1 lit. a DSGVO): Push-Mitteilungen und freiwillige Angaben. Eine Einwilligung können Sie jederzeit für die Zukunft widerrufen, z. B. indem Sie Push-Mitteilungen im Konto ausschalten.</li>
      </UL>
      <P>
        Bei Kindern unter 16 Jahren erfolgen Anmeldung und Einwilligungen durch die Erziehungsberechtigten bzw. mit
        deren Zustimmung.
      </P>
      <P>
        Die App schlägt Lehrkräften aus Anwesenheit, Hausaufgaben und weiteren Angaben eine Note vor. Das ist nur
        eine Hilfe; die Entscheidung trifft immer eine Lehrkraft. Eine ausschließlich automatisierte Entscheidung
        im Sinne von Art. 22 DSGVO findet nicht statt.
      </P>

      <H2>5. Wer die Daten sieht</H2>
      <UL>
        <li>Schülerinnen und Schüler sehen ihre eigenen Daten, Eltern die ihrer verknüpften Kinder.</li>
        <li>Lehrkräfte sehen die Daten ihrer Klassen, die Leitung und die Systembetreuung die Daten der Schule, soweit sie für ihre Aufgabe nötig sind.</li>
        <li>Mitschülerinnen und Mitschüler sehen keine Kontakt-, Anwesenheits- oder Leistungsdaten anderer.</li>
      </UL>

      <H2>6. Dienstleister (Auftragsverarbeitung)</H2>
      <UL>
        <li><b className="text-ivory">Render Services, Inc.</b> (USA) – Betrieb der App (Hosting).</li>
        <li><b className="text-ivory">Supabase, Inc.</b> (USA) – Datenbank und Dateispeicher einschließlich Sicherungen.</li>
        <li><b className="text-ivory">Push-Dienste</b> der Geräte- und Browserhersteller (Apple, Google, Mozilla, Microsoft) – nur wenn Sie Push-Mitteilungen einschalten. Übermittelt werden kurze Hinweistexte, keine Inhalte von Verhaltensvermerken.</li>
      </UL>
      <P>
        Mit unseren Dienstleistern bestehen Verträge zur Auftragsverarbeitung nach Art. 28 DSGVO. Soweit Daten in
        die USA übermittelt werden, geschieht dies auf Grundlage des Angemessenheitsbeschlusses der EU-Kommission
        (EU-US Data Privacy Framework), soweit der Anbieter zertifiziert ist, sonst auf Grundlage der
        EU-Standardvertragsklauseln (Art. 46 DSGVO).
      </P>
      <H3>Koran-Texte und -Audio</H3>
      <P>
        Koran-Texte holt unser Server ohne Personenbezug von öffentlichen Quellen. Beim Abspielen einer
        Rezitation lädt Ihr Gerät die Audiodatei direkt von <i>quranicaudio.com</i> bzw. <i>cdn.islamic.network</i>;
        dabei erhalten diese Anbieter technisch Ihre IP-Adresse (Art. 6 Abs. 1 lit. f DSGVO).
      </P>

      <H2>7. Spracherkennung</H2>
      <P>
        Die Übungsfunktion mit Spracherkennung (Auswendiglernen) läuft vollständig auf Ihrem Gerät. Die
        Mikrofon-Aufnahme wird dabei weder gespeichert noch versendet; gespeichert wird nur das Ergebnis der Übung
        (z. B. welche Stellen geübt wurden). Audioaufnahmen für Hausaufgaben werden nur hochgeladen, wenn Sie sie
        selbst abgeben.
      </P>

      <H2>8. Cookies und Speicher im Browser</H2>
      <P>
        Wir verwenden nur ein technisch notwendiges Cookie für die Anmeldung (gültig bis zu 7 Tage) sowie den
        Speicher Ihres Browsers für Einstellungen wie Sprache, Schriftgröße oder Darstellung und für schnelleres
        Laden. Das ist für den Betrieb erforderlich (§ 25 Abs. 2 TDDDG); eine Einwilligung ist dafür nicht nötig.
      </P>

      <H2>9. Wie lange wir Daten speichern</H2>
      <UL>
        <li>Konto- und Schuldaten: solange die Person Schülerin/Schüler, Elternteil oder Mitarbeitende/r ist. Danach löschen wir sie, soweit keine gesetzlichen Pflichten entgegenstehen. Ein Konto lässt sich in der App unter „Konto“ selbst löschen.</li>
        <li>Klassendaten früherer Schuljahre sehen nur noch Lehrkräfte und Leitung.</li>
        <li>Audioaufnahmen von Hausaufgaben: nach der Bewertung gemäß der vom Verein festgelegten Frist, sofern eine Lehrkraft sie nicht ausdrücklich behält.</li>
        <li>Benachrichtigungen: gelesene nach 90 Tagen, alle nach spätestens einem Jahr.</li>
        <li>Protokoll der Verwaltungsvorgänge: etwa 13 Monate.</li>
        <li>Datensicherungen: tägliche Sicherungen 30 Tage; gelöschte Dateien bleiben 30 Tage wiederherstellbar.</li>
      </UL>

      <H2>10. Ihre Rechte</H2>
      <P>Sie haben das Recht auf</P>
      <UL>
        <li>Auskunft über Ihre Daten (Art. 15 DSGVO),</li>
        <li>Berichtigung (Art. 16) und Löschung (Art. 17),</li>
        <li>Einschränkung der Verarbeitung (Art. 18) und Datenübertragbarkeit (Art. 20),</li>
        <li>Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21),</li>
        <li>Widerruf erteilter Einwilligungen mit Wirkung für die Zukunft (Art. 7 Abs. 3).</li>
      </UL>
      <P>
        Wenden Sie sich dazu an uns{contact ? <> unter <a className="text-mint-light dark:text-mint underline" href={`mailto:${contact}`}>{contact}</a></> : ' (Anschrift oben)'}.
        Außerdem können Sie sich bei einer Datenschutz-Aufsichtsbehörde beschweren, für uns zuständig ist das
        Bayerische Landesamt für Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach.
      </P>

      <H2>11. Pflicht zur Bereitstellung</H2>
      <P>
        Für die Teilnahme am Unterricht über die App brauchen wir Name, Kontaktdaten und die Angaben zur
        Klasse. Ohne diese Angaben ist eine Nutzung der App nicht möglich; die Teilnahme am Unterricht selbst
        bleibt davon unberührt.
      </P>
    </Page>
  );
}
