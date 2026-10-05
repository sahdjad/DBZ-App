// Notizen (Striche) auf PDFs -- gemeinsame Geometrie für die Anzeige (SVG) und
// den Export als neues PDF (pdf-lib). Das Original-PDF wird nie verändert.
//
// Ein Strich: { id, page (1-basiert), tool: 'pen'|'marker', color: '#rrggbb',
//   width (Promille der Seitenbreite), pts: [x0,y0,x1,y1,...] }
// x/y sind ganze Zahlen 0..10000 relativ zur Seitenbreite bzw. -höhe, so wie
// die Seite angezeigt wird (inkl. /Rotate). Damit sind Striche unabhängig von
// Zoom, Bildschirm und Gerät.

export const NOTE_SCALE = 10000;
export const MARKER_OPACITY = 0.35;

export function newStrokeId() {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `s${Date.now().toString(36)}${rnd}`;
}

// Glatte Linie: quadratische Kurven durch die Mittelpunkte benachbarter Punkte.
// Liefert Segmente in Zielkoordinaten (Breite w, Höhe h).
export function strokeSegments(pts, w, h) {
  const n = Math.floor(pts.length / 2);
  if (!n) return [];
  const P = (i) => [(pts[2 * i] / NOTE_SCALE) * w, (pts[2 * i + 1] / NOTE_SCALE) * h];
  const [x0, y0] = P(0);
  if (n === 1) return [{ t: 'M', x: x0, y: y0 }, { t: 'L', x: x0 + 0.01, y: y0 }]; // Punkt
  const segs = [{ t: 'M', x: x0, y: y0 }];
  if (n === 2) {
    const [x1, y1] = P(1);
    segs.push({ t: 'L', x: x1, y: y1 });
    return segs;
  }
  for (let i = 1; i < n - 1; i++) {
    const [cx, cy] = P(i);
    const [nx, ny] = P(i + 1);
    segs.push({ t: 'Q', cx, cy, x: (cx + nx) / 2, y: (cy + ny) / 2 });
  }
  const [lx, ly] = P(n - 1);
  segs.push({ t: 'L', x: lx, y: ly });
  return segs;
}

const r1 = (v) => Math.round(v * 10) / 10;

export function strokePath(pts, w, h) {
  return strokeSegments(pts, w, h).map((s) => (s.t === 'Q'
    ? `Q${r1(s.cx)} ${r1(s.cy)} ${r1(s.x)} ${r1(s.y)}`
    : `${s.t}${r1(s.x)} ${r1(s.y)}`)).join('');
}

// Kürzester Abstand Punkt -> Strich (in Normkoordinaten), für den Radierer.
export function distanceToStroke(stroke, x, y, aspect = 1) {
  const p = stroke.pts;
  const n = Math.floor(p.length / 2);
  let best = Infinity;
  const dy = (v) => v * aspect; // y in Breiten-Einheiten umrechnen
  for (let i = 0; i < n; i++) {
    const ax = p[2 * i];
    const ay = dy(p[2 * i + 1]);
    if (i === n - 1) {
      best = Math.min(best, Math.hypot(x - ax, dy(y) - ay));
      break;
    }
    const bx = p[2 * i + 2];
    const by = dy(p[2 * i + 3]);
    const vx = bx - ax;
    const vy = by - ay;
    const len = vx * vx + vy * vy;
    let t = len ? ((x - ax) * vx + (dy(y) - ay) * vy) / len : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - (ax + t * vx), dy(y) - (ay + t * vy)));
  }
  return best;
}

// Punktliste ausdünnen (Mindestabstand), damit Striche klein bleiben.
export function thinPoints(pts, minDist = 8) {
  if (pts.length <= 4) return pts.slice();
  const out = [pts[0], pts[1]];
  for (let i = 2; i < pts.length - 2; i += 2) {
    const lx = out[out.length - 2];
    const ly = out[out.length - 1];
    if (Math.hypot(pts[i] - lx, pts[i + 1] - ly) >= minDist) out.push(pts[i], pts[i + 1]);
  }
  out.push(pts[pts.length - 2], pts[pts.length - 1]);
  return out;
}

function hexToRgb(hex) {
  const v = parseInt(String(hex).slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

// Abbildung "angezeigte Seite" (x nach rechts, y nach unten, in PDF-Einheiten)
// -> PDF-Benutzerkoordinaten, abhängig von /Rotate (im Uhrzeigersinn).
export function viewToPdfMatrix(rotation, box) {
  const { x: cx, y: cy, width: W, height: H } = box;
  switch (((rotation % 360) + 360) % 360) {
    case 90: return { m: [0, 1, 1, 0, cx, cy], vw: H, vh: W };
    case 180: return { m: [-1, 0, 0, 1, cx + W, cy], vw: W, vh: H };
    case 270: return { m: [0, -1, -1, 0, cx + W, cy + H], vw: H, vh: W };
    default: return { m: [1, 0, 0, -1, cx, cy + H], vw: W, vh: H };
  }
}

/**
 * Erzeugt eine NEUE PDF-Datei: Original + Striche als echte Vektorlinien.
 * `bytes` ist das unveränderte Original (Uint8Array).
 */
export async function exportAnnotatedPdf(bytes, strokes) {
  const lib = await import('pdf-lib');
  const {
    PDFDocument, pushGraphicsState, popGraphicsState, concatTransformationMatrix, setLineWidth,
    setLineCap, setLineJoin, LineCapStyle, LineJoinStyle, setStrokingRgbColor, moveTo, lineTo,
    appendBezierCurve, stroke, setGraphicsState,
  } = lib;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const pages = doc.getPages();
  const byPage = new Map();
  for (const s of strokes) {
    if (!byPage.has(s.page)) byPage.set(s.page, []);
    byPage.get(s.page).push(s);
  }
  for (const [pageNo, list] of byPage) {
    const page = pages[pageNo - 1];
    if (!page) continue;
    const { m, vw, vh } = viewToPdfMatrix(page.getRotation().angle || 0, page.getCropBox());
    const ops = [pushGraphicsState(), concatTransformationMatrix(...m), setLineCap(LineCapStyle.Round), setLineJoin(LineJoinStyle.Round)];
    for (const s of list) {
      const segs = strokeSegments(s.pts, vw, vh);
      if (!segs.length) continue;
      ops.push(pushGraphicsState());
      if (s.tool === 'marker') {
        const gs = page.maybeEmbedGraphicsState({ borderOpacity: MARKER_OPACITY });
        if (gs) ops.push(setGraphicsState(gs));
      }
      ops.push(setStrokingRgbColor(...hexToRgb(s.color)), setLineWidth((s.width / 1000) * vw));
      let px = 0;
      let py = 0;
      for (const g of segs) {
        if (g.t === 'M') ops.push(moveTo(g.x, g.y));
        else if (g.t === 'L') ops.push(lineTo(g.x, g.y));
        else {
          // quadratische -> kubische Bézierkurve
          const c1x = px + (2 / 3) * (g.cx - px);
          const c1y = py + (2 / 3) * (g.cy - py);
          const c2x = g.x + (2 / 3) * (g.cx - g.x);
          const c2y = g.y + (2 / 3) * (g.cy - g.y);
          ops.push(appendBezierCurve(c1x, c1y, c2x, c2y, g.x, g.y));
        }
        px = g.x;
        py = g.y;
      }
      ops.push(stroke(), popGraphicsState());
    }
    ops.push(popGraphicsState());
    page.pushOperators(...ops);
  }
  return doc.save();
}
