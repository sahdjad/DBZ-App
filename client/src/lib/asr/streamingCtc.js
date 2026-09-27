// Streaming-Kern für das NVIDIA-FastConformer-CTC-Modell (Qur'an-Feinabstimmung
// aus dem MIT-Projekt Tilawa, github.com/yazinsai/tilawa, Modell unter
// NVIDIA CC-BY-4.0). Bewusst ohne Browser-Abhängigkeiten, damit er in Node
// getestet werden kann: das eigentliche Modell wird als `run(audio)`
// hereingereicht (onnxruntime-web im Worker, in Tests ein Stub).
//
// Idee (übliches "gepuffertes CTC-Streaming"): statt das ganze Audio bei
// jedem Schritt neu zu dekodieren, wird nur ein kurzes Fenster ab dem zuletzt
// festgeschriebenen Wort (plus etwas linkem Kontext) dekodiert. Jedes Wort
// trägt über die CTC-Frames einen Zeitstempel. Wörter, die weit genug vor dem
// aktuellen Audio-Ende liegen (rechter Sicherheitsabstand), gelten als stabil
// und werden genau einmal festgeschrieben -> nicht überlappende, endgültige
// Segmente, wie sie HifzEngine.accept erwartet. Bei einer Sprechpause wird
// alles Ausstehende festgeschrieben.

export const SAMPLE_RATE = 16000;
const WORD_PREFIX = '▁';

export const DEFAULT_CONFIG = Object.freeze({
  stepSec: 0.7, // neues Audio bis zur nächsten Zwischen-Dekodierung
  rightGuardSec: 0.3, // so nah am Audio-Ende gilt ein Wort noch als unsicher
  settledSec: 2.0, // so viel gehörtes Audio dahinter: Wort gilt auch ohne 2. Durchlauf als sicher
  maxUtteranceSec: 6, // längere Äußerung wird zwischen zwei Wörtern geteilt
  hardMaxSec: 9, // sehr langsames Gerät: dann alles bis auf die letzte Sekunde festschreiben
  prerollSec: 0.25, // Audio vor einer neuen Äußerung (Wortanfang nicht abschneiden)
  silenceSec: 0.45, // Pause, nach der die Äußerung endgültig abgeschlossen wird
  minRms: 0.006, // absolute Untergrenze für "Sprache"
});

export function parseVocab(vocabJson) {
  const tokens = [];
  let maxId = 0;
  for (const [id, tok] of Object.entries(vocabJson)) { tokens[Number(id)] = tok; maxId = Math.max(maxId, Number(id)); }
  const blankId = tokens.indexOf('<blank>') >= 0 ? tokens.indexOf('<blank>') : maxId;
  return { tokens, blankId };
}

/** Greedy-CTC: [{id, frame}] je ausgegebenem Token (erste Frame des Tokens). */
export function greedyCtc(logprobs, timeSteps, vocabSize, blankId) {
  const out = [];
  let prev = -1;
  for (let t = 0; t < timeSteps; t++) {
    const off = t * vocabSize;
    let best = 0;
    let bestVal = logprobs[off];
    for (let v = 1; v < vocabSize; v++) {
      const val = logprobs[off + v];
      if (val > bestVal) { bestVal = val; best = v; }
    }
    if (best !== prev && best !== blankId) out.push({ id: best, frame: t });
    else if (best === prev && best !== blankId && out.length) out[out.length - 1].last = t;
    prev = best;
  }
  return out;
}

/** Token-Folge -> Wörter mit Frame-Spanne. */
export function tokensToWords(ctcTokens, vocab) {
  const words = [];
  let cur = null;
  for (const tk of ctcTokens) {
    const piece = vocab.tokens[tk.id];
    if (!piece || piece === '<unk>' || piece === '<blank>') continue;
    const last = tk.last ?? tk.frame;
    if (piece.startsWith(WORD_PREFIX) || !cur) {
      if (cur && cur.text) words.push(cur);
      cur = { text: piece.replace(WORD_PREFIX, ''), start: tk.frame, end: last };
    } else {
      cur.text += piece;
      cur.end = last;
    }
  }
  if (cur && cur.text) words.push(cur);
  return words;
}

