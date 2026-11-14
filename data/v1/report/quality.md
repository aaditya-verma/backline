# Backline song index — quality report

Engine 0.2.1 · 17256 clean_midi files + 37673 LMD-matched · 54817 analysed · 112 rejected · 25396 songs (artist + title) · 33 dropped (no drums and no confident chords) · **25363 in the index** · 808 s

## B6: LMD-matched + Million Song Dataset

- Matched MIDI files not already in clean_midi: 37673 (4734 joined an existing song as extra versions, 15162 songs are new)
- Songs in the index from clean_midi: 10226; new from LMD-matched: 15137
- With a year: 10821; with a genre: 22830 (from the track: 19501, from the artist: 3329)
- Genres: Rock 7248 · Pop 5142 · Electronic 2416 · Classical 1041 · Jazz 1006 · Metal 994 · Funk & Disco 816 · Soul & R&B 805 · Blues 745 · Hip hop 725 · Country 672 · Latin 414 · Folk 401 · Reggae 257 · Punk 148

## Grades (primary version)

- A: 21175
- B: 872
- C: 3316

## Versions

- Songs with 2+ versions: 10291; all versions agree on the key: 6972 (68%)
- BPM sure (2+ versions within ±2 BPM): 8512
- Primary file transposed from the consensus key: 0

## Rejected files

- too-long: 84
- no-notes: 14
- not-midi: 13
- smpte: 1

## Owner's hand-check songs: consensus key

7 / 9 right (songs not in the index are listed but not counted)

| Song | Answer | Consensus (versions agreeing) | |
|---|---|---|---|
| Creedence Clearwater Revival — Down on the Corner | C major | C major (6/7) | ✓ |
| Eagles — Hotel California | B minor | B minor (13/16) | ✓ |
| Guns N' Roses — Patience | G major | G major (3/3) | ✓ |
| The Doors — Roadhouse Blues | E major | E major (5/5) | ✓ |
| Led Zeppelin — Stairway to Heaven | A minor | A minor (28/28) | ✓ |
| The Doors — Riders on the Storm | E minor | C major (6/14) | ✗ |
| AC/DC — Highway to Hell | A major | A major (3/3) | ✓ |
| John Mayer — Gravity | G major | not in index () | ✗ |
| John Mayer — Slow Dancing in a Burning Room | C# minor | not in index () | ✗ |
| Guns N' Roses — Sweet Child O' Mine | D major | F# major (4/7) | ✗ |
| The Beatles — Hey Jude | F major | F major (10/11) | ✓ |

## Random sample for a spot-check (fixed seed)

| Song | Key | BPM | Meter | Grade | Form |
|---|---|---|---|---|---|
| Steely Dan — With A Gun | A minor | 170 ≈ | 4/4 | A | Break · Verse? · C · Verse? · Chorus? · Verse? · E · Verse? · E · Verse? · E · Bridge? · G |
| Sheena Easton — U Got the Look | B major | 120 ≈ | 4/4 | A | Intro · Verse? · Bridge? · D · Verse? · E · Verse? · F · Outro |
| Los Delinqüentes — Arena En Los Zapatos | C# minor | 130 ≈ | 4/4 | A | Verse? · B · Verse? |
| Lee Ann Womack / Sons Of The Desert — I Hope You Dance (with Sons Of The Desert) | Bb major | 72 ≈ | 4/4 | A | Intro · B · Bridge? · D · Break |
| INXS — Need You Tonight | C minor | 120 ≈ | 4/4 | A | Intro · B · Bridge? · D · E · Outro |
| Dave Matthews Band — Pantala Naga Pampa | D major | 120 ≈ | 4/4 | B | Intro · B · Bridge? · D · E · Outro |
| Sheryl Crow — Hard To Make A Stand | C major | 101.9 ≈ | 4/4 | A | Break · B · Verse? · D · E · Bridge? · Verse? · Outro |
| Nocturnal Rites — The King's Command | E minor | 200 ≈ | 4/4 | A | Verse? · B · C · Verse? · D · Verse? · E · Verse? · Chorus? · Verse? · Chorus? · G · Verse |
| Frans Bauer — De Liefdestango | C major | 121 ≈ | 4/4 | A | A · Verse? · Chorus? · D · Verse? · Chorus? · A · Verse? · Chorus? · D · Verse? · Chorus?  |
| Swingin' Medallions — Double Shot (Of My Baby's Love) | F major | 127 ≈ | 4/4 | A | Verse? · Chorus? · Verse? · Chorus? · Verse? · Bridge? · Outro |
| Meat Puppets — Lost | A major | 115 | 4/4 | A | Intro · Verse? · C · Verse? · C · Chorus? · Verse? · E · Verse? · Chorus? · Verse? · E · V |
| Merle Haggard — Love Me Tender | D major | 76 | 4/4 | C | Verse? · Chorus? · Verse? · Chorus? · Verse? · Chorus? · Verse? · Bridge? · Break |
| Blue Rodeo — Flying | E major | 135 ≈ | 4/4 | A | Intro · Verse? · Chorus? · Verse? · Bridge? · E · Chorus? · Verse? · F · Break |
| They Might Be Giants — Turn Around | A major | 140 ≈ | 4/4 | A | Break · Verse? · Chorus? · D · Verse? · E · Verse? · Chorus? · D · Verse? · E · Verse? · C |
| Vaughn — Isle of Capri | F major | 106 ≈ | 4/4 | A | Intro · Verse? · Chorus? · Verse? · Chorus? · Verse? · Bridge? · E · Break |
| Elvis Presley — Follow That Dream | F major | 126 ≈ | 4/4 | A | Break · Chorus? · Verse? · Chorus? · D · Chorus? · Verse? · Chorus? · D |
| Bach Johann Sebastian — Aria From the Goldberg Variations, BWV 988 | G major | 120 ≈ | 4/4 | C | Verse? · Chorus? · Verse? · C · Verse? · Bridge? · Verse? · E · F · G · Chorus? · F · Vers |
| Tom Jones — I Who Have Nothing | E minor | 139 ≈ | 4/4 | A | Intro · Chorus? · Verse? · Chorus? · Verse? · D · E · Chorus? · Verse? · E · Bridge? · Cho |
| Paul McCartney — Bluebird | B minor | 88 ≈ | 4/4 | A | Intro · B · Verse? · Chorus? · E · Verse? · Chorus? · E · Verse? · Chorus? · E · Verse? ·  |
| David Gilmour — High Hopes | C minor | 77 ≈ | 4/4 | A | Verse? · B · Verse? · Chorus? · Verse? · B · D · E · Bridge? · G · Verse? · Chorus? |
