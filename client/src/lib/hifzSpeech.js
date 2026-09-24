// Sprachen, die der Reihe nach probiert werden: manche Browser/Geräte
// akzeptieren nur den einfachen Sprachcode 'ar', nicht die regionale
// Variante 'ar-SA'. Wird bei genau diesem Fehler ('language-not-supported')
// automatisch EINMAL mit dem nächsten Code neu versucht.
const LANG_FALLBACKS = ['ar-SA', 'ar'];

/** Experimental Web Speech adapter. No claim of calibrated error confidence. */
export class BrowserSpeech {
  constructor({ onSegment, onState, onInterim, recognitionClass } = {}) {
    this.Recognition = recognitionClass ?? globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;
    this.onSegment = onSegment ?? (() => {});
    this.onState = onState ?? (() => {});
    // Nur für ehrliches, sofortiges UI-Feedback ("was hört das Mikrofon gerade") –
    // niemals für Fortschritt/Vergleich genutzt. Zwischenergebnisse sind unsicher.
    this.onInterim = onInterim ?? (() => {});
    this.generation = 0;
    this.recognition = null;
  }
  get supported() { return typeof this.Recognition === 'function'; }
  start(session, langIndex = 0) {
    this.stop();
    if (!this.supported) { this.onState('unsupported'); return; }
    const generation = ++this.generation;
    const recognition = new this.Recognition();
    this.recognition = recognition;
    const delivered = new Set();
    const current = () => this.generation === generation && this.recognition === recognition;
    recognition.lang = LANG_FALLBACKS[langIndex] || LANG_FALLBACKS[0];
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { if (current()) this.onState('listening'); };
    recognition.onresult = event => {
      if (!current()) return;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!current()) return; // app may stop after completing a passage
        const result = event.results[i];
        if (!result.isFinal) { interim = result[0]?.transcript || interim; continue; }
        if (delivered.has(i)) continue;
        delivered.add(i);
        // A final transcript is not proof of correct pronunciation.
        this.onSegment({ session, id: `${generation}:${i}`, final: true,
          text: result[0].transcript, reliable: true });
      }
      if (interim) this.onInterim(interim);
    };
    recognition.onerror = event => {
      if (!current()) return;
      this.stop();
      // Ein nicht unterstützter Sprachcode wird EINMAL mit dem nächsten
      // bekannten Code neu versucht, bevor ein Fehler gemeldet wird.
      if (event.error === 'language-not-supported' && langIndex + 1 < LANG_FALLBACKS.length) {
        this.start(session, langIndex + 1);
        return;
      }
      this.onState(event.error === 'no-speech' ? 'paused' : 'error', event.error);
    };
    recognition.onend = () => {
      if (!current()) return;
      this.recognition = null;
      this.generation++;
      this.onInterim('');
      this.onState('paused'); // no permission/restart loop
    };
    this.onState('requesting');
    try { recognition.start(); }
    catch (error) { this.stop(); this.onState('error', error.name); }
  }
  stop() {
    this.generation++;
    const recognition = this.recognition;
    this.recognition = null;
    this.onInterim('');
    if (recognition) {
      recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
      try { recognition.abort(); } catch { /* already stopped */ }
    }
  }
}
