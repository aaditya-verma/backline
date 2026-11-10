import test from 'node:test';
import assert from 'node:assert/strict';
import B, { parse, analyse, analyseDrums, MidiError } from '../engine/backline.js';
import { writeMidi, drumBars, ROCK, ROCK_B, FILL, repeat } from './helpers.mjs';

const song = (o) => writeMidi(o);

test('parser: tempo, meter, key, track names, programs, durations', () => {
  const bytes = song({
    tempos: [{ q: 0, bpm: 90 }], sigs: [{ q: 0, num: 3, den: 4 }], keys: [{ q: 0, sf: -3, minor: true }],
    tracks: [{ name: 'Bass', ch: 1, program: 33, events: [{ q: 0, note: 40, len: 2 }, { q: 3, note: 43, len: 1 }] }],
  });
  const smf = parse(bytes);
  assert.equal(smf.ppq, 480);
  const all = k => smf.tracks.flatMap(t => t[k]);
  assert.equal(Math.round(60e6 / all('tempos')[0].us), 90);
  assert.deepEqual(all('sigs')[0], { tick: 0, num: 3, den: 4 });
  assert.deepEqual(all('keys')[0], { tick: 0, sf: -3, minor: true });
  const bass = smf.tracks.find(t => t.name === 'Bass');
  assert.deepEqual(bass.programs[0], { tick: 0, ch: 1, prog: 33 });
  assert.deepEqual(bass.notes.map(n => n.dur), [960, 480]);
});

test('parser: lyrics are dropped (never kept in the output)', () => {
  const bytes = song({ lyrics: [{ q: 0, text: 'secret words' }], tracks: [{ name: 'Drums', events: drumBars(repeat(ROCK, 2)) }] });
  const smf = parse(bytes);
  assert.ok(!JSON.stringify(smf).includes('secret'));
  assert.ok(!JSON.stringify(analyse(bytes)).includes('secret'));
});

test('parser: corrupt and hostile files fail with a code, never hang', () => {
  const good = song({ tracks: [{ events: drumBars(repeat(ROCK, 4)) }] });
  const codeOf = f => { try { f(); return 'ok'; } catch (e) { return e instanceof MidiError ? e.code : 'other:' + e.message; } };
  assert.equal(codeOf(() => parse(new Uint8Array([1, 2, 3]))), 'too-small');
  assert.equal(codeOf(() => parse(new TextEncoder().encode('RIFF0000000000000000'))), 'not-midi');
  assert.equal(codeOf(() => parse(good, { limits: { maxBytes: 100 } })), 'too-big');
  assert.equal(codeOf(() => parse(good, { limits: { maxEvents: 10 } })), 'too-many-events');
  // truncate at many points: must either parse (partial) or throw a MidiError — never another error or a hang
  for (let cut = 14; cut < good.length; cut += 7) {
    const c = codeOf(() => analyse(good.slice(0, cut)));
    assert.ok(!c.startsWith('other'), `cut ${cut}: ${c}`);
  }
  // random byte flips
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let i = 0; i < 200; i++) {
    const b = good.slice(); for (let k = 0; k < 5; k++) b[22 + Math.floor(rnd() * (b.length - 22))] = Math.floor(rnd() * 256);
    const c = codeOf(() => analyse(b));
    assert.ok(!c.startsWith('other'), `flip ${i}: ${c}`);
  }
});

test('drums: found on channel 10, or by track name, or reported missing', () => {
  const ch10 = analyse(song({ tracks: [{ name: 'Whatever', ch: 9, events: drumBars(repeat(ROCK, 4)) }] }));
  assert.equal(ch10.drums.features.drumSrc, 'channel 10');
  const named = analyse(song({ tracks: [{ name: 'Drum Kit', ch: 3, events: drumBars(repeat(ROCK, 4)) }] }));
  assert.equal(named.drums.features.drumSrc, 'track name');
  const none = analyse(song({ tracks: [{ name: 'Piano', ch: 0, events: [{ q: 0, note: 60, len: 4 }, { q: 4, note: 64, len: 4 }] }] }));
  assert.equal(none.drums, null);
  assert.ok(none.warnings.some(w => /drum/i.test(w)));
  assert.equal(none.bpm, 120);
});

test('straight 8th rock at 100 BPM: tempo, meter, grid, main groove', () => {
  const a = analyse(song({ tempos: [{ q: 0, bpm: 100 }], tracks: [{ events: drumBars(repeat(ROCK, 8)) }] }));
  assert.equal(a.bpm, 100); assert.equal(a.meter, '4/4'); assert.equal(a.meterChanges, false);
  const f = a.drums.features;
  assert.equal(f.sub, 2); assert.equal(f.feel, 'straight'); assert.equal(f.timeSub, '8ths'); assert.equal(f.backbeat, '2&4');
  assert.deepEqual(a.drums.patterns.main.v, ROCK);
  assert.equal(a.bars, 8);
  assert.deepEqual(a.form, [{ sec: 'A', bars: 8 }]);
  assert.deepEqual(a.sections.A.groove.v, ROCK);
});

