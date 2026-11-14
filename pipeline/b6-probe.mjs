// B6 probe: how much of clean_midi is matched to the Million Song Dataset, and how many matched songs are NOT in
// clean_midi. Reads match_scores.json + md5_to_paths.json (small JSON from the Lakh page) and the unpacked clean_midi.
// Usage: node pipeline/b6-probe.mjs <clean_midi dir> <match_scores.json> <md5_to_paths.json>
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const [clean, msPath, mdPath] = process.argv.slice(2);
const ms = JSON.parse(fs.readFileSync(msPath, 'utf8'));          // {msd_id: {md5: score}}
const md = JSON.parse(fs.readFileSync(mdPath, 'utf8'));          // {md5: [paths]}
const md5ToMsd = new Map(); for (const [id, m] of Object.entries(ms)) for (const [h, sc] of Object.entries(m)) { const c = md5ToMsd.get(h); if (!c || sc > c.sc) md5ToMsd.set(h, { id, sc }); }
let root = clean; { const t = fs.readdirSync(clean); if (t.length === 1) root = path.join(clean, t[0]); }
let files = 0, matched = 0; const songsMatched = new Set(), songs = new Set(), msdInClean = new Set();
for (const a of fs.readdirSync(root)) { const d = path.join(root, a); if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d)) { if (!/\.mid$/i.test(f)) continue; files++;
    const h = crypto.createHash('md5').update(fs.readFileSync(path.join(d, f))).digest('hex'); const key = a.toLowerCase() + '|' + f.replace(/\.\d+\.mid$|\.mid$/i, '').toLowerCase(); songs.add(key);
    const m = md5ToMsd.get(h); if (m) { matched++; songsMatched.add(key); msdInClean.add(m.id); } } }
const allMsd = Object.keys(ms).length, allMd5 = md5ToMsd.size;
const out = { cleanFiles: files, cleanFilesMatchedToMSD: matched, cleanSongs: songs.size, cleanSongsWithMSD: songsMatched.size,
  msdTracksInMatchScores: allMsd, matchedMidiFiles: allMd5, msdTracksAlsoInClean: msdInClean.size, msdTracksNotInClean: allMsd - msdInClean.size,
  md5WithPaths: Object.keys(md).length };
console.log(JSON.stringify(out, null, 1));
