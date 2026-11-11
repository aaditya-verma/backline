// Backline — chord names, transposition, key spelling and capo hints (no dependencies).
export const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const PC = { C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, F: 5, 'E#': 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11 };
export const pcOf = n => (n in PC ? PC[n] : -1);
const mod = n => ((n % 12) + 12) % 12;

// chord quality → intervals above the root (the engine's 10 templates)
export const TONES = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], sus2: [0, 2, 7], sus4: [0, 5, 7], dim: [0, 3, 6], aug: [0, 4, 8], '5': [0, 7] };

/** "F#m7/C#" → {root:6, suf:'m7', bass:1}; "N" or anything unreadable → null */
export function parseChord(s) {
  if (!s || s === 'N') return null;
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(s); if (!m) return null;
  return { root: pcOf(m[1]), suf: m[2], bass: m[3] ? pcOf(m[3]) : null };
}
/** Keys that are written with flats: F Bb Eb Ab Db Gb major, D G C F Bb Eb minor */
export function flatKey(keyPc, minor) { return minor ? [2, 7, 0, 5, 10, 3].includes(keyPc) : [5, 10, 3, 8, 1, 6].includes(keyPc); }
export function noteName(pc, flats) { return (flats ? FLAT : SHARP)[mod(pc)]; }
/** transpose one chord name by n semitones, spelled for the target key */
export function transposeChord(s, n, flats) {
  const c = parseChord(s); if (!c) return s === 'N' ? 'N' : s;
  return noteName(c.root + n, flats) + c.suf + (c.bass != null ? '/' + noteName(c.bass + n, flats) : '');
}
/** MIDI note numbers for a chord: bass note (octave 2) and pad voicing (around middle C) */
export function voicing(s, n = 0) {
  const c = parseChord(s); if (!c) return null;
  const root = mod(c.root + n), iv = TONES[c.suf] || TONES[''];
  const bassPc = c.bass != null ? mod(c.bass + n) : root;
  const bass = 36 + bassPc + (bassPc > 7 ? -12 : 0);              // E1..G2 range: under a guitar
  const base = 52 + mod(root - 4);                                  // root between E3 and D#4
  const pad = iv.map(i => base + i);
  return { bass, pad };
}

// open-position shapes a guitarist plays without a barre (root:suffix)
const OPEN = new Set(['0:', '2:', '4:', '7:', '9:', '9:m', '4:m', '2:m', '4:7', '9:7', '2:7', '7:7', '0:7', '11:7', '0:maj7', '5:maj7', '2:sus2', '2:sus4', '9:sus2', '9:sus4', '4:sus4', '9:m7', '4:m7', '2:m7', '5:']);
const easy = c => !c || c.suf === '5' || OPEN.has(c.root + ':' + c.suf);
/** best capo (0–7) for a list of chord names already transposed: fewest barre shapes; ties → lower capo */
export function capoHint(names) {
  const cs = names.map(parseChord).filter(Boolean); if (!cs.length) return { capo: 0, barre: 0 };
  const share = k => cs.filter(c => !easy({ root: mod(c.root - k), suf: c.suf })).length / cs.length;
  let best = 0, bs = share(0);
  for (let k = 1; k <= 7; k++) { const s = share(k); if (s < bs - 0.1) { bs = s; best = k; } }
  return { capo: best, barre: share(0), barreWithCapo: bs };
}
/** pretty-print a chord with a smaller suffix for the chart */
export function chordHTML(s) {
  if (s === 'N') return '—';
  const m = /^([A-G][#b]?)([^/]*)(\/.*)?$/.exec(s); if (!m) return s;
  const r = m[1].replace('#', '♯').replace('b', '♭');
  return r + (m[2] ? '<sup>' + m[2] + '</sup>' : '') + (m[3] ? m[3].replace('#', '♯').replace(/b$/, '♭') : '');
}
export function keyLabel(keyPc, minor, flats) { return noteName(keyPc, flats).replace('#', '♯').replace('b', '♭') + (minor ? ' minor' : ' major'); }
