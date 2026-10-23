// Gemeinsame Rezitations-Sitzung für „Auswendig rezitieren": EIN Erkennungs-
// stand für beide Anzeigen (Text versteckt / Text sichtbar).
//
// Getrennt gehalten (bewusst):
//  - Übungsumfang (scope): frei (ganzer Qur'an) oder gezielt (Bereich)
//  - Anzeige (versteckt/sichtbar): ändert NUR, wie ein Wort gezählt wird,
//    das ab jetzt erkannt wird ("auswendig" vs. "mitgelesen") -- nie den Stand
//  - Erkennungsstand: Position (cursor), erkannte/ausgelassene Wörter, Hilfen
//  - Seite/Navigation: macht die Oberfläche (pageOf(cursor))
//
// Ablauf: Phase „searching" (freie Rezitation: Stelle im ganzen Qur'an
// suchen, siehe locator.js) -> „tracking" (Wort für Wort mitlesen mit der
// bewährten HifzEngine über ein gleitendes Fenster, also über Seiten- und
// Surengrenzen hinweg) -> „complete" (nur beim gezielten Üben am Bereichsende).
//
// Kein simulierter Fortschritt: Wörter gelten nur durch echte, endgültige
// Erkennungsergebnisse als erkannt. Hilfen (nächstes Wort, Ayah, Seite kurz
// zeigen) decken auf, zählen aber nie als auswendig rezitiert.
import { HifzEngine, normalize } from '../hifzEngine.js';
import { locate } from './locator.js';

const WINDOW_BACK = 30; // Wörter vor der Position (Wiederholungen erkennen)
const WINDOW_AHEAD = 1500;
const REBUILD_MARGIN = 300;
const SEARCH_BUFFER = 24;
const LOST_TOKENS = 5; // so viele unpassende Wörter -> woanders suchen
const NEAR_AHEAD = 40; // Anschluss so weit voraus = Lücke, kein Sprung
const MAX_MISSED_LIST = 60;

export const KIND = Object.freeze({
  MEMORY: 'memory', // bei verstecktem Text erkannt (ohne Hilfe)
  READ: 'read', // bei sichtbarem Text erkannt (mitgelesen)
  ASSISTED: 'assisted', // nach einer Hilfe erkannt
  MISSED: 'missed', // ausgelassen (nicht rezitiert)
});

export class RecitationTracker {
  /**
   * @param index  buildQuranIndex(...)
   * @param opts   { scope: { kind: 'free' } | { kind: 'focused', from, to, label }, reading: bool }
   */
  constructor(index, { scope = { kind: 'free' }, reading = false } = {}) {
    this.index = index;
    this.scope = scope;
    this.range = scope.kind === 'focused' ? [scope.from, scope.to] : [0, index.total];
    this.reading = !!reading; // Text gerade sichtbar (Anzeige „sichtbar" oder „Seite kurz zeigen")
    this.marks = new Map(); // g -> KIND
    this.hints = new Set(); // g: per Hilfe aufgedeckt
    this.version = 0;
    this.seen = new Set();
    this.heard = []; // Suchpuffer (normalisierte Wörter)
    this.lost = [];
    this.candidates = [];
    this.mismatch = null; // { g, suspected }
    this.engine = null;
    this.win = null; // [from, to)
    this.firstG = null;
    this.lastG = null;
    this.stats = { hints: 0, ayahHints: 0, peeks: 0, relocations: 0, suspected: 0, segments: 0 };
    if (scope.kind === 'focused') this._lock(this.range[0], 'start');
    else { this.phase = 'searching'; this.cursor = null; }
  }

  // ---- Anzeige ----------------------------------------------------------
  /** Text sichtbar (Anzeige „sichtbar" oder kurz aufgedeckt)? Nur Zählweise. */
  setReading(on) { this.reading = !!on; }
  notePeek() { this.stats.peeks++; this._bump(); }

  // ---- Erkennung --------------------------------------------------------
  /** Endgültiges Segment der Spracherkennung (nicht überlappend, ID eindeutig). */
  accept({ id, text }) {
    if (this.phase === 'complete' || typeof text !== 'string' || !id || this.seen.has(id)) return false;
    this.seen.add(id);
    this.stats.segments++;
    const tokens = normalize(text).split(' ').filter(Boolean);
    if (!tokens.length) return false;
    if (this.phase === 'searching') return this._search(tokens);
    return this._track(id, text, tokens);
  }

  /** Sofort-Vorschau aus dem Zwischenergebnis: so viele Wörter ab cursor (zählt nie). */
  preview(text) {
    if (this.phase !== 'tracking' || !this.engine || !text) return 0;
    return this.engine.preview(text);
  }

