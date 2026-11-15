// Aufteilung des Datenbestands in viele kleine Datensätze ("Blöcke").
//
// Bisher wurde der GESAMTE Bestand bei jeder Änderung als ein Dokument
// gespeichert -- bei 500 Schülern rund 50 MB je Check-in oder Nachricht.
// Hier wird jede Sammlung (Nutzer, Anwesenheit, Abgaben …) in Blöcke zu je
// 500 Einträgen zerlegt; gespeichert werden nur die Blöcke, die sich wirklich
// geändert haben. Ein neuer Eintrag landet im letzten Block, alte Blöcke
// bleiben unberührt.
//
// Ablage: dieselbe Tabelle wie bisher, je Block eine Zeile:
//   <kennung>:_manifest          Kennzeichen "aufgeteilt" + Version
//   <kennung>:_meta              alles, was keine Liste von Einträgen ist
//   <kennung>:<sammlung>:<nr>    { items: [[laufnummer, eintrag], …] }
// Die Laufnummer hält die Reihenfolge der Einträge fest und ändert sich nie.
// Dieses Modul rechnet nur (kein Netz, keine Dateien) und ist so prüfbar.

import crypto from 'node:crypto';

export const CHUNK_VERSION = 1;
const EMPTY = '{"items":[]}';
const hash = (s) => crypto.createHash('sha1').update(s).digest('base64');
const isRecordList = (v) => Array.isArray(v) && v.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x));

export function createChunker({ prefix, chunkSize = 500 }) {
  let seqOf = new WeakMap(); // Eintrag -> Laufnummer
  let next = {}; // Sammlung -> nächste freie Laufnummer
  let saved = new Map(); // Zeilen-Kennung -> Prüfsumme des gespeicherten Inhalts
  const manifestId = `${prefix}_manifest`;
  const metaId = `${prefix}_meta`;

  /** Welche Zeilen müssten gespeichert werden, damit Supabase dem Stand `data` entspricht? */
  function plan(data) {
    const out = new Map();
    const meta = {};
    const counts = {};
    for (const [name, value] of Object.entries(data)) {
      if (!isRecordList(value) || name.startsWith('_') || name.includes(':')) { meta[name] = value; continue; }
      counts[name] = value.length;
      // Laufnummern vergeben; stimmt die Reihenfolge nicht mehr (Einträge
      // ersetzt oder vorn eingefügt), wird die Sammlung neu durchnummeriert.
      let prev = -1;
      let ordered = true;
      for (const rec of value) {
        let s = seqOf.get(rec);
        if (s === undefined) { s = next[name] ?? 0; next[name] = s + 1; seqOf.set(rec, s); }
        if (s <= prev) { ordered = false; break; }
        prev = s;
      }
      if (!ordered) { value.forEach((rec, i) => seqOf.set(rec, i)); next[name] = value.length; }
      const chunks = new Map();
      for (const rec of value) {
        const s = seqOf.get(rec);
        const n = Math.floor(s / chunkSize);
        if (!chunks.has(n)) chunks.set(n, []);
        chunks.get(n).push([s, rec]);
      }
      if (!chunks.size) out.set(`${prefix}${name}:0`, EMPTY);
      for (const [n, items] of chunks) out.set(`${prefix}${name}:${n}`, JSON.stringify({ items }));
    }
    out.set(metaId, JSON.stringify({ meta }));
    // Früher gespeicherte Blöcke, die es nicht mehr gibt, leeren.
    for (const id of saved.keys()) if (!out.has(id) && id !== manifestId) out.set(id, EMPTY);
    const changed = [];
    const hashes = new Map();
    for (const [id, json] of out) {
      const h = hash(json);
      hashes.set(id, h);
      if (saved.get(id) !== h) changed.push({ id, json });
    }
    return { changed, hashes, counts };
  }

  /** Nach erfolgreichem Speichern: diese Zeilen gelten als gespeichert. */
  function commit(p) {
    for (const { id } of p.changed) saved.set(id, p.hashes.get(id));
  }

  /**
   * Setzt den Bestand aus gespeicherten Zeilen zusammen. Liefert null, wenn
   * (noch) kein aufgeteilter Bestand vorliegt. `requireManifest: false` dient
   * der Kontrolle direkt nach der Umstellung.
   */
  function assemble(rows, { requireManifest = true } = {}) {
    const byId = new Map(rows.map((r) => [r.id, r.data]));
    const manifest = byId.get(manifestId);
    if (requireManifest && !(manifest && manifest.version === CHUNK_VERSION)) return null;
    seqOf = new WeakMap();
    next = {};
    saved = new Map();
    const data = { ...(byId.get(metaId)?.meta || {}) };
    const lists = {};
    for (const [id, value] of byId) {
      if (!id.startsWith(prefix) || id === manifestId) continue;
      saved.set(id, hash(JSON.stringify(value)));
      if (id === metaId) continue;
      const rest = id.slice(prefix.length);
      const cut = rest.lastIndexOf(':');
      if (cut < 0) continue;
      const name = rest.slice(0, cut);
      if (!lists[name]) lists[name] = [];
      for (const pair of value?.items || []) lists[name].push(pair);
    }
    for (const [name, pairs] of Object.entries(lists)) {
      pairs.sort((a, b) => a[0] - b[0]);
      data[name] = pairs.map(([s, rec]) => { seqOf.set(rec, s); return rec; });
      next[name] = pairs.length ? pairs[pairs.length - 1][0] + 1 : 0;
    }
    return data;
  }

  return { plan, commit, assemble, manifestId, metaId, chunkSize, savedIds: () => [...saved.keys()] };
}
