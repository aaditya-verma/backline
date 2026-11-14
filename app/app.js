// Backline app. Navigation, design and drill-downs follow DrumPath (shell.js): Home · Search · Browse · Setlists · More
// (My files, Settings, Credits); every number on a song page is tappable and opens the songs that share it; Back returns
// to the exact screen. Views: search → song sheet (form, chords, drums) → player (B4); jam mode, setlists and share
// links, own MIDI files (B5). No build step, no libraries.
import { transposeChord, chordHTML, flatKey, pcOf, keyLabel, capoHint } from './music.js';
import { Player } from './player.js';
import * as Sets from './sets.js';
import { listOwn, getOwn, deleteOwn, importFile, asSong, fileNotes } from './own.js';
import { $, esc, icon, buildShell, noteView, beforeRoute, restoreScroll, openSheet, closeSheets, toast, confirmInline, setTheme, themeMode } from './shell.js';

const DATA = 'data/v1/';
const norm = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const grade = q => q >= 80 ? 'A' : q >= 60 ? 'B' : 'C';
const SEC_COL = s => `var(--s${(s.charCodeAt(0) - 65) % 8})`;
const LANES = ['C', 'R', 'HH', 'HP', 'T1', 'T2', 'T3', 'S', 'K'];
const fmtKey = k => k ? k.replace('#', '♯').replace(/^([A-G])b/, '$1♭') : '—';
const store = {
  get(k, d) { try { const v = localStorage.getItem('bl.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('bl.' + k, JSON.stringify(v)); } catch (e) { /* private mode: keep going */ } },
};
const main = () => $('#view');

// ---------- data ----------
let INDEX = null, BYID = null;
async function loadIndex() {
  if (INDEX) return INDEX;
  const man = await (await fetch(DATA + 'manifest.json')).json();
  const parts = await Promise.all(man.search.map(f => fetch(DATA + f).then(r => r.json())));
  INDEX = parts.flat().map(r => ({ id: r[0], title: r[1], artist: r[2], bpm: r[3], key: r[4], meter: r[5], feel: r[6], q: r[7], dl: r[8], gl: r[9], yr: r[10] ?? null, ge: r[11] ?? null, n: norm(r[1] + ' ' + r[2]), an: norm(r[2]) }));
  BYID = new Map(INDEX.map(s => [s.id, s])); INDEX.manifest = man; return INDEX;
}
async function loadSong(id) { const r = await fetch(`${DATA}songs/${id.slice(0, 2)}/${id}.json`); if (!r.ok) throw new Error('not found'); return r.json(); }

// ---------- routing ----------
// '' home · #search · #browse[=facet[&v=value]] · #artist=<name> · #song=<id>[&sec&tempo&transpose][&list=<set>&i=<n>]
// #own=<id> · #files · #sets · #list=<id> · #set=<shared code> · #settings · #credits
let FROM = null;
function route() {
  beforeRoute(); if (JAM) closeJam(); closeSheets();
  const h = new URLSearchParams(location.hash.slice(1)), raw = location.hash.slice(1);
  FROM = h.get('list') && h.has('i') ? { set: h.get('list'), i: +h.get('i') } : null;
  const opt = { sec: h.get('sec'), tempo: +h.get('tempo') || null, transpose: h.has('transpose') ? +h.get('transpose') : null };
  const onSong = !!(h.get('song') || h.get('own'));
  document.body.classList.toggle('onsong', onSong); if (!onSong) { player.stop(); setPlayer(false); }
  if (h.get('song')) return showSong(h.get('song'), opt);
  if (h.get('own')) return showOwn(h.get('own'), opt);
  if (h.get('set')) return showShared(h.get('set'));
  if (h.get('list')) return showSet(h.get('list'));
  if (h.has('artist')) return showArtist(h.get('artist'));
  if (raw.startsWith('browse')) return showBrowse(h.get('browse') || '', h.get('v'));
  const v = { search: showSearch, sets: showSets, files: showFiles, settings: showSettings, credits: showCredits }[raw];
  (v || showHome)();
}
window.addEventListener('hashchange', route);
function done(section, label) { noteView(section, label); restoreScroll(); }

// ---------- shared bits ----------
function songRow(s, extra = '') {
  return `<a class="lrow" href="#song=${encodeURIComponent(s.id)}${extra}"><span class="t"><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></span>
    <span class="m">${fmtKey(s.key)} · ${s.bpm ? Math.round(s.bpm) : '?'}<br><span class="badge ${grade(s.q)}">${grade(s.q)}</span></span><span class="chev">${icon('chev', 18)}</span></a>`;
}
function ownRow(r) {
  const A = r.analysis; return `<a class="lrow" href="#own=${encodeURIComponent(r.id)}"><span class="t"><b>${esc(r.title)}</b><span>${esc(r.artist || r.file)}</span></span>
    <span class="m">${fmtKey(A.key && A.key + (A.mode === 'minor' ? 'm' : ''))} · ${Math.round(A.bpm)}<br><span class="badge ${A.quality.grade}">${A.quality.grade}</span></span><span class="chev">${icon('chev', 18)}</span></a>`;
}
const list = rows => `<div class="list">${rows.join('')}</div>`;
async function indexOrMessage() {
  try { return await loadIndex(); } catch (e) { main().innerHTML = `<div class="card"><b>Couldn't load the song list.</b><p class="mut">You're probably offline and haven't opened Backline online yet.</p></div>`; return null; }
}

// ---------- Home ----------
async function showHome() {
  main().innerHTML = '<div class="empty">Loading…</div>';
  const own = await listOwn(), sets = Sets.allSets(), idx = await indexOrMessage(); if (!idx || location.hash.slice(1)) return;
  const fav = store.get('favs', []).map(id => BYID.get(id)).filter(Boolean), rec = store.get('recent', []).map(id => BYID.get(id)).filter(Boolean);
  const stat = (k, v, d, href) => `<a class="card tap stat" href="${href}" style="text-decoration:none;color:inherit"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></a>`;
  main().innerHTML = `<div class="hero"><h1>Backline</h1><p class="line">Chords, form and drum grooves for <b>${idx.length.toLocaleString()} songs</b>, with a backing track to jam over.</p>
    <a class="card tap" href="#search" style="display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--muted)">${icon('search')}<span>Search a song or an artist</span></a></div>
    <div class="hero-stats" style="margin-top:12px">
      ${stat('Songs', idx.length.toLocaleString(), 'Browse by key, tempo, artist', '#browse')}
      ${stat('Favourites', fav.length, 'Tap ☆ on a song to add', '#search')}
      ${stat('Setlists', sets.length, sets.length ? sets.slice(0, 2).map(s => esc(s.name)).join(' · ') : 'Make one for a jam', '#sets')}
      ${stat('My files', own.length, 'Your own MIDI files', '#files')}
    </div>
    ${rec.length ? `<h2>Recent</h2>${list(rec.slice(0, 8).map(s => songRow(s)))}` : ''}
    ${fav.length ? `<h2>Favourites</h2>${list(fav.map(s => songRow(s)))}` : ''}
    <h2>Browse</h2><div class="tiles">${Object.entries(FACETS).map(([k, f]) => `<a class="tile" href="#browse=${k}"><b>${f.label}</b><span>${f.hint}</span></a>`).join('')}</div>
    ${!rec.length ? `<p class="sub" style="margin-top:16px">Lakh runs up to about 2015 and is mostly Western pop and rock. For anything else, open your own MIDI file from <a href="#files">My files</a>.</p>` : ''}`;
  done('home', 'Home');
}

// ---------- Search ----------
const F = { q: '', bmin: '', bmax: '', key: '', meter: '', feel: '', minq: 60, dmax: '', gmax: '', genre: '', ymin: '', ymax: '', open: false, ...store.get('filters', {}) };
function match(s) {
  if (s.q < (+F.minq || 0)) return false;
  if (F.bmin && s.bpm < +F.bmin) return false; if (F.bmax && s.bpm > +F.bmax) return false;
  if (F.key && s.key !== F.key) return false; if (F.meter && s.meter !== F.meter) return false; if (F.feel && s.feel !== F.feel) return false;
  if (F.dmax && (s.dl == null || s.dl > +F.dmax)) return false; if (F.gmax && (s.gl == null || s.gl > +F.gmax)) return false;
  if (F.genre && s.ge !== F.genre) return false; if (F.ymin && !(s.yr >= +F.ymin)) return false; if (F.ymax && !(s.yr <= +F.ymax)) return false;
  return true;
}
async function showSearch() {
  const sel = (id, k, opts) => `<select id="${id}"><option value="">Any</option>${opts.map(o => `<option ${String(F[k]) === String(o) ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
  main().innerHTML = `<h1>Search</h1><div class="card"><div class="searchbar"><input id="q" type="search" placeholder="Song or artist" autocomplete="off" value="${esc(F.q)}" aria-label="Search">
      <button id="ftoggle" class="${F.open ? 'on' : ''}" aria-expanded="${F.open}">Filters</button></div>
    <div class="filters" id="filters" ${F.open ? '' : 'hidden'}>
      <label>BPM<span class="pair"><input id="f_bmin" inputmode="numeric" placeholder="min" value="${esc(F.bmin)}"><input id="f_bmax" inputmode="numeric" placeholder="max" value="${esc(F.bmax)}"></span></label>
      <label>Key${sel('f_key', 'key', KEYS)}</label><label>Meter${sel('f_meter', 'meter', ['4/4', '3/4', '6/8', '12/8', '2/4', '5/4', '7/8'])}</label>
      <label>Feel${sel('f_feel', 'feel', ['straight', 'swing', 'light swing', 'shuffle'])}</label>
      <label>Quality<select id="f_minq"><option value="80" ${+F.minq === 80 ? 'selected' : ''}>A only</option><option value="60" ${+F.minq === 60 ? 'selected' : ''}>A and B</option><option value="0" ${+F.minq === 0 ? 'selected' : ''}>All (incl. C)</option></select></label>
      <label>Drums up to level${sel('f_dmax', 'dmax', [2, 4, 6, 8, 10])}</label><label>Guitar up to level${sel('f_gmax', 'gmax', [2, 4, 6, 8, 10])}</label>
      <label>Genre${sel('f_genre', 'genre', GENRES)}</label>
      <label>Year<span class="pair"><input id="f_ymin" inputmode="numeric" placeholder="from" value="${esc(F.ymin)}"><input id="f_ymax" inputmode="numeric" placeholder="to" value="${esc(F.ymax)}"></span></label>
    </div></div><div id="results"><div class="empty">Loading the song list…</div></div>`;
  let idx = null; const q = $('#q');
  $('#ftoggle').onclick = () => { F.open = !F.open; store.set('filters', F); $('#filters').hidden = !F.open; $('#ftoggle').classList.toggle('on', F.open); $('#ftoggle').setAttribute('aria-expanded', F.open); };
  const bind = (id, k) => { const el = $(id); el[el.tagName === 'SELECT' ? 'onchange' : 'oninput'] = () => { if (F[k] === el.value) return; F[k] = el.value; store.set('filters', F); render(); }; };
  [['#q', 'q'], ['#f_bmin', 'bmin'], ['#f_bmax', 'bmax'], ['#f_key', 'key'], ['#f_meter', 'meter'], ['#f_feel', 'feel'], ['#f_minq', 'minq'], ['#f_dmax', 'dmax'], ['#f_gmax', 'gmax'], ['#f_genre', 'genre'], ['#f_ymin', 'ymin'], ['#f_ymax', 'ymax']].forEach(a => bind(...a));
  done('search', 'Search');
  try { idx = await loadIndex(); } catch (e) { if ($('#results')) $('#results').innerHTML = `<div class="empty">Couldn't load the song list. You're probably offline and haven't opened Backline online yet.</div>`; return; }
  function render() {
    const words = norm(F.q).split(' ').filter(Boolean), out = $('#results'); if (!out || !idx) return;
    if (!words.length) { out.innerHTML = `<p class="sub" style="margin-top:12px">Type a title or an artist, or <a href="#browse">browse</a> by key, tempo or artist.</p>`; return; }
    const hits = [];
    for (const s of idx) { if (!words.every(w => s.n.includes(w)) || !match(s)) continue;
      const t = norm(s.title), score = (t === words.join(' ') ? 3 : 0) + (t.startsWith(words[0]) ? 2 : 0) + (s.n.startsWith(words[0]) ? 1 : 0) + s.q / 100;
      hits.push([score, s]); }
    hits.sort((a, b) => b[0] - a[0]);
    const hidden = idx.filter(s => words.every(w => s.n.includes(w))).length - hits.length;
    const artists = [...new Set(hits.map(h => h[1].artist))].filter(a => words.every(w => norm(a).includes(w))).slice(0, 4);
    out.innerHTML = (artists.length ? `<div class="chips" style="margin:12px 0 0">${artists.map(a => `<a class="chip tag" href="#artist=${encodeURIComponent(a)}" style="text-decoration:none">${esc(a)} ›</a>`).join('')}</div>` : '') +
      (hits.length ? `<h2>${hits.length > 60 ? 'Top 60 of ' + hits.length : hits.length} songs</h2>${hidden ? `<p class="sub">${hidden} hidden by filters</p>` : ''}${list(hits.slice(0, 60).map(h => songRow(h[1])))}`
        : `<div class="empty">No songs found${hidden ? ` (${hidden} hidden by filters: try Quality → All)` : ''}.</div>`);
  }
  render(); if (!matchMedia('(pointer:coarse)').matches) q.focus();
}

// ---------- Browse: facet → value → songs (drill-down with crumbs, like DrumPath's Level → Strand → Lesson) ----------
const KEYS = ['C', 'Cm', 'C#', 'C#m', 'Db', 'D', 'Dm', 'Eb', 'Ebm', 'E', 'Em', 'F', 'Fm', 'F#', 'F#m', 'G', 'Gm', 'Ab', 'G#m', 'A', 'Am', 'Bb', 'Bbm', 'B', 'Bm'];
const BANDS = [[0, 70, 'under 70'], [70, 90, '70–89'], [90, 110, '90–109'], [110, 130, '110–129'], [130, 150, '130–149'], [150, 999, '150 and up']];
const GENRES = ['Rock', 'Pop', 'Soul & R&B', 'Funk & Disco', 'Electronic', 'Hip hop', 'Metal', 'Punk', 'Blues', 'Jazz', 'Country', 'Folk', 'Reggae', 'Latin', 'Classical'];
const FACETS = {
  genre: { label: 'Genre', hint: 'rock, pop, soul …', of: s => s.ge },
  decade: { label: 'Decade', hint: '60s, 70s, 80s …', of: s => s.yr ? Math.floor(s.yr / 10) * 10 + 's' : null },
  key: { label: 'Key', hint: 'C, G, Am …', of: s => s.key, fmt: fmtKey },
  tempo: { label: 'Tempo', hint: 'BPM bands', of: s => { const b = BANDS.find(([a, z]) => s.bpm >= a && s.bpm < z); return b ? b[2] : null; }, order: BANDS.map(b => b[2]) },
  meter: { label: 'Meter', hint: '4/4, 3/4, 6/8 …', of: s => s.meter },
  feel: { label: 'Feel', hint: 'straight, swing, shuffle', of: s => s.feel },
  drums: { label: 'Drum level', hint: '1 easy … 10 hard', of: s => s.dl, fmt: v => 'Level ' + v },
  guitar: { label: 'Guitar level', hint: '1 easy … 10 hard', of: s => s.gl, fmt: v => 'Level ' + v },
  artist: { label: 'Artist', hint: 'A–Z', of: s => { const c = norm(s.artist.replace(/^the /i, ''))[0] || '#'; return /[a-z]/.test(c) ? c.toUpperCase() : '#'; } },
};
const crumbs = parts => `<div class="crumbs">${parts.map((p, i) => i < parts.length - 1 ? `<a href="${p[1]}" style="color:var(--blue);font-weight:600;text-decoration:none">${esc(p[0])}</a> ›` : `<span class="cur">${esc(p[0])}</span>`).join(' ')}</div>`;
async function showBrowse(facet, value) {
  const idx = await indexOrMessage(); if (!idx) return;
  const pool = idx.filter(s => s.q >= (+F.minq || 0)), Fc = FACETS[facet];
  if (!Fc) {
    main().innerHTML = `${crumbs([['Browse', '#browse']])}<h1>Browse</h1><p class="sub">${pool.length.toLocaleString()} songs at quality ${+F.minq >= 80 ? 'A' : +F.minq >= 60 ? 'A and B' : 'A, B and C'} (change it in Settings).</p>
      <div class="tiles">${Object.entries(FACETS).map(([k, f]) => `<a class="tile" href="#browse=${k}"><b>${f.label}</b><span>${f.hint}</span></a>`).join('')}</div>`;
    return done('browse', 'Browse');
  }
  if (value == null) {
    const counts = {}; pool.forEach(s => { const v = Fc.of(s); if (v != null && v !== '') counts[v] = (counts[v] || 0) + 1; });
    let vals = Object.keys(counts);
    if (facet === 'key') vals = KEYS.filter(k => counts[k]).concat(vals.filter(v => !KEYS.includes(v)));
    else if (facet === 'decade') vals.sort();
    else if (Fc.order) vals = Fc.order.filter(v => counts[v]);
    else if (facet === 'drums' || facet === 'guitar') vals.sort((a, b) => a - b);
    else if (facet === 'artist') vals.sort();
    else vals.sort((a, b) => counts[b] - counts[a]);
    const max = Math.max(...Object.values(counts));
    main().innerHTML = `${crumbs([['Browse', '#browse'], [Fc.label, '']])}<h1>${Fc.label}</h1>
      <div class="tiles">${vals.map(v => `<a class="tile" href="#browse=${facet}&v=${encodeURIComponent(v)}"><b>${esc(Fc.fmt ? Fc.fmt(v) : v)}</b><span>${counts[v].toLocaleString()} songs</span>
        <i style="display:block;height:5px;border-radius:3px;background:var(--accent);opacity:.7;width:${Math.max(6, 100 * counts[v] / max)}%"></i></a>`).join('')}</div>`;
    return done('browse', Fc.label);
  }
  const shown = Fc.fmt ? Fc.fmt(value) : value, hits = pool.filter(s => String(Fc.of(s)) === String(value));
  if (facet === 'artist') {   // letter → artists → artist page
    const arts = {}; hits.forEach(s => { arts[s.artist] = (arts[s.artist] || 0) + 1; });
    main().innerHTML = `${crumbs([['Browse', '#browse'], ['Artist', '#browse=artist'], [shown, '']])}<h1>Artists · ${esc(shown)}</h1>
      ${list(Object.keys(arts).sort((a, b) => norm(a).localeCompare(norm(b))).map(a => `<a class="lrow" href="#artist=${encodeURIComponent(a)}"><span class="t"><b>${esc(a)}</b></span><span class="m">${arts[a]} song${arts[a] > 1 ? 's' : ''}</span><span class="chev">${icon('chev', 18)}</span></a>`))}`;
    return done('browse', 'Artists ' + shown);
  }
  const by = store.get('browseSort', 'q'), sorted = [...hits].sort(by === 'title' ? (a, b) => norm(a.title).localeCompare(norm(b.title)) : by === 'bpm' ? (a, b) => a.bpm - b.bpm : (a, b) => b.q - a.q || norm(a.title).localeCompare(norm(b.title)));
  main().innerHTML = `${crumbs([['Browse', '#browse'], [Fc.label, '#browse=' + facet], [shown, '']])}<h1>${esc(Fc.label)}: ${esc(shown)}</h1>
    <div class="row" style="justify-content:space-between"><p class="sub" style="margin:0">${hits.length.toLocaleString()} songs${hits.length > 200 ? ' · first 200' : ''}</p>
      <span class="seg" role="group" aria-label="Sort">${[['q', 'Best'], ['title', 'A–Z'], ['bpm', 'BPM']].map(([k, l]) => `<button data-sort="${k}" class="${by === k ? 'on' : ''}">${l}</button>`).join('')}</span></div>
    <div style="margin-top:10px">${list(sorted.slice(0, 200).map(s => songRow(s)))}</div>`;
  main().querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { store.set('browseSort', b.dataset.sort); showBrowse(facet, value); });
  done('browse', shown);
}
async function showArtist(name) {
  const idx = await indexOrMessage(); if (!idx) return;
  const n = norm(name), hits = idx.filter(s => s.an === n).sort((a, b) => norm(a.title).localeCompare(norm(b.title)));
  const keys = {}; hits.forEach(s => { if (s.key) keys[s.key] = (keys[s.key] || 0) + 1; });
  const L = FACETS.artist.of({ artist: name });
  main().innerHTML = `${crumbs([['Browse', '#browse'], ['Artist', '#browse=artist'], [L, '#browse=artist&v=' + L], [name, '']])}<h1>${esc(name)}</h1>
    <p class="sub">${hits.length} song${hits.length === 1 ? '' : 's'}${Object.keys(keys).length ? ' · most often in ' + Object.entries(keys).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => fmtKey(k)).join(', ') : ''}</p>
    ${hits.length ? list(hits.map(s => songRow(s))) : '<div class="empty">No songs by this artist in the index.</div>'}`;
  done('browse', name);
}

// ---------- song sheet ----------
const player = new Player();
let SONG = null, VIEW = store.get('view', 'both'), ROMAN = false, SHIFT = 0, SEL = null, TL = [], TRACKS = [], JAM = null;

/** the playable timeline: one entry per bar, with its form item, chords and drum pattern */
function timeline(A) {
  const per = A.chords ? A.chords.perBar : [], out = []; let b = 0;
  const [num, den] = String(A.meter || '4/4').split('/').map(Number);
  const meterBeats = den === 8 && num % 3 === 0 ? num / 3 : num || 4;
  A.form.forEach((it, ii) => {
    const S = A.sections[it.sec] || {};
    for (let k = 0; k < it.bars; k++, b++) {
      const lastBar = k === it.bars - 1 && it.bars > 1, pat = lastBar && S.fill ? S.fill : S.groove;
      const steps = pat && pat.v ? Object.values(pat.v)[0].length / (pat.bars || 1) : 0;
      const beats = pat && pat.sub ? Math.max(1, Math.round(steps / pat.sub)) : meterBeats;
      const c = per[b]; out.push({ bar: b, item: ii, sec: it.sec, chords: c == null ? [] : Array.isArray(c) ? c : [c], groove: pat || null, grooveBar: k, beats });
    }
  });
  return out;
}
async function showSong(id, opt = {}) {
  if (!SONG || SONG.id !== id) {
    main().innerHTML = '<div class="empty">Loading…</div>';
    let S; try { S = await loadSong(id); } catch (e) { main().innerHTML = `<div class="card"><b>Couldn't load this song.</b><p class="mut">${navigator.onLine ? 'It may have been removed from the index.' : 'You\'re offline and it hasn\'t been opened on this device before.'}</p><a class="btn" href="#search">Search</a></div>`; return; }
    const rec = store.get('recent', []).filter(x => x !== id); rec.unshift(id); store.set('recent', rec.slice(0, 20));
    loadIntoPlayer(S, null);
  }
  applyOpt(opt);
}
async function showOwn(id, opt = {}) {
  if (!SONG || SONG.id !== id) {
    main().innerHTML = '<div class="empty">Loading…</div>';
    const rec = await getOwn(id).catch(() => null);
    if (!rec) { main().innerHTML = `<div class="card"><b>That file isn't on this device.</b><p class="mut">Your own MIDI files stay on the phone or computer that opened them.</p><a class="btn" href="#files">My files</a></div>`; return; }
    let notes = null; try { notes = fileNotes(rec.bytes, rec.analysis); } catch (e) { /* plays the backing instead */ }
    loadIntoPlayer(asSong(rec), notes);
  }
  applyOpt(opt);
}
function loadIntoPlayer(S, notes) {
  SONG = S; SHIFT = 0; SEL = null; TRACKS = notes ? notes.tracks : [];
  const A = S.analysis; TL = timeline(A); if (notes) TL.forEach((b, i) => { b.notes = notes.bars[i] || []; });
  player.load({ bars: TL, bpm: A.bpm, swing: A.swing }); player.pct = 100; player.loop = null;
  // own file: play the file's own parts (melody and vocal line included); the synthesised bass + pad start muted
  player.fileMode = !!notes; player.trackMute = new Set();
  player.mute.bass = !!notes; player.mute.chords = !!notes;
  if (player.ctx) ['bass', 'chords'].forEach(k => player.setMute(k, player.mute[k]));
}
function applyOpt(opt) {
  if (opt.transpose != null) SHIFT = opt.transpose;
  if (opt.tempo) player.pct = Math.min(120, Math.max(50, opt.tempo));
  if (opt.sec) { const i = SONG.analysis.form.findIndex(f => f.sec === opt.sec); if (i >= 0) { SEL = null; selectItem(i, false, true); } }
  renderSheet(); done(SONG.own ? 'files' : 'search', SONG.title);
}
function keyInfo() {
  const S = SONG, c = S.consensus, A = S.analysis;
  const kpc = c.key ? pcOf(c.key) : A.key ? pcOf(A.key) : null, minor = (c.mode || A.mode) === 'minor';
  const shownPc = kpc == null ? null : ((kpc + SHIFT) % 12 + 12) % 12, flats = shownPc == null ? false : flatKey(shownPc, minor);
  return { kpc, shownPc, minor, flats, total: (S.transpose || 0) + SHIFT };
}
const keyShort = (pc, minor, flats) => (flats ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])[pc] + (minor ? 'm' : '');
function renderSheet() {
  const S = SONG, A = S.analysis, c = S.consensus, K = keyInfo();
  const favs = store.get('favs', []), isFav = favs.includes(S.id);
  const allChords = TL.flatMap(b => b.chords).filter(x => x && x !== 'N').map(x => transposeChord(x, K.total, K.flats));
  const capo = capoHint(allChords), g = A.quality.grade, bpm = Math.round(c.bpm || A.bpm);
  // every fact is a way into Browse: the songs that share it (DrumPath: "every number is tappable")
  const origKey = c.key ? c.key + (c.mode === 'minor' ? 'm' : '') : null, band = FACETS.tempo.of({ bpm });
  const fact = (k, v, href, title) => href && !S.own ? `<a class="card tap stat fact" href="${href}" title="${esc(title || '')}" style="text-decoration:none;color:inherit"><div class="k">${k}</div><div class="v">${v}</div></a>` : `<div class="card fact"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const backTo = S.own ? [['My files', '#files']] : [['Browse', '#browse'], [S.artist, '#artist=' + encodeURIComponent(S.artist)]];
  main().innerHTML = `${crumbs([...backTo, [S.title, '']])}
  <div class="shead"><div class="ti"><h1>${esc(S.title)}</h1><div class="ar">${S.own ? esc(S.artist) : `<a href="#artist=${encodeURIComponent(S.artist)}" style="font-weight:600;text-decoration:none">${esc(S.artist)}</a>`}</div></div>
    <div class="tools" style="margin-top:0"><button id="jambtn" class="pri">${icon('jam', 18)} Jam mode</button><button id="addset">${icon('plus', 18)} Setlist</button>
      ${S.own ? '<button id="delown">Remove file</button>' : `<button id="fav" class="${isFav ? 'on' : ''}" aria-pressed="${isFav}">${isFav ? '★' : '☆'} Favourite</button>`}</div></div>
  ${setBanner()}
  <div class="facts">
    ${fact('Key', K.shownPc == null ? '—' : keyShort(K.shownPc, K.minor, K.flats).replace('#', '♯').replace(/^([A-G])b/, '$1♭') + (SHIFT ? ` <small class="mut">${SHIFT > 0 ? '+' : ''}${SHIFT}</small>` : ''), origKey && '#browse=key&v=' + encodeURIComponent(origKey), 'Other songs in this key')}
    ${fact('BPM', bpm + (c.bpmSure ? '' : ' ≈'), band && '#browse=tempo&v=' + encodeURIComponent(band), 'Other songs at this tempo')}
    ${fact('Meter', esc(c.meter || A.meter), '#browse=meter&v=' + encodeURIComponent(c.meter || A.meter))}
    ${fact('Feel', esc(A.feel || '—'), A.feel && '#browse=feel&v=' + encodeURIComponent(A.feel))}
    ${c.year ? fact('Year', c.year, '#browse=decade&v=' + Math.floor(c.year / 10) * 10 + 's', 'Songs from this decade') : ''}
    ${c.genre ? fact('Genre', esc(c.genre), '#browse=genre&v=' + encodeURIComponent(c.genre), c.genreFrom === 'artist' ? 'From the artist’s usual genre' : 'From the Million Song Dataset') : ''}
    ${fact('Quality', `<span class="badge ${g}">${g}</span> <small class="mut">${A.quality.score}</small>`, null)}
    ${fact('Drums', (A.difficulty.drums ?? '—') + '<small class="mut">/10</small>', A.difficulty.drums != null && '#browse=drums&v=' + A.difficulty.drums)}
    ${fact('Guitar', (A.difficulty.guitar ?? '—') + '<small class="mut">/10</small>', A.difficulty.guitar != null && '#browse=guitar&v=' + A.difficulty.guitar)}
  </div>
  ${S.own ? `<div class="note">Your own file (${esc(S.file)}), analysed on this device. It stays here and is never uploaded.</div>` : ''}
  ${S.versions.length > 1 ? `<div class="note"><a href="#" id="versions">Version ${S.primary} of ${S.versions.length}</a> in Lakh (the best one that agrees with the others).${c.keyVotes ? ` ${c.keyAgree} of ${c.keyVotes} versions agree on the key.` : ''}</div>` : ''}
  ${S.transpose ? `<div class="warnbox">This file was written in ${esc(A.key)} ${esc(A.mode)}; the other versions say ${esc(c.key)} ${esc(c.mode)}, so the chords are shifted ${S.transpose > 0 ? '+' : ''}${S.transpose} to match.</div>` : ''}
  ${TRACKS.length ? `<div class="card tracks" style="margin-top:12px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Parts in your file</h3><span class="mut" style="font-size:13px">tap to mute or unmute</span></div><div class="tools" style="margin-top:8px">
    <button id="filemode" class="${player.fileMode ? 'pri' : ''}">${player.fileMode ? 'Playing the file' : 'Playing the backing'}</button>
    ${TRACKS.map(t => `<button class="sm ${player.trackMute.has(t.tr) ? '' : 'on'}" data-track="${t.tr}" ${player.fileMode ? '' : 'disabled'}>${esc(t.name)}</button>`).join('')}</div>
    <div class="note">“Playing the file” plays every part of your file, melody and vocal line included, with simple synth sounds. Switch to “Playing the backing” for the generated drums, bass and chords.</div></div>` : ''}
  <div class="tools">
    <span class="seg" role="group" aria-label="View"><button data-view="guitar" class="${VIEW === 'guitar' ? 'on' : ''}">Guitar</button><button data-view="drums" class="${VIEW === 'drums' ? 'on' : ''}">Drums</button><button data-view="both" class="${VIEW === 'both' ? 'on' : ''}">Both</button></span>
    <span class="seg" role="group" aria-label="Chord names"><button data-roman="0" class="${ROMAN ? '' : 'on'}">C G Am</button><button data-roman="1" class="${ROMAN ? 'on' : ''}">I V vi</button></span>
    <span class="stepper" aria-label="Transpose"><button id="tdn" aria-label="Transpose down">−</button><span id="tval">${SHIFT === 0 ? 'Original' : (SHIFT > 0 ? '+' : '') + SHIFT}</span><button id="tup" aria-label="Transpose up">+</button></span>
  </div>
  <div class="note">${capo.capo ? `Capo ${capo.capo}: play the shapes of ${keyLabel(((K.shownPc ?? 0) - capo.capo + 12) % 12, K.minor, flatKey(((K.shownPc ?? 0) - capo.capo + 12) % 12, K.minor))} (barre chords ${Math.round(capo.barre * 100)}% → ${Math.round(capo.barreWithCapo * 100)}%).` : allChords.length ? 'No capo needed.' : ''}
    Section names with “?” and the chords are the engine's guesses${S.own ? ' from your file' : ' from a fan-made file'}. Tap a bar for details.</div>
  <div class="formstrip" id="strip" role="list">${A.form.map((f, i) => `<button role="listitem" data-item="${i}" class="${SEL === i ? 'sel' : ''}" style="background:${SEC_COL(f.sec)};flex-grow:${f.bars};width:${Math.max(34, f.bars * 6)}px" title="${esc(f.name || f.sec)}: ${f.bars} bars — tap to loop">${esc((f.name || f.sec).replace('?', ''))}<small>${f.bars}</small></button>`).join('')}</div>
  <div class="view-${VIEW}" id="body" style="display:flex;flex-direction:column">
    <div class="chart" id="chart">${A.form.map((f, i) => itemHTML(f, i, K)).join('')}</div>
    <div class="drums-block">${A.drums ? `<h2>Drum grooves</h2><p class="sub">${esc(A.drums.features.feel || '')}${A.drums.features.halfTime ? ' · half-time' : ''} · lanes as in DrumPath</p><div class="grooves">${grooveCards(A)}</div>` : '<p class="mut">No drum part in this file.</p>'}</div>
  </div>`;
  const m = main();
  $('#jambtn').onclick = openJam; $('#addset').onclick = addToSetDialog;
  if ($('#versions')) $('#versions').onclick = e => { e.preventDefault(); versionsSheet(); };
  if ($('#delown')) $('#delown').onclick = async () => { if (!confirmInline($('#delown'), 'Tap again to remove')) return; await deleteOwn(S.id); SONG = null; location.hash = '#files'; };
  if ($('#filemode')) $('#filemode').onclick = () => { player.fileMode = !player.fileMode; ['bass', 'chords'].forEach(k => { player.mute[k] = player.fileMode; if (player.ctx) player.setMute(k, player.mute[k]); }); renderSheet(); updatePlayer(); };
  m.querySelectorAll('[data-track]').forEach(b => b.onclick = () => { const t = +b.dataset.track; player.trackMute.has(t) ? player.trackMute.delete(t) : player.trackMute.add(t); b.classList.toggle('on', !player.trackMute.has(t)); });
  if ($('#setprev')) $('#setprev').onclick = () => openFromSet(FROM.set, FROM.i - 1);
  if ($('#setnext')) $('#setnext').onclick = () => openFromSet(FROM.set, FROM.i + 1);
  if ($('#fav')) $('#fav').onclick = () => { const f = store.get('favs', []), i = f.indexOf(S.id); if (i >= 0) f.splice(i, 1); else f.unshift(S.id); store.set('favs', f); toast(i >= 0 ? 'Removed from favourites' : 'Added to favourites'); renderSheet(); };
  m.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { VIEW = b.dataset.view; store.set('view', VIEW); renderSheet(); });
  m.querySelectorAll('[data-roman]').forEach(b => b.onclick = () => { ROMAN = b.dataset.roman === '1'; renderSheet(); });
  $('#tdn').onclick = () => { SHIFT = Math.max(-6, SHIFT - 1); afterShift(); }; $('#tup').onclick = () => { SHIFT = Math.min(6, SHIFT + 1); afterShift(); };
  m.querySelectorAll('#strip button').forEach(b => b.onclick = () => selectItem(+b.dataset.item, true));
  m.querySelectorAll('[data-loop]').forEach(b => b.onclick = () => selectItem(+b.dataset.loop, false));
  m.querySelectorAll('.cbar').forEach(el => { el.onclick = () => barSheet(+el.dataset.bar); el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); barSheet(+el.dataset.bar); } }; });
  player.shift = K.total; setPlayer(true); updatePlayer(); markLoop();
}
function afterShift() { player.shift = keyInfo().total; renderSheet(); }
function itemHTML(f, i, K) {
  const A = SONG.analysis, bars = TL.filter(b => b.item === i), romanPer = A.chords ? A.chords.roman : [];
  let prev = null;
  const cells = bars.map(b => {
    const segs = ROMAN ? (Array.isArray(romanPer[b.bar]) ? romanPer[b.bar] : [romanPer[b.bar]]) : b.chords.map(x => transposeChord(x, K.total, K.flats));
    const label = segs.map(x => x == null || x === 'N' ? '<span class="c none">—</span>' : `<span class="c ${!ROMAN && x === prev && segs.length === 1 ? 'rep' : ''}">${ROMAN ? esc(x) : chordHTML(x)}</span>`).join('');
    prev = segs[segs.length - 1];
    return `<div class="cbar ${segs.length > 1 ? 'half' : ''}" data-bar="${b.bar}" role="button" tabindex="0" aria-label="Bar ${b.bar + 1}"><span class="n">${b.bar + 1}</span>${label}</div>`;
  }).join('');
  return `<div class="item" id="item${i}"><div class="ihead"><span class="tag" style="background:${SEC_COL(f.sec)}">${esc(f.sec)}</span><span class="nm">${esc(f.name || 'Section ' + f.sec)}</span><span class="ct">${f.bars} bars</span>
    <button class="sm ${SEL === i ? 'on' : ''}" data-loop="${i}">${SEL === i ? 'Looping' : 'Loop'}</button></div><div class="bars">${cells}</div></div>`;
}
/** drill into one bar: its chords (with Roman numerals), its section, its groove; play from here or loop it */
function barSheet(bar) {
  const b = TL[bar], f = SONG.analysis.form[b.item], K = keyInfo(), A = SONG.analysis, rn = A.chords ? A.chords.roman[bar] : null;
  const names = b.chords.map(x => transposeChord(x, K.total, K.flats)), rns = Array.isArray(rn) ? rn : [rn];
  const isFill = b.grooveBar === f.bars - 1 && f.bars > 1 && A.sections[f.sec] && A.sections[f.sec].fill;
  openSheet(`Bar ${bar + 1}`, `<p class="sub">${esc(f.name || 'Section ' + f.sec)} · bar ${b.grooveBar + 1} of ${f.bars}${isFill ? ' · fill' : ''}</p>
    <div class="grid">${names.length ? names.map((n, i) => `<div class="card"><div class="big">${n === 'N' ? '—' : chordHTML(n)}</div><div class="mut">${esc(rns[i] || '')}${names.length > 1 ? ` · ${i ? 'second' : 'first'} half` : ''}</div></div>`).join('') : '<div class="mut">No chord here.</div>'}</div>
    ${b.groove && b.groove.v ? `<h3 style="margin-top:14px">Drums</h3><div class="card">${lanesHTML(b.groove)}</div>` : ''}
    <div class="tools"><button class="pri" id="bplay">${icon('play', 16)} Play from here</button><button id="bloop">Loop this bar</button><button id="bsec">Loop the ${esc((f.name || 'section').replace('?', ''))}</button></div>`, (m, close) => {
    $('#bplay', m).onclick = async () => { close(); player.loop = null; SEL = null; markLoop(); player.shift = keyInfo().total; await player.play(bar); updatePlayer(); };
    $('#bloop', m).onclick = () => { close(); SEL = null; markLoop(); player.loop = [bar, bar]; document.querySelector(`.cbar[data-bar="${bar}"]`).classList.add('inloop'); updatePlayer(); };
    $('#bsec', m).onclick = () => { close(); SEL = null; selectItem(b.item, false); };
  });
}
function versionsSheet() {
  const S = SONG;
  openSheet('Versions in Lakh', `<p class="sub">Fan-made files of the same song. Backline shows version ${S.primary}: the best one that agrees with the others on key and tempo.</p>
    <div style="overflow-x:auto"><table><tr><th>#</th><th>Grade</th><th class="n">BPM</th><th>Key</th><th>Meter</th><th class="n">Bars</th><th>Drums</th></tr>
    ${S.versions.map(v => `<tr${v.v === S.primary ? ' style="font-weight:700"' : ''}><td>${v.v}${v.v === S.primary ? ' ✓' : ''}</td><td><span class="badge ${v.grade}">${v.grade}</span></td><td class="n">${Math.round(v.bpm)}</td><td>${v.key ? fmtKey(v.key) + (v.mode === 'minor' ? 'm' : '') : '—'}</td><td>${esc(v.meter)}</td><td class="n">${v.bars}</td><td>${v.drums ? 'yes' : '—'}</td></tr>`).join('')}</table></div>
    <p class="mut" style="font-size:13px">Only the shown version is stored in full for now.</p>`);
}
function grooveCards(A) {
  const seen = [], out = [];
  A.form.forEach(f => { if (seen.includes(f.sec)) return; seen.push(f.sec); const S = A.sections[f.sec]; if (!S) return;
    for (const [what, p] of [['Groove', S.groove], ['Fill', S.fill]]) if (p && p.v && Object.keys(p.v).length) out.push(`<div class="card"><div class="gh"><span class="sectag" style="background:${SEC_COL(f.sec)}">${esc(f.sec)}</span><b>${esc(f.name || 'Section ' + f.sec)}</b><span class="mut">${what}</span></div>${lanesHTML(p)}</div>`); });
  return out.join('') || '<p class="mut">No grooves found.</p>';
}
function lanesHTML(p) {
  const lanes = LANES.filter(l => p.v[l]); if (!lanes.length) return '';
  const len = p.v[lanes[0]].length, sub = p.sub || 2, cls = ch => ch === '.' ? '' : ch === 'X' ? 'acc' : ch === 'g' ? 'gho' : ch === 'o' ? 'opn' : 'hit';
  return `<div class="lanes" style="grid-template-columns:auto repeat(${len},minmax(9px,1fr))">${lanes.map(l => `<span class="ln">${l}</span>${[...p.v[l]].map((ch, s) => `<span class="st ${cls(ch)} ${s % sub === 0 ? 'beat' : ''}" style="--pc:var(--p-${l})"></span>`).join('')}`).join('')}</div>`;
}
function selectItem(i, scroll, quiet) {
  SEL = SEL === i ? null : i;
  player.loop = SEL == null ? null : (() => { const bs = TL.filter(b => b.item === SEL); return [bs[0].bar, bs[bs.length - 1].bar]; })();
  if (quiet) return;
  document.querySelectorAll('#strip button').forEach(b => b.classList.toggle('sel', +b.dataset.item === SEL));
  document.querySelectorAll('[data-loop]').forEach(b => { const on = +b.dataset.loop === SEL; b.classList.toggle('on', on); b.textContent = on ? 'Looping' : 'Loop'; });
  markLoop(); updatePlayer();
  if (scroll && SEL != null) $('#item' + SEL).scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function markLoop() { document.querySelectorAll('.cbar').forEach(el => { const b = TL[+el.dataset.bar]; el.classList.toggle('inloop', SEL != null && b.item === SEL); }); }

// ---------- player bar ----------
function setPlayer(on) { $('#player').hidden = !on; document.body.style.setProperty('--player-h', on ? $('#player').offsetHeight + 'px' : '0px'); }
function updatePlayer() {
  if (!SONG) return; const p = $('#player');
  p.querySelector('.play').innerHTML = icon(player.playing ? 'pause' : 'play', 22); p.querySelector('.play').setAttribute('aria-label', player.playing ? 'Pause' : 'Play');
  $('#tempo').value = player.pct; $('#tempoval').textContent = `${player.pct}% · ${Math.round(player.tempo)} BPM`;
  for (const k of ['drums', 'bass', 'chords', 'click']) { const b = p.querySelector(`[data-mute="${k}"]`); const on = !player.mute[k]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }
  $('#countin').classList.toggle('on', player.countIn);
  const kb = $('#kitbtn'); if (kb) { kb.hidden = !navigator.requestMIDIAccess; kb.classList.toggle('on', player.kit && !!player.midiOut); kb.setAttribute('aria-pressed', player.kit && !!player.midiOut); kb.title = player.midiOut ? 'Drums to ' + player.midiOut.name : 'Send the drums to a drum module (MIDI)'; }
  $('#loopinfo').textContent = SEL != null ? `Loop: ${(SONG.analysis.form[SEL].name || SONG.analysis.form[SEL].sec).replace('?', '')} ✕` : player.loop ? `Loop: bar ${player.loop[0] + 1} ✕` : 'Whole song';
  setPlayer(true);
}
let lastNow = null;
player.onBar = (bar, beat) => {
  if (JAM) jamUpdate(bar, beat);
  if (beat) return;   // the sheet only moves on bar changes
  const pos = $('#ppos'); if (!pos) return;
  if (lastNow) lastNow.classList.remove('now'); document.querySelectorAll('#strip .now').forEach(x => x.classList.remove('now'));
  if (bar === -1) { pos.innerHTML = '<b>Count-in</b><span>&nbsp;</span>'; return; }
  if (bar < 0 || !TL[bar]) return;
  const b = TL[bar], f = SONG.analysis.form[b.item], el = document.querySelector(`.cbar[data-bar="${bar}"]`);
  pos.innerHTML = `<b>Bar ${bar + 1}</b><span>${esc(f.name || 'Section ' + f.sec)} · ${b.grooveBar + 1}/${f.bars}</span>`;
  if (el) { el.classList.add('now'); lastNow = el; const r = el.getBoundingClientRect(), ph = $('#player').offsetHeight;
    if (r.bottom > innerHeight - ph - 16 || r.top < 90) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  const sb = document.querySelector(`#strip [data-item="${b.item}"]`); if (sb) sb.classList.add('now');
};
player.onStop = () => { updatePlayer(); if (lastNow) lastNow.classList.remove('now'); if (JAM) jamUpdate(null); };
function wirePlayer() {
  const p = $('#player');
  p.querySelector('.play').onclick = async () => { if (player.playing) { player.stop(); updatePlayer(); return; }
    player.shift = keyInfo().total; const from = player.loop ? player.loop[0] : 0; await player.play(from); updatePlayer(); };
  $('#tempo').oninput = e => { player.pct = +e.target.value; updatePlayer(); };
  p.querySelectorAll('[data-mute]').forEach(b => b.onclick = () => { const k = b.dataset.mute; player.mute[k] = !player.mute[k]; if (player.ctx) player.setMute(k, player.mute[k]); updatePlayer(); });
  $('#countin').onclick = () => { player.countIn = !player.countIn; updatePlayer(); };
  $('#kitbtn').onclick = async () => { if (!player.midiOut && !(await pickKit())) return; player.kit = !player.kit; if (!player.kit) player._midiPanic(); store.set('kitOn', player.kit); updatePlayer(); toast(player.kit ? 'Drums → ' + player.midiOut.name + '. The Drums button still turns the device’s own drums on or off.' : 'Kit off'); };
  $('#loopinfo').onclick = () => { if (SEL != null) selectItem(SEL, false); else if (player.loop) { player.loop = null; markLoop(); updatePlayer(); } };
}

// ---------- setlists ----------
function songRef() { return { id: SONG.id, title: SONG.title, artist: SONG.artist, own: !!SONG.own, tempo: player.pct, transpose: SHIFT }; }
function addToSetDialog() {
  const sets = Sets.allSets();
  openSheet('Add to a setlist', `<p class="sub">Saves ${esc(SONG.title)} at ${player.pct}% tempo${SHIFT ? `, transposed ${SHIFT > 0 ? '+' : ''}${SHIFT}` : ''}.</p>
    ${sets.length ? list(sets.map(s => `<div class="lrow" data-set="${s.id}" role="button" tabindex="0"><span class="t"><b>${esc(s.name)}</b><span>${s.songs.length} songs${s.songs.some(x => x.id === SONG.id) ? ' · already in it (updates tempo and key)' : ''}</span></span><span class="chev">${icon('plus', 18)}</span></div>`)) : ''}
    <div class="tools"><input id="newset" placeholder="New setlist name" style="flex:1;min-width:0"><button class="pri" id="mkset">Create + add</button></div>`, (d, close) => {
    d.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { Sets.addToSet(b.dataset.set, songRef()); close(); toast('Added to ' + Sets.getSet(b.dataset.set).name); });
    $('#mkset', d).onclick = () => { const s = Sets.newSet($('#newset', d).value.trim() || 'Setlist ' + (sets.length + 1)); Sets.addToSet(s.id, songRef()); close(); toast('Added to ' + s.name); };
  });
}
function setBanner() {
  if (!FROM) return ''; const s = Sets.getSet(FROM.set); if (!s) return '';
  return `<div class="card setbar"><a href="#list=${s.id}">${icon('sets', 16)} ${esc(s.name)}</a><span class="mut">${FROM.i + 1} of ${s.songs.length}</span>
    <button class="sm" id="setprev" ${FROM.i > 0 ? '' : 'disabled'} aria-label="Previous song">‹ Prev</button><button class="sm" id="setnext" ${FROM.i < s.songs.length - 1 ? '' : 'disabled'} aria-label="Next song">Next ›</button></div>`;
}
function songHash(x, setId, i) { return `#${x.own ? 'own' : 'song'}=${encodeURIComponent(x.id)}&tempo=${x.tempo || 100}&transpose=${x.transpose || 0}` + (setId ? `&list=${setId}&i=${i}` : ''); }
function openFromSet(setId, i) { const s = Sets.getSet(setId); if (!s || !s.songs[i]) return; player.stop(); location.hash = songHash(s.songs[i], setId, i); }
function showSets() {
  const sets = Sets.allSets();
  main().innerHTML = `<h1>Setlists</h1><p class="sub">Kept in this browser. Share one as a link to open it on another phone.</p>
    ${sets.length ? list(sets.map(s => `<a class="lrow" href="#list=${s.id}"><span class="t"><b>${esc(s.name)}</b><span>${s.songs.map(x => esc(x.title)).join(' · ') || 'empty'}</span></span><span class="m">${s.songs.length}<br>songs</span><span class="chev">${icon('chev', 18)}</span></a>`))
      : '<div class="card"><b>No setlists yet.</b><p class="mut">Open a song and tap <b>+ Setlist</b>, or create an empty one here.</p></div>'}
    <div class="tools"><input id="newset" placeholder="New setlist name" style="flex:1;min-width:0"><button class="pri" id="mkset">Create</button></div>`;
  $('#mkset').onclick = () => { const s = Sets.newSet($('#newset').value.trim() || 'Setlist ' + (sets.length + 1)); location.hash = '#list=' + s.id; };
  done('sets', 'Setlists');
}
function showSet(id) {
  const s = Sets.getSet(id); if (!s) { main().innerHTML = `<div class="card"><b>That setlist isn't on this device.</b><p><a href="#sets">All setlists</a></p></div>`; return done('sets', 'Setlist'); }
  const sh = x => `${x.tempo && x.tempo !== 100 ? x.tempo + '%' : ''}${x.transpose ? ` ${x.transpose > 0 ? '+' : ''}${x.transpose}` : ''}`.trim();
  main().innerHTML = `${crumbs([['Setlists', '#sets'], [s.name, '']])}<h1>${esc(s.name)}</h1><p class="sub">${s.songs.length} songs</p>
    ${s.songs.length ? `<div class="list setsongs">${s.songs.map((x, i) => `<div class="lrow"><a class="t" href="${songHash(x, id, i)}" style="text-decoration:none;color:inherit"><b>${i + 1}. ${esc(x.title)}</b><span>${esc(x.artist || '')}${x.own ? ' · my file' : ''}${sh(x) ? ' · ' + esc(sh(x)) : ''}</span></a>
      <span class="rowbtns"><button data-up="${i}" aria-label="Move up" ${i ? '' : 'disabled'}>↑</button><button data-dn="${i}" aria-label="Move down" ${i < s.songs.length - 1 ? '' : 'disabled'}>↓</button><button data-rm="${i}" aria-label="Remove">✕</button></span></div>`).join('')}</div>`
      : '<div class="card"><b>Empty.</b><p class="mut">Open a song and tap <b>+ Setlist</b>.</p></div>'}
    <div class="tools"><button class="pri" id="start" ${s.songs.length ? '' : 'disabled'}>${icon('play', 16)} Start from song 1</button><button id="share" ${s.songs.length ? '' : 'disabled'}>${icon('share', 16)} Share link</button>
      <button id="rename">Rename</button><button id="delset">Delete setlist</button></div>
    ${s.songs.some(x => x.own) ? '<p class="sub" style="margin-top:10px">Songs from your own MIDI files only open on this device; a shared link skips them.</p>' : ''}`;
  const m = main();
  m.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { Sets.moveInSet(id, +b.dataset.up, -1); showSet(id); });
  m.querySelectorAll('[data-dn]').forEach(b => b.onclick = () => { Sets.moveInSet(id, +b.dataset.dn, 1); showSet(id); });
  m.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { if (!confirmInline(b, '?')) return; Sets.removeFromSet(id, +b.dataset.rm); showSet(id); });
  $('#start').onclick = () => openFromSet(id, 0);
  $('#share').onclick = async () => { const link = Sets.shareLink({ ...s, songs: s.songs.filter(x => !x.own) }, location.href);
    try { if (navigator.share) { await navigator.share({ title: s.name, text: 'Setlist: ' + s.name, url: link }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch (e) { openSheet('Share link', `<input value="${esc(link)}" readonly style="width:100%">`, d => $('input', d).select()); } };
  $('#rename').onclick = () => openSheet('Rename', `<input id="nm" value="${esc(s.name)}" style="width:100%"><div class="tools"><button class="pri" id="ok">Save</button></div>`, (d, close) => {
    $('#ok', d).onclick = () => { s.name = $('#nm', d).value.trim() || s.name; Sets.putSet(s); close(); showSet(id); }; });
  $('#delset').onclick = () => { if (!confirmInline($('#delset'), 'Tap again to delete')) return; Sets.deleteSet(id); location.hash = '#sets'; };
  done('sets', s.name);
}
async function showShared(code) {
  const sh = Sets.decodeShared(code);
  if (!sh) { main().innerHTML = `<div class="card"><b>This setlist link is broken or cut off.</b><p class="mut">Ask for it again.</p></div>`; return done('sets', 'Shared setlist'); }
  let idx = null; try { idx = await loadIndex(); } catch (e) { /* offline: show ids */ }
  const rows = sh.songs.map(x => { const r = BYID && BYID.get(x.id); return { ...x, title: r ? r.title : x.id, artist: r ? r.artist : '', missing: idx && !r }; });
  main().innerHTML = `${crumbs([['Setlists', '#sets'], ['Shared with you', '']])}<h1>${esc(sh.name)}</h1><p class="sub">Shared with you · ${rows.length} songs</p>
    ${list(rows.map((x, i) => `<div class="lrow"><span class="t"><b>${i + 1}. ${esc(x.title)}</b><span>${esc(x.artist)}${x.tempo !== 100 ? ' · ' + x.tempo + '%' : ''}${x.transpose ? ` · ${x.transpose > 0 ? '+' : ''}${x.transpose}` : ''}${x.missing ? ' · not in this index' : ''}</span></span></div>`))}
    <div class="tools"><button class="pri" id="saveset">Save to my setlists</button><a class="btn" href="#">Not now</a></div>`;
  $('#saveset').onclick = () => { const s = Sets.newSet(sh.name); s.songs = rows.filter(x => !x.missing).map(x => ({ id: x.id, title: x.title, artist: x.artist, tempo: x.tempo, transpose: x.transpose })); Sets.putSet(s); toast('Saved'); location.hash = '#list=' + s.id; };
  done('sets', sh.name);
}

// ---------- My files ----------
async function showFiles() {
  const own = await listOwn();
  main().innerHTML = `<h1>My files</h1><p class="sub">Open a MIDI file from this device. Backline analyses it here; the file stays on this device and is never uploaded. Name it “Artist - Title.mid” and the names fill in.</p>
    <div class="tools" style="margin-top:0"><label class="btn pri" for="ownfile" style="background:var(--accent);color:var(--accent-ink);border-color:var(--accent)">${icon('plus', 18)} Open my MIDI file</label><input id="ownfile" type="file" accept=".mid,.midi,.kar,audio/midi,audio/x-midi" hidden></div>
    ${own.length ? `<div style="margin-top:12px">${list(own.map(ownRow))}</div>` : '<div class="card" style="margin-top:12px"><b>No files yet.</b><p class="mut">Songs that aren\'t in Lakh (recent hits, Bollywood) work this way.</p></div>'}`;
  $('#ownfile').onchange = async e => { const f = e.target.files[0]; if (!f) return; toast('Reading ' + f.name + '…');
    try { const r = await importFile(f); location.hash = '#own=' + r.id; } catch (err) { toast(err.message || 'Could not read that file'); } };
  done('files', 'My files');
}

// ---------- Kit: Web MIDI out to a drum module (B6) ----------
let MIDI = null;
async function midiAccess() { if (MIDI) return MIDI; if (!navigator.requestMIDIAccess) return null; try { MIDI = await navigator.requestMIDIAccess(); MIDI.onstatechange = () => { if (player.midiOut && player.midiOut.state === 'disconnected') { player.midiOut = null; player.kit = false; updatePlayer(); toast('Drum module disconnected'); } }; return MIDI; } catch (e) { return null; } }
/** ask for MIDI access and pick an output; remembers the device by name. Resolves true when one is chosen. */
function pickKit() {
  return new Promise(async res => {
    const acc = await midiAccess(); if (!acc) { toast(navigator.requestMIDIAccess ? 'MIDI access was not allowed' : 'This browser has no Web MIDI (use Chrome)'); return res(false); }
    const outs = [...acc.outputs.values()];
    if (!outs.length) { toast('No MIDI device found. Connect the module over USB, then try again.'); return res(false); }
    const want = store.get('kitName', null), hit = outs.find(o => o.name === want);
    if (hit && outs.length === 1) { player.midiOut = hit; return res(true); }
    let chosen = false;
    const m = openSheet('Send drums to', `<p class="sub">Backline's drum part plays on the module's own sounds (channel 10, General MIDI notes). The device's own drums stay under the Drums button, so you can use either or both.</p>
      ${list(outs.map((o, i) => `<div class="lrow" data-out="${i}" role="button" tabindex="0"><span class="t"><b>${esc(o.name)}</b><span>${esc(o.manufacturer || '')}</span></span>${o.name === want ? '<span class="chip">last used</span>' : ''}</div>`))}`, (d, close) => {
      d.querySelectorAll('[data-out]').forEach(b => b.onclick = () => { player.midiOut = outs[+b.dataset.out]; store.set('kitName', player.midiOut.name); chosen = true; close(); res(true); });
    });
    new MutationObserver((_, ob) => { if (!document.body.contains(m)) { ob.disconnect(); if (!chosen) res(false); } }).observe(document.body, { childList: true });
  });
}

// ---------- Settings ----------
async function showSettings() {
  let est = null; try { est = navigator.storage && await navigator.storage.estimate(); } catch (e) { /* not supported */ }
  let cached = 0; try { const c = await caches.open('bl-songs'); cached = (await c.keys()).length; } catch (e) { /* no cache API */ }
  const tm = themeMode();
  main().innerHTML = `<h1>Settings</h1>
    <div class="card"><h3>Theme</h3><span class="seg" role="group" aria-label="Theme">${[['system', 'Follow device'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button data-theme-set="${k}" class="${tm === k ? 'on' : ''}">${l}</button>`).join('')}</span></div>
    <div class="card" style="margin-top:12px"><h3>Search</h3><p class="mut" style="margin:0 0 8px">Which songs show in Search and Browse by default.</p>
      <span class="seg" role="group" aria-label="Quality">${[[80, 'A only'], [60, 'A and B'], [0, 'All']].map(([k, l]) => `<button data-q="${k}" class="${+F.minq === k ? 'on' : ''}">${l}</button>`).join('')}</span></div>
    <div class="card" style="margin-top:12px"><h3>Drum module (MIDI out)</h3><p class="mut" style="margin:0 0 8px">${navigator.requestMIDIAccess ? `Send Backline's drums to your kit's module over USB. ${player.midiOut ? 'Now: <b>' + esc(player.midiOut.name) + '</b>.' : store.get('kitName', null) ? 'Last used: ' + esc(store.get('kitName', '')) + '.' : 'No module chosen yet.'} Turn it on and off with <b>Kit</b> on the player.` : 'This browser has no Web MIDI. Use Chrome on Android, Windows or Mac.'}</p>
      ${navigator.requestMIDIAccess ? '<div class="tools" style="margin-top:0"><button id="pickkit">Choose module</button></div>' : ''}</div>
    <div class="card" style="margin-top:12px"><h3>Offline</h3><p class="mut" style="margin:0">${cached} song${cached === 1 ? '' : 's'} kept for offline use (every song you open is kept).${est ? ` Backline uses ${(est.usage / 1e6).toFixed(1)} MB on this device.` : ''}</p>
      <div class="tools"><button id="clearsongs" ${cached ? '' : 'disabled'}>Remove offline songs</button><button id="clearrecent">Clear recent songs</button></div></div>`;
  main().querySelectorAll('[data-theme-set]').forEach(b => b.onclick = () => { setTheme(b.dataset.themeSet); showSettings(); });
  main().querySelectorAll('[data-q]').forEach(b => b.onclick = () => { F.minq = +b.dataset.q; store.set('filters', F); showSettings(); });
  $('#clearsongs').onclick = async () => { if (!confirmInline($('#clearsongs'), 'Tap again to remove')) return; try { await caches.delete('bl-songs'); } catch (e) { /* ignore */ } toast('Offline songs removed'); showSettings(); };
  $('#clearrecent').onclick = () => { store.set('recent', []); toast('Recent songs cleared'); };
  if ($('#pickkit')) $('#pickkit').onclick = async () => { if (await pickKit()) { toast('Module: ' + player.midiOut.name); showSettings(); } };
  done('settings', 'Settings');
}

// ---------- jam mode: full screen, current chord large, next chord, bar and beat; screen stays awake ----------
async function openJam() {
  const A = SONG.analysis;
  JAM = { wake: null, el: document.createElement('div') }; JAM.el.id = 'jam'; JAM.el.setAttribute('role', 'dialog'); JAM.el.setAttribute('aria-label', 'Jam mode');
  JAM.el.innerHTML = `<div class="jtop"><span class="jsec" id="jsec">${esc(SONG.title)}</span><span class="jbar" id="jbar"></span><button class="icon" id="jx" aria-label="Close jam mode">${icon('close')}</button></div>
    <div class="jmain"><div class="jnow" id="jnow">▶</div><div class="jnext"><span class="mut">next</span><b id="jnext"></b></div></div>
    <div class="jbeats" id="jbeats"></div>
    <div class="jctl"><button id="jplay" class="pri" aria-label="Play">${icon('play')}</button><button id="jslow" aria-label="Slower">−5%</button><span class="num" id="jtempo"></span><button id="jfast" aria-label="Faster">+5%</button>
      <span class="mut" id="jloop">${SEL != null ? 'Loop: ' + esc(A.form[SEL].name || A.form[SEL].sec) : ''}</span></div>`;
  document.body.appendChild(JAM.el);
  $('#jx', JAM.el).onclick = closeJam;
  $('#jplay', JAM.el).onclick = () => $('#player .play').click();
  $('#jslow', JAM.el).onclick = () => { player.pct = Math.max(50, player.pct - 5); updatePlayer(); jamUpdate(); };
  $('#jfast', JAM.el).onclick = () => { player.pct = Math.min(120, player.pct + 5); updatePlayer(); jamUpdate(); };
  try { if (JAM.el.requestFullscreen) await JAM.el.requestFullscreen(); } catch (e) { /* not allowed here: the overlay still covers the page */ }
  try { await screen.orientation.lock('landscape'); } catch (e) { /* phones without orientation lock */ }
  try { if (navigator.wakeLock) JAM.wake = await navigator.wakeLock.request('screen'); } catch (e) { /* battery saver */ }
  jamUpdate(player.playing ? player.cur : null, 0);
}
function closeJam() {
  if (!JAM) return; const j = JAM; JAM = null;
  try { if (j.wake) j.wake.release(); } catch (e) { /* already released */ }
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* not fullscreen */ }
  try { screen.orientation.unlock(); } catch (e) { /* not locked */ }
  j.el.remove();
}
document.addEventListener('visibilitychange', async () => { if (JAM && !document.hidden && navigator.wakeLock) try { JAM.wake = await navigator.wakeLock.request('screen'); } catch (e) { /* ignore */ } });
function chordAt(bar, beat) { const b = TL[bar]; if (!b || !b.chords.length) return null; const i = Math.min(b.chords.length - 1, Math.floor(beat * b.chords.length / b.beats)); return b.chords[i]; }
function nextChord(bar, beat) {
  const cur = chordAt(bar, beat); let b = bar, k = beat;
  for (let n = 0; n < 64 * 8; n++) { k++; if (k >= TL[b].beats) { k = 0; b++; if (player.loop && b > player.loop[1]) b = player.loop[0]; if (b >= TL.length) return null; }
    const c = chordAt(b, k); if (c && c !== 'N' && c !== cur) return { c, bar: b }; }
  return null;
}
function jamUpdate(bar, beat = 0) {
  if (!JAM) return; const J = JAM.el, K = keyInfo(), name = c => c && c !== 'N' ? chordHTML(transposeChord(c, K.total, K.flats)) : '—';
  $('#jtempo', J).textContent = `${player.pct}% · ${Math.round(player.tempo)}`;
  $('#jplay', J).innerHTML = icon(player.playing ? 'pause' : 'play');
  if (bar === -1) { $('#jnow', J).textContent = beat + 1; $('#jsec', J).textContent = 'Count-in'; return; }
  if (bar == null || bar < 0 || !TL[bar]) { const b0 = player.loop ? player.loop[0] : 0, nx = nextChord(b0, 0);
    $('#jnow', J).innerHTML = name(chordAt(b0, 0) || (nx || {}).c); $('#jsec', J).textContent = SONG.title; $('#jbar', J).textContent = ''; $('#jnext', J).innerHTML = nx ? name(nx.c) : '—'; $('#jbeats', J).innerHTML = ''; return; }
  const b = TL[bar], f = SONG.analysis.form[b.item], nx = nextChord(bar, beat);
  $('#jnow', J).innerHTML = name(chordAt(bar, beat));
  $('#jnext', J).innerHTML = nx ? name(nx.c) + (nx.bar !== bar ? `<small class="mut"> · bar ${nx.bar + 1}</small>` : '') : '—';
  $('#jsec', J).textContent = (f.name || f.sec).replace('?', '');
  $('#jbar', J).textContent = `bar ${b.grooveBar + 1}/${f.bars} · ${bar + 1}`;
  $('#jbeats', J).innerHTML = Array.from({ length: b.beats }, (_, k) => `<span class="${k === beat ? 'on' : ''} ${k === 0 ? 'one' : ''}"></span>`).join('');
}

// ---------- credits ----------
async function showCredits() {
  let man = null; try { man = (await loadIndex()).manifest; } catch (e) { /* offline */ }
  main().innerHTML = `<h1>Credits</h1><div class="card">
    <p>Song data is derived from the <a href="https://colinraffel.com/projects/lmd/" rel="noopener">Lakh MIDI Dataset v0.1</a> by Colin Raffel, licensed <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener">CC BY 4.0</a>. C. Raffel, <em>Learning-Based Methods for Comparing Sequences, with Applications to Audio-to-MIDI Alignment and Matching</em>, PhD thesis, Columbia University, 2016.</p>
    <p>The MIDI files are fan transcriptions and may be wrong. Backline publishes only what it works out from them: tempo, meter, key, chord names, section form and short drum patterns. No MIDI files, melodies or lyrics. That is also why the backing track has no vocals.</p>
    <p>All sounds are synthesised in your browser. Design and navigation follow DrumPath.</p>
    ${man ? `<p class="mut">Index built ${esc(man.built)} with engine ${esc(man.engine)}: ${man.counts.songs.toLocaleString()} songs from ${man.counts.files.toLocaleString()} files.</p>` : ''}</div>`;
  done('credits', 'Credits');
}

// ---------- start ----------
function netChip() { const off = !navigator.onLine; $('#ndot').classList.toggle('ok', !off); $('#ntxt').textContent = off ? 'Offline' : 'Online'; }
addEventListener('online', netChip); addEventListener('offline', netChip);
buildShell(); wirePlayer(); netChip(); route();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__bl = { player, Sets, get song() { return SONG; }, get tl() { return TL; }, get jam() { return JAM; } };   // for the headless checks
