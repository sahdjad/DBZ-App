/** Experimental Web Speech adapter. No claim of calibrated error confidence. */
export class BrowserSpeech {
  constructor({ onSegment, onState, recognitionClass } = {}) {
    this.Recognition = recognitionClass ?? globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;
    this.onSegment = onSegment ?? (() => {});
    this.onState = onState ?? (() => {});
    this.generation = 0;
    this.recognition = null;
  }
  get supported() { return typeof this.Recognition === 'function'; }
  start(session) {
    this.stop();
    if (!this.supported) { this.onState('unsupported'); return; }
    const generation = ++this.generation;
    const recognition = new this.Recognition();
    this.recognition = recognition;
    const delivered = new Set();
    const current = () => this.generation === generation && this.recognition === recognition;
    recognition.lang = 'ar-SA';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { if (current()) this.onState('listening'); };
    recognition.onresult = event => {
      if (!current()) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!current()) return; // app may stop after completing a passage
        const result = event.results[i];
        if (!result.isFinal || delivered.has(i)) continue;
        delivered.add(i);
        // A final transcript is not proof of correct pronunciation.
        this.onSegment({ session, id: `${generation}:${i}`, final: true,
          text: result[0].transcript, reliable: true });
      }
    };
    recognition.onerror = event => {
      if (!current()) return;
      this.stop();
      this.onState(event.error === 'no-speech' ? 'paused' : 'error', event.error);
    };
    recognition.onend = () => {
      if (!current()) return;
      this.recognition = null;
      this.generation++;
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
    if (recognition) {
      recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
      try { recognition.abort(); } catch { /* already stopped */ }
    }
  }
}
