// Nachgebauter Supabase-Dienst für Tests (REST-Tabelle `app_state` + Storage).
// Die echte Produktion ist aus Tests nicht erreichbar; hiermit lässt sich der
// Supabase-Betrieb trotzdem durchspielen -- inklusive Ausfall (`fake.down`).

import http from 'node:http';

export async function startFakeSupabase() {
  const fake = { row: null, buckets: {}, calls: [], failUploads: false, down: false };
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
        if (req.method === 'GET') return json(200, fake.row ? [{ data: fake.row }] : []);
        fake.row = JSON.parse(body.toString()).data;
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
