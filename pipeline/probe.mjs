#!/usr/bin/env node
// Backline pipeline probe (brief §3 step 0).
// Usage:
//   node pipeline/probe.mjs --src <clean_midi.tar.gz> --scratch <dir outside repo> [--download-sec N] [--where actions|laptop] [--out probe.json]
// Unpacks the archive into an EMPTY scratch dir, then reports sizes and counts.
// Writes only numbers (no file names, no MIDI content) to --out.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), [])
);
const src = args.src, scratch = args.scratch;
if (!src || !scratch) { console.error('need --src and --scratch'); process.exit(2); }

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const absScratch = path.resolve(scratch);
if (absScratch.startsWith(repoRoot + path.sep)) { console.error('scratch must be OUTSIDE the repo'); process.exit(2); }
fs.mkdirSync(absScratch, { recursive: true });
if (fs.readdirSync(absScratch).length) { console.error('scratch dir must be empty'); process.exit(2); }

const archiveBytes = fs.statSync(src).size;
const t0 = Date.now();
execFileSync('tar', ['-xzf', path.resolve(src), '-C', absScratch, '--no-same-owner', '--no-same-permissions'], { stdio: 'inherit' });
const unpackSec = (Date.now() - t0) / 1000;

// Walk without following symlinks.
let files = 0, midi = 0, mthd = 0, bytes = 0, other = 0, symlinks = 0, biggest = 0;
const artists = new Set();
const songsPerArtist = new Map();
function walk(dir, depth, artist) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) { symlinks++; continue; }
    if (e.isDirectory()) {
      // archive layout is clean_midi/<Artist>/<Title>.mid
      walk(p, depth + 1, depth === 1 ? e.name : artist);
      continue;
    }
    if (!e.isFile()) continue;
    files++;
    const sz = fs.statSync(p).size; bytes += sz; biggest = Math.max(biggest, sz);
    if (/\.(mid|midi|kar)$/i.test(e.name)) {
      midi++;
      if (artist) { artists.add(artist); songsPerArtist.set(artist, (songsPerArtist.get(artist) || 0) + 1); }
      const fd = fs.openSync(p, 'r'); const b = Buffer.alloc(4); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd);
      if (b.toString('latin1') === 'MThd') mthd++;
    } else other++;
  }
}
walk(absScratch, 0, null);

let freeBytes = null;
try { const s = fs.statfsSync(absScratch); freeBytes = s.bavail * s.bsize; } catch {}

const counts = [...songsPerArtist.values()].sort((a, b) => a - b);
const out = {
  probe: 'backline-b0', date: new Date().toISOString(), where: args.where || 'laptop',
  host: { platform: process.platform, cpus: os.cpus().length, memGB: +(os.totalmem() / 2 ** 30).toFixed(1) },
  downloadSec: args['download-sec'] ? +args['download-sec'] : null,
  archiveMB: +(archiveBytes / 2 ** 20).toFixed(1),
  unpackedMB: +(bytes / 2 ** 20).toFixed(1),
  unpackSec,
  files, midiFiles: midi, midiWithValidHeader: mthd, otherFiles: other, symlinksSkipped: symlinks,
  biggestFileKB: +(biggest / 1024).toFixed(1),
  artists: artists.size,
  filesPerArtistMedian: counts.length ? counts[counts.length >> 1] : 0,
  filesPerArtistMax: counts.length ? counts[counts.length - 1] : 0,
  freeDiskGBAfterUnpack: freeBytes == null ? null : +(freeBytes / 2 ** 30).toFixed(1),
};
console.log(JSON.stringify(out, null, 2));
if (args.out) fs.writeFileSync(args.out, JSON.stringify(out, null, 2) + '\n');