// Vergleichsform ohne Vokalzeichen: dasselbe Wort kommt mal mit, mal ohne
// Taschkil aus dem Modell (z. B. "شر" / "شَرِّ").
const bare = (t) => t.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '');

function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[n];
}
// "Gleiches Wort" zwischen zwei Durchläufen: exakt, oder bei längeren
// Wörtern höchstens ein Buchstabe Unterschied (das Modell schwankt z. B.
// zwischen mit/ohne Hamza) -- sonst blockiert ein einziges schwankendes Wort
// alle folgenden.
const sameWord = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && editDistance(a, b) <= 1);

function rms(buf, from, to) {
  let s = 0;
  const n = Math.max(1, to - from);
  for (let i = from; i < to; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / n);
}

export class StreamingTranscriber {
  /**
   * @param {{run:(audio:Float32Array)=>Promise<{logprobs:Float32Array,timeSteps:number,vocabSize:number}>,
   *          vocab:{tokens:string[],blankId:number}, onCommit?:(text:string)=>void,
   *          onInterim?:(text:string)=>void, onPerf?:(p:{rtf:number,windowSec:number})=>void, config?:object}} opts
   *
   * Verfahren (wie "whisper-streaming"/LocalAgreement-2): die laufende
   * Äußerung -- bis zur nächsten Atempause -- wird bei jedem Schritt komplett
   * dekodiert. Ein Wort wird erst festgeschrieben, wenn zwei aufeinander-
   * folgende Durchläufe denselben Anfang liefern; bei der Pause wird der Rest
   * endgültig. Frühere Wörter bleiben so über die ganze Äußerung akustisch im
   * Kontext (keine Wortfetzen an Fenstergrenzen). Zu lange Äußerungen werden
   * hinter einem bereits festen Wort geteilt, damit die Rechenzeit auch auf
   * dem Handy begrenzt bleibt.
   */
  constructor({ run, vocab, onCommit, onInterim, onPerf, config } = {}) {
    this.run = run;
    this.vocab = vocab;
    this.onCommit = onCommit ?? (() => {});
    this.onInterim = onInterim ?? (() => {});
    this.onPerf = onPerf ?? (() => {});
    this.cfg = { ...DEFAULT_CONFIG, ...(config || {}) };
    this.reset();
  }

  reset() {
    this.buf = new Float32Array(SAMPLE_RATE * 8);
    this.len = 0; // gültige Samples in buf
    this.bufStart = 0; // absolute Sample-Position von buf[0]
    this.total = 0; // absolute Samples insgesamt empfangen
    this.uttStart = null; // absolute Startposition der laufenden Äußerung (null = keine)
    this.committedEnd = 0; // absolute Position (letzte CTC-Spitze) des letzten festen Wortes
    this.lastCommitted = null; // {key, endAbs}
    this.committedKeys = []; // feste Wörter der aktuellen Fenster-Hypothese (Vergleichsform)
    this.prevKeys = []; // komplette Hypothese des vorigen Durchlaufs (Vergleichsform)
    this.dropLead = null; // nach einer Teilung: zuletzt festes Wort
    this.lastDecodeAt = 0;
    this.busy = null;
    this.noiseFloor = null;
    this.silentSamples = 0;
    this.lastSpeechAbs = 0;
    this.pendingText = '';
    this.generation = (this.generation ?? 0) + 1;
  }

  _append(chunk) {
    if (this.len + chunk.length > this.buf.length) {
      const next = new Float32Array(Math.max(this.buf.length * 2, this.len + chunk.length));
      next.set(this.buf.subarray(0, this.len));
      this.buf = next;
    }
    this.buf.set(chunk, this.len);
    this.len += chunk.length;
    this.total += chunk.length;
  }

