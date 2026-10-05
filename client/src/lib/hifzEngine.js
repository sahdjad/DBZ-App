// Transcript follower, NOT a pronunciation/tajwid detector.
//
// Field evidence (real device tests, browser Web Speech API, ar-SA/ar):
// the recognizer's transcript almost never carries the Uthmani mushaf's
// hamza-bearing alif forms (\u0623/\u0625/\u0622/\u0671) or hamza-on-waw/ya (\u0624/\u0626) -- it returns
// plain carrier letters. An earlier, stricter version of this function kept
// those forms distinct "to not grade over pronunciation", but in practice
// that meant almost nothing ever matched and the whole feature stayed
// silent. Folding these well-known, systematic spelling variants for
// COMPARISON only (never for what is shown on screen -- the original mushaf
// text is untouched, see validatePassage below) is standard, well-documented
// practice in Arabic text normalization, not an invented leniency: it
// removes an orthographic mismatch that is not an actual mispronunciation.
// Uthmani-Rechtschreibung vs. heutige Schreibweise (Feldtest mit der NVIDIA-
// Erkennung): der Mushaf schreibt ein langes a oft nur als kleines, hoch-
// gestelltes Alif (U+0670) -- "سَمَٰوَٰتٍ", "ذَٰلِكَ" -- oder über einem stummen
// Waw -- "ٱلْحَيَوٰةَ", "ٱلصَّلَوٰةَ". Die Erkennung schreibt dafür "سماوات",
// "ذلك", "الحياة", "الصلاة". Das ist reine Rechtschreibung, kein Rezitations-
// fehler: Waw direkt + kleines Alif (stummer Waw-Träger) -> Alif; sonst
// kleines Alif -> Alif. Die zweite Form (kleines Alif weggelassen) deckt die
// Wörter ab, die man heute ohne Alif schreibt (ذلك، هذا، الرحمن، لكن).
const expandDagger = (t) => t.replace(/\u0648\u0670/g, '\u0627').replace(/\u0649\u0670/g, '\u0649').replace(/\u0670/g, '\u0627');

export function normalize(text, { dagger = 'alif' } = {}) {
  const src = String(text).normalize('NFC');
  return (dagger === 'alif' ? expandDagger(src) : src)
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627') // hamza/wasla-bearing alif -> bare alif
    .replace(/\u0649/g, '\u064A') // alif maqsura -> ya
    .replace(/\u0624/g, '\u0648') // hamza on waw -> bare waw
    .replace(/\u0626/g, '\u064A') // hamza on ya -> bare ya
    .replace(/\u0621/g, '') // standalone hamza: frequently dropped by ASR transcripts
    .replace(/\u0629/g, '\u0647') // ta marbuta -> ha: ASR transcripts routinely write it as \u0647
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}
// Toleriert einen einzelnen ASR-Buchstabenfehler INNERHALB eines Wortes
// (z. B. ein falsch erkannter Laut) nach der Normalisierung oben -- ohne ein
// komplett anderes, \u00E4hnlich aussehendes Wort f\u00E4lschlich als Treffer zu
// werten. Nur ab 4 Zeichen und h\u00F6chstens 1 Bearbeitungsschritt Unterschied:
// kurze W\u00F6rter (2-3 Buchstaben) sind im Arabischen oft eigene, unterschiedliche
// W\u00F6rter (z. B. \u0645\u0646 / \u0639\u0646), da w\u00E4re jede Toleranz riskant.
// Laute, die die Erkennung (und Schüler beim Rezitieren) häufig verwechseln:
// emphatische/nicht-emphatische Paare und ähnliche Laute. NUR für den
// Vergleich -- angezeigt wird immer der Originaltext. Verdoppelte Buchstaben
// (Schadda wird von der Erkennung oft als Doppelbuchstabe geschrieben) werden
// zusammengefasst.
const PHONETIC = { '\u0635': '\u0633', '\u062B': '\u0633', '\u0637': '\u062A', '\u0636': '\u062F', '\u0638': '\u0630', '\u0632': '\u0630', '\u0642': '\u0643', '\u062D': '\u0647' };
export function phonetic(token) {
  let out = '';
  for (const ch of token) {
    const c = PHONETIC[ch] || ch;
    if (out[out.length - 1] !== c) out += c;
  }
  return out;
}

