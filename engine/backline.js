/* Backline engine — reads a Standard MIDI File and describes the song.
   ES module, no dependencies. A plain-script copy (window.Backline / module.exports) is built by
   tools/build-engine.mjs into engine/dist/ for DrumPath (vendor/backline-engine.<ver>.js).

   B1 (this version): safe parser, drum lanes, grid/swing, bar clustering, fills, sections, drum features.
   The drum analysis is moved from DrumPath src/js/midi-analyse.js 1.1 and must give identical results
   (test/equivalence.test.mjs, tools/calibrate-groove.mjs). Harmony, key and named form arrive in B2.

   Stays in DrumPath (not here): feature → lesson-tag rule table and lesson-pattern similarity. */

export const VERSION = '0.1.1';

/* ---------- 1. Parser ---------- */
// Limits protect against corrupt or hostile files (brief §1.8). The pipeline also sets a wall-clock limit.
export const LIMITS = { maxBytes: 4 * 1024 * 1024, maxTracks: 256, maxEvents: 2_000_000, maxBars: 4000, maxMinutes: 20 };

export class MidiError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

/** parse(bytes) → {fmt, ppq, tracks:[{name, notes:[{tick,ch,note,vel,dur}], tempos, sigs, keys, programs, chans}]}
 *  Lyrics (FF 05), markers and other text events are dropped; only the track name is kept. */
export function parse(buf, opts = {}) {
  const lim = { ...LIMITS, ...(opts.limits || {}) };
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b.length > lim.maxBytes) throw new MidiError('too-big', `File is ${b.length} bytes (limit ${lim.maxBytes})`);
  if (b.length < 14) throw new MidiError('too-small', 'File too small to be MIDI');
  let p = 0, events = 0;
  const need = n => { if (p + n > b.length) throw new MidiError('truncated', 'File ends early'); };
  const u32 = () => { need(4); const v = (b[p] << 24 | b[p + 1] << 16 | b[p + 2] << 8 | b[p + 3]) >>> 0; p += 4; return v; };
  const u16 = () => { need(2); const v = b[p] << 8 | b[p + 1]; p += 2; return v; };
  const str = n => { need(n); let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(b[p + i]); p += n; return s; };
  const vlq = () => { let v = 0, c, k = 0; do { if (p >= b.length) throw new MidiError('truncated', 'File ends inside a number'); c = b[p++]; v = v * 128 + (c & 127); } while (c & 128 && ++k < 4); return v; };
  if (str(4) !== 'MThd') throw new MidiError('not-midi', 'Not a MIDI file');
  const hl = u32(), fmt = u16(), ntr = u16(), div = u16(); p = 8 + hl;
  if (div & 0x8000) throw new MidiError('smpte', 'SMPTE time division is not supported');
  if (!div) throw new MidiError('bad-header', 'Zero ticks per quarter note');
  if (ntr > lim.maxTracks) throw new MidiError('too-many-tracks', `${ntr} tracks (limit ${lim.maxTracks})`);
  const tracks = [];
  for (let t = 0; t < ntr && p + 8 <= b.length; t++) {
    const id = str(4), len = u32(), end = Math.min(b.length, p + len);
    if (id !== 'MTrk') { p = end; t--; continue; }
    const tr = { name: '', notes: [], tempos: [], sigs: [], keys: [], programs: [], chans: {} };
    const open = new Map(); // ch*128+note → [note objects] waiting for note-off
    let tick = 0, rs = 0, skips = 0;
    try { while (p < end) {
      if (++events > lim.maxEvents) throw new MidiError('too-many-events', `More than ${lim.maxEvents} events`);
      tick += vlq(); if (p >= end) break;
      if (!rs) while (p < end && !(b[p] & 0x80)) { if (++skips > 64) throw new MidiError('bad-status', 'Data byte without a status'); p++; } // stray data bytes: skip (sloppy writers)
      if (p >= end) break;
      let st = b[p];
      if (st & 0x80) { p++; if (st < 0xF0) rs = st; } else st = rs;
      if (st === 0xFF) {
        const ty = b[p++], l = vlq(); const d = b.subarray(p, Math.min(end, p + l)); p += l;
        if (ty === 0x51 && l >= 3) tr.tempos.push({ tick, us: d[0] << 16 | d[1] << 8 | d[2] });
        else if (ty === 0x58 && l >= 2) { if (d[0] >= 1 && d[0] <= 32 && d[1] <= 6) tr.sigs.push({ tick, num: d[0], den: Math.pow(2, d[1]) }); } // nonsense meters ignored
        else if (ty === 0x59 && l >= 2) tr.keys.push({ tick, sf: d[0] > 127 ? d[0] - 256 : d[0], minor: d[1] === 1 });
        else if ((ty === 0x03 || ty === 0x04) && !tr.name) tr.name = String.fromCharCode.apply(null, d.subarray(0, 64));
        else if (ty === 0x2F) break;
        continue; // lyrics, text, markers: dropped
      }
      if (st === 0xF0 || st === 0xF7) { p += vlq(); continue; }
      const hi = st & 0xF0, ch = st & 15;
      if (hi === 0xC0) { tr.programs.push({ tick, ch, prog: b[p++] }); continue; }
      if (hi === 0xD0) { p++; continue; }
      const d1 = b[p++], d2 = b[p++];
      if (hi === 0x90 && d2 > 0) {
        const n = { tick, ch, note: d1, vel: d2, dur: 0 }; tr.notes.push(n); tr.chans[ch] = (tr.chans[ch] || 0) + 1;
        const k = ch * 128 + d1; (open.get(k) || open.set(k, []).get(k)).push(n);
      } else if (hi === 0x80 || hi === 0x90) {
        const q = open.get(ch * 128 + d1); if (q && q.length) { const n = q.shift(); n.dur = tick - n.tick; }
      }
    } } catch (e) { if (e.code !== 'truncated' && e.code !== 'bad-status') throw e; tr.damaged = e.code; } // keep what was read
    if (skips) tr.skipped = skips;
    open.forEach(q => q.forEach(n => { n.dur = Math.max(0, tick - n.tick); })); // never closed: run to track end
    p = end; tracks.push(tr);
  }
  if (!tracks.length) throw new MidiError('no-tracks', 'No tracks in this file');
  return { fmt, ppq: div, tracks, damaged: tracks.filter(t => t.damaged || t.skipped).length };
}

