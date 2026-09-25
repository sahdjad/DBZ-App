// Sprachen, die der Reihe nach probiert werden: manche Browser/Geräte
// akzeptieren nur den einfachen Sprachcode 'ar', nicht die regionale
// Variante 'ar-SA'. Wird bei genau diesem Fehler ('language-not-supported')
// automatisch EINMAL mit dem nächsten Code neu versucht.
const LANG_FALLBACKS = ['ar-SA', 'ar'];

// Höchstzahl automatischer Neustarts pro 30-Sekunden-Fenster (siehe onend
// unten) -- Schutz gegen eine Neustart-Schleife, falls ein Gerät die
// Spracherkennung aus einem Grund abbricht, der nicht als "error" ankommt.
const MAX_AUTO_RESTARTS = 6;
const RESTART_WINDOW_MS = 30000;

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
    this.restarts = 0;
    this.restartWindowStart = 0;
  }
  get supported() { return typeof this.Recognition === 'function'; }
  start(session, langIndex = 0) {
    this.stop();
    if (!this.supported) { this.onState('unsupported'); return; }
    this.restarts = 0;
    this.restartWindowStart = Date.now();
    this._attempt(session, langIndex, /* announceRequesting */ true);
  }
  // Interner Start-Versuch -- von start() (echter Beginn, meldet
  // "requesting" fürs Berechtigungs-Popup) UND vom automatischen
  // Neustart in onend() genutzt (kein "requesting", der Nutzer hat die
  // Erlaubnis schon erteilt, kein erneuter Dialog).
  _attempt(session, langIndex, announceRequesting) {
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
        this._attempt(session, langIndex + 1, false);
        return;
      }
      this.onState(event.error === 'no-speech' ? 'paused' : 'error', event.error);
    };
    recognition.onend = () => {
      if (!current()) return;
      this.recognition = null;
      this.generation++;
      // Feldbeobachtung (echte Gerätetests): der Browser beendet eine
      // laufende Erkennungssitzung oft von SELBST nach einer kurzen
      // Sprechpause -- besonders bei Arabisch -- OBWOHL continuous=true
      // gesetzt ist. Das ist eine bekannte Eigenheit der Browser-
      // Spracherkennung, kein echtes Ende der Übung. Ohne automatischen
      // Neustart bricht die Worterkennung dadurch mitten in der Rezitation
      // lautlos ab: das Mikrofon "hört" nicht mehr zu, aber nichts auf dem
      // Bildschirm sagt das deutlich, und der Nutzer rezitiert einfach
      // weiter, ohne dass noch etwas erkannt wird -- genau das gemeldete
      // Symptom ("Wörter werden nicht zuverlässig aufgedeckt"). Deshalb
      // automatisch und unbemerkt neu starten, solange es kein echter
      // Fehler war (ein echter Fehler geht über onerror, nicht hierüber).
      // Begrenzt auf MAX_AUTO_RESTARTS je RESTART_WINDOW_MS, damit ein
      // Gerät mit einem dauerhaften, nicht als "error" erkennbaren Problem
      // nicht endlos neu startet.
      const now = Date.now();
      if (now - this.restartWindowStart > RESTART_WINDOW_MS) { this.restartWindowStart = now; this.restarts = 0; }
      this.restarts++;
      if (this.restarts <= MAX_AUTO_RESTARTS) {
        this._attempt(session, langIndex, false);
        return;
      }
      this.onInterim('');
      this.onState('paused');
    };
    if (announceRequesting) this.onState('requesting');
    try { recognition.start(); }
    catch (error) { this.stop(); this.onState('error', error.name); }
  }
  stop() {
    this.generation++;
    const recognition = this.recognition;
    this.recognition = null;
    this.restarts = 0;
    this.onInterim('');
    if (recognition) {
      recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
      try { recognition.abort(); } catch { /* already stopped */ }
    }
  }
}
