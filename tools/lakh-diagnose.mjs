// Lakh diagnostics (B1): explain failures and outliers from the smoke run.
// Usage: node tools/lakh-diagnose.mjs <scratch dir>
// Prints file paths (artist/title — public names) and numeric facts only: no notes, melodies or lyrics.
import fs from 'node:fs'; import path from 'node:path';
import { parse, analyse } from '../engine/backline.js';
const dir = process.argv[2];
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
  const p = path.join(d, e.name); if (e.isSymbolicLink()) continue; if (e.isDirectory()) walk(p); else if (/\.(mid|midi|kar)$/i.test(e.name)) files.push(p); } })(dir);
const rel = f => path.relative(dir, f);
const facts = smf => {
  const notes = smf.tracks.flatMap(t => t.notes), on = notes.map(n => n.tick).sort((a, b) => a - b);
  let gap = 0; for (let i = 1; i < on.length; i++) gap = Math.max(gap, on[i] - on[i - 1]);
  const ends = notes.map(n => n.tick + n.dur).sort((a, b) => a - b);
  const sigs = smf.tracks.flatMap(t => t.sigs), tempos = smf.tracks.flatMap(t => t.tempos);
  const bpms = tempos.map(t => Math.round(60e6 / t.us));
  return { ppq: smf.ppq, tracks: smf.tracks.length, notes: notes.length,
    lastOnsetQ: on.length ? Math.round(on.at(-1) / smf.ppq) : 0, p99OnsetQ: on.length ? Math.round(on[Math.floor(on.length * 0.99)] / smf.ppq) : 0,
    lastEndQ: ends.length ? Math.round(ends.at(-1) / smf.ppq) : 0, maxGapQ: Math.round(gap / smf.ppq),
    longestNoteQ: notes.length ? Math.round(Math.max(...notes.map(n => n.dur)) / smf.ppq) : 0,
    sigs: sigs.slice(0, 4).map(s => s.num + '/' + s.den), nSigs: sigs.length, tempos: tempos.length, bpmMin: Math.min(...bpms), bpmMax: Math.max(...bpms) };
};
const ex = {}, add = (k, v) => { (ex[k] = ex[k] || []); if (ex[k].length < 12) ex[k].push(v); };
const ratio = [];
for (const f of files) {
  const bytes = fs.readFileSync(f); const t = performance.now(); let a;
  try { a = analyse(bytes); }
  catch (e) {
    const code = e.code || 'other';
    let fx = null; try { fx = facts(parse(bytes, { limits: { maxBytes: 64e6 } })); } catch (e2) { fx = { parseError: e2.message }; }
    add(code, { f: rel(f), msg: e.message.slice(0, 120), stack: code === 'other' ? (e.stack || '').split('\n').slice(1, 3).join(' | ').replace(/\(.*engine\//g, '(') : undefined, ...fx });
    continue;
  }
  const ms = performance.now() - t;
  const bpm = a.bars / Math.max(1e-6, a.durS / 60);
  ratio.push(bpm);
  if (ms > 1500) add('slow', { f: rel(f), ms: Math.round(ms), bars: a.bars, grooves: Object.keys(a.sections).length, ...facts(parse(bytes)) });
  if (bpm > 80 || a.bars > 600) add('many-bars', { f: rel(f), bars: a.bars, durS: a.durS, bpm: a.bpm, meter: a.meter, ...facts(parse(bytes)) });
}
const s = [...ratio].sort((x, y) => x - y), q = p => Math.round(s[Math.floor(p * (s.length - 1))] * 10) / 10;
console.log(JSON.stringify({ barsPerMinute: { p01: q(.01), p50: q(.5), p90: q(.9), p99: q(.99), over80: s.filter(x => x > 80).length }, counts: Object.fromEntries(Object.entries(ex).map(([k, v]) => [k, v.length])) }, null, 1));
for (const [k, v] of Object.entries(ex)) { console.log('\n### ' + k); v.forEach(o => console.log(JSON.stringify(o))); }
