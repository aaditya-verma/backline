// B2 tests: chords, key, Roman numerals, named form, guitar difficulty, quality.
// Every file is generated in code, so the right answer is known exactly (brief §7).
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyse, roman, chordName } from '../engine/backline.js';
import { writeMidi, drumBars, chordParts, ROCK, ROCK_B, FILL, repeat } from './helpers.mjs';

const loop = (p, n) => Array.from({ length: n }, () => p).flat();

test('I–V–vi–IV in C: chords per bar, key, Roman numerals', () => {
  const a = analyse(writeMidi({ tempos: [{ q: 0, bpm: 100 }], tracks: chordParts(loop(['C', 'G', 'Am', 'F'], 4)) }));
  assert.deepEqual(a.chords.perBar.slice(0, 4), ['C', 'G', 'Am', 'F']);
  assert.deepEqual(a.chords.roman.slice(0, 4), ['I', 'V', 'vi', 'IV']);
  assert.equal(a.key, 'C'); assert.equal(a.mode, 'major'); assert.equal(a.keySource, 'profile');
  assert.ok(a.chords.fit > 0.9, 'clean triads fit the templates');
});

test('key signature is used when it fits (G major, one sharp)', () => {
  const a = analyse(writeMidi({ keys: [{ q: 0, sf: 1, minor: false }], tracks: chordParts(loop(['G', 'D', 'Em', 'C'], 4)) }));
  assert.equal(a.key, 'G'); assert.equal(a.mode, 'major'); assert.equal(a.keySource, 'key signature');
  assert.deepEqual(a.chords.roman.slice(0, 4), ['I', 'V', 'vi', 'IV']);
  assert.ok(a.keyConf >= 0.6);
});

test('a wrong key signature is overruled by the notes', () => {
  // file claims E♭ major (3 flats) but plays D major
  const a = analyse(writeMidi({ keys: [{ q: 0, sf: -3, minor: false }], tracks: chordParts(loop(['D', 'A', 'Bm', 'G'], 4)) }));
  assert.equal(a.key, 'D'); assert.equal(a.keySource, 'profile');
});

test('minor key: starts and ends on the tonic minor chord (A minor, not C major)', () => {
  const a = analyse(writeMidi({ tracks: chordParts([...loop(['Am', 'F', 'C', 'G'], 4), 'Am', 'Am']) }));
  assert.equal(a.key, 'A'); assert.equal(a.mode, 'minor');
  assert.deepEqual(a.chords.roman.slice(0, 4), ['i', 'VI', 'III', 'VII']);
});

test('chord types: 7, maj7, m7, sus2, sus4, dim, aug, power chord', () => {
  const prog = ['G7', 'Cmaj7', 'Dm7', 'Dsus4', 'Asus2', 'Bdim', 'Caug', 'E5'];
  const a = analyse(writeMidi({ tracks: chordParts(prog) }));
  assert.deepEqual(a.chords.perBar, prog);
});

test('half-bar changes and slash chords', () => {
  const a = analyse(writeMidi({ tracks: chordParts([['C', 'G'], 'Am', 'C/E', 'F', ['C', 'G'], 'Am', 'C/E', 'F']) }));
  assert.deepEqual(a.chords.perBar.slice(0, 4), [['C', 'G'], 'Am', 'C/E', 'F']);
  assert.equal(a.chords.segsPerBar, 2);
});

test('3/4: one chord per bar', () => {
  const a = analyse(writeMidi({ sigs: [{ q: 0, num: 3, den: 4 }], tracks: chordParts(loop(['C', 'F', 'G', 'C'], 2), { beats: 3 }) }));
  assert.equal(a.chords.segsPerBar, 1);
  assert.deepEqual(a.chords.perBar.slice(0, 4), ['C', 'F', 'G', 'C']);
});

test('a melody with passing notes does not change the chords', () => {
  const parts = chordParts(loop(['C', 'G', 'Am', 'F'], 4));
  const melody = []; for (let i = 0; i < 64; i++) melody.push({ q: i, note: [72, 74, 76, 77, 79, 77, 76, 74][i % 8], vel: 100, len: 0.9 });
  const a = analyse(writeMidi({ tracks: [...parts, { name: 'Lead', ch: 2, program: 80, events: melody }] }));
  assert.deepEqual(a.chords.perBar.slice(0, 8), ['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F']);
});