/* ---------- 2. General MIDI (+ Roland TD extras) → DrumPath lanes (pattern-spec §1) ---------- */
export const GM = { 35: ['K'], 36: ['K'], 38: ['S'], 40: ['S'], 37: ['S', 'rim'], 42: ['HH'], 22: ['HH'], 44: ['HP'], 46: ['HH', 'open'], 26: ['HH', 'open'],
  49: ['C'], 57: ['C'], 52: ['C'], 55: ['C'], 51: ['R'], 59: ['R'], 53: ['R', 'bell'] };
export const TOM_NOTES = [41, 43, 45, 47, 48, 50, 58];
export const LANES = ['C', 'R', 'HH', 'HP', 'S', 'T1', 'T2', 'T3', 'K'];
const HANDS = ['C', 'R', 'HH', 'S', 'T1', 'T2', 'T3'];
function tomMap(used) {
  const u = [...new Set(used)].sort((a, b) => b - a), m = {};
  if (u.length === 1) { const n = u[0]; m[n] = n >= 47 ? 'T1' : n >= 45 ? 'T2' : 'T3'; return m; }
  u.forEach((n, i) => { m[n] = 'T' + (1 + Math.round(i * 2 / (u.length - 1))); }); return m;
}

/* ---------- helpers ---------- */
export const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r2 = x => Math.round(x * 100) / 100;
export function tempoMap(tempos, ppq) {
  const t = [...tempos].sort((a, b) => a.tick - b.tick); if (!t.length || t[0].tick > 0) t.unshift({ tick: 0, us: 500000 });
  const seg = []; let ms = 0; for (let i = 0; i < t.length; i++) { if (i) ms += (t[i].tick - t[i - 1].tick) * t[i - 1].us / ppq / 1000; seg.push({ tick: t[i].tick, us: t[i].us, ms }); }
  // binary search (DrumPath scanned linearly; same result, faster on long songs)
  return tick => { let lo = 0, hi = seg.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (seg[mid].tick <= tick) lo = mid; else hi = mid - 1; } const s = seg[lo]; return s.ms + (tick - s.tick) * s.us / ppq / 1000; };
}
/** Tempo over a tick span: duration-weighted (one sample per quarter) median, min, max. Same rule as DrumPath. */
export function tempoStats(tempos, ppq, firstT, lastT) {
  const tsorted = [...tempos].sort((a, b) => a.tick - b.tick);
  // one sample per quarter note of each tempo segment, as {bpm, count} (DrumPath pushed every sample)
  let runs = []; if (tsorted.length) { for (let i = 0; i < tsorted.length; i++) { const a = Math.max(firstT, tsorted[i].tick), z = Math.min(lastT, i + 1 < tsorted.length ? tsorted[i + 1].tick : lastT);
    const w = Math.max(z - a, i === tsorted.length - 1 || tsorted.length === 1 ? 1 : 0); if (w > 0) runs.push({ bpm: 60e6 / tsorted[i].us, n: Math.ceil(w / ppq) }); } }
  if (!runs.length) runs = [{ bpm: tsorted.length ? 60e6 / tsorted[0].us : 120, n: 1 }];
  const byBpm = [...runs].sort((x, y) => x.bpm - y.bpm), N = byBpm.reduce((a, r) => a + r.n, 0);
  const at = k => { let c = 0; for (const r of byBpm) { c += r.n; if (k < c) return r.bpm; } return byBpm.at(-1).bpm; };
  const med = N % 2 ? at(N >> 1) : (at(N / 2 - 1) + at(N / 2)) / 2;
  return { bpmQ: Math.round(med * 10) / 10, min: Math.round(byBpm[0].bpm), max: Math.round(byBpm.at(-1).bpm), fromFile: tsorted.length > 0 };
}
const allOf = (smf, k) => [].concat(...smf.tracks.map(t => t[k]));
/** Where the music is: split onsets at silences longer than 64 quarters (16 bars of 4/4) and keep the
 *  segment with the most notes. Notes held past the music (never released) count at most 8 quarters. */
