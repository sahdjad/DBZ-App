// AudioWorklet: sammelt Mikrofon-Samples (Mono) und schickt sie in ~100-ms-
// Blöcken an den Haupt-Thread. Liegt als eigene Datei vor (nicht als Blob),
// damit die Content-Security-Policy ('self') eingehalten wird.
class DbzCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = Math.round(sampleRate / 10);
    this.buf = new Float32Array(this.size);
    this.len = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      let i = 0;
      while (i < ch.length) {
        const n = Math.min(ch.length - i, this.size - this.len);
        this.buf.set(ch.subarray(i, i + n), this.len);
        this.len += n; i += n;
        if (this.len === this.size) {
          this.port.postMessage(this.buf, [this.buf.buffer]);
          this.buf = new Float32Array(this.size);
          this.len = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('dbz-capture', DbzCaptureProcessor);