test('flat keys are spelled with flats (F major: B♭, not A♯)', () => {
  const a = analyse(writeMidi({ keys: [{ q: 0, sf: -1 }], tracks: chordParts(loop(['F', 'Bb', 'C', 'F'], 4)) }));
  assert.equal(a.key, 'F');
  assert.deepEqual(a.chords.perBar.slice(0, 4), ['F', 'Bb', 'C', 'F']);
});

test('Roman numeral and chord-name helpers', () => {
  assert.equal(roman(7, '7', 0, false), 'V7');
  assert.equal(roman(11, 'dim', 0, false), 'vii°');
  assert.equal(roman(10, '', 0, false), '♭VII');
  assert.equal(roman(7, '', 9, true), 'VII');
  assert.equal(chordName(0, '', 4, false), 'C/E');
  assert.equal(chordName(10, 'm7', null, true), 'Bbm7');
});

test('guitar: capo hint turns F♯–B–C♯ barre shapes into open D–G–A shapes (capo 4)', () => {
  const a = analyse(writeMidi({ tracks: chordParts(loop(['F#', 'B', 'C#', 'F#'], 4)) }));
  assert.equal(a.guitar.capo, 4);
  assert.equal(a.guitar.barreShareWithCapo, 0);
  assert.ok(a.difficulty.guitar >= 1 && a.difficulty.guitar <= 10);
  assert.equal(a.guitar.heuristic, true);
});

// A whole song: intro (no drums) · verse · chorus · verse · chorus · bridge · chorus · outro (no drums)
function fullSong() {
  const intro = repeat('C', 4), verse = loop(['Am', 'F', 'C', 'G'], 2), chorus = loop(['F', 'G', 'C', 'Am'], 2), bridge = ['Dm', 'Em', 'F', 'G'], outro = ['F', 'G', 'C', 'C'];
  const prog = [...intro, ...verse, ...chorus, ...verse, ...chorus, ...bridge, ...chorus, ...outro];
  const V = repeat(ROCK, 8), CH = repeat(ROCK_B, 8), BR = repeat(ROCK, 4);
  const drums = [...V, ...CH, ...V, ...CH, ...BR, ...CH];
  return writeMidi({ tempos: [{ q: 0, bpm: 100 }], tracks: [{ name: 'Drums', ch: 9, events: drumBars(drums, { startBar: 4 }) }, ...chordParts(prog)] });
}

test('form: sections from chords + drums, with name guesses', () => {
  const a = analyse(fullSong());
  assert.equal(a.bars, 52);
  assert.deepEqual(a.form.map(f => [f.name, f.bars]), [['Intro', 4], ['Verse?', 8], ['Chorus?', 8], ['Verse?', 8], ['Chorus?', 8], ['Bridge?', 4], ['Chorus?', 8], ['Outro', 4]]);
  const ch = Object.values(a.sections).find(s => s.name === 'Chorus?'), ve = Object.values(a.sections).find(s => s.name === 'Verse?');
  assert.deepEqual(ve.chords.slice(0, 4), ['Am', 'F', 'C', 'G']);
  assert.deepEqual(ve.roman.slice(0, 4), ['vi', 'IV', 'I', 'V']);
  assert.deepEqual(ch.groove.v, ROCK_B); assert.deepEqual(ve.groove.v, ROCK);
  assert.equal(ch.count, 3);
  assert.equal(a.key, 'C'); assert.equal(a.mode, 'major');
});

test('quality: a clean full song with drums and chords is grade A', () => {
  const a = analyse(fullSong());
  assert.equal(a.quality.grade, 'A', JSON.stringify(a.quality));
});

test('no drums: chords, key and form still come out; quality is C', () => {
  const a = analyse(writeMidi({ tracks: chordParts([...loop(['C', 'G', 'Am', 'F'], 4), ...loop(['F', 'G', 'C', 'C'], 2), ...loop(['C', 'G', 'Am', 'F'], 4)]) }));
  assert.equal(a.drums, null); assert.equal(a.key, 'C');
  assert.deepEqual(a.form.map(f => f.sec), ['A', 'B', 'A']);
  assert.equal(a.quality.grade, 'C');
});