// Gedehnte Laute (Madd) schreibt die Erkennung oft doppelt: "لاا" = "لا".
const collapse = (t) => t.replace(/(.)\1+/gu, '$1');

function closeEnough(a, b) {
  if (a === b) return true;
  if (collapse(a) === collapse(b)) return true;
  const pa = phonetic(a), pb = phonetic(b);
  // Gleich klingend (nach Lautangleichung): ab 3 Buchstaben sicher genug.
  if (pa === pb) return Math.min(a.length, b.length) >= 3;
  if (pa.length < 4 || pb.length < 4) return false;
  // Höchstens EIN abweichender Laut (nach Lautangleichung) -- zwei wären schon
  // ein anderes Wort (z. B. العالمين / العاصفين).
  if (Math.abs(pa.length - pb.length) > 1) return false;
  return levenshtein(pa, pb) <= 1;
}

// Wortanfang, den die Erkennung an einer Satz-/Fenstergrenze abgeschnitten
// hat (z. B. "وم" statt "ومن", "الفل" statt "الفلق"): höchstens ein
// fehlender Buchstabe am Ende und mindestens zwei erkannte Buchstaben.
function truncatedOf(token, word) {
  // Bei Zwei-Buchstaben-Wörtern (z. B. "شي" für شيء) bleibt nach dem
  // Abschneiden oft nur der erste Buchstabe übrig.
  return (token.length >= 2 || word.length === 2) && word.length - token.length === 1 && word.startsWith(token);
}
const tokenMatches = (token, word) => token === word || closeEnough(token, word) || truncatedOf(token, word);
const wordMatches = (token, w) => tokenMatches(token, w.token) || (w.alt !== w.token && tokenMatches(token, w.alt));
// Strenger Vergleich (ohne Tippfehler-/Abschneide-Toleranz) -- für das
// Erkennen von Wiederholungen, damit z. B. "إلا" nicht als abgeschnittenes
// "إله" gilt.
const sameWord = (token, w) => [w.token, w.alt].some((x) => token === x || collapse(token) === collapse(x)
  || (Math.min(token.length, x.length) >= 3 && phonetic(token) === phonetic(x)));

// Für die Sofort-Vorschau aus dem Zwischenergebnis: nur ganze, gleich lange
// Wörter (ein angefangenes Wort am Audio-Ende ist kürzer und passt deshalb
// nie), höchstens ein vertauschter Laut bei längeren Wörtern.
function previewMatches(token, w) {
  if (token.length < 2) return false;
  if (sameWord(token, w)) return true;
  return [w.token, w.alt].some((x) => {
    const pa = phonetic(token), pb = phonetic(x);
    return pa.length >= 5 && pa.length === pb.length && levenshtein(pa, pb) <= 1;
  });
}

export function validatePassage(input) {
  if (!input || typeof input !== 'object') throw new Error('Abschnitt fehlt.');
  for (const key of ['id', 'title', 'edition', 'riwaya', 'source']) {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > 500)
      throw new Error(`Ungültiges Metadatenfeld: ${key}`);
  }
  if (!Array.isArray(input.words) || input.words.length < 1 || input.words.length > 8000)
    throw new Error('Ein Abschnitt benötigt 1–8000 Wörter.');
  const ids = new Set();
  let previous;
  const words = input.words.map(w => {
    if (!w || typeof w.id !== 'string' || !w.id || ids.has(w.id))
      throw new Error('Wort-IDs müssen eindeutig sein.');
    ids.add(w.id);
    if (!Number.isInteger(w.surah) || w.surah < 1 || w.surah > 114 ||
        !Number.isInteger(w.ayah) || w.ayah < 1 || !Number.isInteger(w.position) || w.position < 1 ||
        !Number.isInteger(w.line) || w.line < 1)
      throw new Error(`Ungültige Wortreferenz: ${w.id}`);
    if (typeof w.text !== 'string' || w.text.length > 200 || !/\p{Script=Arabic}/u.test(w.text))
      throw new Error(`Arabischer Originaltext fehlt: ${w.id}`);
    const token = normalize(w.text);
    if (!token || token.includes(' ')) throw new Error(`Ein Token pro Wort erforderlich: ${w.id}`);
    if (previous) {
      const sameVerse = previous.surah === w.surah && previous.ayah === w.ayah;
      const laterVerse = w.surah > previous.surah || (w.surah === previous.surah && w.ayah > previous.ayah);
      if (w.line < previous.line || !(sameVerse ? w.position === previous.position + 1 : laterVerse && w.position === 1))
        throw new Error('Wortreihenfolge oder Zeilenreihenfolge ungültig.');
    }
    previous = w;
    return Object.freeze({ id: w.id, surah: w.surah, ayah: w.ayah,
      position: w.position, line: w.line, text: w.text, token, alt: normalize(w.text, { dagger: 'drop' }) || token });
  });
  return Object.freeze({ id: input.id, title: input.title, edition: input.edition,
    riwaya: input.riwaya, source: input.source, words: Object.freeze(words) });
}

