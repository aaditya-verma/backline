// Backline — Find MIDI (B8): search links to free MIDI sites with the title and artist filled in (brief §11.6).
// Backline never downloads, fetches or re-hosts anything from these sites: the links open in a new tab, the person
// downloads the file there, and opens it in Backline, where the engine grades it on the device (own.js).

const enc = encodeURIComponent;
const q = (t, a) => [a, t].filter(Boolean).join(' ').trim();
const web = (site, t, a) => `https://duckduckgo.com/?q=${enc(`site:${site} ${q(t, a)} midi`)}`;

/** Free sources, best first for pop and rock. `how` says whether the link uses the site's own search or a web search
 *  limited to the site (for sites whose search address could not be checked, B8 survey 15 Nov 2026). */
export const SOURCES = [
  { id: 'bitmidi', name: 'BitMidi', size: 'about 113,000 files', what: 'The largest free archive: pop, rock, film, games',
    how: 'site search', url: (t, a) => `https://bitmidi.com/search?q=${enc(q(t, a))}` },
  { id: 'freemidi', name: 'FreeMidi.org', size: 'about 70,000 files', what: 'Pop, rock, hip-hop, metal, by artist',
    how: 'web search', url: (t, a) => web('freemidi.org', t, a) },
  { id: 'midiworld', name: 'MIDIWorld', size: 'about 25,000 files', what: 'Pop, rock, TV and film themes',
    how: 'web search', url: (t, a) => web('midiworld.com', t, a) },
  { id: 'vgmusic', name: 'VGMusic', size: 'video-game music', what: 'Game soundtracks only',
    how: 'web search', url: (t, a) => web('vgmusic.com', t, a) },
  { id: 'mutopia', name: 'Mutopia', size: 'about 2,100 pieces', what: 'Classical, public domain (title or composer)',
    how: 'site search', url: (t, a) => `https://www.mutopiaproject.org/cgibin/make-table.cgi?searchingfor=${enc(q(t, a))}` },
  { id: 'web', name: 'The whole web', size: 'any site', what: 'Everything else (fan sites, forums)',
    how: 'web search', url: (t, a) => `https://duckduckgo.com/?q=${enc(`"${t}" ${a} midi file`.trim())}` },
];

/** Ways to make a file when none can be found (all free). */
export const MAKE = [
  { name: 'MuseScore Studio', what: 'Write the parts as notation, then File › Export › MIDI', url: 'https://musescore.org/' },
  { name: 'TuxGuitar', what: 'Tab editor; opens Guitar Pro tabs and exports MIDI', url: 'https://www.tuxguitar.app/' },
];

/** Plain-words verdict on an imported file from the engine's quality parts (scoreQuality in the engine). */
export function verdict(A) {
  const p = (A.quality && A.quality.parts) || {}, g = A.quality.grade, rows = [];
  const add = (v, good, part, bad) => rows.push({ s: v >= 0.9 ? 'ok' : v >= 0.5 ? 'part' : 'no', t: v >= 0.9 ? good : v >= 0.5 ? part : bad });
  add(p.drumTrack ?? 0, 'Has a drum part', 'Has a drum part', 'No drum part: Backline plays its own simple beat');
  if (p.drumTrack) {
    add(p.drumNotes ?? 0, 'Plenty of drum notes', 'Thin drum part', 'Very few drum notes');
    add(p.mapped ?? 0, 'Drum sounds are standard kit pieces', 'Some drum sounds are unusual', 'Most drum sounds are unusual (not a standard kit)');
    add(p.onGrid ?? 0, 'Notes sit on the beat', 'Some notes are off the beat grid', 'Timing is loose: probably played in live');
  }
  add(p.chordFit ?? 0, 'Chords read clearly', 'Chords are partly unclear', 'Chords are hard to read: check them by ear');
  add(p.length ?? 0, 'Full-length song', 'Unusual length', 'Very short or very long: may be a snippet or a medley');
  const advice = g === 'A' ? 'Good file: practise from it.'
    : g === 'B' ? 'Usable. Check the chords by ear, or try another file from the same site.'
      : 'Weak file. Try another version: most songs have several on these sites.';
  return { grade: g, score: A.quality.score, rows, advice };
}
