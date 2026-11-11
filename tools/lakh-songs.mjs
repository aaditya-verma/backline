// Look up named songs in an unpacked clean_midi folder and print the engine's reading of each version.
// Usage: node tools/lakh-songs.mjs <scratch dir> <list file: "Artist | Title" per line> [out.md]
// Prints derived data only (key, tempo, form, chords per section) — never notes, melodies or lyrics.
import fs from 'node:fs'; import path from 'node:path';
import { analyse, VERSION } from '../engine/backline.js';
const [dir, listFile, outFile] = process.argv.slice(2);
const norm = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^the /, '');
const wanted = fs.readFileSync(listFile, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => { const [a, t] = l.split('|').map(x => x.trim()); return { a, t }; });
let root = dir; const top = fs.readdirSync(dir); if (top.length === 1 && fs.statSync(path.join(dir, top[0])).isDirectory()) root = path.join(dir, top[0]);
const artists = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
const out = [`## Engine ${VERSION} on the owner's hand-check songs`, ''];
for (const w of wanted) {
  const ad = artists.filter(a => norm(a) === norm(w.a) || norm(a).includes(norm(w.a)));
  const files = ad.flatMap(a => fs.readdirSync(path.join(root, a)).filter(f => /\.(mid|midi|kar)$/i.test(f) && norm(f.replace(/\.[^.]+$/, '').replace(/\.\d+$/, '')).startsWith(norm(w.t))).map(f => path.join(root, a, f))).sort();
  out.push(`### ${w.a} — ${w.t}: ${files.length} version(s)`, '');
  if (!files.length) { out.push('Not found in clean_midi. Artist folders that look close: ' + (artists.filter(a => norm(a).split(' ')[0] === norm(w.a).split(' ')[0]).slice(0, 5).join(', ') || 'none'), ''); continue; }
  files.forEach((f, vi) => {
    let a; try { a = analyse(fs.readFileSync(f)); } catch (e) { out.push(`- v${vi + 1}: failed (${e.code})`); return; }
    out.push(`**v${vi + 1}** · key **${a.key || '?'} ${a.mode || ''}** (${a.keySource}, conf ${a.keyConf}) · ${a.bpm} BPM ${a.meter} · ${a.feel || 'no drums'} · grade ${a.quality.grade} (${a.quality.score}) · ${a.bars} bars`);
    out.push('', 'Form: ' + a.form.map(x => `${x.sec}${x.name ? ' ' + x.name : ''} ${x.bars}`).join(' · '), '');
    for (const [L, S] of Object.entries(a.sections)) {
      const show = c => Array.isArray(c) ? c.join(' ') : c;
      out.push(`- ${L} ${S.name || ''} (${S.bars} bars, ×${S.count}): ${S.chords.slice(0, 8).map(show).join(' | ')}${S.chords.length > 8 ? ' …' : ''}  —  ${S.roman.slice(0, 8).map(show).join(' | ')}`);
    }
    out.push('');
  });
}
const md = out.join('\n'); console.log(md); if (outFile) fs.writeFileSync(outFile, md + '\n');
