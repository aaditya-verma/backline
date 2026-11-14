// B3 — build the song index from an unpacked clean_midi folder (brief §3).
// B6 — optional extras from the environment: LMD_MATCHED (unpacked lmd_matched folder), LMD_SCORES (match_scores.json),
// MSD_META (msd-meta.json from pipeline/msd_meta.py). With them, songs get a year and a genre from the Million Song
// Dataset, matched files join their song as extra versions, and matched songs that aren't in clean_midi are added,
// named from the Million Song Dataset. Song ids already published never change: clean_midi songs get their ids first.
// Usage: node pipeline/build-index.mjs <clean_midi dir> <out dir> [check-songs.txt]
// Writes <out>/data/v1/{manifest.json, search.json, songs/<2>/<id>.json, report/errors.csv, report/quality.md}.
// Derived data only: numbers, chord names, drum patterns, section names. Never notes of melodies, never lyrics, never MIDI.
// Same input → same output: files are read in sorted order, the sample uses a fixed seed, and only manifest.json
// carries the build date.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
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
// ---------- B6: Million Song Dataset metadata ----------
const md5 = buf => crypto.createHash('md5').update(buf).digest('hex');
const loadJSON = p => p && fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
const SCORES = loadJSON(process.env.LMD_SCORES), META = loadJSON(process.env.MSD_META) || {};
const md5ToMsd = new Map();   // best-scoring Million Song Dataset track for each MIDI file
if (SCORES) for (const [tid, m] of Object.entries(SCORES)) for (const [h, sc] of Object.entries(m)) { const c = md5ToMsd.get(h); if (!c || sc > c.sc || (sc === c.sc && tid < c.tid)) md5ToMsd.set(h, { tid, sc }); }
// Echo Nest artist terms → one coarse genre. The first (highest-weight) term that names a genre wins.
const GENRES = [['Metal', ['metal']], ['Punk', ['punk']], ['Hip hop', ['hip hop', 'rap', 'gangsta', 'crunk']], ['Blues', ['blues']],
  ['Jazz', ['jazz', 'bebop', 'big band', 'swing']], ['Country', ['country', 'bluegrass', 'honky', 'americana']], ['Reggae', ['reggae', 'ska', 'dancehall', 'dub']],
  ['Latin', ['latin', 'salsa', 'bossa', 'samba', 'tango', 'reggaeton', 'flamenco', 'mambo', 'cumbia', 'merengue']], ['Soul & R&B', ['soul', 'r&b', 'rhythm and blues', 'motown', 'doo-wop', 'gospel']],
  ['Funk & Disco', ['funk', 'disco']], ['Folk', ['folk', 'singer-songwriter', 'celtic']], ['Classical', ['classical', 'opera', 'soundtrack', 'baroque', 'orchestra']],
  ['Rock', ['rock', 'grunge', 'new wave', 'britpop', 'indie', 'alternative', 'emo', 'shoegaze']], ['Electronic', ['electro', 'house', 'techno', 'trance', 'dance', 'edm', 'drum and bass', 'idm', 'big beat', 'ambient', 'downtempo', 'trip hop']],
  ['Pop', ['pop', 'teen', 'ballad', 'adult contemporary', 'easy listening', 'chanson', 'schlager', 'crooner', 'vocal']]];
// A term names its genre by its last word ("country rock" and "soft rock" are rock, "dance pop" is pop); a few names
// are whole phrases ("hip hop", "rhythm and blues", "new wave", "drum and bass").
const PHRASES = [['hip hop', 'Hip hop'], ['rhythm and blues', 'Soul & R&B'], ['r&b', 'Soul & R&B'], ['drum and bass', 'Electronic'], ['trip hop', 'Electronic'],
  ['new wave', 'Rock'], ['punk rock', 'Punk'], ['blues-rock', 'Blues'], ['blues rock', 'Blues'], ['singer-songwriter', 'Folk'], ['big band', 'Jazz'], ['easy listening', 'Pop'], ['adult contemporary', 'Pop'], ['doo-wop', 'Soul & R&B']];
const termGenre = t => { const l = t.toLowerCase(); for (const [ph, g] of PHRASES) if (l.includes(ph)) return g;
  const words = l.split(/[\s/-]+/).filter(Boolean); for (let i = words.length - 1; i >= 0; i--) for (const [g, kws] of GENRES) if (kws.some(k => !k.includes(' ') && (words[i] === k || words[i].startsWith(k)))) return g;
  for (const [g, kws] of GENRES) if (kws.some(k => l.includes(k))) return g; return null; };   // compounds: eurodance, synthpop