  _trimTo(absPos) {
    const drop = Math.min(this.len, Math.max(0, absPos - this.bufStart));
    if (drop <= 0) return;
    this.buf.copyWithin(0, drop, this.len);
    this.len -= drop;
    this.bufStart += drop;
  }

  // Einfache, adaptive Sprach-/Pausenerkennung über 20-ms-Blöcke.
  _updateVad(chunk) {
    const block = 320;
    const base = this.total - chunk.length;
    for (let i = 0; i < chunk.length; i += block) {
      const to = Math.min(chunk.length, i + block);
      const r = rms(chunk, i, to);
      this.noiseFloor = this.noiseFloor == null ? r : (r < this.noiseFloor ? r : this.noiseFloor * 0.999 + r * 0.001);
      const speech = r > Math.max(this.cfg.minRms, this.noiseFloor * 3);
      if (speech) {
        this.silentSamples = 0;
        this.lastSpeechAbs = base + to;
        if (this.uttStart == null) {
          this.uttStart = Math.max(this.bufStart, base + i - this.cfg.prerollSec * SAMPLE_RATE);
          this.committedKeys = []; this.prevKeys = []; this.dropLead = null;
          this.lastDecodeAt = base + i;
        }
      } else this.silentSamples += to - i;
    }
  }

  /** Neues 16-kHz-Mono-Audio einspeisen. Gibt ein Promise zurück, falls dekodiert wird. */
  push(chunk) {
    this._append(chunk);
    this._updateVad(chunk);
    return this._maybeDecode();
  }

  _maybeDecode(force = false) {
    if (this.busy) return this.busy;
    if (this.uttStart == null) {
      // Keine laufende Äußerung: nur etwas Vorlauf fürs nächste Wort behalten.
      this._trimTo(this.total - this.cfg.prerollSec * SAMPLE_RATE);
      return null;
    }
    const silent = this.silentSamples >= this.cfg.silenceSec * SAMPLE_RATE;
    if (!force && !silent && this.total - this.lastDecodeAt < this.cfg.stepSec * SAMPLE_RATE) return null;
    const gen = this.generation;
    this.busy = this._decode(force || silent).finally(() => { if (gen === this.generation) this.busy = null; });
    return this.busy;
  }

