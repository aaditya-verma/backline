# Backline

Song engine + standalone jam app built on the Lakh MIDI Dataset. Search a song, see its form, chords and drum grooves, and play a synthesised backing track (drums, bass, chord pad) with loop, tempo and transpose.

Live: https://aaditya-verma.github.io/backline/ · Status: **B0** (repo, Pages, pipeline probe). Nothing built yet.

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

## Probe results (B0)
_Pending._
