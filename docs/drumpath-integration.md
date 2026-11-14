# Backline → DrumPath integration note (B7)

**For:** the DrumPath build chat. **From:** the Backline build chat, 14 Nov 2026. **Brief:** `build/backline-engine-brief.md` §5–6 in the Drums project.
**Rule of thumb:** DrumPath keeps working if Backline is down; everything below is an extra route, never a dependency.

## 1. What Backline gives you

| Piece | Where | Version | Notes |
|---|---|---|---|
| Engine (plain script) | `engine/dist/backline-engine.0.2.1.js` in `aaditya-verma/backline` | 0.2.1 | `window.Backline` (also ES module `engine/backline.js`). Drum part = DrumPath `midi-analyse.js` 1.1 moved over; output identical on all 1,150 Groove files. 0.2.1 only adds `grid` to the output. |
| Index client (plain script) | `client/backline-index.js` | 0.1.0 | `window.BacklineIndex`: `manifest()`, `search(q)`, `song(id)`, `toDrumPath(song, MidiAnalyse, lessons)`, `link(id, opts)`. |
| Song index | `https://aaditya-verma.github.io/backline/data/v1/` | v1 | Same origin as DrumPath (`aaditya-verma.github.io`), so no CORS. |
| Deep links | `https://aaditya-verma.github.io/backline/#song=<id>&sec=B&tempo=80&transpose=-2` | — | Opens the song sheet with that section looped, tempo % and transpose. |
| Stem mixer module | `engine/dist/backline-mixer.<ver>.js` | after B9 | Not built yet (see §3 item 7). |

Pin copies: `vendor/backline-engine.0.2.1.js` and `vendor/backline-index.0.1.0.js` in the DrumPath repo, like the lesson files. Never load them live from Backline.

## 2. Data contract (v1)

- `manifest.json`: `{schema:1, engine, built, builtOn, counts:{files, cleanFiles, matchedFiles, analysed, rejected, songs, dropped}, search:[files], source, citation}`.
- Search rows (`manifest.search` lists one or more files): `[id, title, artist, bpm, key, meter, feel, quality, drumsLvl, gtrLvl, year, genre]`. `key` is like `Bm`. `year` and `genre` arrived in B6 and can be `null`.
- Song file `songs/<first 2 chars of id>/<id>.json`:
  - `id, title, artist, engine, source` (`clean_midi` or `lmd_matched`)
  - `consensus: {bpm, bpmSure, meter, key, mode, keyAgree, keyVotes, year, genre, genreFrom, terms}`: across all versions of the song (BPM folded for double/half-speed files; `bpmSure` = 2+ versions within ±2 BPM).
  - `primary` (1-based), `transpose` (semitones from the primary file to the consensus key), `versions:[{v, grade, score, bpm, meter, key, mode, bars, drums, chords, src, year}]`
  - `analysis`: the primary file's full `SongAnalysis`: `bpm, meter, bars, feel, swing, key, mode, form:[{sec, name, bars}], sections:{A:{name, count, chords, roman, groove, fill, bars}}, chords:{perBar, roman, …}, drums:{features, patterns, sections, confidence}, difficulty:{drums, guitar}, quality:{score, grade}, warnings`.
  - `analysis.drums` has **the same shape as `MidiAnalyse.analyse()`'s `features`, `patterns`, `sections` and `confidence`**. Grooves and fills are in pattern-spec form (`{sub, bars, v:{K:'x...', …}}`).
- **Ids are permanent** (RULES A2). v1 fields are only ever added; a breaking change ships as `v2`, with `v1` kept 90+ days.
- **Credit** wherever the data shows: Lakh MIDI Dataset v0.1, Colin Raffel, CC BY 4.0, https://colinraffel.com/projects/lmd/ (also his 2016 thesis). The files are fan transcriptions; show the quality grade.

## 3. Wiring tasks for DrumPath (brief §6)

1. **Vendor the engine.** `midi-analyse.js` can keep its own code or call `Backline.analyse(bytes).drums`. If it switches, re-run the Groove calibration: BPM 100%, meter 100%, beat/fill 93% must not drop, and the Analyse & tag tests must pass.
2. **Analyse & tag › new first route "From the song index".**
   ```js
   const hits = await BacklineIndex.search(title + ' ' + artist);            // pick one (show title, artist, key, BPM, grade, year)
   const song = await BacklineIndex.song(hits[0].id);
   const a = BacklineIndex.toDrumPath(song, MidiAnalyse, LESSONS.filter(l => l.ex));
   reviewSheet(s.id, fromAnalysis(a, 'midi', { source: 'Lakh MIDI (Backline, quality ' + song.analysis.quality.grade + ')', backlineId: song.id }));
   ```
   `toDrumPath` runs DrumPath's own `ruleTags` + `simTags` on the index's features and main groove, so tags come from the same rule table as a local MIDI file. Tested in Backline against DrumPath's real `midi-analyse.js` 1.1 (`test/client.test.mjs`). Songs with no drum part throw `no drum part`: say so in the sheet.
3. **Catalog enrichment.** Add a reviewed map `lessons/lakh-map.js` (catalog song id → Backline id). Set `bpmSure` from `consensus.bpmSure`, and take the sections from `analysis.form`. Readiness rules don't change.
4. **Practise this groove.** `analysis.sections[L].groove` / `.fill` are ready-to-play patterns (pattern spec §1–2) for a song's verse/chorus.
5. **"Open in Backline ↗"** on DrumPath song pages: `BacklineIndex.link(backlineId, {tempo, transpose})`.
6. **DrumPath on claude.ai (D-021):** check whether the artifact page can `fetch()` `https://aaditya-verma.github.io/backline/data/v1/manifest.json`. If it can, Studio looks the song up in the index before asking Claude. If not, leave the route out there. *(Open question since the song-intelligence brief; Backline can't test it from its side.)*
7. **Stem mixer in the practice screen (D-026):** after Backline B9 ships `backline-mixer.<ver>.js`. Nothing to do yet.

## 4. Checks for the DrumPath chat

- Hotel California (`eagles--hotel-california`) through `toDrumPath`: bpm 74 (sure), 4/4, support tags `2.4.05 2.4.06 3.2.05 3.4.06 3.6.01`, level 3 (14 Nov 2026, against `midi-analyse.js` 1.1).
- The From-the-song-index route works offline once a song has been opened (cache the song JSON with the rest of the song's data).
- Credits screen lists the Lakh line.