  _search(tokens) {
    this.heard.push(...tokens);
    if (this.heard.length > SEARCH_BUFFER) this.heard.splice(0, this.heard.length - SEARCH_BUFFER);
    const res = locate(this.index, this.heard, { range: this.range });
    this.candidates = res.status === 'ambiguous' ? res.candidates.map((c) => ({ start: c.start, end: c.end, words: c.words })) : [];
    if (res.status === 'found') this._found(res.best, 'search');
    this._bump();
    return true;
  }

  _found(run, why) {
    const kind = this.reading ? KIND.READ : KIND.MEMORY;
    // Gehörtes, das eindeutig zur gefundenen Stelle passt, gilt als rezitiert.
    for (const g of run.words) if (!this.marks.has(g)) this._mark(g, this.hints.has(g) ? KIND.ASSISTED : kind);
    if (why === 'relocated') this.stats.relocations++;
    this._lock(run.end, why);
  }

  _lock(g, why) {
    this.cursor = Math.min(g, this.range[1]);
    this.phase = this.cursor >= this.range[1] ? 'complete' : 'tracking';
    this.heard = []; this.lost = []; this.candidates = []; this.mismatch = null;
    this.lockedBy = why;
    if (this.phase === 'tracking') this._window(true);
    this._bump();
  }

  _window(force = false) {
    const c = this.cursor;
    if (!force && this.win && c >= this.win[0] && c < this.win[1] - REBUILD_MARGIN) return;
    if (!force && this.win && this.win[1] >= this.range[1] && c < this.win[1]) return; // Fenster reicht bis zum Ende
    const from = Math.max(this.range[0], c - WINDOW_BACK);
    const to = Math.min(this.range[1], c + WINDOW_AHEAD);
    const ix = this.index;
    const words = [];
    for (let g = from; g < to; g++) {
      words.push({ id: ix.id(g), surah: ix.surah[g], ayah: ix.ayah[g], position: ix.pos[g], line: ix.ayahNo[g], text: ix.token[g], alt: ix.alt[g] });
    }
    const engine = new HifzEngine({ id: `rec:${from}`, title: 'Rezitation', edition: 'Qur\'an-Index (Tanzil Uthmani)', riwaya: 'Hafs ʿan ʿĀṣim', source: 'client/public/quran/index-v1.json', words });
    engine.index = c - from;
    engine.status = 'following';
    for (const g of this.hints) if (g >= from && g < to) engine.hints.add(g - from);
    this.engine = engine;
    this.win = [from, to];
  }

  _track(id, text, tokens) {
    const engine = this.engine;
    const from = this.win[0];
    const before = this.cursor;
    const histLen = engine.history.length;
    const s = engine.accept({ session: engine.session, id, final: true, text, reliable: true });
    for (const e of engine.history.slice(histLen)) {
      const g = from + e.index;
      if (e.kind === 'transcript-match') this._mark(g, this.reading ? KIND.READ : KIND.MEMORY);
      else if (e.kind === 'assisted-match') this._mark(g, this.reading ? KIND.READ : KIND.ASSISTED);
      else if (e.kind === 'skipped') this._mark(g, KIND.MISSED);
    }
    this.cursor = from + s.index;
    const wasSuspected = this.mismatch?.suspected;
    this.mismatch = s.mismatch ? { g: from + s.mismatch.index, suspected: s.mismatch.suspected } : null;
    if (this.mismatch?.suspected && !wasSuspected) this.stats.suspected++;

    if (this.cursor >= this.range[1]) { this.phase = 'complete'; this._bump(); return true; }
    if (this.cursor > before) this.lost = [];
    else {
      // Keine Fortschritt: vielleicht rezitiert die Person inzwischen an einer
      // anderen Stelle (freie Rezitation) -- dort suchen, aber nur mit
      // eindeutigem Treffer und nicht direkt hier um die aktuelle Position.
      this.lost.push(...tokens);
      if (this.lost.length > SEARCH_BUFFER) this.lost.splice(0, this.lost.length - SEARCH_BUFFER);
      if (this.lost.length >= LOST_TOKENS) {
        const res = locate(this.index, this.lost, { range: this.range, minScore: 4 });
        const b = res.best;
        if (res.status === 'found' && b.start > this.cursor && b.start <= this.cursor + NEAR_AHEAD) {
          // Kurz voraus wieder Anschluss gefunden (die Erkennung hat ein paar
          // Wörter nicht verstanden oder sie wurden ausgelassen): die Lücke wird
          // ehrlich als „ausgelassen" markiert -- nie als rezitiert.
          for (let g = this.cursor; g < b.start; g++) this._mark(g, KIND.MISSED);
          this._found(b, 'resync');
          return true;
        }
        if (res.status === 'found' && (b.end < this.cursor - 3 || b.end > this.cursor + 12)) {
          this._found(b, 'relocated');
          return true;
        }
        this.candidates = res.status === 'ambiguous' ? res.candidates.map((c) => ({ start: c.start, end: c.end, words: c.words })) : [];
      }
    }
    this._window();
    this._bump();
    return true;
  }

