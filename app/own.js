// Backline — the user's own MIDI files (B5). Analysed on the device with the same engine; the file and its analysis
// are kept in this browser's IndexedDB and never uploaded anywhere.
import { parse, analyse, GM } from '../engine/backline.js';

const DB = 'backline', STORE = 'own';
function db() {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function tx(mode, fn) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(STORE, mode), st = t.objectStore(STORE), out = fn(st);
  t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); }
export const listOwn = async () => { try { return (await tx('readonly', st => st.getAll())).sort((a, b) => b.added - a.added).map(({ bytes, ...r }) => r); } catch (e) { return []; } };
export const getOwn = id => tx('readonly', st => st.get(id));
export const deleteOwn = id => tx('readwrite', st => st.delete(id));

async function hashOf(bytes) { const h = await crypto.subtle.digest('SHA-1', bytes); return [...new Uint8Array(h)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(''); }
/** "Queen - Bohemian Rhapsody.mid" → {title:'Bohemian Rhapsody', artist:'Queen'} */
export function namesFrom(file) {
  const base = file.replace(/\.(mid|midi|kar)$/i, '').replace(/[_]+/g, ' ').trim(), m = base.split(/\s+[-–—]\s+/);
  return m.length >= 2 ? { artist: m[0].trim(), title: m.slice(1).join(' - ').trim() } : { artist: '', title: base };
}
/** analyse a File and save it; returns the stored record (without bytes) */
export async function importFile(file) {
  if (file.size > 4 * 1024 * 1024) throw new Error('That file is over 4 MB, which is too big for a song MIDI file.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const analysis = analyse(bytes);                                   // throws a readable MidiError for broken files
  const id = 'own-' + await hashOf(bytes), n = namesFrom(file.name);
  const rec = { id, file: file.name, title: n.title, artist: n.artist, added: Date.now(), bytes, analysis };
  await tx('readwrite', st => st.put(rec)); const { bytes: _, ...meta } = rec; return meta;
}
/** a song object shaped like an index song, so the sheet and player work unchanged */
export function asSong(rec) {
  const A = rec.analysis;
  return { id: rec.id, own: true, title: rec.title, artist: rec.artist || 'My MIDI file', file: rec.file, engine: A.engine,
    consensus: { bpm: A.bpm, bpmSure: false, meter: A.meter, key: A.key, mode: A.mode, keyAgree: 0, keyVotes: 0 }, primary: 1, transpose: 0, versions: [], analysis: A };
}
const TOM = { 41: 'T3', 43: 'T3', 45: 'T2', 47: 'T2', 48: 'T1', 50: 'T1', 58: 'T2' };
/** every note of the file, placed in the song's bars: bars[b] = [{f, d, n, v, tr, prog, lane, open}] (f, d = fraction of the bar) */
export function fileNotes(bytes, A) {
  const smf = parse(bytes), ppq = smf.ppq, { startBar, barQ } = A.grid || { startBar: 0, barQ: 4 }, nBars = A.bars;
  const bars = Array.from({ length: nBars }, () => []), tracks = [];
  smf.tracks.forEach((t, ti) => {
    if (!t.notes.length) return;
    const prog = {}; t.programs.forEach(p => { if (!(p.ch in prog)) prog[p.ch] = p.prog; });
    const drum = t.notes.every(n => n.ch === 9) || /drum|kit|perc/i.test(t.name);
    let count = 0;
    for (const n of t.notes) {
      const q = n.tick / ppq - startBar * barQ, b = Math.floor(q / barQ + 1e-9); if (b < 0 || b >= nBars) continue;
      const isDrum = n.ch === 9 || drum, m = isDrum ? (GM[n.note] || (TOM[n.note] ? [TOM[n.note]] : null)) : null; if (isDrum && !m) continue;
      bars[b].push({ f: (q - b * barQ) / barQ, d: (n.dur / ppq) / barQ, n: n.note, v: n.vel, tr: ti, prog: prog[n.ch] || 0, lane: isDrum ? m[0] : null, open: isDrum && m[1] === 'open' });
      count++;
    }
    if (count) tracks.push({ tr: ti, name: (t.name || '').replace(/\0/g, '').trim() || (drum ? 'Drums' : `Track ${ti + 1}`), drum, notes: count, prog: Object.values(prog)[0] ?? null });
  });
  bars.forEach(l => l.sort((a, b) => a.f - b.f));
  return { bars, tracks };
}
