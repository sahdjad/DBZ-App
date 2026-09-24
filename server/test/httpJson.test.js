// fetchJson (server/providers/httpJson.js): Serialisierung + Wiederholungen
// bei 429/5xx/Netzwerkfehlern. Simuliert quran.com per gemocktem global.fetch,
// kein echter Netzwerkzugriff (in dieser Umgebung sowieso blockiert).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson } from '../providers/httpJson.js';

function withMockFetch(handler, run) {
  const orig = global.fetch;
  global.fetch = handler;
  return run().finally(() => { global.fetch = orig; });
}

test('succeeds on the first try when the response is ok', async () => {
  await withMockFetch(
    async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ a: 1 }) }),
    async () => {
      const data = await fetchJson('https://example.test/x');
      assert.deepEqual(data, { a: 1 });
    },
  );
});

test('retries after a 429 and eventually succeeds', async () => {
  let calls = 0;
  await withMockFetch(
    async () => {
      calls += 1;
      if (calls < 3) return { ok: false, status: 429, headers: new Headers(), json: async () => ({}) };
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ ok: 'ja' }) };
    },
    async () => {
      const data = await fetchJson('https://example.test/x');
      assert.deepEqual(data, { ok: 'ja' });
      assert.equal(calls, 3);
    },
  );
});

test('retries after a network error and eventually succeeds', async () => {
  let calls = 0;
  await withMockFetch(
    async () => {
      calls += 1;
      if (calls < 2) throw new Error('network down');
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ ok: 'ja' }) };
    },
    async () => {
      const data = await fetchJson('https://example.test/x');
      assert.deepEqual(data, { ok: 'ja' });
      assert.equal(calls, 2);
    },
  );
});

test('gives up after repeated 429s and throws', async () => {
  let calls = 0;
  await withMockFetch(
    async () => { calls += 1; return { ok: false, status: 429, headers: new Headers(), json: async () => ({}) }; },
    async () => {
      await assert.rejects(() => fetchJson('https://example.test/x'));
      assert.equal(calls, 3); // maximal 3 Versuche, kein endloses Warten
    },
  );
});

test('a normal 4xx (e.g. 404) is not retried', async () => {
  let calls = 0;
  await withMockFetch(
    async () => { calls += 1; return { ok: false, status: 404, headers: new Headers(), json: async () => ({}) }; },
    async () => {
      await assert.rejects(() => fetchJson('https://example.test/x'));
      assert.equal(calls, 1);
    },
  );
});

test('concurrent calls are serialized, not fired all at once', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  await withMockFetch(
    async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight -= 1;
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) };
    },
    async () => {
      await Promise.all([
        fetchJson('https://example.test/1'),
        fetchJson('https://example.test/2'),
        fetchJson('https://example.test/3'),
      ]);
      assert.equal(maxInFlight, 1); // nie zwei quran.com-Anfragen gleichzeitig
    },
  );
});
