// The engine's drum analysis must match DrumPath's midi-analyse.js 1.1 exactly (brief §2: calibration must not drop).
// The reference copy lives in test/reference/ (from aaditya-verma/drumpath @ 952a380, 10 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parse, analyseDrums } from '../engine/backline.js';
import { writeMidi, drumBars, ROCK, ROCK_B, FILL, repeat } from './helpers.mjs';
const require = createRequire(import.meta.url);
const REF = require('./reference/drumpath-midi-analyse-1.1.cjs');

export function compare(bytes) {
  const r = REF.analyse(bytes, {});
  const e = analyseDrums(parse(bytes), { allNotesFallback: true });
  const { tags, ...refConf } = r.confidence;
  return { same: JSON.stringify([r.features, r.patterns, r.sections, refConf]) === JSON.stringify([e.features, e.patterns, e.sections, e.confidence]), r, e };
}

const cases = {
  rock: writeMidi({ tracks: [{ events: drumBars(repeat(ROCK, 8)) }] }),
  verseChorus: writeMidi({ tracks: [{ events: drumBars([...repeat(ROCK, 7), FILL, ...repeat(ROCK_B, 7), FILL]) }] }),
  sixteenths: writeMidi({ tempos: [{ q: 0, bpm: 92 }], tracks: [{ events: drumBars(repeat({ HH: 'xxxxxxxxxxxxxxxx', S: '....x..g....x...', K: 'x.....x...x.....' }, 8), { sub: 4 }) }] }),
  sixEight: writeMidi({ tempos: [{ q: 0, bpm: 150 }], sigs: [{ q: 0, num: 6, den: 8 }], tracks: [{ events: drumBars(repeat({ HH: 'xxxxxx', K: 'x.....', S: '...x..' }, 8), { sub: 3, steps: 6, beatQ: 1.5 }) }] }),
  tempoChange: writeMidi({ tempos: [{ q: 0, bpm: 100 }, { q: 16, bpm: 124 }], tracks: [{ events: drumBars(repeat(ROCK, 8)) }] }),
  fourFloor: writeMidi({ tempos: [{ q: 0, bpm: 124 }], tracks: [{ events: drumBars(repeat({ HH: '.o.o.o.o', K: 'x.x.x.x.', S: '..x...x.' }, 8)) }] }),
  oneBarFill: writeMidi({ tracks: [{ events: drumBars([FILL]) }] }),
  noDrumChannel: writeMidi({ tracks: [{ name: 'Percussion', ch: 4, events: drumBars(repeat(ROCK, 4)) }] }),
};

for (const [name, bytes] of Object.entries(cases)) {
  test('same result as DrumPath 1.1: ' + name, () => {
    const { same, r, e } = compare(bytes);
    if (!same) assert.deepEqual({ f: e.features, p: e.patterns, s: e.sections }, { f: r.features, p: r.patterns, s: r.sections });
  });
}
