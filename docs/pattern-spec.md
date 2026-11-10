> **Copy** of DrumPath's `build/pattern-spec.md` (Drums project), taken **11 Nov 2026**. Backline uses §1–2 (lanes, characters) and the `sub` / `steps` / `bars` / `swing` fields of §3. The Drums project copy is the source of truth: propose changes there first (RULES C2), then re-copy.

# Lesson-data format: pattern spec (source of truth)

All lesson data follows this spec (Rule C2). Briefs refer to it. If code and spec disagree, fix the code, or change the spec first and log a decision.

## 1. Lanes
| Lane | Pad | Articulations |
|---|---|---|
| `K` | Kick | — |
| `S` | Snare | `head` (default), `rim` |
| `HH` | Hi-hat (stick) | `closed` (default), `open` |
| `HP` | Hi-hat pedal (foot chick) | — |
| `T1` `T2` `T3` | Toms high → low | — |
| `C` | Crash | — |
| `R` | Ride | — |

## 2. Pattern characters (one per step)
| Char | Meaning | Scoring |
|---|---|---|
| `.` | rest | — |
| `x` | normal hit | timing |
| `X` | accent | timing + velocity ≥ max(b×1.2, b+10) |
| `g` | ghost | timing + velocity ≤ b×0.6 |
| `o` | open hi-hat (HH only) | timing + articulation `open` |
| `r` | rim / cross-stick (S only) | timing + articulation `rim` |
| `f` | flam: 1 grace in the other hand at −30 ms | main timing + grace present and ≤ main×0.8 |
| `d` | drag: 2 graces in the other hand at −60 / −30 ms | as `f`, two graces |

`b` = per-lane, per-run baseline: the median velocity of `x` hits; if there are none, the midpoint of the `X` and `g` medians.
On `HH`, `x/X/g` require `closed`. On `S`, `x/X/g/f/d` require `head`.
Graces are matched 12–90 ms before the main note on the same lane. A flat flam is < 12 ms.

**Hit matching.** A hit is matched to the nearest unplayed note on the same lane within the match window (Settings, default ±120 ms). **From Level 4 (D-023)** each note's window is also capped at half the gap to its lane neighbour (minimum 20 ms), so fast passages (16ths at 140, 32nd rolls) can't be scored against the wrong note. Levels 0–3 keep the plain window.

## 3. Exercise fields
Constructor: `X(name, sub, lanes, opts)`.

| Field | Default | Meaning |
|---|---|---|
| `sub` | — | steps per beat (1 = quarters, 2 = 8ths, 3 = 8th triplets, 4 = 16ths, 6 = 16th triplets, 8 = 32nds) |
| `lanes` | — | `{K:'x...', S:'..x.', …}`, one string per lane |
| `bars` | 1 | bars in the pattern; each lane string = `steps × bars` chars |
| `steps` | `4*sub` | steps per bar (meter) |
| `clicks` | every `sub` steps | step indexes that click; the first is accented |
| `click` | `'all'` | `'all'` · `'24'` (beats 2 & 4) · `'1'` (beat 1); the count-in always clicks every beat |
| `swing` | 0.5 | 0.5 straight … 0.67 triplet feel; delays odd steps by `(swing−0.5)×2×stepMs` |
| `st` | — | sticking string (`R`, `L`, `.`); same length as the pattern; for `f`/`d` this is the **main** hand |
| `dyn` | off | `true` = score dynamics; `'even'` = doubles evenness (\|v2−v1\|/v1 ≤ 0.2) |
| `graceMode` | `'strict'` | `'lenient'` = score the main note only (kit can't detect graces) |
| `meter` | — | *(Level 4)* text shown on the practice screen, e.g. `'3/4'`, `'6/8'`, `'12/8'`, `'6/8 → 3/4'` |
| `labels` | — | *(Level 4)* one label per bar (length = `bars`), shown after the bar counter, e.g. chord names of a 12-bar blues |
| `withFill` | — | beat + fill cycle helper |

Lesson-level: `id` (`L.S.NN`, permanent), `t` (name), `bpm:[start, goal]`, `step` (+5), `type` (`'play'` default · `'info'` with `check:[…]`/`quiz` · `'song'`), `call` (the app plays every other repeat first, then you copy it), **`routine:{min:10}`** *(Level 4)*: adds "Start 10-min routine" — the lesson's exercises play one after another with a 4-second break until the timer runs out; every run is scored and saved by the normal rules.

## 4. Meter cheat-sheet
| Meter | sub | steps | clicks | BPM counts |
|---|---|---|---|---|
| 4/4 | 2 | 8 | [0,2,4,6] | quarter note |
| 3/4 | 2 | 6 | [0,2,4] | quarter note |
| 6/8 | 3 | 6 | [0,3] | **dotted quarter** (2 per bar) |
| 12/8 | 3 | 12 | [0,3,6,9] | **dotted quarter** (4 per bar) |
| 6/8 at 8th speed of 3/4 (e.g. 4.1.04) | 2 | 6 | [0,3] | quarter note (so both meters share 8th-note speed) |
| 5/4 | 2 | 10 | every 2 | quarter note |
| 7/8 (2+2+3) | 2 | 7 | [0,2,4] | quarter note |

The engine's rule: one beat = `sub` steps, `stepMs = 60000 / bpm / sub`. So with `sub` 3 in 6/8 or 12/8 the BPM is the dotted-quarter pulse, matching the curriculum (6/8 rock 50 → 80) and the song catalog ("6/8 (dotted-quarter pulse)"). *(Corrected 11 Nov 2026, D-023: this section used to say the tempo is always the quarter note.)*

## 5. Validity checks (run in test mode)
- Every lane string length = `steps × bars`. `st` length = pattern length. `labels` length = `bars`.
- `o` only on HH, `r` only on S. `f`/`d` need an `st` letter at that step.
- A perfect simulated run scores 100% in every column. A wrong velocity or articulation fails the right column.
- With no new fields, the exercise behaves exactly as before (Rule C1).

## 6. Example
```js
X('Hi-hat openings 1', 2,
  {HH:'xxxxxxxo', HP:'x.......', K:'x...x...', S:'..x...x.'},
  {})
X('Five-stroke roll', 4,
  {S:'xxxxX...xxxxX...'},
  {st:'RRLLR...LLRRL...', dyn:true})
X('6/8 rock', 3,
  {HH:'xxxxxx', K:'x.....', S:'...x..'},
  {steps:6, meter:'6/8'})
```