export function songSpan(notes, ppq) {
  const on = notes.map(n => n.tick).sort((a, b) => a - b), gap = 64 * ppq;
  let best = { a: 0, z: 0, n: 0 }, a = 0;
  for (let i = 1; i <= on.length; i++) if (i === on.length || on[i] - on[i - 1] > gap) { if (i - a > best.n) best = { a, z: i - 1, n: i - a }; a = i; }
  const start = on[best.a], lastOnset = on[best.z];
  let end = lastOnset; notes.forEach(n => { if (n.tick >= start && n.tick <= lastOnset) end = Math.max(end, n.tick + Math.min(n.dur, 8 * ppq)); });
  return { start, lastOnset, end, dropped: on.length - best.n };
}

/** Find drum notes: channel 10, else tracks named drum/kit/perc (merged). allNotesFallback = DrumPath's old last resort. */
export function findDrums(smf, opts = {}) {
  let notes = [].concat(...smf.tracks.map(t => t.notes.filter(n => n.ch === 9))); let src = 'channel 10';
  if (!notes.length) { notes = [].concat(...smf.tracks.filter(t => /drum|kit|perc/i.test(t.name)).map(t => t.notes)); src = 'track name'; }
  if (!notes.length && opts.allNotesFallback) { notes = allOf(smf, 'notes'); src = 'all notes (no drum track found)'; }
  if (!notes.length) return null;
  notes.sort((a, b) => a.tick - b.tick || a.note - b.note);
  return { notes, src };
}

/* ---------- 3. Drums: grid, bars, clusters, fills, sections, features ---------- */
/** analyseDrums(smf) → DrumPath-compatible {features, patterns, sections, confidence, unmapped} + bar-level detail.
 *  Throws MidiError('no-drums') when there are no playable drum notes. */
