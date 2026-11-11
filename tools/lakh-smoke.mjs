// Lakh smoke run (B1, B2): run the engine over every file in an unpacked clean_midi folder and report numbers only.
// Usage: node tools/lakh-smoke.mjs <scratch dir> [out.json]
// No file names, titles or note data are written — only counts, shares and timings.
import fs from 'node:fs'; import path from 'node:path';
import { analyse, VERSION } from '../engine/backline.js';
const dir = process.argv[2], outFile = process.argv[3];
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
  const p = path.join(d, e.name); if (e.isSymbolicLink()) continue; if (e.isDirectory()) walk(p); else if (/\.(mid|midi|kar)$/i.test(e.name)) files.push(p); } })(dir);
const tally = (o, k) => { o[k] = (o[k] || 0) + 1; };
const err = {}, drumSrc = {}, meters = {}, feel = {}, subs = {}, letters = {}, warn = {};
const itemsPer = [], repShare = [];
const keys = {}, modes = {}, keySrc = {}, grades = {}, names = {}, nSections = {}, gtr = []; const fit = [], share = [], conf = [], score = []; let withChords = 0, capo = 0, gradeABdrums = 0, gradeABchords = 0;
const times = [], bars = [], dur = [], bpm = [], diff = []; let ok = 0, withDrums = 0, meterChanges = 0, bpmRange = 0, bpmAssumed = 0;
const t0 = Date.now();
for (const f of files) {
  const t = performance.now(); let a;
  try { a = analyse(fs.readFileSync(f)); } catch (e) { tally(err, e.code || 'other'); times.push(performance.now() - t); continue; }
  times.push(performance.now() - t); ok++;
  tally(meters, a.meter); bars.push(a.bars); dur.push(a.durS); bpm.push(a.bpm);
  if (a.meterChanges) meterChanges++; if (a.bpmRange) bpmRange++; if (a.bpmSource === 'assumed') bpmAssumed++;
  a.warnings.forEach(w => tally(warn, w.replace(/[0-9]+/g, '#').replace(/bars counted in .*/, 'bars counted in first meter')));
  tally(grades, a.quality.grade); score.push(a.quality.score);
  if (a.key) { withChords++; tally(keys, a.key + (a.mode === 'minor' ? 'm' : '')); tally(modes, a.mode); tally(keySrc, a.keySource); fit.push(a.chords.fit); conf.push(a.keyConf); gtr.push(a.difficulty.guitar); if (a.guitar.capo) capo++; }
  share.push(a.chords.share);
  a.form.forEach(f => tally(names, f.name || '(letter only)')); itemsPer.push(a.form.length);
  { const cnt = {}; a.form.forEach(f => { cnt[f.sec] = (cnt[f.sec] || 0) + 1; }); repShare.push(a.form.filter(f => cnt[f.sec] > 1).reduce((s, f) => s + f.bars, 0) / Math.max(1, a.bars)); } tally(nSections, Math.min(8, Object.keys(a.sections).length) + (Object.keys(a.sections).length >= 8 ? '+' : ''));
  if (a.quality.grade !== 'C' && a.drums) gradeABdrums++; if (a.quality.grade !== 'C' && a.key && a.chords.fit >= 0.75) gradeABchords++;
  if (a.drums) { withDrums++; tally(drumSrc, a.drums.features.drumSrc); tally(feel, a.feel); tally(subs, 'sub ' + a.drums.features.sub); diff.push(a.difficulty.drums);
    tally(letters, Math.min(6, Object.keys(a.sections).length) + (Object.keys(a.sections).length >= 6 ? '+' : '') + ' grooves'); }
}
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 10) / 10; };
const top = (o, k = 8) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k));
const out = { engine: VERSION, files: files.length, analysed: ok, failed: files.length - ok, errors: top(err, 20),
  withDrums, withDrumsPct: Math.round(1000 * withDrums / Math.max(1, ok)) / 10, drumSource: drumSrc,
  meters: top(meters), meterChanges, bpmRangeSongs: bpmRange, bpmAssumed, feel: top(feel), grid: top(subs), drumGroovesPerSong: top(letters),
  bpm: { p10: q(bpm, .1), p50: q(bpm, .5), p90: q(bpm, .9) }, bars: { p10: q(bars, .1), p50: q(bars, .5), p90: q(bars, .9) },
  durationS: { p10: q(dur, .1), p50: q(dur, .5), p90: q(dur, .9) }, drumDifficulty: { p10: q(diff, .1), p50: q(diff, .5), p90: q(diff, .9) },
  withChords, withChordsPct: Math.round(1000 * withChords / Math.max(1, ok)) / 10, modes, keySource: keySrc, topKeys: top(keys, 12),
  chordFit: { p10: q(fit, .1), p50: q(fit, .5), p90: q(fit, .9) }, chordShare: { p10: q(share, .1), p50: q(share, .5), p90: q(share, .9) }, keyConf: { p10: q(conf, .1), p50: q(conf, .5), p90: q(conf, .9) },
  guitarLevel: { p10: q(gtr, .1), p50: q(gtr, .5), p90: q(gtr, .9) }, capoSuggested: capo,
  grades, qualityScore: { p10: q(score, .1), p50: q(score, .5), p90: q(score, .9) }, gradeABwithDrums: gradeABdrums, gradeABwithConfidentChords: gradeABchords,
  formItemsPerSong: { p10: q(itemsPer, .1), p50: q(itemsPer, .5), p90: q(itemsPer, .9) }, barsInRepeatedSections: { p10: q(repShare, .1), p50: q(repShare, .5), p90: q(repShare, .9) },
  sectionNames: top(names, 10), sectionsPerSong: top(nSections, 10),
  msPerFile: { p50: q(times, .5), p95: q(times, .95), max: q(times, 1) }, totalSeconds: Math.round((Date.now() - t0) / 1000), warnings: top(warn, 10) };
console.log(JSON.stringify(out, null, 1));
if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1) + '\n');