const genreOf = terms => { for (const t of terms || []) { const g = termGenre(t); if (g) return g; } return null; };
const ARTIST_GENRE = new Map(); { const c = new Map(); for (const [a, , , terms] of Object.values(META)) { const g = genreOf(terms); if (!g) continue; const k = norm(a); const m = c.get(k) || {}; m[g] = (m[g] || 0) + 1; c.set(k, m); }
  for (const [k, m] of c) ARTIST_GENRE.set(k, Object.entries(m).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0][0]); }
const msdOf = h => { const m = md5ToMsd.get(h); const r = m && META[m.tid]; return r ? { tid: m.tid, artist: r[0], title: r[1], year: r[2], terms: r[3], genre: genreOf(r[3]) } : null; };
/** Million Song Dataset titles carry version notes: "Hotel California (Remastered)", "Layla - Live" → "Hotel California", "Layla" */
const cleanTitle = t => t.replace(/\s*[([](?:[^)\]]*\b(?:version|remaster(?:ed)?|live|mix|edit|mono|stereo|demo|take|single|lp|album|bonus|instrumental|acoustic|explicit)\b[^)\]]*)[)\]]\s*$/i, '')
  .replace(/\s+-\s+(?:\d{4}\s+)?(?:remaster(?:ed)?|live|single version|album version|mono|stereo|demo|edit|radio edit)\b.*$/i, '').trim() || t;
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
const t0 = Date.now(); const errors = []; const groups = new Map(), cleanMd5 = new Set();
for (const f of files) {
  const buf = fs.readFileSync(f.path), h = md5(buf); cleanMd5.add(h);
  let a; try { a = analyse(buf); } catch (e) { errors.push([f.artist, f.title, e.code || 'other', String(e.message || '').slice(0, 80)]); continue; }
  const k = norm(f.artist) + '|' + norm(f.title);
  if (!groups.has(k)) groups.set(k, { artist: f.artist, title: f.title, versions: [], clean: true });
  a.__src = 'clean'; a.__msd = msdOf(h); groups.get(k).versions.push(a);
}
// B6: LMD-matched files (lmd_matched/A/B/C/<track id>/<md5>.mid) that aren't already a clean_midi file. Each joins the
// song with the same artist + title (an extra version), or starts a new song named from the Million Song Dataset.
let matchedFiles = 0, matchedNew = 0, matchedJoined = 0;
if (process.env.LMD_MATCHED && fs.existsSync(process.env.LMD_MATCHED)) {
  const best = new Map();   // md5 → {path, tid}: one file per MIDI, filed under its best match
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort(byName)) { const p = path.join(d, e.name);
    if (e.isDirectory() && !e.isSymbolicLink()) walk(p); else if (e.isFile() && /\.mid$/i.test(e.name)) { const h = e.name.slice(0, -4); if (!best.has(h)) best.set(h, p); } } };
  walk(process.env.LMD_MATCHED);
  for (const [h, p] of [...best].sort((x, y) => x[0] < y[0] ? -1 : 1)) {
    if (cleanMd5.has(h)) continue; const m = msdOf(h); if (!m || !m.artist || !m.title) continue; matchedFiles++;
    let a; try { a = analyse(fs.readFileSync(p)); } catch (e) { errors.push([m.artist, m.title, e.code || 'other', String(e.message || '').slice(0, 80)]); continue; }
    const title = cleanTitle(m.title), k = norm(m.artist) + '|' + norm(title);
    if (!groups.has(k)) { groups.set(k, { artist: m.artist, title, versions: [], clean: false }); matchedNew++; } else if (groups.get(k).clean) matchedJoined++;
    a.__src = 'matched'; a.__msd = m; groups.get(k).versions.push(a);
  }
}
const secs = Math.round((Date.now() - t0) / 1000);