export function analyseDrums(smf, opts = {}) {
  const ppq = smf.ppq;
  const tempos = allOf(smf, 'tempos'), sigsAll = allOf(smf, 'sigs').sort((a, b) => a.tick - b.tick);
  const found = findDrums(smf, opts);
  if (!found) throw new MidiError('no-drums', 'No drum track in this file');
  const { notes, src: drumSrc } = found;
  const toMs = tempoMap(tempos, ppq);
  const tm = tomMap(notes.filter(n => TOM_NOTES.includes(n.note)).map(n => n.note));
  let unmapped = 0; const ev = [];
  notes.forEach(n => { let m = GM[n.note]; if (!m && tm[n.note]) m = [tm[n.note]]; if (!m) { unmapped++; return; }
    ev.push({ q: n.tick / ppq, ms: toMs(n.tick), lane: m[0], art: m[1] || '', vel: n.vel, note: n.note }); });
  if (!ev.length) throw new MidiError('no-drums', 'No drum notes this app can play were found');
  /* tempo: duration-weighted median over the drum span */
  const firstT = notes[0].tick, lastT = notes[notes.length - 1].tick;
  const ts = tempoStats(tempos, ppq, firstT, lastT);
  const bpmQ = ts.bpmQ, bpmMin = ts.min, bpmMax = ts.max;
  /* meter */
  const sigs = sigsAll.length ? sigsAll : [{ tick: 0, num: 4, den: 4 }];
  const sig0 = sigs.filter(s => s.tick <= firstT).pop() || sigs[0];
  const meterChanges = new Set(sigs.filter(s => s.tick <= lastT).map(s => s.num + '/' + s.den)).size > 1;
  const compound = sig0.den === 8 && sig0.num % 3 === 0 && sig0.num > 3;
  // work in beats of the pulse you count: dotted quarters in 6/8, 9/8, 12/8; quarters otherwise
  const beatQ = compound ? 1.5 : 1; ev.forEach(e => { e.q = e.q / beatQ; });
  const barQ = sig0.num * 4 / sig0.den / beatQ;
  const pulseBpm = Math.round(bpmQ / beatQ * 10) / 10;
  /* swing: where the off-beat 8ths sit (0.5 straight … 0.67 triplet) */
  const offs = ev.filter(e => ['HH', 'R', 'S', 'K'].includes(e.lane)).map(e => e.q - Math.floor(e.q)).filter(f => f > 0.42 && f < 0.75);
  const swingR = offs.length >= 4 ? median(offs) : 0.5;
  // classify each note's position inside the beat: on-beat, 8th, 16th, triplet or sextuplet
  const CL = [[0, 'on'], [1, 'on'], [0.5, '8'], [0.25, '16'], [0.75, '16'], [1 / 3, 't'], [2 / 3, 't'], [1 / 6, 's'], [5 / 6, 's']];
  const cnt = { on: 0, '8': 0, '16': 0, t: 0, s: 0 }; ev.forEach(e => { const f = e.q - Math.floor(e.q); let best = CL[0], bd = 9; CL.forEach(c => { const d = Math.abs(f - c[0]); if (d < bd) { bd = d; best = c; } }); cnt[best[1]]++; });
  const N = ev.length, trip = swingR >= 0.6 || cnt.t > Math.max(1.5 * cnt['16'], 0.08 * N);
  const sub = trip ? (cnt.s > 0.06 * N || cnt['8'] > 0.15 * N && cnt.t > 0.15 * N ? 6 : 3) : (cnt['16'] > 0.06 * N ? 4 : 2);
  // per-beat best sub
  const beatSub = {}; ev.forEach(e => { const bt = Math.floor(e.q + 1e-6); const fr = e.q - bt; const best = [2, 3, 4, 6].find(s => Math.abs(fr * s - Math.round(fr * s)) / s <= 0.06) || 8; (beatSub[bt] = beatSub[bt] || []).push(best); });
  const beatSubs = Object.values(beatSub).map(a => Math.max(...a));
  const tripletBeats = beatSubs.filter(s => s === 3 || s === 6).length / Math.max(1, beatSubs.length);
  const swingFeel = sub === 3 || sub === 6 ? (tripletBeats > 0.3 ? 'triplet' : 'straight') : swingR >= 0.6 ? 'swing' : swingR >= 0.54 ? 'light swing' : 'straight';
  const swing = (sub === 2 || sub === 4) && swingR >= 0.54 && swingR < 0.6 ? r2(swingR) : undefined;
  /* graces: flams/drags = hit on the same lane 12–90 ms before a main note, quieter */
  const byLane = {}; ev.forEach(e => (byLane[e.lane] = byLane[e.lane] || []).push(e));
  let flams = 0, drags = 0;
  Object.values(byLane).forEach(a => { for (let i = a.length - 1; i > 0; i--) { const m = a[i]; if (m.grace) continue; const gs = [];
    for (let j = i - 1; j >= 0 && m.ms - a[j].ms <= 90; j--) { const d = m.ms - a[j].ms; if (d >= 12 && a[j].vel <= m.vel * 0.9 && !a[j].grace) gs.push(a[j]); }
    const same = gs.filter(g => Math.round(g.q * sub) === Math.round(m.q * sub));
    if (same.length && (m.lane === 'S' || m.lane[0] === 'T')) { same.slice(0, 2).forEach(g => g.grace = true); m.orn = same.length >= 2 ? 'd' : 'f'; if (same.length >= 2) drags++; else flams++; } } });
  const main = ev.filter(e => !e.grace);
  /* kit adaptation flag: kicks closer than a single pedal can play at this tempo (DrumPath thins them) */
  const kicks = main.filter(e => e.lane === 'K'); let fastK = 0; const minGap = Math.max(70, Math.min(110, 60000 / pulseBpm / 4 * 0.8));
  for (let i = 1; i < kicks.length; i++) if (kicks[i].ms - kicks[i - 1].ms < minGap) { fastK++; kicks[i].thin = true; }
  const doubleBass = fastK >= 4;
  /* quantise into bars */
  const barStart = Math.floor((main[0].q + 0.25) / barQ) * barQ; // pickups count to their bar
  const spb = Math.round(barQ * sub);
  const nBars = Math.max(1, Math.ceil((main[main.length - 1].q - barStart + 0.25) / barQ));
  const maxBars = (opts.limits && opts.limits.maxBars) || LIMITS.maxBars;
  if (!(nBars <= maxBars)) throw new MidiError('too-long', `${nBars} bars (limit ${maxBars})`);
  const bars = Array.from({ length: nBars }, () => ({})); const offsets = [];
  // backbeat median for ghost detection: snare velocities on beats (2/4, or 3 in half-time)
  const snares = main.filter(e => e.lane === 'S' && e.art !== 'rim');
  const sOnBeat = snares.filter(e => { const f = (e.q - barStart) / 1 % 1; return f < 0.08 || f > 0.92; });
  const bbMed = median((sOnBeat.length ? sOnBeat : snares).map(e => e.vel)) || 100;
  main.forEach(e => { const st = Math.round((e.q - barStart) * sub); const bi = Math.floor(st / spb), k = st - bi * spb; if (bi < 0 || bi >= nBars) return;
    offsets.push((e.q - barStart) * sub - st);
    let c = 'x'; if (e.lane === 'HH' && e.art === 'open') c = 'o'; else if (e.lane === 'S' && e.art === 'rim') c = 'r'; else if (e.orn) c = e.orn; else if (e.lane === 'S' && e.vel < 0.6 * bbMed) c = 'g';
    const L = bars[bi][e.lane] || (bars[bi][e.lane] = Array(spb).fill('.'));
    const prev = L[k]; if (prev === '.' || c !== 'g' && prev === 'g' || prev === 'x' && (c === 'o' || c === 'f' || c === 'd')) L[k] = c;
    if (e.lane === 'K' && e.thin) (bars[bi].Kthin = bars[bi].Kthin || []).push(k); });
  const onsets = b => { const s = new Set(); LANES.forEach(l => { if (b[l]) b[l].forEach((c, i) => { if (c !== '.') s.add(l + i); }); }); return s; };
  const dist = (A, B) => { if (!A.size && !B.size) return 0; let x = 0; A.forEach(v => { if (!B.has(v)) x++; }); B.forEach(v => { if (!A.has(v)) x++; }); const u = new Set([...A, ...B]).size; return x / u; };
  /* cluster bars: same or nearly the same (≤ 25% of onsets differ) */
  const bo = bars.map(onsets), clusters = []; const lab = bars.map(() => -1);
  bo.forEach((o, i) => { if (!o.size) return; let best = -1, bd = 1; clusters.forEach((c, ci) => { const d = dist(o, bo[c.proto]); if (d < bd) { bd = d; best = ci; } });
    if (best >= 0 && bd <= 0.25) { clusters[best].bars.push(i); lab[i] = best; } else { clusters.push({ proto: i, bars: [i] }); lab[i] = clusters.length - 1; } });
  clusters.forEach(c => { let bi = c.proto, bs = 1e9; c.bars.forEach(i => { const s = c.bars.reduce((a, j) => a + dist(bo[i], bo[j]), 0); if (s < bs) { bs = s; bi = i; } }); c.proto = bi; });
  const order = clusters.map((c, i) => i).sort((a, b) => clusters[b].bars.length - clusters[a].bars.length);
  const mainC = order[0];
  const second = order.slice(1).find(ci => clusters[ci].bars.length >= 2 && dist(bo[clusters[ci].proto], bo[clusters[mainC].proto]) > 0.3);
  const nonEmpty = bo.filter(o => o.size).length;
  // fills: phrase-end bars (2/4/8) that differ from the bar before
  const tomCount = b => ['T1', 'T2', 'T3'].reduce((a, l) => a + (b[l] ? b[l].filter(c => c !== '.').length : 0), 0);
  const fills = []; bars.forEach((b, i) => { if (!bo[i].size || lab[i] === mainC && clusters[mainC].bars.length > 1 && tomCount(b) < 2) return;
    const phraseEnd = (i + 1) % 2 === 0 || i === nBars - 1; const dPrev = i ? dist(bo[i], bo[i - 1]) : 1;
    if (phraseEnd && (dPrev > 0.35 || tomCount(b) >= 2) && !(second != null && lab[i] === second && tomCount(b) < 2)) fills.push(i); });
  let mainFill = null; if (fills.length) { const fc = {}; fills.forEach(i => { fc[lab[i]] = (fc[lab[i]] || 0) + 1; });
    const bestC = Object.keys(fc).sort((a, b) => fc[b] - fc[a] || tomCount(bars[clusters[b].proto]) - tomCount(bars[clusters[a].proto]))[0];
    mainFill = fills.find(i => String(lab[i]) === bestC); }
  /* sections: a change of groove cluster starts a new section; fills don't */
  const isGrooveC = ci => ci >= 0 && clusters[ci].bars.length >= 2; const sections = []; const names = {};
  bars.forEach((b, i) => { const ci = lab[i]; if (ci < 0) return; const cur = sections[sections.length - 1];
    if (!cur || isGrooveC(ci) && ci !== cur.c && !fills.includes(i)) { if (!(ci in names)) names[ci] = String.fromCharCode(65 + Object.keys(names).length);
      sections.push({ name: names[ci], c: ci, start: i, bars: 1, fills: fills.includes(i) ? [i] : [] }); } else { cur.bars++; if (fills.includes(i)) cur.fills.push(i); } });
  /* patterns (exercise objects in DrumPath's format, pattern-spec §3) */
  const meterTxt = sig0.num + '/' + sig0.den;
  const toEx = (bi, name) => { if (bi == null) return null; const b = bars[bi], v = {}; LANES.forEach(l => { if (b[l]) { let s = b[l].slice(); if (l === 'K' && b.Kthin) b.Kthin.forEach(k => { s[k] = '.'; }); s = s.join(''); if (/[^.]/.test(s)) v[l] = s; } });
    const steps = spb, ex = { n: name, sub, bars: 1, v }; if (steps !== 4 * sub) ex.steps = steps;
    if (sub === 3 && steps === 6 && compound) ex.clicks = [0, 3]; if (swing) ex.swing = swing; return ex; };
  // engine-only: the raw bar (kicks not thinned); DrumPath thins, Backline plays what the file says
  const toRaw = bi => { if (bi == null) return null; const b = bars[bi], v = {}; LANES.forEach(l => { if (b[l] && b[l].some(c => c !== '.')) v[l] = b[l].join(''); });
    const ex = { sub, bars: 1, v }; if (spb !== 4 * sub) ex.steps = spb; if (swing) ex.swing = swing; return ex; };
  const patterns = { main: toEx(clusters[mainC] && clusters[mainC].proto, 'Main groove'), second: second != null ? toEx(clusters[second].proto, 'Second groove') : null, fill: toEx(mainFill, 'Main fill') };
  /* ---------- features ---------- */
  const gb = bars[clusters[mainC].proto]; const laneHits = (b, l) => b[l] ? b[l].filter(c => c !== '.').length : 0;
  const timeLane = laneHits(gb, 'R') > laneHits(gb, 'HH') ? 'R' : 'HH';
  const tlPer = laneHits(gb, timeLane) / Math.max(1, barQ);
  const tlBeat = tlPer >= 3.5 ? '16ths' : tlPer >= 1.75 ? '8ths' : tlPer >= 0.9 ? 'quarters' : 'sparse';
  const twoHanded = tlBeat === '16ths' && pulseBpm >= 105;
  const beatsIdx = k => k % sub === 0 ? k / sub : -1;
  const sn = gb.S || []; const sBeats = []; sn.forEach((c, k) => { if (c !== '.' && c !== 'g') { const bt = beatsIdx(k); if (bt >= 0) sBeats.push(bt); } });
  const backbeat = sig0.num === 4 && sig0.den === 4 ? (sBeats.includes(1) && sBeats.includes(3) ? '2&4' : sBeats.includes(2) && !sBeats.includes(1) && !sBeats.includes(3) ? '3' : 'other') : 'n/a';
  const halfTime = backbeat === '3';
  const allMain = main.filter(e => e.q >= barStart);
  const hhOpenPerBar = r2(allMain.filter(e => e.lane === 'HH' && e.art === 'open').length / Math.max(1, nonEmpty));
  const ghostRatio = r2(snares.filter(e => e.vel < 0.6 * bbMed).length / Math.max(1, snares.length));
  const kb = gb.K || []; const kBeats = kb.map((c, k) => c !== '.' && k % sub === 0 ? 1 : 0).reduce((a, x) => a + x, 0);
  const beatsPerBar = Math.round(spb / sub);
  const fourFloor = !compound && kBeats >= beatsPerBar && beatsPerBar >= 4;
  const kick16 = sub === 4 && kb.some((c, k) => c !== '.' && k % 2 === 1);
  const kickAnd = kb.some((c, k) => c !== '.' && k % sub !== 0);
  const kickDouble = kb.some((c, k) => c !== '.' && k > 0 && kb[k - 1] !== '.');
  const kickDensity = r2(kicks.length / Math.max(1, nonEmpty));
  const xstick = r2(main.filter(e => e.lane === 'S' && e.art === 'rim').length / Math.max(1, main.filter(e => e.lane === 'S').length));
  const fillToms = fills.length ? r2(fills.reduce((a, i) => a + tomCount(bars[i]), 0) / fills.length) : 0;
  const tomUse = r2(main.filter(e => e.lane[0] === 'T').length / main.length);
  // linear share in the main groove: steps with exactly one limb hitting
  let lin = 0, act = 0; for (let k = 0; k < spb; k++) { const n = LANES.filter(l => gb[l] && gb[l][k] !== '.').length; if (n) { act++; if (n === 1) lin++; } }
  const linear = r2(act ? lin / act : 0);
  // kick + crash within 30 ms (two-pointer; DrumPath did a full scan, same answer)
  const kms = kicks.map(e => e.ms), crashes = main.filter(e => e.lane === 'C'); let uni = 0, kj = 0;
  crashes.forEach(c => { while (kj < kms.length && kms[kj] < c.ms - 30) kj++; let j = kj; while (j < kms.length && kms[j] < c.ms + 30) { if (Math.abs(kms[j] - c.ms) < 30) { uni++; break; } j++; } });
  const unisons = r2(uni / Math.max(1, crashes.length));
  const hpUse = r2(laneHits(gb, 'HP') / beatsPerBar);
  const peak = lanes => { const t = main.filter(e => lanes.includes(e.lane)).map(e => e.ms); let m = 0, j = 0; for (let i = 0; i < t.length; i++) { while (t[i] - t[j] > 1000) j++; m = Math.max(m, i - j + 1); } return m; };
  const nps = { hands: peak(HANDS), kick: peak(['K']), hhFoot: peak(['HP']) };
  const odd = !compound && [5, 7, 9, 11, 13, 15].includes(sig0.num);
  const shuffle = (sub === 3 || sub === 6 || swingR >= 0.6) && !compound;
  const durS = (main[main.length - 1].ms - main[0].ms) / 1000;
  const difficulty = Math.max(1, Math.min(10, Math.round(1 + nps.hands / 2.2 + nps.kick / 3 + (ghostRatio > 0.2 ? 1 : 0) + (odd ? 1.5 : 0) + (flams + drags > 2 ? 1 : 0) + (linear > 0.6 ? 1 : 0))));
  const isFill = nonEmpty <= 2 || nonEmpty <= 4 && (clusters[mainC].bars.length / nonEmpty < 0.6 || fillToms >= 3);
  const features = { bpm: bpmQ, pulseBpm, bpmRange: bpmMax - bpmMin > 2 ? [bpmMin, bpmMax] : null, tempoSource: ts.fromFile ? 'MIDI tempo map' : 'none in file (assumed 120)',
    meter: meterTxt, meterChanges, compound, odd, sub, feel: swingFeel, swing: r2(swingR), shuffle, halfTime, backbeat, timeLane, timeSub: tlBeat, twoHanded,
    hhOpenPerBar, ghostRatio, flams, drags, kickDensity, kick16, kickAnd, kickDouble, fourFloor, xstick, fillToms, tomUse, linear, unisons, hpUse,
    nps, difficulty, doubleBass, bars: nBars, barsPlayed: nonEmpty, mainShare: r2(clusters[mainC].bars.length / Math.max(1, nonEmpty)),
    fills: fills.length, durS: r2(durS), isFill, drumSrc, unmapped, timingMs: Math.round(median(offsets.map(o => Math.abs(o) * 60000 / pulseBpm / sub))) };
  const confidence = { bpm: ts.fromFile ? 0.95 : 0.2, meter: sigsAll.length ? 0.95 : 0.5, feel: offs.length >= 8 ? 0.8 : 0.5, sections: nonEmpty >= 8 ? 0.7 : 0.4 };
  return {
    features, patterns, confidence, unmapped,
    sections: sections.map(s => ({ name: s.name, start: s.start + 1, bars: s.bars, fills: s.fills.map(i => i + 1) })),
    // bar-level detail for the song form (engine only)
    detail: { firstBar: Math.round(barStart / barQ), nBars, label: lab, fills, mainC, second, names, sub, spb, barQ, beatQ, compound, sig0,
      clusterSize: clusters.map(c => c.bars.length), clusterProto: clusters.map(c => c.proto), toRaw, density: bo.map(o => o.size), crash: bars.map(b => laneHits(b, 'C')) },
  };
}

