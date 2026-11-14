# Backline

Song engine + standalone jam app built on the Lakh MIDI Dataset. Search a song, see its form, chords and drum grooves, and play a synthesised backing track (drums, bass, chord pad) with loop, tempo and transpose.

Live: https://aaditya-verma.github.io/backline/ · Status: **B5 built**: jam mode, setlists with share links, and your own MIDI files, on top of B4 (search, song sheet, backing-track player, offline). Design and navigation now follow DrumPath (owner request, 14 Nov 2026). B3 song index: 10,226 songs in `data/v1` on the `data` branch. Next: B7 hand-over to DrumPath (B6 is optional).

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

**Hand-check (12 Nov 2026):** 15 songs in `tools/check-songs.txt` (owner + guitarist friend, plus answers from free chord sites the owner OK'd), run by `songs.yml` on every engine change. Key: 51 / 58 Lakh versions (88%), and the majority of versions is right for every scored song (the misses are transposed fan files). Chorus starting on the right chord: 7 / 22 versions (32%), so section names stay marked `?` and get version consensus in B3. Gravity and Slow Dancing in a Burning Room are not in clean_midi.

**Unit tests:** 48 / 48 pass (23 for B2, all on generated files with known answers). **Groove calibration:** still identical to DrumPath on all 1,150 files.

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
| Capo hint given | 5,997 songs (35%; only when ≥ 35% of chords would need a barre) |
| Guitar level (p10 / median / p90) | 5 / 7 / 10 (heuristic; fan files use many passing chords, so it reads high) |

**Still to check:** chords right in ≥ 80% of bars and key right in ≥ 90% of songs on the owner's 15-song hand-check list; section names against the owner's 20-song spot-check (B3). The grade spread (89% A) is generous and will be tightened in B3 once versions of the same song can be compared.

## App (B4)
`index.html` + `app/` (plain ES modules, no build step) + `sw.js`.
- **Search** the index by title or artist; filters for BPM, key, meter, feel, quality (A+B by default), drum and guitar level; favourites and recent songs.
- **Song sheet**: key, BPM (≈ when versions disagree), meter, feel, quality, difficulty; version info; form strip (tap = jump and loop); chord chart in rows of 4 bars, chord names or Roman numerals, transpose ±6 with a capo hint; drum grooves and fills as lane grids; Guitar / Drums / Both views.
- **Player** (Web Audio, all synthesised): drums from each section's groove and fill, bass on the chord roots, a chord pad, click; mute each part; tempo 50–120%; loop a section; count-in; the current bar is highlighted.
- **Offline**: the service worker keeps the app, the song list and every song you've opened.
- **Deep links**: `#song=<id>&sec=B&tempo=80&transpose=-2`.

**Checks:** `node test/ui/smoke.mjs <url>` (search → sheet → transpose → loop → play → deep link → credits, no page errors) and `node test/ui/layout.mjs <url>` (4 screens × 8 sizes × 100/125% text: nothing wider than the screen, nothing spilling, the player never covers the page end). Both need Playwright + Chrome (`PW`, `CHROME` env vars point at them). 12 Nov 2026: all pass, 0 layout problems.

## B5 additions
- **Jam mode** (song sheet → Jam mode): full screen, landscape where the phone allows; the current chord large, the next chord beside it, section name, bar and beat counter; tempo ±5%; the screen stays awake (Wake Lock).
- **Setlists**: + Setlist on a song saves it with its tempo and transpose; reorder, remove, rename, Start → each song opens at its own settings with ‹ Prev / Next ›. **Share link**: `#set=<base64url(JSON {n, s:[[id, tempo, transpose]]})>`; the other phone previews it and saves it. Kept in the browser (localStorage); nothing is uploaded.
- **Open my MIDI file**: analysed on the device with the same engine (0.2.1 adds `grid`, the bar → file position map); the file and its analysis are kept in this browser's IndexedDB and never uploaded. The song sheet lists the file's parts; **Playing the file** plays every part (melody and vocal line included) with simple synth sounds, each part can be muted; **Playing the backing** switches to the generated drums, bass and chords.
- **Checks:** `node test/ui/b5.mjs <url> "<Artist - Title.mid>"` (own file → parts → plays the file → mute a part; setlist → reorder → Prev/Next with saved tempo → share link saved on a second phone; jam mode → beats move → closes). 14 Nov 2026: 17/17 pass, smoke 12/12, layout 0 problems on 7 screens × 8 sizes × 2 text sizes.

## Design and navigation (from DrumPath, 14 Nov 2026)
`app/shell.js` and `app/app.css` take DrumPath's `src/js/05-shell.js` and `src/css/app.css`: the same tokens (soft grey levels, light + dark + theme button), frosted header with a status chip, a tab row on wide screens, a floating bottom bar (Home · Search · Browse · Setlists · More) with a More sheet on phones, the floating dock with **Back** (a back stack that names where it goes and restores the exact screen and scroll), bottom sheets, lists, cards and tappable stat cards. Backline keeps its own amber accent; drum lanes use DrumPath's pad colours.
- **Drill-downs:** Browse › Key / Tempo / Meter / Feel / Drum level / Guitar level / Artist › value › songs, with crumbs; every fact on a song page (key, BPM, meter, feel, difficulty) opens the songs that share it; the artist name and crumbs open the artist page; a bar opens a sheet with its chords, Roman numerals and drum pattern, plus Play from here / Loop this bar / Loop the section; “Version 1 of 9” opens the versions table.
- **Settings:** theme, default quality filter, offline songs and storage.
- **Checks:** `node test/ui/nav.mjs <url>` (bottom bar vs tabs, More sheet, theme, Browse drill-down, Back restores list + scroll, tappable facts, bar sheet, crumbs): 15/15. Layout: 0 problems on 11 screens × 8 sizes × 2 text sizes.

