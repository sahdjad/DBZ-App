// Nachgebauter Supabase-Dienst für Tests (REST-Tabelle `app_state` + Storage).
// Die echte Produktion ist aus Tests nicht erreichbar; hiermit lässt sich der
// Supabase-Betrieb trotzdem durchspielen -- inklusive Ausfall (`fake.down`).

import http from 'node:http';

// Wie Postgres-jsonb: Schlüssel werden beim Speichern umsortiert (erst nach
// Länge, dann alphabetisch). Die App darf sich auf keine Reihenfolge verlassen.
function jsonb(v) {
  if (Array.isArray(v)) return v.map(jsonb);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))) out[k] = jsonb(v[k]);
    return out;
  }
  return v;
}

export async function startFakeSupabase() {
  // rows: Zeilen der Tabelle app_state (Kennung -> Inhalt). `row` ist die alte
  // Ein-Dokument-Zeile "dbz"; state() setzt den aufgeteilten Bestand zusammen.
  const fake = {
    rows: {}, buckets: {}, calls: [], writes: [], bytesWritten: 0, failUploads: false, failWrites: false, down: false,
    get row() { return this.rows.dbz ?? null; },
    set row(v) { if (v === null) delete this.rows.dbz; else this.rows.dbz = jsonb(v); },
    state() {
      const out = { ...(this.rows['dbz:_meta']?.meta || {}) };
      const lists = {};
      for (const [id, data] of Object.entries(this.rows)) {
        const m = /^dbz:([^_:][^:]*):(\d+)$/.exec(id);
        if (m) (lists[m[1]] ||= []).push(...(data.items || []));
      }
      for (const [name, pairs] of Object.entries(lists)) out[name] = pairs.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
      return out;
    },
  };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, 'http://x');
      const p = decodeURIComponent(url.pathname);
      fake.calls.push(`${req.method} ${p}`);
      const json = (code, data) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
      if (fake.down) return json(503, { message: 'project paused' });
      if (req.headers.authorization !== 'Bearer service-key') return json(401, { message: 'unauthorized' });
      if (p === '/rest/v1/app_state') {
        if (req.method === 'GET') {
          const f = url.searchParams.get('id') || '';
          let ids = Object.keys(fake.rows).sort();
          if (f.startsWith('eq.')) ids = ids.filter((id) => id === f.slice(3));
          else if (f.startsWith('like.')) { const pre = f.slice(5).replace(/\*$/, ''); ids = ids.filter((id) => id.startsWith(pre)); }
          const offset = Number(url.searchParams.get('offset')) || 0;
          const limit = Number(url.searchParams.get('limit')) || 1000;
          const withId = (url.searchParams.get('select') || '').includes('id');
          return json(200, ids.slice(offset, offset + limit).map((id) => (withId ? { id, data: fake.rows[id] } : { data: fake.rows[id] })));
        }
        if (fake.failWrites) return json(500, { message: 'write failed' });
        const parsed = JSON.parse(body.toString());
        fake.bytesWritten += body.length;
        fake.writes.push((Array.isArray(parsed) ? parsed : [parsed]).map((r) => r.id));
        for (const r of Array.isArray(parsed) ? parsed : [parsed]) fake.rows[r.id] = jsonb(r.data);
        return json(201, {});
      }
      if (p === '/storage/v1/bucket' && req.method === 'POST') {
        const b = JSON.parse(body.toString());
        if (fake.buckets[b.id]) return json(409, { message: 'The resource already exists' });
        fake.buckets[b.id] = { public: b.public, objects: {} };
        return json(200, { name: b.id });
      }
      let m = /^\/storage\/v1\/object\/list\/([^/]+)$/.exec(p);
      if (m && req.method === 'POST') {
        const b = fake.buckets[m[1]];
        if (!b) return json(404, {});
        return json(200, Object.keys(b.objects).sort().map((name) => ({ name, updated_at: '2026-01-01T00:00:00Z', metadata: { size: b.objects[name].length } })));
      }
      m = /^\/storage\/v1\/object\/([^/]+)$/.exec(p);
      if (m && req.method === 'DELETE') {
        for (const n of JSON.parse(body.toString()).prefixes) delete fake.buckets[m[1]]?.objects[n];
        return json(200, []);
      }
      m = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(p);
      if (m) {
        const b = fake.buckets[m[1]];
        if (!b) return json(404, {});
        if (req.method === 'POST') {
          if (fake.failUploads && m[1] === 'uploads') return json(500, { message: 'storage down' });
          b.objects[m[2]] = body;
          return json(200, { Key: m[2] });
        }
        if (req.method === 'DELETE') { delete b.objects[m[2]]; return json(200, {}); }
        if (req.method === 'GET') {
          if (!b.objects[m[2]]) return json(404, {});
          res.writeHead(200, { 'content-type': 'application/gzip' });
          return res.end(b.objects[m[2]]);
        }
      }
      json(404, { message: 'not found' });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  fake.url = `http://127.0.0.1:${server.address().port}`;
  fake.close = () => server.close();
  return fake;
}
