// B7: the DrumPath client turns a Backline song into what DrumPath's analyser returns. Uses DrumPath's own
// midi-analyse.js when a copy is given (DRUMPATH_ANALYSE=path), else a stub with the same API.
import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import { createRequire } from 'node:module';
import { analyse } from '../engine/backline.js'; import { writeMidi, drumBars, repeat, ROCK, chordParts } from './helpers.mjs';
const require = createRequire(import.meta.url); await import('../client/backline-index.js'); const BI = globalThis.BacklineIndex;   // a plain script: it sets a global
const MA = process.env.DRUMPATH_ANALYSE ? require(process.env.DRUMPATH_ANALYSE) : { ruleTags: () => [{ id: '1.2.02', weight: 2, reason: 'stub', confidence: 0.6 }], simTags: () => [], guessGenre: () => 'Rock' };
const prog = ['C', 'G', 'Am', 'F']; const p = [...prog, ...prog, ...prog, ...prog];
const A = analyse(writeMidi({ tracks: [{ name: 'Drums', ch: 9, events: drumBars(repeat(ROCK, p.length)) }, ...chordParts(p)] }));
const song = { id: 'x--y', title: 'Y', artist: 'X', consensus: { bpm: A.bpm, bpmSure: true, meter: A.meter, key: A.key, mode: A.mode, year: 1985, genre: 'Rock' }, versions: [{}, {}], analysis: A };
test('toDrumPath has the shape fromAnalysis() reads', () => {
  const d = BI.toDrumPath(song, MA, []);
  for (const k of ['features', 'patterns', 'sections', 'confidence', 'suggestedTags', 'level', 'draftSong']) assert.ok(k in d, k);
  assert.equal(d.draftSong.bpm, Math.round(A.bpm)); assert.equal(d.draftSong.bpmSure, true); assert.ok(d.confidence.bpm >= 0.95);
  assert.ok(Array.isArray(d.suggestedTags) && d.suggestedTags.length > 0);
  assert.ok(d.patterns.main && d.patterns.main.v && d.patterns.main.v.K, 'main groove in pattern-spec form');
  assert.equal(d.backline.link, 'https://aaditya-verma.github.io/backline/#song=x--y'); assert.equal(d.backline.key, 'C');
});
test('a song without drums is refused with a clear message', () => { assert.throws(() => BI.toDrumPath({ ...song, analysis: { ...A, drums: null } }, MA), /no drum part/); });
test('deep link carries section, tempo and transpose', () => { assert.equal(BI.link('a--b', { sec: 'B', tempo: 80, transpose: -2 }), 'https://aaditya-verma.github.io/backline/#song=a--b&sec=B&tempo=80&transpose=-2'); });