test('drums only: no key, no chords, form from grooves', () => {
  const a = analyse(writeMidi({ tracks: [{ name: 'Drums', ch: 9, events: drumBars([...repeat(ROCK, 8), ...repeat(ROCK_B, 8), ...repeat(ROCK, 8)]) }] }));
  assert.equal(a.key, null); assert.equal(a.mode, null);
  assert.deepEqual(a.form.map(f => [f.sec, f.bars]), [['A', 8], ['B', 8], ['A', 8]]);
});

test('same input, same output (deterministic)', () => {
  const b = fullSong(); assert.equal(JSON.stringify(analyse(b)), JSON.stringify(analyse(b)));
});

test('blues in E: minor-third riff, but E and A chords are major → E major', () => {
  const prog = loop(['E7', 'E7', 'E7', 'E7', 'A7', 'A7', 'E7', 'E7', 'B7', 'A7', 'E7', 'B7'], 2);
  const riff = []; for (let b = 0; b < prog.length; b++) [40, 43, 44, 45].forEach((n, i) => riff.push({ q: b * 4 + i, note: n + 12, vel: 100, len: 0.9 })); // E G G# A: blue third
  const a = analyse(writeMidi({ tracks: [...chordParts(prog), { name: 'Riff', ch: 3, program: 30, events: riff }] }));
  assert.equal(a.key, 'E'); assert.equal(a.mode, 'major');
});

test('verse heard first, and an 8-bar verse made of two 4-bar halves stays one section', () => {
  const verse = ['Bm', 'F#', 'A', 'E', 'G', 'D', 'Em', 'F#'], chorus = ['G', 'D', 'F#', 'Bm', 'G', 'D', 'Em', 'F#'];
  const prog = [...verse, ...verse, ...chorus, ...verse, ...verse, ...chorus, ...verse];
  const a = analyse(writeMidi({ tracks: [{ name: 'Drums', ch: 9, events: drumBars(repeat(ROCK, prog.length)) }, ...chordParts(prog)] }));
  assert.equal(a.key, 'B'); assert.equal(a.mode, 'minor');
  assert.deepEqual(a.form.map(f => [f.name, f.bars]), [['Verse?', 16], ['Chorus?', 8], ['Verse?', 16], ['Chorus?', 8], ['Verse?', 8]]);
});

test('riff-only blues (E5 with A7) is E major; Dorian Am7–D7 stays A minor', () => {
  const blues = loop(['E5', 'E5', 'E5', 'E5', 'A7', 'A7', 'E5', 'E5', 'B7', 'A7', 'E5', 'E5'], 2);
  const riff = []; for (let b = 0; b < blues.length; b++) [40, 43, 45, 43].forEach((n, i) => riff.push({ q: b * 4 + i, note: n + 12, vel: 100, len: 0.9 }));
  const a = analyse(writeMidi({ tracks: [...chordParts(blues), { name: 'Riff', ch: 3, program: 30, events: riff }] }));
  assert.equal(a.key, 'E'); assert.equal(a.mode, 'major');
  const d = analyse(writeMidi({ tracks: chordParts(loop(['Am7', 'D7'], 12)) }));
  assert.equal(d.key, 'A'); assert.equal(d.mode, 'minor');
});

test('minor blues (Em–Am–B7) stays E minor', () => {
  const a = analyse(writeMidi({ tracks: chordParts(loop(['Em', 'Em', 'Em', 'Em', 'Am', 'Am', 'Em', 'Em', 'B7', 'Am', 'Em', 'B7'], 2)) }));
  assert.equal(a.key, 'E'); assert.equal(a.mode, 'minor');
});

test('E5 riff with a few E7 bars is E major; E5 metal riff with Em and C stays E minor', () => {
  const a = analyse(writeMidi({ tracks: chordParts([...loop(['E5'], 20), 'Em', 'Em', 'Em', 'Em', 'E7', 'E7']) }));
  assert.equal(a.key, 'E'); assert.equal(a.mode, 'major');
  const m = analyse(writeMidi({ tracks: chordParts(loop(['E5', 'E5', 'Em', 'C', 'D', 'Em'], 4)) }));
  assert.equal(m.key, 'E'); assert.equal(m.mode, 'minor');
});
