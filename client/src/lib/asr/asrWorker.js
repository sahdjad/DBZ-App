// Hintergrund-Thread für die On-Device-Qur'an-Spracherkennung (NVIDIA
// FastConformer, Qur'an-Feinabstimmung von Tilawa). Lädt das Modell einmalig
// (danach aus dem Gerätespeicher), nimmt 16-kHz-Audio entgegen und meldet
// festgeschriebene Wörter zurück. Audio verlässt das Gerät nie.
import * as ort from 'onnxruntime-web/wasm';
import { StreamingTranscriber, parseVocab } from './streamingCtc.js';

const CACHE_NAME = 'dbz-asr-v1';
let transcriber = null;
let session = null;

async function fetchCached(url, onProgress) {
  let cache = null;
  try { cache = await caches.open(CACHE_NAME); } catch { /* z. B. privater Modus */ }
  const hit = cache && await cache.match(url);
  if (hit) return hit.arrayBuffer();
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok || !res.body) throw new Error(`Download fehlgeschlagen (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const parts = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }
  const buf = new Uint8Array(loaded);
  let off = 0;
  for (const p of parts) { buf.set(p, off); off += p.length; }
  if (cache) {
    try { await cache.put(url, new Response(buf, { headers: { 'content-type': 'application/octet-stream' } })); } catch { /* Speicher voll -> nächstes Mal neu laden */ }
  }
  return buf.buffer;
}

async function init({ modelUrl, vocabUrl, wasmUrl }) {
  ort.env.wasm.numThreads = 1; // ohne COOP/COEP-Header gibt es keine Threads im Browser
  ort.env.wasm.wasmPaths = { wasm: wasmUrl };
  const vocabJson = await fetch(vocabUrl, { credentials: 'same-origin' }).then((r) => {
    if (!r.ok) throw new Error(`Wortschatz konnte nicht geladen werden (${r.status})`);
    return r.json();
  });
  const model = await fetchCached(modelUrl, (loaded, total) => postMessage({ type: 'progress', loaded, total }));
  postMessage({ type: 'progress', loaded: 1, total: 1, phase: 'init' });
  session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  const vocab = parseVocab(vocabJson);
  const run = async (audio) => {
    const feeds = {
      audio_signal: new ort.Tensor('float32', audio, [1, audio.length]),
      length: new ort.Tensor('int64', BigInt64Array.from([BigInt(audio.length)]), [1]),
    };
    const out = await session.run(feeds);
    const t = out[session.outputNames[0]];
    return { logprobs: t.data, timeSteps: t.dims[1], vocabSize: t.dims[2] };
  };
  transcriber = new StreamingTranscriber({
    run,
    vocab,
    onCommit: (text) => postMessage({ type: 'commit', text }),
    onInterim: (text) => postMessage({ type: 'interim', text }),
    onPerf: (p) => postMessage({ type: 'perf', ...p }),
  });
  // Aufwärmen: der erste Durchlauf ist deutlich langsamer (JIT/Speicher).
  await run(new Float32Array(16000));
  postMessage({ type: 'ready' });
}

onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === 'init') await init(msg);
    else if (msg.type === 'audio' && transcriber) await transcriber.push(msg.data);
    else if (msg.type === 'flush' && transcriber) { await transcriber.flush(); postMessage({ type: 'flushed' }); }
    else if (msg.type === 'reset' && transcriber) transcriber.reset();
  } catch (err) {
    postMessage({ type: 'error', message: err?.message || String(err) });
  }
};
