// Look up named songs in an unpacked clean_midi folder and print the engine's reading of each version.
// Usage: node tools/lakh-songs.mjs <scratch dir> <list file: "Artist | Title" per line> [out.md]
// Prints derived data only (key, tempo, form, chords per section) — never notes, melodies or lyrics.
// Optional third field = the owner's answers, e.g. "key=E major; chorus=F": each version is scored against them.
import fs from 'node:fs'; import path from 'node:path';
import { analyse, VERSION } from '../engine/backline.js';
const [dir, listFile, outFile] = process.argv.slice(2);
const norm = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^the /, '');
const wanted = fs.readFileSync(listFile, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => { const [a, t, ans = ''] = l.split('|').map(x => x.trim());
  const truth = Object.fromEntries(ans.split(';').map(x => x.split('=').map(y => y.trim())).filter(x => x[0] && x[1])); return { a, t, truth }; });
const score = { key: [0, 0], chorus: [0, 0] }; const tick = (k, ok) => { score[k][1]++; if (ok) score[k][0]++; return ok ? '✓' : '✗'; };
let root = dir; const top = fs.readdirSync(dir); if (top.length === 1 && fs.statSync(path.join(dir, top[0])).isDirectory()) root = path.join(dir, top[0]);
const artists = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
const out = [`## Engine ${VERSION} on the owner's hand-check songs`, ''];
for (const w of wanted) {
  const ad = artists.filter(a => norm(a) === norm(w.a) || norm(a).includes(norm(w.a)));
  const files = ad.flatMap(a => fs.readdirSync(path.join(root, a)).filter(f => /\.(mid|midi|kar)$/i.test(f) && norm(f.replace(/\.[^.]+$/, '').replace(/\.\d+$/, '')).startsWith(norm(w.t))).map(f => path.join(root, a, f))).sort();
  out.push(`### ${w.a} — ${w.t}: ${files.length} version(s)`, '');
  if (!files.length) { out.push('Not found in clean_midi. Artist folders that look close: ' + (artists.filter(a => norm(a).split(' ')[0] === norm(w.a).split(' ')[0]).slice(0, 5).join(', ') || 'none'), ''); continue; }
  files.forEach((f, vi) => {
    const dbg = {}; let a; try { a = analyse(fs.readFileSync(f), { debugForm: dbg }); } catch (e) { out.push(`- v${vi + 1}: failed (${e.code})`); return; }
    out.push(`**v${vi + 1}** · key **${a.key || '?'} ${a.mode || ''}** (${a.keySource}, conf ${a.keyConf}) · ${a.bpm} BPM ${a.meter} · ${a.feel || 'no drums'} · grade ${a.quality.grade} (${a.quality.score}) · ${a.bars} bars`);
    const checks = [];
    // tuned=-1: the record sounds a half step below the shapes, and a fan file may be written either way
    const PC = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'], ALT = { Db: 'C#', 'D#': 'Eb', Gb: 'F#', 'G#': 'Ab', 'A#': 'Bb' };
    const pc = n => PC.indexOf(ALT[n] || n), shift = +(w.truth.tuned || 0);
    const keyOk = (k, m) => { const [tk, tm] = w.truth.key.split(' '); if (m !== tm || pc(k) < 0) return 0; const d = (pc(k) - pc(tk) + 12) % 12; return d === 0 ? 1 : shift && d === (shift + 12) % 12 ? 2 : 0; };
    let off = 0;
    if (w.truth.key) { const r = keyOk(a.key, a.mode); if (r === 2) off = shift; checks.push('key ' + tick('key', r > 0) + (r === 2 ? ' (written at record pitch)' : '')); }
    if (w.truth.chorus) { const ch = Object.values(a.sections).find(S => S.name === 'Chorus?'); const first = ch && [ch.chords].flat(2).find(c => c && c !== 'N');
      checks.push('chorus starts on ' + w.truth.chorus + ' ' + tick('chorus', !!first && (pc(first.replace(/\/.*/, '').match(/^[A-G][#b]?/)[0]) - pc(w.truth.chorus) - off + 24) % 12 === 0)); }
    if (checks.length) out[out.length - 1] += ' · owner check: ' + checks.join(', ');
    out.push('', 'Form: ' + a.form.map(x => `${x.sec}${x.name ? ' ' + x.name : ''} ${x.bars}`).join(' · '), '');
    for (const [L, S] of Object.entries(a.sections)) {
      const show = c => Array.isArray(c) ? c.join(' ') : c;
      out.push(`- ${L} ${S.name || ''} (${S.bars} bars, ×${S.count}): ${S.chords.slice(0, 8).map(show).join(' | ')}${S.chords.length > 8 ? ' …' : ''}  —  ${S.roman.slice(0, 8).map(show).join(' | ')}`);
    }
    // BARS=1: one line per bar (chord names, drum groove letter, crash, section-start marks) to study section boundaries
    if (process.env.BARS && dbg.bars) { const NM = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
      const cn = c => c === 'N' ? 'N' : NM[+c.split(':')[0]] + c.split(':')[1];
      let sec = 0, at = 0; const starts = new Map(); a.form.forEach(x => { starts.set(at, x.sec + (x.name ? ' ' + x.name : '')); at += x.bars; });
      out.push('```'); dbg.bars.forEach((b, i) => out.push(`${String(i).padStart(3)} ${(starts.get(i) || '').padEnd(10)} ${b.chords.map(cn).join(' ').padEnd(12)} ${b.drum} d${(b.density || 0).toFixed(1)}${b.crash ? ' C' : ''}${b.start ? ' S' + b.start : ''}`)); out.push('```'); }
    out.push('');
  });
}
if (score.key[1] || score.chorus[1]) out.push('## Scoreboard (every version counted, fan files included)', '', ...Object.entries(score).filter(([, v]) => v[1]).map(([k, [ok, n]]) => `- ${k}: ${ok} / ${n} (${Math.round(100 * ok / n)}%)`), '');
const md = out.join('\n'); console.log(md); if (outFile) fs.writeFileSync(outFile, md + '\n');