/* ---------- 4. Song analysis (B1: tempo, meter, drums, drum-based form) ---------- */
/** analyse(bytes, opts) → SongAnalysis (brief §2). Fields arriving in B2 (key, chords, named form, guitar
 *  difficulty, quality) are null here. Never throws for a parsable file without drums: drums → null. */
export function analyse(buf, opts = {}) {
  let smf = buf && buf.tracks ? buf : parse(buf, opts);
  const ppq = smf.ppq, warnings = [];
  const all0 = allOf(smf, 'notes'); if (!all0.length) throw new MidiError('no-notes', 'No notes in this file');
  if (smf.damaged) warnings.push(smf.damaged + ' damaged track(s): kept the part that could be read');
  const span = songSpan(all0, ppq);
  if (span.dropped) {
    warnings.push(span.dropped + ' stray note(s) far from the music ignored');
    smf = { ...smf, tracks: smf.tracks.map(t => ({ ...t, notes: t.notes.filter(n => n.tick >= span.start && n.tick <= span.lastOnset) })) };
  }
  const all = allOf(smf, 'notes'), firstT = span.start, lastT = span.end;
  const tempos = allOf(smf, 'tempos'), sigsAll = allOf(smf, 'sigs').sort((a, b) => a.tick - b.tick);
  const ts = tempoStats(tempos, ppq, firstT, lastT);
  const toMs = tempoMap(tempos, ppq);
  const sigs = sigsAll.length ? sigsAll : [{ tick: 0, num: 4, den: 4 }];
  const sig0 = sigs.filter(s => s.tick <= firstT).pop() || sigs[0];
  const meters = [...new Set(sigs.filter(s => s.tick <= lastT).map(s => s.num + '/' + s.den))];
  const compound = sig0.den === 8 && sig0.num % 3 === 0 && sig0.num > 3;
  if (!sigsAll.length) warnings.push('no time signature in file: assumed 4/4');
  if (!ts.fromFile) warnings.push('no tempo in file: assumed 120 BPM');
  if (meters.length > 1) warnings.push('meter changes: bars counted in ' + sig0.num + '/' + sig0.den);
  const durS = (toMs(lastT) - toMs(firstT)) / 1000, maxMin = (opts.limits && opts.limits.maxMinutes) || LIMITS.maxMinutes;
  if (durS > maxMin * 60) throw new MidiError('too-long', `${Math.round(durS / 60)} minutes of music (limit ${maxMin}): timing in the file is probably broken`);

  let drums = null;
  try { drums = analyseDrums(smf, opts); } catch (e) { if (e.code !== 'no-drums') throw e; warnings.push(e.message); }

  /* song form from drum sections, covering every bar of the song */
  const barQ = sig0.num * 4 / sig0.den, startBar = Math.floor(firstT / ppq / barQ + 1e-6);
  const songBars = Math.max(1, Math.ceil(lastT / ppq / barQ - 1e-6) - startBar);
  const maxBars = (opts.limits && opts.limits.maxBars) || LIMITS.maxBars;
  if (!(songBars <= maxBars)) throw new MidiError('too-long', `${songBars} bars (limit ${maxBars})`);
  const form = [], sections = {};
  if (drums) {
    const d = drums.detail, lab = d.label, letterOf = ci => d.names[ci];
    // per bar: section letter (DrumPath rule) or '·' for 2+ empty bars (no drums)
    const per = []; let cur = null;
    for (let i = 0; i < d.nBars; i++) {
      const ci = lab[i];
      if (ci < 0) { per.push(null); continue; }
      const isGroove = d.clusterSize[ci] >= 2, isFill = d.fills.includes(i);
      if (cur == null || isGroove && letterOf(ci) !== cur && !isFill) cur = letterOf(ci) || cur;
      per.push(cur);
    }
    // empty bars: a run of 2+ is a break; a single one joins the section before it
    for (let i = 0; i < per.length; i++) if (per[i] === null) { let j = i; while (j < per.length && per[j] === null) j++;
      const fillWith = j - i >= 2 ? '·' : (per[i - 1] || per[j] || '·'); for (let k = i; k < j; k++) per[k] = fillWith; i = j - 1; }
    const lead = Math.max(0, d.firstBar - startBar), tail = Math.max(0, songBars - lead - d.nBars);
    const seq = [...Array(lead).fill('·'), ...per, ...Array(tail).fill('·')];
    seq.forEach(s => { const f = form[form.length - 1]; if (f && f.sec === s) f.bars++; else form.push({ sec: s, bars: 1 }); });
    // per letter: groove = its cluster's prototype bar, fill = the commonest fill bar inside that letter's sections
    Object.entries(d.names).forEach(([ci, L]) => {
      const barIdx = per.map((s, i) => s === L ? i : -1).filter(i => i >= 0);
      const fl = d.fills.filter(i => per[i] === L);
      let fill = null; if (fl.length) { const fc = {}; fl.forEach(i => { fc[lab[i]] = (fc[lab[i]] || 0) + 1; }); const best = Object.keys(fc).sort((a, b) => fc[b] - fc[a])[0]; fill = fl.find(i => String(lab[i]) === best); }
      sections[L] = { bars: barIdx.length, groove: d.toRaw(d.clusterProto[+ci]), fill: d.toRaw(fill) };
    });
  } else form.push({ sec: '·', bars: songBars });

  const df = drums && drums.features;
  const out = {
    engine: VERSION,
    bpm: Math.round(ts.bpmQ / (compound ? 1.5 : 1) * 10) / 10, // the pulse you count (dotted quarter in 6/8, 12/8)
    bpmRange: ts.max - ts.min > 2 ? [ts.min, ts.max] : null,
    bpmSource: ts.fromFile ? 'file' : 'assumed',
    meter: sig0.num + '/' + sig0.den, meterChanges: meters.length > 1, meters,
    durS: Math.round(durS * 10) / 10,
    bars: songBars,
    feel: df ? (df.halfTime ? 'half-time' : df.shuffle ? 'shuffle' : df.feel) : null,
    swing: df ? df.swing : null,
    key: null, mode: null, keyConf: null, // B2
    form, sections,
    drums: df ? { features: df, patterns: drums.patterns, sections: drums.sections, confidence: drums.confidence } : null,
    difficulty: { drums: df ? df.difficulty : null, guitar: null }, // guitar: B2
    quality: null, // B2/B3
    tracks: smf.tracks.length,
    warnings,
  };
  return out;
}

