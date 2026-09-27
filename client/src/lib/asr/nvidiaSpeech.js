// On-Device-Qur'an-Spracherkennung (NVIDIA FastConformer, wie bei Tarteel)
// mit derselben Schnittstelle wie BrowserSpeech (hifzSpeech.js): start(session),
// stop(), supported, onSegment/onState/onInterim. Zusätzlich preload() und
// onProgress für den einmaligen Modell-Download.
//
// Datenschutz: Audio wird ausschließlich im Browser des Geräts verarbeitet
// (Web Worker + WebAssembly) und nie gespeichert oder verschickt.
import { SAMPLE_RATE } from './streamingCtc.js';

const MODEL_URL = '/api/asr/model';
const VOCAB_URL = '/api/asr/vocab';
const WASM_URL = '/ort/ort-wasm-simd-threaded.wasm';
const WORKLET_URL = '/asr-capture-worklet.js';

// Einfaches Heruntertakten mit Mittelwertbildung (wirkt als Tiefpass), falls
// der Browser keinen 16-kHz-AudioContext erlaubt (z. B. Firefox).
export function downsample(input, fromRate, toRate = SAMPLE_RATE) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

export class NvidiaSpeech {
  constructor({ onSegment, onState, onInterim, onProgress, onPerf } = {}) {
    this.onSegment = onSegment ?? (() => {});
    this.onState = onState ?? (() => {});
    this.onInterim = onInterim ?? (() => {});
    this.onProgress = onProgress ?? (() => {});
    this.onPerf = onPerf ?? (() => {});
    this.worker = null;
    this.readyPromise = null;
    this.ready = false;
    this.session = null;
    this.generation = 0;
    this.counter = 0;
    this.audio = null; // { ctx, stream, node, source }
  }

  get supported() {
    return typeof WebAssembly === 'object' && typeof Worker === 'function'
      && typeof (globalThis.AudioContext || globalThis.webkitAudioContext) === 'function'
      && !!globalThis.navigator?.mediaDevices?.getUserMedia
      && typeof globalThis.AudioWorkletNode === 'function';
  }

  /** Modell laden (einmalig herunterladen, danach aus dem Gerätespeicher). */
  preload() {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./asrWorker.js', import.meta.url), { type: 'module' });
      this.worker = worker;
      worker.onmessage = (e) => {
        const m = e.data || {};
        if (m.type === 'progress') this.onProgress(m);
        else if (m.type === 'ready') { this.ready = true; resolve(); }
        else if (m.type === 'commit') this._deliver(m.text);
        else if (m.type === 'interim') { if (this.session != null) this.onInterim(m.text); }
        else if (m.type === 'perf') this.onPerf(m);
        else if (m.type === 'error') {
          if (!this.ready) { this.readyPromise = null; this.worker = null; worker.terminate(); reject(new Error(m.message)); }
          else { this._stopAudio(); this.onState('error', m.message); }
        }
      };
      worker.onerror = (e) => {
        e.preventDefault?.();
        if (!this.ready) { this.readyPromise = null; this.worker = null; worker.terminate(); reject(new Error(e.message || 'Die Spracherkennung konnte nicht gestartet werden.')); }
      };
      worker.postMessage({ type: 'init', modelUrl: MODEL_URL, vocabUrl: VOCAB_URL, wasmUrl: WASM_URL });
    });
    return this.readyPromise;
  }

  _deliver(text) {
    if (this.session == null || !text) return;
    this.onSegment({ session: this.session, id: `nv${this.generation}:${++this.counter}`, final: true, text, reliable: true });
  }

  async start(session) {
    this._stopAudio();
    if (!this.supported) { this.onState('unsupported'); return; }
    const gen = ++this.generation;
    this.session = session;
    try {
      if (!this.ready) {
        this.onState('loading');
        await this.preload();
        if (gen !== this.generation) return;
      }
      this.onState('requesting');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (gen !== this.generation) { stream.getTracks().forEach((t) => t.stop()); return; }
      const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
      let ctx;
      try { ctx = new Ctx({ sampleRate: SAMPLE_RATE }); } catch { ctx = new Ctx(); }
      let source;
      try { source = ctx.createMediaStreamSource(stream); } catch {
        // Manche Browser erlauben keine abweichende Abtastrate -> Standardrate + selbst heruntertakten.
        await ctx.close().catch(() => {});
        ctx = new Ctx();
        source = ctx.createMediaStreamSource(stream);
      }
      await ctx.audioWorklet.addModule(WORKLET_URL);
      const node = new AudioWorkletNode(ctx, 'dbz-capture');
      const rate = ctx.sampleRate;
      node.port.onmessage = (e) => {
        if (gen !== this.generation || !this.worker) return;
        const chunk = downsample(e.data, rate);
        this.worker.postMessage({ type: 'audio', data: chunk }, [chunk.buffer]);
      };
      source.connect(node);
      // Nicht hörbar ausgeben, aber den Graphen "ziehen" (manche Browser verlangen ein Ziel).
      const mute = ctx.createGain();
      mute.gain.value = 0;
      node.connect(mute).connect(ctx.destination);
      if (ctx.state === 'suspended') await ctx.resume();
      this.audio = { ctx, stream, node, source };
      this.worker.postMessage({ type: 'reset' });
      this.onState('listening');
    } catch (err) {
      if (gen !== this.generation) return;
      this._stopAudio();
      const name = err?.name === 'NotAllowedError' ? 'not-allowed' : err?.name === 'NotFoundError' ? 'audio-capture' : 'model';
      this.onState('error', name === 'model' ? (err?.message || 'model') : name);
    }
  }

  _stopAudio() {
    const a = this.audio;
    this.audio = null;
    if (!a) return;
    try { a.node.port.onmessage = null; a.source.disconnect(); a.node.disconnect(); } catch { /* egal */ }
    a.stream.getTracks().forEach((t) => t.stop());
    a.ctx.close().catch(() => {});
  }

  /** Mikrofon aus; bereits gesprochene, noch offene Wörter werden noch ausgewertet. */
  stop() {
    const wasRunning = !!this.audio;
    this._stopAudio();
    this.onInterim('');
    if (wasRunning && this.worker) this.worker.postMessage({ type: 'flush' });
    const gen = ++this.generation;
    // Späte Ergebnisse des Abschlusses noch zulassen, danach Sitzung lösen.
    setTimeout(() => { if (gen === this.generation) this.session = null; }, 8000);
  }

  dispose() {
    this._stopAudio();
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    this.ready = false;
  }
}
