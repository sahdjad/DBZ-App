// Erzeugt die PWA-Icons der DBZ-App ohne externe Abhängigkeiten.
// Zeichnet ein DBZ-Icon (dunkelgrüner Verlauf + mintfarbenes offenes Buch)
// und kodiert es als PNG über das eingebaute zlib-Modul.
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'public');
fs.mkdirSync(OUT, { recursive: true });

// --- kleine Zeichen-Helfer (RGBA-Puffer) ------------------------------------
function canvas(S) {
  return { S, buf: new Uint8Array(S * S * 4) };
}
function set(c, x, y, [r, g, b, a = 255]) {
  if (x < 0 || y < 0 || x >= c.S || y >= c.S) return;
  const i = (y * c.S + x) * 4;
  const ia = a / 255;
  c.buf[i] = c.buf[i] * (1 - ia) + r * ia;
  c.buf[i + 1] = c.buf[i + 1] * (1 - ia) + g * ia;
  c.buf[i + 2] = c.buf[i + 2] * (1 - ia) + b * ia;
  c.buf[i + 3] = Math.max(c.buf[i + 3], a);
}
// Punkt-in-Polygon (Scanline)
function inPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function fillPoly(c, ptsFrac, color) {
  const pts = ptsFrac.map(([x, y]) => [x * c.S, y * c.S]);
  for (let y = 0; y < c.S; y++) for (let x = 0; x < c.S; x++) if (inPoly(x + 0.5, y + 0.5, pts)) set(c, x, y, color);
}

function draw(S) {
  const c = canvas(S);
  const r = S * 0.22; // Eckenradius
  const lerp = (a, b, t) => a + (b - a) * t;
  const top = [0x16, 0x53, 0x2d]; // tiefes Grün
  const bot = [0x0a, 0x1a, 0x10]; // fast schwarzes Grün
  const inRounded = (x, y) => {
    const cx = Math.min(Math.max(x, r), S - r);
    const cy = Math.min(Math.max(y, r), S - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!inRounded(x + 0.5, y + 0.5)) continue;
      const t = y / S;
      set(c, x, y, [lerp(top[0], bot[0], t), lerp(top[1], bot[1], t), lerp(top[2], bot[2], t), 255]);
    }
  }
  // Offenes Buch (mint), zwei Seiten als Trapeze + Mittelspalt
  const mint = [0x86, 0xd2, 0xac, 255];
  const mintDim = [0x5d, 0xba, 0x8c, 255];
  fillPoly(c, [[0.22, 0.36], [0.49, 0.32], [0.49, 0.70], [0.22, 0.66]], mint);
  fillPoly(c, [[0.51, 0.32], [0.78, 0.36], [0.78, 0.66], [0.51, 0.70]], mint);
  // Mittelspalt (Buchrücken) dunkel
  fillPoly(c, [[0.485, 0.32], [0.515, 0.32], [0.515, 0.70], [0.485, 0.70]], [0x0a, 0x1a, 0x10, 255]);
  // dezente Seitenlinien
  for (const yy of [0.45, 0.52, 0.59]) {
    fillPoly(c, [[0.27, yy], [0.46, yy - 0.02], [0.46, yy], [0.27, yy + 0.02]], mintDim);
    fillPoly(c, [[0.54, yy - 0.02], [0.73, yy], [0.73, yy + 0.02], [0.54, yy]], mintDim);
  }
  return c;
}

// --- PNG-Kodierung -----------------------------------------------------------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const body = Buffer.concat([tb, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(c) {
  const { S, buf } = c;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0; // Filter None
    Buffer.from(buf.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

for (const [name, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180], ['favicon-64.png', 64]]) {
  fs.writeFileSync(path.join(OUT, name), encodePng(draw(size)));
  console.log('written', name, size);
}