export class HifzEngine {
  constructor(passage, { mismatchConfirmations = 2 } = {}) {
    this.passage = validatePassage(passage);
    if (!Number.isInteger(mismatchConfirmations) || mismatchConfirmations < 2)
      throw new Error('Mindestens zwei Bestätigungen erforderlich.');
    this.confirmations = mismatchConfirmations;
    this.reset();
  }
  reset() {
    this.session = (this.session ?? 0) + 1;
    this.index = 0;
    this.seen = new Set();
    this.hints = new Set();
    this.dismissed = new Set();
    this.history = [];
    this.missed = new Set();
    this.backlog = [];
    this.mismatch = null;
    this.status = 'ready';
    return this.snapshot();
  }
  snapshot() {
    return { session: this.session, index: this.index, total: this.passage.words.length,
      status: this.status, hints: [...this.hints], missed: [...this.missed],
      mismatch: this.mismatch ? { ...this.mismatch } : null,
      history: this.history.map(e => ({ ...e })) };
  }
  hint() {
    if (this.index < this.passage.words.length && !this.hints.has(this.index)) {
      this.hints.add(this.index);
      this.history.push({ kind: 'hint', index: this.index });
    }
    return this.snapshot(); // revealing is not advancing
  }
  dismissMismatch() {
    if (this.mismatch) {
      this.history.push({ kind: 'dismissed', index: this.index });
      this.dismissed.add(this.index);
    }
    this.mismatch = null;
    this.status = this.index === this.passage.words.length ? 'complete' : 'waiting';
    return this.snapshot();
  }
  /**
   * Sofort-Vorschau (wie Tarteel): Wie viele der nächsten erwarteten Wörter
   * stehen schon eindeutig im noch nicht bestätigten Zwischenergebnis? Ändert
   * den bestätigten Stand NICHT -- die Anzeige deckt diese Wörter nur vorab
   * auf. Streng: nur in Reihenfolge, ganze Wörter, keine Sprünge/Wiederholungen,
   * nicht während einer Abweichung. Bestätigt die Erkennung kurz darauf etwas
   * anderes, verschwindet die Vorschau wieder.
   */
  preview(text) {
    if (this.status === 'complete' || this.mismatch || this.backlog.length || typeof text !== 'string') return 0;
    const tokens = normalize(text).split(' ').filter(Boolean);
    const words = this.passage.words;
    let n = 0;
    while (n < tokens.length && n < 8 && this.index + n < words.length && previewMatches(tokens[n], words[this.index + n])) n++;
    return n;
  }
  /** final segments are incremental, immutable, non-overlapping; IDs unique per session. */
  accept({ session, id, final, text, reliable = true }) {
    if (session !== this.session || !final || this.status === 'complete') return this.snapshot();
    if (typeof id !== 'string' || !id) throw new Error('Segment-ID fehlt.');
    if (this.seen.has(id)) return this.snapshot();
    if (typeof text !== 'string' || text.length > 10000) throw new Error('Ungültiges Transkript.');
    if (this.seen.size >= 10000) throw new Error('Sitzungslimit erreicht. Bitte neu beginnen.');
    this.seen.add(id);
    const fresh = normalize(text).split(' ').filter(Boolean);
    if (!fresh.length) return this.snapshot();
    if (!reliable) { this.status = 'uncertain'; return this.snapshot(); }
    const words = this.passage.words;
    // Streaming-Erkennung liefert oft nur 1-2 Wörter je Segment. Nach einer
    // Abweichung bleiben die noch nicht zugeordneten Wörter deshalb kurz im
    // Gedächtnis (backlog) und werden mit dem nächsten Segment zusammen
    // ausgewertet -- sonst ließe sich ein ausgelassenes Wort nie erkennen.
    const backlog = this.backlog;
    this.backlog = [];
    const tokens = [...backlog, ...fresh];

    // Allow only an exact, unambiguous suffix repetition ending at the frontier.
    // If the repeated prefix also equals the next words, do not guess advancement.
    let offset = 0;
    const candidates = [];
    for (let length = 1; !backlog.length && length <= Math.min(this.index, tokens.length, 12); length++) {
      // Wiederholung der letzten Wörter (Schüler setzen oft neu an) -- auch mit
      // kleinen Erkennungsabweichungen, nicht nur buchstabengenau.
      const suffix = words.slice(this.index - length, this.index);
      if (suffix.every((w, i) => sameWord(tokens[i], w))) candidates.push(length);
    }
    // Passt das erste Wort genauso auf das ERWARTETE Wort, ist es keine
    // Wiederholung, sondern das nächste Wort (es wurde ja tatsächlich gesagt).
    if (candidates.length && !(words[this.index] && sameWord(tokens[0], words[this.index]))) {
      if (candidates.length > 1) { this.status = 'uncertain'; return this.snapshot(); }
      offset = candidates[0];
    }
    // Field evidence (real device tests): real ASR transcripts sometimes
    // contain a single stray extra token (stutter, filler, a duplicated/
    // re-segmented chunk) that does not correspond to any expected word.
    // Treated naively, that one stray token would stall the whole rest of
    // the recitation. If the next word the reciter is expected to say
    // appears a short distance further along in THIS SAME transcript, the
    // token(s) in between are noise in what was HEARD -- skipping them
    // reveals nothing that was not actually said, it only ignores clutter.
    // A missing/wrong EXPECTED word is a different case and is deliberately
    // NOT auto-skipped (see below): that would reveal a word the person
    // never said, which this engine must never do.
    const INSERTION_LOOKAHEAD = 3;
    let i = offset;
    const advance = (consumed) => {
      if (this.mismatch) this.history.push({ kind: 'recovered', index: this.index });
      this.history.push({ kind: this.hints.has(this.index) ? 'assisted-match' : 'transcript-match', index: this.index });
      this.index++;
      this.mismatch = null;
      this.status = this.index === words.length ? 'complete' : 'following';
      i += consumed;
    };
    // Beim Wiederfinden (Sprung) ist ein Ein-Buchstaben-Token nie ein Treffer.
    const at = (k, w) => k < tokens.length && w < words.length && tokens[k].length >= 2 && wordMatches(tokens[k], words[w]);
    while (i < tokens.length && this.index < words.length) {
      const expected = words[this.index];
      if (wordMatches(tokens[i], expected)) { advance(1); continue; }
      // Von der Erkennung in zwei Teile zerlegtes Wort ("ال" + "فلق").
      if (i + 1 < tokens.length && [expected.token, expected.alt].some((t) => closeEnough(tokens[i] + tokens[i + 1], t))) { advance(2); continue; }
      // Von der Erkennung zusammengezogene Wörter ("قلاعوذ" = قل + أعوذ): der
      // Token entspricht den nächsten 2-3 erwarteten Wörtern hintereinander.
      let merged = 0;
      for (let n = 2; n <= 3 && this.index + n <= words.length; n++) {
        const joined = words.slice(this.index, this.index + n);
        if (closeEnough(tokens[i], joined.map((w) => w.token).join('')) || closeEnough(tokens[i], joined.map((w) => w.alt).join(''))) { merged = n; break; }
      }
      if (merged) {
        for (let n = 0; n < merged; n++) advance(n === 0 ? 1 : 0);
        continue;
      }
      // Störlaut direkt vor dem Wort mitgeschrieben ("اكتبه" für كتبه): das
      // erwartete Wort steht vollständig am Ende des Tokens (mind. 4 Buchstaben).
      if (expected.token.length >= 4 && tokens[i].length - expected.token.length <= 3 && phonetic(tokens[i]).endsWith(phonetic(expected.token))) { advance(1); continue; }
      let resync = -1;
      // Wörter aus dem Gedächtnis zählen nicht gegen das Toleranzfenster.
      const lookahead = INSERTION_LOOKAHEAD + Math.max(0, backlog.length - i);
      for (let k = 1; k <= lookahead && i + k < tokens.length; k++) {
        // Kurze Wörter nur bei (nahezu) gleicher Schreibung -- ein einzelner
        // gehörter Buchstabe darf hier nie ein Wort aufdecken.
        if (expected.token.length >= 4 ? wordMatches(tokens[i + k], expected) : sameWord(tokens[i + k], expected)) { resync = k; break; }
      }
      if (resync > 0) {
        this.history.push({ kind: 'insertion-ignored', index: this.index });
        i += resync;
        continue;
      }
      // Übersprungenes Wort (wie bei Tarteel): passen die NÄCHSTEN ZWEI
      // erwarteten Wörter eindeutig und direkt hintereinander (höchstens ein
      // Störwort davor), wurde das aktuelle Wort ausgelassen -- oder die
      // Erkennung hat es verschluckt. Es wird dann NICHT als rezitiert
      // gezählt, sondern sichtbar als Fehler ("ausgelassen") markiert, und
      // die Übung läuft weiter, statt an einer Stelle hängen zu bleiben,
      // obwohl die Person korrekt weiterrezitiert.
      // Wieder Anschluss finden: rezitiert die Person nach einer Stelle, die die
      // Erkennung nicht verstanden hat (oder die ausgelassen wurde), korrekt
      // weiter, darf die Übung nicht für immer hängen bleiben. Passen die
      // nächsten erwarteten Wörter eindeutig hintereinander (höchstens ein
      // Störwort dazwischen), werden die Wörter DAVOR als "ausgelassen" rot
      // markiert -- NICHT als rezitiert gezählt -- und es geht dort weiter.
      // Ein ausgelassenes Wort braucht 2 passende Folgewörter, 2-6 ausgelassene
      // Wörter brauchen 3 (je mehr übersprungen wird, desto strenger).
      const runFrom = (k, w, need) => {
        let t = k, n = 0, strays = 0;
        while (n < need) {
          if (at(t, w + n)) { n++; t++; continue; }
          if (!strays && n > 0 && at(t + 1, w + n)) { strays++; t += 2; n++; continue; }
          return false;
        }
        return true;
      };
      let skipAt = -1, skipBy = 0;
      for (let m = 1; m <= 6 && skipAt < 0; m++) {
        const need = m === 1 ? 2 : 3;
        if (this.index + m + need > words.length) break;
        // Nahe Stelle: direkt hier (höchstens 2 Störwörter davor); größerer
        // Sprung (2-6 Wörter): irgendwo im gehörten Rest, aber 3 Treffer am Stück.
        const ks = m === 1 ? [i, i + 1, i + 2] : Array.from({ length: Math.max(0, tokens.length - i) }, (_, x) => i + x);
        for (const k of ks) if (runFrom(k, this.index + m, need)) { skipAt = k; skipBy = m; break; }
      }
      if (skipAt >= 0) {
        for (let m = 0; m < skipBy; m++) {
          this.missed.add(this.index);
          this.history.push({ kind: 'skipped', index: this.index });
          this.index++;
        }
        this.mismatch = null;
        i = skipAt;
        continue;
      }
      const count = this.mismatch?.index === this.index ? this.mismatch.count + 1 : 1;
      this.mismatch = { index: this.index, count, suspected: count >= this.confirmations && !this.dismissed.has(this.index) };
      this.status = this.mismatch.suspected ? 'suspected' : 'uncertain';
      this.history.push({ kind: 'transcript-deviation', index: this.index });
      this.backlog = tokens.slice(i).slice(-8);
      break; // never scan past a missing/wrong expected word
    }
    return this.snapshot();
  }
}
