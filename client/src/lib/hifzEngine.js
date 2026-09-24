/** Transcript follower, NOT a pronunciation/tajwid detector. */
export function normalize(text) {
  return String(text).normalize('NFC')
    .replace(/\u0671/g, '\u0627') // alif wasla only; preserve hamza distinctions
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
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
      position: w.position, line: w.line, text: w.text, token });
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
    this.mismatch = null;
    this.status = 'ready';
    return this.snapshot();
  }
  snapshot() {
    return { session: this.session, index: this.index, total: this.passage.words.length,
      status: this.status, hints: [...this.hints],
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
  /** final segments are incremental, immutable, non-overlapping; IDs unique per session. */
  accept({ session, id, final, text, reliable = true }) {
    if (session !== this.session || !final || this.status === 'complete') return this.snapshot();
    if (typeof id !== 'string' || !id) throw new Error('Segment-ID fehlt.');
    if (this.seen.has(id)) return this.snapshot();
    if (typeof text !== 'string' || text.length > 10000) throw new Error('Ungültiges Transkript.');
    if (this.seen.size >= 10000) throw new Error('Sitzungslimit erreicht. Bitte neu beginnen.');
    this.seen.add(id);
    const tokens = normalize(text).split(' ').filter(Boolean);
    if (!tokens.length) return this.snapshot();
    if (!reliable) { this.status = 'uncertain'; return this.snapshot(); }
    const words = this.passage.words;

    // Allow only an exact, unambiguous suffix repetition ending at the frontier.
    // If the repeated prefix also equals the next words, do not guess advancement.
    let offset = 0;
    const candidates = [];
    for (let length = 1; length <= Math.min(this.index, tokens.length, 12); length++) {
      const suffix = words.slice(this.index - length, this.index).map(w => w.token);
      if (suffix.every((t, i) => t === tokens[i])) candidates.push(length);
    }
    if (candidates.length) {
      if (words[this.index]?.token === tokens[0] || candidates.length > 1) {
        this.status = 'uncertain'; return this.snapshot();
      }
      offset = candidates[0];
    }
    for (let i = offset; i < tokens.length && this.index < words.length; i++) {
      if (tokens[i] === words[this.index].token) {
        if (this.mismatch) this.history.push({ kind: 'recovered', index: this.index });
        this.history.push({ kind: this.hints.has(this.index) ? 'assisted-match' : 'transcript-match', index: this.index });
        this.index++;
        this.mismatch = null;
        this.status = this.index === words.length ? 'complete' : 'following';
      } else {
        const count = this.mismatch?.index === this.index ? this.mismatch.count + 1 : 1;
        this.mismatch = { index: this.index, count, suspected: count >= this.confirmations && !this.dismissed.has(this.index) };
        this.status = this.mismatch.suspected ? 'suspected' : 'uncertain';
        this.history.push({ kind: 'transcript-deviation', index: this.index });
        break; // never scan past a missing/wrong token
      }
    }
    return this.snapshot();
  }
}
