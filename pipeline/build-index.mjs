// B3 — build the song index from an unpacked clean_midi folder (brief §3).
// Usage: node pipeline/build-index.mjs <clean_midi dir> <out dir> [check-songs.txt]
// Writes <out>/data/v1/{manifest.json, search.json, songs/<2>/<id>.json, report/errors.csv, report/quality.md}.
// Derived data only: numbers, chord names, drum patterns, section names. Never notes of melodies, never lyrics, never MIDI.
// Same input → same output: files are read in sorted order, the sample uses a fixed seed, and only manifest.json
// carries the build date.
import fs from 'node:fs'; import path from 'node:path';
import { analyse, VERSION } from '../engine/backline.js';

const [srcDir, outDir, checkFile] = process.argv.slice(2);
if (!srcDir || !outDir) { console.error('usage: build-index.mjs <clean_midi dir> <out dir> [check-songs.txt]'); process.exit(2); }
const OUT = path.join(outDir, 'data', 'v1');

// ---------- helpers ----------
const norm = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^the /, '');
const slug = s => norm(s).replace(/ /g, '-').slice(0, 60) || 'x';
const median = a => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const write = (rel, obj) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj)); return fs.statSync(p).size; };

// ---------- 1. files, in sorted order; the archive may have one top folder ----------
let root = srcDir; { const top = fs.readdirSync(srcDir); if (top.length === 1 && fs.statSync(path.join(srcDir, top[0])).isDirectory()) root = path.join(srcDir, top[0]); }
const byName = (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
const files = [];
for (const ad of fs.readdirSync(root, { withFileTypes: true }).sort(byName)) {
  if (!ad.isDirectory() || ad.isSymbolicLink()) continue;
  for (const f of fs.readdirSync(path.join(root, ad.name), { withFileTypes: true }).sort(byName)) {
    if (!f.isFile() || !/\.(mid|midi|kar)$/i.test(f.name)) continue;
    const title = f.name.replace(/\.[^.]+$/, '').replace(/\.\d+$/, '').trim();
    files.push({ artist: ad.name.trim(), title, path: path.join(root, ad.name, f.name) });
  }
}

// ---------- 2. analyse every file ----------
const t0 = Date.now(); const errors = []; const groups = new Map();
for (const f of files) {
  let a; try { a = analyse(fs.readFileSync(f.path)); } catch (e) { errors.push([f.artist, f.title, e.code || 'other', String(e.message || '').slice(0, 80)]); continue; }
  const k = norm(f.artist) + '|' + norm(f.title);
  if (!groups.has(k)) groups.set(k, { artist: f.artist, title: f.title, versions: [] });
  groups.get(k).versions.push(a);
}
const secs = Math.round((Date.now() - t0) / 1000);

// ---------- 3. one song per group: consensus values, primary version, version summaries ----------
const usable = a => !!a.drums || (a.key && a.chords && a.chords.share >= 0.2 && a.chords.fit >= 0.75);
const songs = []; const ids = new Set(); let dropped = 0;
for (const [, g] of [...groups].sort((x, y) => x[0] < y[0] ? -1 : 1)) {
  const vs = g.versions;
  if (!vs.some(usable)) { dropped++; continue; }
  // primary = highest quality score; ties go to the longer file, then the first in sorted order
  let pi = 0; vs.forEach((a, i) => { const b = vs[pi]; if (a.quality.score > b.quality.score || (a.quality.score === b.quality.score && a.bars > b.bars)) pi = i; });
  const P = vs[pi];
  const bpms = vs.map(a => a.bpm).filter(Boolean), bpm = median(bpms);
  const bpmSure = bpms.filter(b => Math.abs(b - bpm) <= 2).length >= 2;
  const vote = (vals, tie) => { const c = {}; vals.forEach(v => { c[v] = (c[v] || 0) + 1; }); const best = Math.max(...Object.values(c)); const top = Object.keys(c).filter(k => c[k] === best); return top.includes(tie) ? tie : top.sort()[0]; };
  const meter = vote(vs.map(a => a.meter), P.meter);
  const keyed = vs.filter(a => a.key), kv = keyed.map(a => a.key + ' ' + a.mode);
  const key = keyed.length ? vote(kv, P.key ? P.key + ' ' + P.mode : undefined) : null;
  const keyAgree = key ? kv.filter(k => k === key).length : 0;
  // how far the primary file sits from the consensus key (a transposed fan file): the app shifts chords by this
  let transpose = 0; if (key && P.key && P.mode === key.split(' ')[1]) { const d = (PC[key.split(' ')[0]] - PC[P.key] + 12) % 12; transpose = d > 6 ? d - 12 : d; }
  let id = slug(g.artist) + '--' + slug(g.title); if (ids.has(id)) { let n = 2; while (ids.has(id + '-' + n)) n++; id += '-' + n; } ids.add(id);
  const versions = vs.map((a, i) => ({ v: i + 1, grade: a.quality.grade, score: a.quality.score, bpm: a.bpm, meter: a.meter, key: a.key, mode: a.mode, bars: a.bars, drums: !!a.drums, chords: !!a.key }));
  const song = { id, title: g.title, artist: g.artist, engine: VERSION,
    consensus: { bpm, bpmSure, meter, key: key ? key.split(' ')[0] : null, mode: key ? key.split(' ')[1] : null, keyAgree, keyVotes: keyed.length },
    primary: pi + 1, transpose, versions, analysis: P };
  songs.push(song);
}

// ---------- 4. write ----------
fs.rmSync(OUT, { recursive: true, force: true });
let songBytes = 0;
for (const s of songs) songBytes += write(`songs/${s.id.slice(0, 2)}/${s.id}.json`, s);
const rows = songs.map(s => { const a = s.analysis, c = s.consensus;
  return [s.id, s.title, s.artist, c.bpm, c.key ? c.key + (c.mode === 'minor' ? 'm' : '') : null, c.meter, a.feel || null, a.quality.score, a.difficulty.drums ?? null, a.difficulty.guitar ?? null]; });
const searchFiles = []; const whole = JSON.stringify(rows);
if (whole.length <= 1.5e6) { write('search.json', whole); searchFiles.push('search.json'); }
else { const by = {}; rows.forEach(r => { const c = norm(r[1])[0] || '#'; const k = /[a-z]/.test(c) ? c : '0'; (by[k] = by[k] || []).push(r); });
  for (const k of Object.keys(by).sort()) { write(`search/${k}.json`, by[k]); searchFiles.push(`search/${k}.json`); } }
write('report/errors.csv', 'artist,title,code,message\n' + errors.map(r => r.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\n') + '\n');

// ---------- 5. report ----------
const tally = (arr, f) => arr.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});
const grades = tally(songs, s => s.analysis.quality.grade), errBy = tally(errors, e => e[2]);
const multi = songs.filter(s => s.versions.length > 1), agreeAll = multi.filter(s => s.consensus.keyVotes && s.consensus.keyAgree === s.consensus.keyVotes).length;
const rnd = mulberry32(20261112); const pool = [...songs]; const sample = [];
for (let i = 0; i < 20 && pool.length; i++) sample.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
// hand-check songs: does the consensus key match the owner's answer?
let check = [];
if (checkFile && fs.existsSync(checkFile)) {
  for (const l of fs.readFileSync(checkFile, 'utf8').split('\n').map(x => x.trim()).filter(x => x && !x.startsWith('#'))) {
    const [ar, ti, ans = ''] = l.split('|').map(x => x.trim()); const t = Object.fromEntries(ans.split(';').map(x => x.split('=').map(y => y.trim())).filter(x => x[0] && x[1]));
    const s = songs.find(x => norm(x.artist) === norm(ar) && norm(x.title) === norm(ti)); if (!t.key) continue;
    const got = s && s.consensus.key ? s.consensus.key + ' ' + s.consensus.mode : null; const [tk, tm] = t.key.split(' ');
    const d = got && got.split(' ')[1] === tm ? (PC[got.split(' ')[0]] - PC[tk] + 12) % 12 : -1;
    check.push({ song: `${ar} — ${ti}`, answer: t.key, consensus: got || (s ? 'no key' : 'not in index'), ok: d === 0 || (t.tuned && d === (+t.tuned + 12) % 12), versions: s ? `${s.consensus.keyAgree}/${s.consensus.keyVotes}` : '' });
  }
}
const md = [`# Backline song index — quality report`, '', `Engine ${VERSION} · ${files.length} MIDI files · ${files.length - errors.length} analysed · ${errors.length} rejected · ${groups.size} songs (artist + title) · ${dropped} dropped (no drums and no confident chords) · **${songs.length} in the index** · ${secs} s`, '',
  `## Grades (primary version)`, '', ...['A', 'B', 'C'].map(g => `- ${g}: ${grades[g] || 0}`), '',
  `## Versions`, '', `- Songs with 2+ versions: ${multi.length}; all versions agree on the key: ${agreeAll} (${Math.round(100 * agreeAll / Math.max(1, multi.length))}%)`,
  `- BPM sure (2+ versions within ±2 BPM): ${songs.filter(s => s.consensus.bpmSure).length}`,
  `- Primary file transposed from the consensus key: ${songs.filter(s => s.transpose).length}`, '',
  `## Rejected files`, '', ...Object.entries(errBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`), '',
  ...(check.length ? [`## Owner's hand-check songs: consensus key`, '', `${check.filter(c => c.ok).length} / ${check.filter(c => c.versions).length} right (songs not in the index are listed but not counted)`, '', '| Song | Answer | Consensus (versions agreeing) | |', '|---|---|---|---|',
    ...check.map(c => `| ${c.song} | ${c.answer} | ${c.consensus} (${c.versions}) | ${c.ok ? '✓' : '✗'} |`), ''] : []),
  `## Random sample for a spot-check (fixed seed)`, '', '| Song | Key | BPM | Meter | Grade | Form |', '|---|---|---|---|---|---|',
  ...sample.map(s => `| ${s.artist} — ${s.title} | ${s.consensus.key ? s.consensus.key + ' ' + s.consensus.mode : '—'} | ${s.consensus.bpm}${s.consensus.bpmSure ? '' : ' ≈'} | ${s.consensus.meter} | ${s.analysis.quality.grade} | ${s.analysis.form.map(f => f.name || f.sec).join(' · ').slice(0, 90)} |`), ''].join('\n');
write('report/quality.md', md);
const manifest = { schema: 1, engine: VERSION, built: process.env.BUILD_DATE || new Date().toISOString().slice(0, 10), builtOn: process.env.GITHUB_ACTIONS ? 'actions' : 'laptop',
  counts: { files: files.length, analysed: files.length - errors.length, rejected: errors.length, songs: songs.length, dropped }, search: searchFiles,
  source: 'Lakh MIDI Dataset v0.1, clean_midi subset (Colin Raffel), CC BY 4.0. Only derived data is published here; no MIDI files.',
  citation: 'Colin Raffel. "Learning-Based Methods for Comparing Sequences, with Applications to Audio-to-MIDI Alignment and Matching". PhD Thesis, 2016.' };
write('manifest.json', JSON.stringify(manifest, null, 1));
console.log(md.split('\n').slice(0, 30).join('\n'));
console.log(`\nwritten: ${songs.length} song files, ${(songBytes / 1e6).toFixed(1)} MB; search ${(whole.length / 1e6).toFixed(2)} MB in ${searchFiles.length} file(s)`);