test('swing: off-beats at 2/3 of the beat read as a triplet feel / shuffle', () => {
  const ev = [];
  for (let bar = 0; bar < 8; bar++) for (let beat = 0; beat < 4; beat++) {
    const q = bar * 4 + beat;
    ev.push({ q, note: 51 }, { q: q + 2 / 3, note: 51 });
    if (beat % 2 === 0) ev.push({ q, note: 36 }); else ev.push({ q, note: 38 });
  }
  const a = analyse(song({ tempos: [{ q: 0, bpm: 120 }], tracks: [{ events: ev }] }));
  assert.equal(a.drums.features.sub, 3);
  assert.equal(a.drums.features.shuffle, true);
  assert.equal(a.feel, 'shuffle');
});

test('6/8: BPM is the dotted-quarter pulse (pattern-spec §4)', () => {
  // 6/8 at 180 quarter-note BPM → 120 dotted-quarter pulse
  const bar = { HH: 'xxxxxx', K: 'x.....', S: '...x..' };
  const a = analyse(song({ tempos: [{ q: 0, bpm: 180 }], sigs: [{ q: 0, num: 6, den: 8 }], tracks: [{ events: drumBars(repeat(bar, 8), { sub: 3, steps: 6, beatQ: 1.5 }) }] }));
  assert.equal(a.meter, '6/8'); assert.equal(a.bpm, 120); assert.equal(a.drums.features.compound, true);
  assert.equal(a.drums.features.sub, 3); assert.deepEqual(a.drums.patterns.main.v, bar);
  assert.deepEqual(a.drums.patterns.main.clicks, [0, 3]);
});

test('meter changes are flagged', () => {
  const a = analyse(song({ sigs: [{ q: 0, num: 4, den: 4 }, { q: 16, num: 3, den: 4 }], tracks: [{ events: drumBars(repeat(ROCK, 8)) }] }));
  assert.equal(a.meterChanges, true); assert.deepEqual(a.meters, ['4/4', '3/4']);
  assert.ok(a.warnings.some(w => /meter changes/.test(w)));
});

test('tempo changes: median and range', () => {
  const a = analyse(song({ tempos: [{ q: 0, bpm: 100 }, { q: 24, bpm: 110 }], tracks: [{ events: drumBars(repeat(ROCK, 8)) }] }));
  // 24 quarters at 100, 8 at 110 → duration-weighted median 100
  assert.equal(a.bpm, 100); assert.deepEqual(a.bpmRange, [100, 110]);
});

test('form: verse groove, fills at phrase ends, chorus groove, silent intro and break', () => {
  // 2 silent bars, A×7 + fill, B×7 + fill, 2 silent bars, A×4
  const bars = [...repeat(ROCK, 7), FILL, ...repeat(ROCK_B, 7), FILL];
  const ev = [...drumBars(bars, { startBar: 2 }), ...drumBars(repeat(ROCK, 4), { startBar: 20 })];
  const a = analyse(song({ tracks: [{ events: ev }, { name: 'Pad', ch: 0, events: [{ q: 0, note: 60, len: 96 }] }] }));
  assert.equal(a.bars, 24);
  assert.deepEqual(a.form, [{ sec: '·', bars: 2 }, { sec: 'A', bars: 8 }, { sec: 'B', bars: 8 }, { sec: '·', bars: 2 }, { sec: 'A', bars: 4 }]);
  assert.equal(a.form.reduce((s, f) => s + f.bars, 0), a.bars, 'form covers every bar');
  assert.deepEqual(a.sections.A.groove.v, ROCK);
  assert.deepEqual(a.sections.B.groove.v, ROCK_B);
  assert.deepEqual(a.sections.A.fill.v, FILL);
  assert.equal(a.sections.A.bars, 12);
});

test('ghost notes, open hats, cross-stick come through as pattern characters', () => {
  const bar = { HH: 'xxxxxxxo', S: '..x.g.x.', K: 'x...x...' };
  const a = analyse(song({ tracks: [{ events: drumBars(repeat(bar, 8)) }] }));
  assert.deepEqual(a.drums.patterns.main.v, { HH: 'xxxxxxxo', S: '..x.g.x.', K: 'x...x...' });
  assert.ok(a.drums.features.ghostRatio > 0.2);
});

test('output is deterministic and has the documented shape', () => {
  const bytes = song({ tracks: [{ events: drumBars(repeat(ROCK, 8)) }] });
  assert.equal(JSON.stringify(analyse(bytes)), JSON.stringify(analyse(bytes)));
  const a = analyse(bytes);
  for (const k of ['engine', 'bpm', 'bpmRange', 'meter', 'meterChanges', 'key', 'mode', 'keyConf', 'feel', 'swing', 'form', 'sections', 'drums', 'difficulty', 'quality', 'warnings'])
    assert.ok(k in a, 'missing ' + k);
  assert.equal(a.engine, B.VERSION);
});