  // ---- Hilfen -----------------------------------------------------------
  /** Nächstes Wort aufdecken (zählt nicht als rezitiert). */
  hintNext() {
    if (this.phase !== 'tracking') return;
    const g = this._nextOpen();
    if (g == null || this.hints.has(g)) return;
    this.hints.add(g);
    this.engine.hints.add(g - this.win[0]);
    this.stats.hints++;
    this._bump();
  }

  /** Aktuelle Ayah aufdecken (zählt nicht als rezitiert). */
  hintAyah() {
    if (this.phase !== 'tracking') return;
    const g0 = this._nextOpen();
    if (g0 == null) return;
    const ix = this.index;
    const [a, b] = ix.ayahRange(ix.surah[g0], ix.ayah[g0], ix.ayah[g0]);
    for (let g = Math.max(a, g0); g < b; g++) {
      this.hints.add(g);
      if (g >= this.win[0] && g < this.win[1]) this.engine.hints.add(g - this.win[0]);
    }
    this.stats.ayahHints++;
    this._bump();
  }

  _nextOpen() {
    return this.cursor != null && this.cursor < this.range[1] ? this.cursor : null;
  }

  dismissMismatch() {
    if (!this.engine || !this.mismatch) return;
    const s = this.engine.dismissMismatch();
    this.mismatch = null;
    this.cursor = this.win[0] + s.index;
    this._bump();
  }

  /** Bei mehrdeutiger Stelle: Person wählt selbst. */
  choose(i) {
    const c = this.candidates[i];
    if (!c) return;
    this._found(c, this.phase === 'searching' ? 'chosen' : 'relocated');
  }

  /** Ab einem Wort weitermachen (z. B. Sprung per Seitenwahl beim gezielten Üben). */
  restartAt(g) {
    if (g < this.range[0] || g >= this.range[1]) return;
    this._lock(g, 'manual');
  }

  /** Neu suchen (freie Rezitation, z. B. nach „Andere Stelle"). */
  searchAgain() {
    if (this.scope.kind !== 'free') return;
    this.phase = 'searching'; this.cursor = null; this.engine = null; this.win = null;
    this.heard = []; this.lost = []; this.candidates = []; this.mismatch = null;
    this._bump();
  }

  // ---- Stand ------------------------------------------------------------
  _mark(g, kind) {
    const prev = this.marks.get(g);
    // Einmal ausgelassen bleibt sichtbar ausgelassen, außer es wird später tatsächlich rezitiert.
    if (prev && prev !== KIND.MISSED) return;
    this.marks.set(g, kind);
    if (this.firstG == null || g < this.firstG) this.firstG = g;
    if (this.lastG == null || g > this.lastG) this.lastG = g;
  }

  _bump() { this.version++; }

  counts() {
    const c = { memory: 0, read: 0, assisted: 0, missed: 0 };
    for (const k of this.marks.values()) c[k]++;
    return c;
  }

  /** Zusammenfassung zum Speichern (nur Zahlen/Stellen, nie Audio). */
  summary() {
    const ix = this.index;
    const missed = [];
    for (const [g, k] of this.marks) if (k === KIND.MISSED && missed.length < MAX_MISSED_LIST) missed.push(ix.id(g));
    const pages = new Set();
    for (const g of this.marks.keys()) pages.add(ix.pageOf(g));
    return {
      scope: this.scope.kind === 'focused'
        ? { kind: 'focused', label: this.scope.label || null, from: ix.verseKey(this.range[0]), to: ix.verseKey(Math.max(this.range[0], this.range[1] - 1)) }
        : { kind: 'free' },
      from: this.firstG == null ? null : ix.verseKey(this.firstG),
      to: this.lastG == null ? null : ix.verseKey(this.lastG),
      pages: [...pages].sort((a, b) => a - b).slice(0, 60),
      counts: this.counts(),
      hints: this.stats.hints,
      ayahHints: this.stats.ayahHints,
      peeks: this.stats.peeks,
      relocations: this.stats.relocations,
      suspected: this.stats.suspected,
      missedWords: missed,
      complete: this.phase === 'complete',
    };
  }
}
