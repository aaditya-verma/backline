// Test helpers: build MIDI files in code, so every test knows the right answer.
// writeMidi({ppq, tracks:[{name, ch, events:[{q, note, vel, len}], meta:[...] }], tempos:[{q,bpm}], sigs:[{q,num,den}], keys:[{q,sf,minor}], lyrics:[{q,text}]})
export function writeMidi(o = {}) {
  const ppq = o.ppq || 480;
  const vlq = v => { const a = [v & 127]; while (v >>= 7) a.unshift(v & 127 | 128); return a; };
  const u32 = v => [v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255];
  const T = q => Math.max(0, Math.round(q * ppq));
  const chunk = evs => {
    evs.sort((a, b) => a.t - b.t || a.o - b.o); let last = 0; const body = [];
    evs.forEach(e => { body.push(...vlq(e.t - last), ...e.d); last = e.t; }); body.push(0, 0xFF, 0x2F, 0);
    return [0x4D, 0x54, 0x72, 0x6B, ...u32(body.length), ...body];
  };
  const txt = s => [...s].map(c => c.charCodeAt(0) & 255);
  const conductor = [];
  (o.tempos || [{ q: 0, bpm: 120 }]).forEach(t => { const us = Math.round(60e6 / t.bpm); conductor.push({ t: T(t.q), o: 0, d: [0xFF, 0x51, 3, us >> 16 & 255, us >> 8 & 255, us & 255] }); });
  (o.sigs || [{ q: 0, num: 4, den: 4 }]).forEach(s => conductor.push({ t: T(s.q), o: 0, d: [0xFF, 0x58, 4, s.num, Math.round(Math.log2(s.den)), 24, 8] }));
  (o.keys || []).forEach(k => conductor.push({ t: T(k.q), o: 0, d: [0xFF, 0x59, 2, k.sf & 255, k.minor ? 1 : 0] }));
  (o.lyrics || []).forEach(l => { const d = txt(l.text); conductor.push({ t: T(l.q), o: 1, d: [0xFF, 0x05, d.length, ...d] }); });
  const chunks = [chunk(conductor)];
  (o.tracks || []).forEach(tr => {
    const ch = tr.ch ?? 9, evs = [];
    if (tr.name) { const d = txt(tr.name); evs.push({ t: 0, o: 0, d: [0xFF, 0x03, d.length, ...d] }); }
    if (tr.program != null) evs.push({ t: 0, o: 1, d: [0xC0 | ch, tr.program] });
    tr.events.forEach(n => { const t = T(n.q); evs.push({ t, o: 3, d: [0x90 | ch, n.note, n.vel || 100] }); evs.push({ t: t + Math.max(1, T(n.len ?? 0.125)), o: 2, d: [0x80 | ch, n.note, 0] }); });
    chunks.push(chunk(evs));
  });
  return new Uint8Array([0x4D, 0x54, 0x68, 0x64, ...u32(6), 0, 1, 0, chunks.length, ppq >> 8, ppq & 255, ...chunks.flat()]);
}

// Drum bar builders. A bar is a map lane → pattern string (one char per step), like pattern-spec §2.
const NOTE = { K: 36, S: 38, HH: 42, HO: 46, HP: 44, C: 49, R: 51, T1: 48, T2: 45, T3: 41, RIM: 37 };
export function drumBars(barList, { sub = 2, steps, beatQ = 1, startBar = 0, vel = 100, ghostVel = 40 } = {}) {
  const ev = [];
  barList.forEach((bar, bi) => {
    const n = steps || 4 * sub;
    Object.entries(bar).forEach(([lane, pat]) => {
      [...pat].forEach((c, k) => {
        if (c === '.') return;
        const q = ((startBar + bi) * n + k) / sub * beatQ;
        const note = c === 'o' ? NOTE.HO : c === 'r' ? NOTE.RIM : NOTE[lane];
        ev.push({ q, note, vel: c === 'g' ? ghostVel : c === 'X' ? 127 : vel });
      });
    });
  });
  return ev;
}
export const ROCK = { HH: 'xxxxxxxx', S: '..x...x.', K: 'x...x...' };
export const ROCK_B = { R: 'x.x.x.x.', S: '..x...x.', K: 'x..xx...', C: 'x.......' };
export const FILL = { S: 'xxxx....', T1: '....xx..', T3: '......xx' };
export const repeat = (bar, n) => Array(n).fill(bar);

// Chord parts: prog = one entry per bar, a chord name ('C', 'Am', 'G7', 'C/E', 'E5') or [first half, second half].
// Writes a piano part (close voicing around middle C) and a bass part (root or slash bass, octave 2).
const PCS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const IV = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], sus2: [0, 2, 7], sus4: [0, 5, 7], dim: [0, 3, 6], aug: [0, 4, 8], '5': [0, 7] };
export function chordNotes(name) {
  const m = /^([A-G][#b]?)(maj7|m7|m|7|sus2|sus4|dim|aug|5)?(?:\/([A-G][#b]?))?$/.exec(name); if (!m) throw new Error('bad chord ' + name);
  const r = PCS[m[1]], iv = IV[m[2] || ''], bass = m[3] != null ? PCS[m[3]] : r;
  return { piano: iv.map(i => 60 + ((r + i) % 12)), bass: 36 + bass };
}
export function chordParts(prog, { startBar = 0, beats = 4, vel = 80 } = {}) {
  const piano = [], bass = [];
  prog.forEach((c, bi) => { const halves = Array.isArray(c) ? c : [c]; const len = beats / halves.length;
    halves.forEach((name, h) => { if (name === 'N') return; const q = (startBar + bi) * beats + h * len, n = chordNotes(name);
      n.piano.forEach(note => piano.push({ q, note, vel, len: len * 0.95 })); bass.push({ q, note: n.bass, vel, len: len * 0.95 }); }); });
  return [{ name: 'Piano', ch: 0, program: 0, events: piano }, { name: 'Bass', ch: 1, program: 33, events: bass }];
}