// ---------- 3. one song per group: consensus values, primary version, version summaries ----------
const usable = a => !!a.drums || (a.key && a.chords && a.chords.share >= 0.2 && a.chords.fit >= 0.75);
const songs = []; const ids = new Set(); let dropped = 0, dupes = 0;
// clean_midi songs first, so their published ids (B3) never change; then the songs new in B6
const order = [...groups].sort((x, y) => (x[1].clean === y[1].clean ? 0 : x[1].clean ? -1 : 1) || (x[0] < y[0] ? -1 : 1));
for (const [, g] of order) {
  // the same transcription often exists as several files (re-saved, renamed, matched to several recordings): count it once,
  // or copies out-vote the other versions (Riders on the Storm: four identical "C major" files against five E minor ones)
  const seen = new Set(), vs = g.versions.filter(a => { const f = [a.bars, Math.round(a.bpm || 0), a.key, a.mode, a.meter, JSON.stringify(a.chords ? a.chords.perBar : null)].join('|');
    if (seen.has(f)) { dupes++; return false; } seen.add(f); return true; });
  if (!vs.some(usable)) { dropped++; continue; }
  // tempo: fan files are often written at double or half speed (Hotel California at 74 and at 148). Fold every
  // version's BPM by ×2 / ÷2 onto the reading most versions support, then take the median of the folded values.
  const bpms = vs.map(a => a.bpm).filter(Boolean);
  const fold = (b, ref) => [b, b * 2, b / 2].reduce((x, y) => Math.abs(Math.log(y / ref)) < Math.abs(Math.log(x / ref)) ? y : x);
  let ref = median(bpms), sup = -1;
  for (const r of [...bpms].sort((x, y) => x - y)) { const n = bpms.filter(b => Math.abs(b - r) / r <= 0.04).length; if (n > sup) { sup = n; ref = r; } }
  const folded = bpms.map(b => fold(b, ref)), bpm = bpms.length ? Math.round(median(folded) * 10) / 10 : null;
  const bpmSure = folded.filter(b => Math.abs(b - bpm) <= 2).length >= 2;
  const vote = (vals, tie) => { const c = {}; vals.forEach(v => { c[v] = (c[v] || 0) + 1; }); const best = Math.max(...Object.values(c)); const top = Object.keys(c).filter(k => c[k] === best); return top.includes(tie) ? tie : top.sort()[0]; };
  const keyed0 = vs.filter(a => a.key), key0 = keyed0.length ? vote(keyed0.map(a => a.key + ' ' + a.mode)) : null;
  // primary = the best file that agrees with the others: consensus key first, then a BPM at the consensus speed (not
  // double or half), then the quality score, then the longer file, then the first in sorted order
  const rank = a => [key0 && a.key && a.key + ' ' + a.mode === key0 ? 1 : 0, bpm && a.bpm && Math.abs(a.bpm - bpm) / bpm <= 0.04 ? 1 : 0, a.quality.score, a.bars];
  const better = (x, y) => { const p = rank(x), q = rank(y); for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return p[i] > q[i]; return false; };
  let pi = 0; vs.forEach((a, i) => { if (better(a, vs[pi])) pi = i; });
  const P = vs[pi];
  // a 1-beat signature (a pickup bar written as 1/4) is never the song's meter
  const meters = vs.map(a => a.meter).filter(m => m && !/^1\//.test(m)), meter = meters.length ? vote(meters, P.meter) : P.meter;
  const keyed = vs.filter(a => a.key), kv = keyed.map(a => a.key + ' ' + a.mode);
  const key = keyed.length ? vote(kv, P.key ? P.key + ' ' + P.mode : undefined) : null;
  const keyAgree = key ? kv.filter(k => k === key).length : 0;
  // how far the primary file sits from the consensus key (a transposed fan file): the app shifts chords by this
  let transpose = 0; if (key && P.key && P.mode === key.split(' ')[1]) { const d = (PC[key.split(' ')[0]] - PC[P.key] + 12) % 12; transpose = d > 6 ? d - 12 : d; }
  let id = slug(g.artist) + '--' + slug(g.title); if (ids.has(id)) { let n = 2; while (ids.has(id + '-' + n)) n++; id += '-' + n; } ids.add(id);
  const versions = vs.map((a, i) => ({ v: i + 1, grade: a.quality.grade, score: a.quality.score, bpm: a.bpm, meter: a.meter, key: a.key, mode: a.mode, bars: a.bars, drums: !!a.drums, chords: !!a.key,
    src: a.__src, year: a.__msd ? a.__msd.year : null }));
  // year: the earliest Million Song Dataset year among the versions (reissues and remasters come later); genre: the
  // most common genre among the matched versions, else the artist's usual genre across the whole dataset
  const ms = vs.map(a => a.__msd).filter(Boolean), years = ms.map(m => m.year).filter(Boolean);
  const gs = ms.map(m => m.genre).filter(Boolean), genre = gs.length ? vote(gs) : ARTIST_GENRE.get(norm(g.artist)) || null;
  const tm = ms.find(m => m.genre === genre) || ms[0], terms = tm ? tm.terms.slice(0, 3) : [];   // terms that agree with the chosen genre
  const song = { id, title: g.title, artist: g.artist, engine: VERSION, source: g.clean ? 'clean_midi' : 'lmd_matched',
    consensus: { bpm, bpmSure, meter, key: key ? key.split(' ')[0] : null, mode: key ? key.split(' ')[1] : null, keyAgree, keyVotes: keyed.length,
      year: years.length ? Math.min(...years) : null, genre, genreFrom: gs.length ? 'track' : genre ? 'artist' : null, terms },
    primary: pi + 1, transpose, versions, analysis: (({ __src, __msd, ...rest }) => rest)(P) };
  songs.push(song);
}

// ---------- 4. write ----------
fs.rmSync(OUT, { recursive: true, force: true });
let songBytes = 0;
for (const s of songs) songBytes += write(`songs/${s.id.slice(0, 2)}/${s.id}.json`, s);
const rows = songs.map(s => { const a = s.analysis, c = s.consensus;
  return [s.id, s.title, s.artist, c.bpm, c.key ? c.key + (c.mode === 'minor' ? 'm' : '') : null, c.meter, a.feel || null, a.quality.score, a.difficulty.drums ?? null, a.difficulty.guitar ?? null,
    c.year, c.genre]; });   // v1 rows only ever grow: B6 adds year and genre at the end
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
const md = [`# Backline song index — quality report`, '', `Engine ${VERSION} · ${files.length} clean_midi files${matchedFiles ? ' + ' + matchedFiles + ' LMD-matched' : ''} · ${files.length + matchedFiles - errors.length} analysed · ${errors.length} rejected · ${groups.size} songs (artist + title) · ${dropped} dropped (no drums and no confident chords) · **${songs.length} in the index** · ${secs} s`, '',
  ...(process.env.LMD_MATCHED ? [`## B6: LMD-matched + Million Song Dataset`, '', `- Matched MIDI files not already in clean_midi: ${matchedFiles} (${matchedJoined} joined an existing song as extra versions, ${matchedNew} songs are new)`,
    `- Songs in the index from clean_midi: ${songs.filter(x => x.source === 'clean_midi').length}; new from LMD-matched: ${songs.filter(x => x.source === 'lmd_matched').length}`,
    `- With a year: ${songs.filter(x => x.consensus.year).length}; with a genre: ${songs.filter(x => x.consensus.genre).length} (from the track: ${songs.filter(x => x.consensus.genreFrom === 'track').length}, from the artist: ${songs.filter(x => x.consensus.genreFrom === 'artist').length})`,
    `- Genres: ${Object.entries(tally(songs.filter(x => x.consensus.genre), x => x.consensus.genre)).sort((a, b) => b[1] - a[1]).map(([g, n]) => g + ' ' + n).join(' · ')}`, ''] : []),
  `## Grades (primary version)`, '', ...['A', 'B', 'C'].map(g => `- ${g}: ${grades[g] || 0}`), '',
  `## Versions`, '', `- Duplicate files counted once: ${dupes}`, `- Songs with 2+ versions: ${multi.length}; all versions agree on the key: ${agreeAll} (${Math.round(100 * agreeAll / Math.max(1, multi.length))}%)`,
  `- BPM sure (2+ versions within ±2 BPM): ${songs.filter(s => s.consensus.bpmSure).length}`,
  `- Primary file transposed from the consensus key: ${songs.filter(s => s.transpose).length}`, '',
  `## Rejected files`, '', ...Object.entries(errBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`), '',
  ...(check.length ? [`## Owner's hand-check songs: consensus key`, '', `${check.filter(c => c.ok).length} / ${check.filter(c => c.versions).length} right (songs not in the index are listed but not counted)`, '', '| Song | Answer | Consensus (versions agreeing) | |', '|---|---|---|---|',
    ...check.map(c => `| ${c.song} | ${c.answer} | ${c.consensus} (${c.versions}) | ${c.ok ? '✓' : '✗'} |`), ''] : []),
  `## Random sample for a spot-check (fixed seed)`, '', '| Song | Key | BPM | Meter | Grade | Form |', '|---|---|---|---|---|---|',
  ...sample.map(s => `| ${s.artist} — ${s.title} | ${s.consensus.key ? s.consensus.key + ' ' + s.consensus.mode : '—'} | ${s.consensus.bpm}${s.consensus.bpmSure ? '' : ' ≈'} | ${s.consensus.meter} | ${s.analysis.quality.grade} | ${s.analysis.form.map(f => f.name || f.sec).join(' · ').slice(0, 90)} |`), ''].join('\n');
write('report/quality.md', md);
const manifest = { schema: 1, engine: VERSION, built: process.env.BUILD_DATE || new Date().toISOString().slice(0, 10), builtOn: process.env.GITHUB_ACTIONS ? 'actions' : 'laptop',
  counts: { files: files.length + matchedFiles, cleanFiles: files.length, matchedFiles, analysed: files.length + matchedFiles - errors.length, rejected: errors.length, songs: songs.length, dropped }, search: searchFiles,
  source: 'Lakh MIDI Dataset v0.1, clean_midi subset (Colin Raffel), CC BY 4.0. Only derived data is published here; no MIDI files.',
  citation: 'Colin Raffel. "Learning-Based Methods for Comparing Sequences, with Applications to Audio-to-MIDI Alignment and Matching". PhD Thesis, 2016.' };
write('manifest.json', JSON.stringify(manifest, null, 1));
console.log(md.split('\n').slice(0, 30).join('\n'));
console.log(`\nwritten: ${songs.length} song files, ${(songBytes / 1e6).toFixed(1)} MB; search ${(whole.length / 1e6).toFixed(2)} MB in ${searchFiles.length} file(s)`);