  async _decode(finalize) {
    const gen = this.generation;
    const SR = SAMPLE_RATE;
    const winStart = this.uttStart;
    this._trimTo(winStart);
    const endAbs = this.total;
    const audio = this.buf.slice(winStart - this.bufStart, this.len); // Kopie: der Puffer wächst weiter
    this.lastDecodeAt = endAbs;
    let words = [];
    if (audio.length >= SR * 0.2) {
      const t0 = Date.now();
      const out = await this.run(audio);
      if (gen !== this.generation) return; // zwischenzeitlich zurückgesetzt/gestoppt
      const windowSec = audio.length / SR;
      this.onPerf({ rtf: (Date.now() - t0) / 1000 / windowSec, windowSec });
      const spf = audio.length / out.timeSteps; // Samples je Frame
      words = tokensToWords(greedyCtc(out.logprobs, out.timeSteps, out.vocabSize, this.vocab.blankId), this.vocab)
        .map((w) => ({ text: w.text, key: bare(w.text), startAbs: winStart + w.start * spf, endAbs: winStart + (w.end + 1) * spf }));
      // Direkt nach einer Teilung: ein Rest des zuletzt festen Wortes am
      // Fensteranfang ist kein neues Wort.
      const lead = this.dropLead;
      if (lead && words.length && words[0].startAbs < winStart + 0.35 * SR
          && (words[0].key === lead.key || lead.key.endsWith(words[0].key))) words = words.slice(1);
    }

    // Wo beginnen in DIESER Hypothese die noch nicht festgeschriebenen Wörter?
    // Normalfall: nach genau so vielen Wörtern, wie schon fest sind. Hat sich
    // der Anfang verschoben (ein Wort zerfiel/verschmolz), wird das zuletzt
    // feste Wort in der Nähe gesucht; notfalls entscheidet die Zeit.
    const ck = this.committedKeys;
    let from = ck.length;
    if (ck.length && (words.length < ck.length || !sameWord(words[ck.length - 1].key, ck[ck.length - 1]))) {
      const lastKey = ck[ck.length - 1];
      let found = -1;
      for (let d = 0; d <= 2 && found < 0; d++) {
        for (const i of [ck.length - 1 - d, ck.length - 1 + d]) if (i >= 0 && i < words.length && sameWord(words[i].key, lastKey)) { found = i; break; }
      }
      from = found >= 0 ? found + 1 : words.findIndex((w) => w.startAbs > this.committedEnd);
      if (from < 0) from = words.length;
    }
    const prevTail = this.prevKeys.slice(from);

    let n = from;
    if (finalize) {
      // Nur was vor dem Ende der Sprache beginnt -- im reinen Stille-Rest
      // "erfindet" das Modell sonst gelegentlich Text.
      while (n < words.length && words[n].startAbs < this.lastSpeechAbs + 0.1 * SR) n++;
    } else {
      // LocalAgreement: in zwei aufeinanderfolgenden Durchläufen gleich UND
      // nicht direkt am Audio-Ende.
      const guardEnd = endAbs - this.cfg.rightGuardSec * SR;
      const settledEnd = endAbs - this.cfg.settledSec * SR;
      while (n < words.length && words[n].endAbs <= guardEnd
             && ((n - from < prevTail.length && sameWord(words[n].key, prevTail[n - from])) || words[n].endAbs <= settledEnd)) n++;
      // Sehr langes Fenster (langsames Gerät, keine Pause): alles bis auf die
      // letzte Sekunde festschreiben, damit es weitergeht.
      if ((endAbs - winStart) / SR >= this.cfg.hardMaxSec) {
        while (n < words.length && words[n].endAbs <= endAbs - SR) n++;
      }
    }
    if (n > from) {
      const fresh = words.slice(from, n);
      this.onCommit(fresh.map((w) => w.text).join(' '));
      this.committedKeys = words.slice(0, n).map((w) => w.key);
      const last = words[n - 1];
      this.committedEnd = last.endAbs;
      this.lastCommitted = { key: last.key, endAbs: last.endAbs };
    }
    this.prevKeys = words.map((w) => w.key);
    const rest = words.slice(n);

    if (finalize) {
      this.pendingText = '';
      if (this.silentSamples >= this.cfg.silenceSec * SR) this.uttStart = null; // Äußerung abgeschlossen
      else this._splitAt(endAbs, null); // Stopp mitten in der Sprache
    } else {
      this.pendingText = rest.map((w) => w.text).join(' ');
      // Zu lange Äußerung: zwischen dem letzten festen und dem ersten offenen
      // Wort teilen (Mitte der Lücke), damit die Rechenzeit begrenzt bleibt.
      if ((endAbs - winStart) / SR >= this.cfg.maxUtteranceSec && n > 0) {
        const last = words[n - 1];
        const next = words[n];
        const cut = next ? Math.round((last.endAbs + next.startAbs) / 2) : Math.round(last.endAbs + 0.1 * SR);
        this._splitAt(Math.min(cut, endAbs), { key: last.key });
        this.prevKeys = [];
      }
    }
    this.onInterim(this.pendingText);
  }

  _splitAt(absPos, dropLead) {
    this.uttStart = Math.max(this.bufStart, absPos);
    this.committedKeys = [];
    this.dropLead = dropLead;
  }

  /** Alles noch Ausstehende endgültig festschreiben (z. B. beim Stoppen). */
  async flush() {
    if (this.busy) await this.busy;
    if (this.uttStart != null) await this._maybeDecode(true);
  }
}
