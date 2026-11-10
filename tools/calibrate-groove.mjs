// Groove MIDI calibration (brief §2, §7): run the engine and DrumPath's analyser 1.1 on every Groove MIDI file.
// Usage: node tools/calibrate-groove.mjs <dir with info.csv + drummer*/...> [out.json]
// Reports BPM within ±2, meter correct, beat/fill accuracy (DrumPath's numbers: 100 / 100 / 93) and how many
// files give byte-identical drum results in both. Numbers only; no MIDI content is written.
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
import { parse, analyseDrums, VERSION } from '../engine/backline.js';
const require = createRequire(import.meta.url);
const REF = require('../test/reference/drumpath-midi-analyse-1.1.cjs');
const src = process.argv[2], outFile = process.argv[3];
const csv = fs.readFileSync(path.join(src, 'info.csv'), 'utf8').trim().split(/\r?\n/); const head = csv.shift().split(',');
const rows = csv.map(l => { const v = l.split(','); return Object.fromEntries(head.map((h, i) => [h, v[i]])); });
let n = 0, okB = 0, okM = 0, okT = 0, same = 0; const errors = [], diffs = []; const t0 = Date.now();
for (const r of rows) {
  const bytes = fs.readFileSync(path.join(src, r.midi_filename));
  let e, ref;
  try { e = analyseDrums(parse(bytes), { allNotesFallback: true }); } catch (x) { errors.push(r.midi_filename + ': ' + x.message); continue; }
  try { ref = REF.analyse(bytes, {}); } catch (x) { ref = null; }
  n++; const F = e.features;
  okB += Math.abs(F.bpm - +r.bpm) <= 2; okM += F.meter === r.time_signature.replace('-', '/'); okT += (F.isFill ? 'fill' : 'beat') === r.beat_type;
  if (ref) { const { tags, ...rc } = ref.confidence;
    if (JSON.stringify([ref.features, ref.patterns, ref.sections, rc]) === JSON.stringify([e.features, e.patterns, e.sections, e.confidence])) same++;
    else if (diffs.length < 10) diffs.push(r.midi_filename); }
}
const pct = x => Math.round(1000 * x / Math.max(1, n)) / 10;
const cal = { engine: VERSION, reference: 'DrumPath midi-analyse 1.1', files: rows.length, parsed: n, errors,
  bpmWithin2: pct(okB), meterCorrect: pct(okM), beatFill: pct(okT), identicalToDrumPath: pct(same), firstDiffs: diffs,
  drumpathBaseline: { bpmWithin2: 100, meterCorrect: 100, beatFill: 93 }, seconds: Math.round((Date.now() - t0) / 100) / 10 };
const pass = cal.bpmWithin2 >= 100 && cal.meterCorrect >= 100 && cal.beatFill >= 93 && cal.identicalToDrumPath === 100;
cal.pass = pass;
console.log(JSON.stringify(cal, null, 1));
if (outFile) fs.writeFileSync(outFile, JSON.stringify(cal, null, 1) + '\n');
if (!pass) process.exitCode = 1;
