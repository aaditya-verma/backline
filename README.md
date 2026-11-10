# Backline

Song engine + standalone jam app built on the Lakh MIDI Dataset. Search a song, see its form, chords and drum grooves, and play a synthesised backing track (drums, bass, chord pad) with loop, tempo and transpose.

Live: https://aaditya-verma.github.io/backline/ · Status: **B1 done** (engine 0.1.1: parse, drums, grid, sections). Next: B2 harmony, key and form.

| Folder | What |
|---|---|
| `engine/` | Dependency-free JS MIDI analyser (structure, grooves, chords, key, BPM, meter) |
| `pipeline/` | Node build that turns the Lakh `clean_midi` archive into `data/v1` (Actions or laptop — see `pipeline/LAPTOP.md`) |
| `data/` | Published from the `data` branch: derived JSON only |
| `app/` | The Backline PWA |
| `docs/` | `pattern-spec.md` (copied from DrumPath), integration notes |

## Ground rules
- **No MIDI files, melodies, lyrics or full note-for-note parts in this repo or on Pages.** Only derived data: tempo, meter, key, chords per bar, section form and 1–2-bar drum patterns. `.gitignore` and the Pages workflow both block raw files.
- Lakh files are fan transcriptions: every song carries a quality grade (A/B/C), and guessed fields (section names, chords) are marked as guesses.
- Free only: GitHub Pages + Actions, no paid services.

## Credits
Song data is derived from the **Lakh MIDI Dataset v0.1** by Colin Raffel, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — https://colinraffel.com/projects/lmd/

> Colin Raffel. *Learning-Based Methods for Comparing Sequences, with Applications to Audio-to-MIDI Alignment and Matching.* PhD Thesis, Columbia University, 2016.

The MIDI files are fan-made transcriptions and may be wrong. Changes made: only derived features are published (see above).

## Probe results (B0, 11 Nov 2026 — GitHub Actions, Lakh mirror)
| | |
|---|---|
| Source | `http://hog.ee.columbia.edu/craffel/lmd/clean_midi.tar.gz` (HTTP 200) |
| Download | 20 s (~11 MB/s) |
| Archive | 223.4 MB |
| Unpacked | 777.8 MB, unpack 4.8 s |
| Files | 17,259 (17,256 MIDI; 17,243 with a valid `MThd` header; 3 other) |
| Artists | 2,197 folders (median 2 files each, max 783) |
| Runner | 4 CPU, 15.6 GB RAM, 84.8 GB free after unpack |

Verdict: Actions + mirror works; the laptop route is a fallback only.

## Engine checks (B1, 11 Nov 2026 — engine 0.1.1, `.github/workflows/engine.yml`)
**Unit tests:** 25 / 25 pass (`npm test`), all on MIDI files generated in code, including "same result as DrumPath 1.1" checks and hostile-file cases.

**Groove MIDI calibration** (1,150 files, Magenta, CC BY 4.0) — must not drop below DrumPath's numbers:

| | Backline 0.1.1 | DrumPath 1.1 |
|---|---|---|
| Files parsed | 1,150 / 1,150 | 1,150 / 1,150 |
| BPM within ±2 | 100% | 100% |
| Meter correct | 100% | 100% |
| Beat vs fill | 93% | 93% |
| Drum output identical to DrumPath | 100% of files | — |

**Lakh smoke run** (engine over all 17,256 clean_midi files, numbers only; 125 s, median 5.7 ms per file):

| | |
|---|---|
| Analysed | 17,189 (99.6%) |
| Failed | 67: timing implies > 20 min of music 44 · not MIDI 13 · no notes 9 · SMPTE timing 1 |
| With a usable drum part | 15,661 (91.1%): channel 10 15,634 · track name 27 |
| Meter | 4/4 15,979 · 3/4 311 · 2/4 222 · 6/8 179 · 12/8 178 · other 120; meter changes in 1,903 |
| Feel | straight 9,926 · shuffle 4,203 · half-time 1,009 · light swing 277 · triplet 246 |
| BPM (p10 / median / p90) | 73 / 115 / 150 |
| Length (p10 / median / p90) | 143 / 226 / 319 s |
| Warnings | stray notes ignored 1,938 · no drum track 1,379 · no time signature 740 · damaged tracks kept partly 54 |