/* ---------- tiny SMF writer (type 0, channel 10) — DrumPath-compatible, for tests and exports ---------- */
export function writeSMF(notes, o = {}) {
  const ppq = o.ppq || 480; const vlq = v => { const a = [v & 127]; while (v >>= 7) a.unshift(v & 127 | 128); return a; };
  const ev = []; const us = Math.round(60e6 / (o.bpm || 120)); ev.push({ t: 0, d: [0xFF, 0x51, 3, us >> 16 & 255, us >> 8 & 255, us & 255] });
  ev.push({ t: 0, d: [0xFF, 0x58, 4, o.num || 4, Math.round(Math.log2(o.den || 4)), 24, 8] });
  notes.forEach(n => { const t = Math.max(0, Math.round(n.q * ppq)); ev.push({ t, d: [0x99, n.note, n.vel || 100] }); ev.push({ t: t + Math.round(ppq / 8), d: [0x89, n.note, 0] }); });
  ev.sort((a, b) => a.t - b.t || (a.d[0] === 0x89 ? -1 : 1)); let last = 0; const body = []; ev.forEach(e => { body.push(...vlq(e.t - last), ...e.d); last = e.t; }); body.push(0, 0xFF, 0x2F, 0);
  const u32 = v => [v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255];
  return new Uint8Array([0x4D, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, ppq >> 8, ppq & 255, 0x4D, 0x54, 0x72, 0x6B, ...u32(body.length), ...body]);
}

const Backline = { VERSION, LIMITS, MidiError, parse, analyse, analyseDrums, findDrums, songSpan, tempoMap, tempoStats, median, writeSMF, GM, TOM_NOTES, LANES };
export default Backline;
