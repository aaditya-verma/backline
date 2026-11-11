# Backline

Song engine + standalone jam app built on the Lakh MIDI Dataset. Search a song, see its form, chords and drum grooves, and play a synthesised backing track (drums, bass, chord pad) with loop, tempo and transpose.

Live: https://aaditya-verma.github.io/backline/ · Status: **B2 built** (engine 0.2.0: chords, key, Roman numerals, named form, guitar difficulty, quality). Chord hand-check on 15 known songs pending. Next: B3 song index.

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
| Meter | 4/4 15,979 · 3/4 311 · 2/4 222 · 6/8 179 · 12/8 178 · 6/4 59 · 2/2 55 · 1/4 34 · other 172; meter changes in 1,903 |
| Feel | straight 9,926 · shuffle 4,203 · half-time 1,009 · light swing 277 · triplet 246 |
| BPM (p10 / median / p90) | 73 / 115 / 150 |
| Length (p10 / median / p90) | 143 / 226 / 319 s |
| Warnings | stray notes ignored 1,938 · no drum track 1,379 · no time signature 740 · damaged tracks kept partly 54 |

## Engine checks (B2, 11 Nov 2026 — engine 0.2.0)
**What B2 adds:** a chord every half-bar (every bar in 3/4, 5/4, 7/8) from 10 templates (major, minor, 7, maj7, m7, sus2, sus4, dim, aug, power chord) plus slash bass; the key (key-signature event when it fits the notes, otherwise Krumhansl–Kessler profiles, with the tonic chord settling major vs relative minor); Roman numerals; a named form (Intro, Verse?, Chorus?, Pre-chorus?, Bridge?, Outro, Break); a guitar difficulty with a capo hint (heuristic); and a quality grade. Every guessed field is marked (`?` on names, `chords.guessed`, `guitar.heuristic`).

**Unit tests:** 41 / 41 pass (16 new for B2, all on generated files with known answers). **Groove calibration:** still identical to DrumPath on all 1,150 files.

**Lakh run** (all 17,256 clean_midi files, numbers only; median 7.5 ms per file):

| | |
|---|---|
| Key found | 17,179 songs (99.9% of analysed): major 11,978 · minor 5,201 |
| Key from | profile 13,836 · key-signature event 3,343 |
| Commonest keys | C 2,086 · G 1,820 · D 1,486 · A 1,389 · E 1,172 · F 1,122 · Em 991 · Am 917 |
| Chord template fit (p10 / median / p90) | 0.8 / 0.9 / 0.9 |
| Half-bars with a chord (p10 / median) | 80% / 100% |
| Quality grade | A 15,302 · B 348 · C 1,539 |
| Sections per song (p10 / median / p90) | 8 / 12 / 22; 80% of bars sit in repeated sections (median) |
| Section names | Chorus? 72,857 · Verse? 58,299 · Bridge? 13,312 · Pre-chorus? 11,768 · Outro 7,893 · Break 7,460 · Intro 7,239 · letter only 60,964 |
| Capo hint given | 7,832 songs |

**Still to check:** chords right in ≥ 80% of bars and key right in ≥ 90% of songs on the owner's 15-song hand-check list; section names against the owner's 20-song spot-check (B3). The grade spread (89% A) is generous and will be tightened in B3 once versions of the same song can be compared.
