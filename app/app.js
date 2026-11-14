// Backline app: search → song sheet (form, chords, drums) → backing-track player (B4); jam mode, setlists and
// share links, own MIDI files (B5). No build step, no libraries.
import { transposeChord, chordHTML, flatKey, pcOf, keyLabel, capoHint } from './music.js';
import { Player } from './player.js';
import * as Sets from './sets.js';
import { listOwn, getOwn, deleteOwn, importFile, asSong, fileNotes } from './own.js';

const DATA = 'data/v1/';
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const grade = q => q >= 80 ? 'A' : q >= 60 ? 'B' : 'C';
const SEC_COL = i => `var(--s${i % 8})`;
const LANES = ['C', 'R', 'HH', 'HP', 'T1', 'T2', 'T3', 'S', 'K'];

// ---------- small storage (recents, favourites, last view settings) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('bl.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('bl.' + k, JSON.stringify(v)); } catch (e) { /* private mode: keep going */ } },
};
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200); }

// ---------- data ----------
let INDEX = null, BYID = null;
async function loadIndex() {
  if (INDEX) return INDEX;
  const man = await (await fetch(DATA + 'manifest.json')).json();
  const parts = await Promise.all(man.search.map(f => fetch(DATA + f).then(r => r.json())));
  INDEX = parts.flat().map(r => ({ id: r[0], title: r[1], artist: r[2], bpm: r[3], key: r[4], meter: r[5], feel: r[6], q: r[7], dl: r[8], gl: r[9], n: norm(r[1] + ' ' + r[2]) }));
  BYID = new Map(INDEX.map(s => [s.id, s])); INDEX.manifest = man; return INDEX;
}
async function loadSong(id) { const r = await fetch(`${DATA}songs/${id.slice(0, 2)}/${id}.json`); if (!r.ok) throw new Error('not found'); return r.json(); }

// ---------- routing: #song=<id>&sec=B&tempo=80&transpose=-2 · #credits · (empty) = search ----------
// #own=<id> (own file) · #sets · #list=<set id> · #set=<shared code> · …&list=<set id>&i=<n> on a song = opened from a setlist
let FROM = null;   // {set, i} when the open song came from a setlist
function route() {
  if (JAM) closeJam();
  const h = new URLSearchParams(location.hash.slice(1));
  FROM = h.get('list') && h.has('i') ? { set: h.get('list'), i: +h.get('i') } : null;
  const opt = { sec: h.get('sec'), tempo: +h.get('tempo') || null, transpose: h.has('transpose') ? +h.get('transpose') : null };
  if (h.get('song')) return showSong(h.get('song'), opt);
  if (h.get('own')) return showOwn(h.get('own'), opt);
  if (h.get('set')) return showShared(h.get('set'));
  if (h.get('list')) return showSet(h.get('list'));
  if (location.hash === '#sets') return showSets();
  if (location.hash === '#credits') return showCredits();
  showSearch();
}
window.addEventListener('hashchange', route);

// ---------- search ----------
const F = store.get('filters', { q: '', bmin: '', bmax: '', key: '', meter: '', feel: '', minq: 60, dmax: '', gmax: '', open: false });
function match(s) {
  if (s.q < (+F.minq || 0)) return false;
  if (F.bmin && s.bpm < +F.bmin) return false; if (F.bmax && s.bpm > +F.bmax) return false;
  if (F.key && s.key !== F.key) return false; if (F.meter && s.meter !== F.meter) return false; if (F.feel && s.feel !== F.feel) return false;
  if (F.dmax && (s.dl == null || s.dl > +F.dmax)) return false; if (F.gmax && (s.gl == null || s.gl > +F.gmax)) return false;
  return true;
}
function rowHTML(s) {
  return `<li><a class="song" href="#song=${encodeURIComponent(s.id)}"><span class="t"><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></span>
    <span class="m">${s.key ? esc(s.key.replace('#', '♯')) : '—'} · ${s.bpm ? Math.round(s.bpm) : '?'}<br><span class="badge ${grade(s.q)}">${grade(s.q)}</span></span></a></li>`;
}
function ownRowHTML(r) {
  const A = r.analysis; return `<li><a class="song" href="#own=${encodeURIComponent(r.id)}"><span class="t"><b>${esc(r.title)}</b><span>${esc(r.artist || r.file)}</span></span>
    <span class="m">${A.key ? esc((A.key + (A.mode === 'minor' ? 'm' : '')).replace('#', '♯')) : '—'} · ${Math.round(A.bpm)}<br><span class="badge ${A.quality.grade}">${A.quality.grade}</span></span></a></li>`;
}
async function showSearch() {
  player.stop(); setPlayer(false); $('#where').textContent = 'Search';
  const m = $('main');
  m.innerHTML = `<div class="card"><div class="searchbar"><input id="q" type="search" placeholder="Search a song or artist" autocomplete="off" value="${esc(F.q)}" aria-label="Search">
      <button id="ftoggle" class="${F.open ? 'on' : ''}" aria-expanded="${F.open}">Filters</button></div>
    <div class="filters" id="filters" ${F.open ? '' : 'hidden'}>
      <label>BPM<span class="pair"><input id="f_bmin" inputmode="numeric" placeholder="min" value="${esc(F.bmin)}"><input id="f_bmax" inputmode="numeric" placeholder="max" value="${esc(F.bmax)}"></span></label>
      <label>Key<select id="f_key"><option value="">Any</option>${['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'].flatMap(k => [k, k + 'm']).map(k => `<option ${F.key === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label>Meter<select id="f_meter"><option value="">Any</option>${['4/4', '3/4', '6/8', '12/8', '2/4', '5/4', '7/8'].map(k => `<option ${F.meter === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label>Feel<select id="f_feel"><option value="">Any</option>${['straight', 'swing', 'light swing', 'shuffle'].map(k => `<option ${F.feel === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label>Quality<select id="f_minq"><option value="80" ${+F.minq === 80 ? 'selected' : ''}>A only</option><option value="60" ${+F.minq === 60 ? 'selected' : ''}>A and B</option><option value="0" ${+F.minq === 0 ? 'selected' : ''}>All (incl. C)</option></select></label>
      <label>Drums up to level<select id="f_dmax"><option value="">Any</option>${[2, 4, 6, 8, 10].map(k => `<option ${+F.dmax === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label>Guitar up to level<select id="f_gmax"><option value="">Any</option>${[2, 4, 6, 8, 10].map(k => `<option ${+F.gmax === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
    </div></div>
    <div class="tools" style="margin-top:0"><label class="btn" for="ownfile">Open my MIDI file</label><input id="ownfile" type="file" accept=".mid,.midi,.kar,audio/midi,audio/x-midi" hidden>
      <a class="btn" href="#sets">Setlists${Sets.allSets().length ? ` · ${Sets.allSets().length}` : ''}</a></div>
    <div id="results"><div class="empty">Loading the song list…</div></div>`;
  const q = $('#q'); let idx = null;
  $('#ownfile').onchange = async e => { const f = e.target.files[0]; if (!f) return; toast('Reading ' + f.name + '…');
    try { const r = await importFile(f); location.hash = '#own=' + r.id; } catch (err) { toast(err.message || 'Could not read that file'); } };
  $('#ftoggle').onclick = () => { F.open = !F.open; store.set('filters', F); $('#filters').hidden = !F.open; $('#ftoggle').classList.toggle('on', F.open); $('#ftoggle').setAttribute('aria-expanded', F.open); };
  const bind = (id, k) => { const el = $(id); el[el.tagName === 'SELECT' ? 'onchange' : 'oninput'] = () => { if (F[k] === el.value) return; F[k] = el.value; store.set('filters', F); render(); }; };
  bind('#q', 'q'); bind('#f_bmin', 'bmin'); bind('#f_bmax', 'bmax'); bind('#f_key', 'key'); bind('#f_meter', 'meter'); bind('#f_feel', 'feel'); bind('#f_minq', 'minq'); bind('#f_dmax', 'dmax'); bind('#f_gmax', 'gmax');
  const own = await listOwn(); if (!$('#results')) return;   // the user may have moved on while this loaded
  try { idx = await loadIndex(); } catch (e) { if ($('#results')) $('#results').innerHTML = `<div class="empty">Couldn't load the song list. You're probably offline and haven't opened Backline online yet.</div>`; return; }
  function render() {
    const words = norm(F.q).split(' ').filter(Boolean), out = $('#results'); if (!out || !idx) return;   // typed before the list loaded: render() runs again once it has
    if (!words.length) {
      const fav = store.get('favs', []).map(id => BYID.get(id)).filter(Boolean), rec = store.get('recent', []).map(id => BYID.get(id)).filter(Boolean);
      out.innerHTML = (fav.length ? `<div class="sectitle"><h2>Favourites</h2></div><div class="card"><ul class="list">${fav.map(rowHTML).join('')}</ul></div>` : '') +
        (rec.length ? `<div class="sectitle"><h2>Recent</h2></div><div class="card"><ul class="list">${rec.map(rowHTML).join('')}</ul></div>` : '') +
        (own.length ? `<div class="sectitle"><h2>My MIDI files</h2><span class="mut small">on this device only</span></div><div class="card"><ul class="list">${own.map(ownRowHTML).join('')}</ul></div>` : '') +
        `<p class="mut small">${idx.length.toLocaleString()} songs from the Lakh MIDI Dataset. Type a title or an artist. Lakh runs up to about 2015 and is mostly Western pop and rock.</p>`;
      return;
    }
    const hits = [];
    for (const s of idx) { if (!words.every(w => s.n.includes(w)) || !match(s)) continue;
      const t = norm(s.title), score = (t === words.join(' ') ? 3 : 0) + (t.startsWith(words[0]) ? 2 : 0) + (s.n.startsWith(words[0]) ? 1 : 0) + s.q / 100;
      hits.push([score, s]); }
    hits.sort((a, b) => b[0] - a[0]);
    const hidden = idx.filter(s => words.every(w => s.n.includes(w))).length - hits.length;
    out.innerHTML = hits.length ? `<div class="sectitle"><h2>${hits.length > 60 ? 'Top 60 of ' + hits.length : hits.length} songs</h2>${hidden ? `<span class="mut small">${hidden} hidden by filters</span>` : ''}</div><div class="card"><ul class="list">${hits.slice(0, 60).map(h => rowHTML(h[1])).join('')}</ul></div>`
      : `<div class="empty">No songs found${hidden ? ` (${hidden} hidden by filters: try Quality → All)` : ''}.</div>`;
  }
  if (!$('#results')) return; render(); if (!matchMedia('(pointer:coarse)').matches) q.focus();
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
  const m = $('main'); $('#where').textContent = '';
  if (!SONG || SONG.id !== id) {
    m.innerHTML = '<div class="empty">Loading…</div>';
    let S; try { S = await loadSong(id); } catch (e) { m.innerHTML = `<div class="empty">Couldn't load this song${navigator.onLine ? '' : ': you\'re offline and it hasn\'t been opened before'}. <a href="#">Back to search</a></div>`; return; }
    const rec = store.get('recent', []).filter(x => x !== id); rec.unshift(id); store.set('recent', rec.slice(0, 20));
    loadIntoPlayer(S, null);
  }
  applyOpt(opt);
}
async function showOwn(id, opt = {}) {
  const m = $('main');
  if (!SONG || SONG.id !== id) {
    m.innerHTML = '<div class="empty">Loading…</div>';
    const rec = await getOwn(id).catch(() => null);
    if (!rec) { m.innerHTML = `<div class="empty">That file isn't on this device any more. Own MIDI files stay on the phone or computer that opened them. <a href="#">Back to search</a></div>`; return; }
    let notes = null; try { notes = fileNotes(rec.bytes, rec.analysis); } catch (e) { /* plays the backing instead */ }
    loadIntoPlayer(asSong(rec), notes);
  }
  applyOpt(opt);
}
function loadIntoPlayer(S, notes) {
  SONG = S; SHIFT = 0; SEL = null; TRACKS = notes ? notes.tracks : [];
  const A = S.analysis; TL = timeline(A); if (notes) TL.forEach((b, i) => { b.notes = notes.bars[i] || []; });
  player.load({ bars: TL, bpm: A.bpm, swing: A.swing }); player.pct = 100; player.loop = null;
  // own file: play the file's own parts (melody and vocals included); the synthesised bass + pad start muted
  player.fileMode = !!notes; player.trackMute = new Set();
  if (notes) { player.mute.bass = true; player.mute.chords = true; } else { player.mute.bass = false; player.mute.chords = false; }
  if (player.ctx) ['bass', 'chords'].forEach(k => player.setMute(k, player.mute[k]));
}
function applyOpt(opt) {
  if (opt.transpose != null) SHIFT = opt.transpose;
  if (opt.tempo) player.pct = Math.min(120, Math.max(50, opt.tempo));
  if (opt.sec) { const i = SONG.analysis.form.findIndex(f => f.sec === opt.sec); if (i >= 0) SEL = i; }
  renderSheet();
}
function keyInfo() {
  const S = SONG, c = S.consensus, A = S.analysis;
  const kpc = c.key ? pcOf(c.key) : A.key ? pcOf(A.key) : null, minor = (c.mode || A.mode) === 'minor';
  const shownPc = kpc == null ? null : ((kpc + SHIFT) % 12 + 12) % 12, flats = shownPc == null ? false : flatKey(shownPc, minor);
  return { kpc, shownPc, minor, flats, total: (S.transpose || 0) + SHIFT };
}
function renderSheet() {
  const S = SONG, A = S.analysis, c = S.consensus, K = keyInfo(), m = $('main');
  $('#where').textContent = `${S.title} · ${S.artist}`;
  const favs = store.get('favs', []), isFav = favs.includes(S.id);
  const allChords = TL.flatMap(b => b.chords).filter(x => x && x !== 'N').map(x => transposeChord(x, K.total, K.flats));
  const capo = capoHint(allChords);
  const g = A.quality.grade;
  m.innerHTML = `
  <div class="sheethead"><div class="ti"><h1>${esc(S.title)}</h1><div class="ar">${esc(S.artist)}</div></div>
    <div class="tools" style="margin-top:0"><button id="jambtn" class="pri">Jam mode</button><button id="addset">+ Setlist</button>
      ${S.own ? '<button id="delown">Remove file</button>' : `<button id="fav" class="${isFav ? 'on' : ''}" aria-pressed="${isFav}">${isFav ? '★' : '☆'} Favourite</button>`}</div></div>
  ${setBanner()}
  <div class="facts">
    <span class="fact">Key<b>${K.shownPc == null ? '—' : keyLabel(K.shownPc, K.minor, K.flats)}</b></span>
    <span class="fact">BPM<b>${Math.round(c.bpm || A.bpm)}${c.bpmSure ? '' : ' ≈'}</b></span>
    <span class="fact">Meter<b>${esc(c.meter || A.meter)}</b></span>
    <span class="fact">Feel<b>${esc(A.feel || '—')}</b></span>
    <span class="fact">Quality<b><span class="badge ${g}">${g}</span></b></span>
    <span class="fact">Drums<b>${A.difficulty.drums ?? '—'}/10</b></span><span class="fact">Guitar<b>${A.difficulty.guitar ?? '—'}/10</b></span>
  </div>
  ${S.own ? `<div class="note">Your own file (${esc(S.file)}), analysed on this device. It stays here and is never uploaded.</div>` : ''}
  ${TRACKS.length ? `<div class="card tracks"><div class="sectitle" style="margin:0 0 6px"><h2>Parts in your file</h2><span class="mut small">tap to mute or unmute</span></div><div class="tools" style="margin-top:0">
    <button id="filemode" class="${player.fileMode ? 'on' : ''}">${player.fileMode ? 'Playing the file' : 'Playing the backing'}</button>
    ${TRACKS.map(t => `<button data-track="${t.tr}" class="${player.trackMute.has(t.tr) ? '' : 'on'}" ${player.fileMode ? '' : 'disabled'}>${esc(t.name)}</button>`).join('')}</div>
    <div class="note">“Playing the file” plays every part of your file, melody and vocal line included, with simple synth sounds. Switch to “Playing the backing” for the generated drums, bass and chords.</div></div>` : ''}
  ${S.versions.length > 1 ? `<div class="note">Version ${S.primary} of ${S.versions.length} in Lakh (the best one that agrees with the others). ${c.keyVotes ? `${c.keyAgree} of ${c.keyVotes} versions agree on the key.` : ''}</div>` : ''}
  ${S.transpose ? `<div class="warnbox">This file was written in ${esc(A.key)} ${esc(A.mode)}; the other versions say ${esc(c.key)} ${esc(c.mode)}, so the chords are shifted ${S.transpose > 0 ? '+' : ''}${S.transpose} to match.</div>` : ''}
  <div class="tools">
    <span class="seg" role="group" aria-label="View"><button data-view="guitar" class="${VIEW === 'guitar' ? 'on' : ''}">Guitar</button><button data-view="drums" class="${VIEW === 'drums' ? 'on' : ''}">Drums</button><button data-view="both" class="${VIEW === 'both' ? 'on' : ''}">Both</button></span>
    <span class="seg" role="group" aria-label="Chord names"><button data-roman="0" class="${ROMAN ? '' : 'on'}">C G Am</button><button data-roman="1" class="${ROMAN ? 'on' : ''}">I V vi</button></span>
    <span class="stepper" aria-label="Transpose"><button id="tdn" aria-label="Transpose down">−</button><span id="tval">${SHIFT === 0 ? 'Original' : (SHIFT > 0 ? '+' : '') + SHIFT}</span><button id="tup" aria-label="Transpose up">+</button></span>
  </div>
  <div class="note">${capo.capo ? `Capo ${capo.capo}: play the shapes of ${keyLabel(((K.shownPc ?? 0) - capo.capo + 12) % 12, K.minor, flatKey(((K.shownPc ?? 0) - capo.capo + 12) % 12, K.minor))} (barre chords ${Math.round(capo.barre * 100)}% → ${Math.round(capo.barreWithCapo * 100)}%).` : allChords.length ? 'No capo needed.' : ''}
    Section names with “?” and the chords are the engine's guesses${S.own ? ' from your file' : ' from a fan-made file'}.</div>
  <div class="formstrip" id="strip" role="list">${A.form.map((f, i) => `<button role="listitem" data-item="${i}" class="${SEL === i ? 'sel' : ''}" style="background:${SEC_COL(f.sec.charCodeAt(0) - 65)};flex-grow:${f.bars};width:${Math.max(34, f.bars * 6)}px" title="${esc(f.name || f.sec)}: ${f.bars} bars">${esc((f.name || f.sec).replace('?', ''))}<small>${f.bars}</small></button>`).join('')}</div>
  <div class="view-${VIEW}" id="body" style="display:flex;flex-direction:column">
    <div class="chart" id="chart">${A.form.map((f, i) => itemHTML(f, i, K)).join('')}</div>
    <div class="drums-block">${A.drums ? `<div class="sectitle"><h2>Drum grooves</h2><span class="mut small">${esc(A.drums.features.feel || '')}${A.drums.features.halfTime ? ' · half-time' : ''}</span></div><div class="grooves">${grooveCards(A)}</div>` : '<p class="mut">No drum part in this file.</p>'}</div>
  </div>`;
  $("#jambtn").onclick = openJam;
  $('#addset').onclick = addToSetDialog;
  if ($('#delown')) $('#delown').onclick = async () => { if (!confirmInline($('#delown'), 'Tap again to remove')) return; await deleteOwn(S.id); SONG = null; location.hash = ''; };
  if ($('#filemode')) $('#filemode').onclick = () => { player.fileMode = !player.fileMode; ['bass', 'chords'].forEach(k => { player.mute[k] = player.fileMode; if (player.ctx) player.setMute(k, player.mute[k]); }); renderSheet(); };
  m.querySelectorAll('[data-track]').forEach(b => b.onclick = () => { const t = +b.dataset.track; player.trackMute.has(t) ? player.trackMute.delete(t) : player.trackMute.add(t); b.classList.toggle('on', !player.trackMute.has(t)); });
  if ($('#setprev')) $('#setprev').onclick = () => openFromSet(FROM.set, FROM.i - 1);
  if ($('#setnext')) $('#setnext').onclick = () => openFromSet(FROM.set, FROM.i + 1);
  if ($('#fav')) $('#fav').onclick = () => { const f = store.get('favs', []), i = f.indexOf(S.id); if (i >= 0) f.splice(i, 1); else f.unshift(S.id); store.set('favs', f); renderSheet(); };
  m.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { VIEW = b.dataset.view; store.set('view', VIEW); renderSheet(); });
  m.querySelectorAll('[data-roman]').forEach(b => b.onclick = () => { ROMAN = b.dataset.roman === '1'; renderSheet(); });
  $('#tdn').onclick = () => { SHIFT = Math.max(-6, SHIFT - 1); afterShift(); }; $('#tup').onclick = () => { SHIFT = Math.min(6, SHIFT + 1); afterShift(); };
  m.querySelectorAll('#strip button').forEach(b => b.onclick = () => selectItem(+b.dataset.item, true));
  m.querySelectorAll('[data-loop]').forEach(b => b.onclick = () => selectItem(+b.dataset.loop, false));
  m.querySelectorAll('.bar').forEach(el => el.onclick = () => { if (player.playing) { player.play(+el.dataset.bar); } });
  player.shift = K.total; setPlayer(true); updatePlayer(); markLoop();
}
function afterShift() { player.shift = keyInfo().total; renderSheet(); }
function itemHTML(f, i, K) {
  const A = SONG.analysis, bars = TL.filter(b => b.item === i), S = A.sections[f.sec] || {};
  const romanPer = A.chords ? A.chords.roman : [];
  let prev = null;
  const cells = bars.map(b => {
    const segs = ROMAN ? (Array.isArray(romanPer[b.bar]) ? romanPer[b.bar] : [romanPer[b.bar]]) : b.chords.map(x => transposeChord(x, K.total, K.flats));
    const label = segs.map(x => x == null || x === 'N' ? '<span class="c none">—</span>' : `<span class="c ${!ROMAN && x === prev && segs.length === 1 ? 'rep' : ''}">${ROMAN ? esc(x) : chordHTML(x)}</span>`).join('');
    prev = segs[segs.length - 1];
    return `<div class="bar ${segs.length > 1 ? 'half' : ''}" data-bar="${b.bar}"><span class="n">${b.bar + 1}</span>${label}</div>`;
  }).join('');
  return `<div class="item" id="item${i}"><div class="ihead"><span class="tag" style="background:${SEC_COL(f.sec.charCodeAt(0) - 65)}">${esc(f.sec)}</span><span class="nm">${esc(f.name || 'Section ' + f.sec)}</span><span class="ct">${f.bars} bars</span>
    <button data-loop="${i}" class="${SEL === i ? 'on' : ''}">${SEL === i ? 'Looping' : 'Loop'}</button></div><div class="bars">${cells}</div></div>`;
}
function grooveCards(A) {
  const seen = [], out = [];
  A.form.forEach(f => { if (seen.includes(f.sec)) return; seen.push(f.sec); const S = A.sections[f.sec]; if (!S) return;
    for (const [what, p] of [['Groove', S.groove], ['Fill', S.fill]]) if (p && p.v && Object.keys(p.v).length) out.push(`<div class="gcard"><div class="gh"><span class="tag badge" style="background:${SEC_COL(f.sec.charCodeAt(0) - 65)};color:#111">${esc(f.sec)}</span><b>${esc(f.name || 'Section ' + f.sec)}</b><span class="mut">${what}</span></div>${lanesHTML(p)}</div>`); });
  return out.join('') || '<p class="mut">No grooves found.</p>';
}
function lanesHTML(p) {
  const lanes = LANES.filter(l => p.v[l]), len = p.v[lanes[0]].length, sub = p.sub || 2;
  const cls = ch => ch === '.' ? '' : ch === 'X' ? 'acc' : ch === 'g' ? 'gho' : ch === 'o' ? 'opn' : 'hit';
  return `<div class="lanes" style="grid-template-columns:auto repeat(${len},minmax(9px,1fr))">${lanes.map(l => `<span class="ln">${l}</span>${[...p.v[l]].map((ch, s) => `<span class="st ${cls(ch)} ${s % sub === 0 ? 'beat' : ''}" style="--pc:var(--p-${l})"></span>`).join('')}`).join('')}</div>`;
}
function selectItem(i, scroll) {
  SEL = SEL === i ? null : i;
  player.loop = SEL == null ? null : (() => { const bs = TL.filter(b => b.item === SEL); return [bs[0].bar, bs[bs.length - 1].bar]; })();
  document.querySelectorAll('#strip button').forEach(b => b.classList.toggle('sel', +b.dataset.item === SEL));
  document.querySelectorAll('[data-loop]').forEach(b => { const on = +b.dataset.loop === SEL; b.classList.toggle('on', on); b.textContent = on ? 'Looping' : 'Loop'; });
  markLoop(); updatePlayer();
  if (scroll && SEL != null) $('#item' + SEL).scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function markLoop() { document.querySelectorAll('.bar').forEach(el => { const b = TL[+el.dataset.bar]; el.classList.toggle('inloop', SEL != null && b.item === SEL); }); }

// ---------- player bar ----------
function setPlayer(on) { $('#player').hidden = !on; document.body.style.setProperty('--player-h', on ? $('#player').offsetHeight + 'px' : '0px'); }
function updatePlayer() {
  if (!SONG) return; const p = $('#player');
  p.querySelector('.play').textContent = player.playing ? '❚❚' : '▶'; p.querySelector('.play').setAttribute('aria-label', player.playing ? 'Pause' : 'Play');
  $('#tempo').value = player.pct; $('#tempoval').textContent = `${player.pct}% · ${Math.round(player.tempo)} BPM`;
  for (const k of ['drums', 'bass', 'chords', 'click']) { const b = p.querySelector(`[data-mute="${k}"]`); const on = !player.mute[k]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }
  $('#countin').classList.toggle('on', player.countIn);
  $('#loopinfo').textContent = SEL != null ? `Loop: ${SONG.analysis.form[SEL].name || SONG.analysis.form[SEL].sec}` : 'Whole song';
  setPlayer(true);
}
let lastNow = null;
player.onBar = (bar, beat) => {
  if (JAM) jamUpdate(bar, beat);
  if (beat) return;   // the sheet only moves on bar changes
  const pos = $('#ppos'); if (!pos) return;
  if (lastNow) lastNow.classList.remove('now'); document.querySelectorAll('#strip .now').forEach(x => x.classList.remove('now'));
  if (bar === -1) { pos.innerHTML = '<b>Count-in</b><span>&nbsp;</span>'; return; }
  if (bar < 0) return;
  const b = TL[bar], f = SONG.analysis.form[b.item], el = document.querySelector(`.bar[data-bar="${bar}"]`);
  pos.innerHTML = `<b>Bar ${bar + 1}</b><span>${esc(f.name || 'Section ' + f.sec)} · ${b.grooveBar + 1}/${f.bars}</span>`;
  if (el) { el.classList.add('now'); lastNow = el; const r = el.getBoundingClientRect(), ph = $('#player').offsetHeight;
    if (r.bottom > innerHeight - ph - 8 || r.top < 70) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  const sb = document.querySelector(`#strip [data-item="${b.item}"]`); if (sb) sb.classList.add('now');
};
player.onStop = () => { updatePlayer(); if (lastNow) lastNow.classList.remove('now'); if (JAM) jamUpdate(null); };
function wirePlayer() {
  const p = $('#player');
  p.querySelector('.play').onclick = async () => { if (player.playing) { player.stop(); updatePlayer(); return; }
    player.shift = keyInfo().total; const from = SEL != null ? player.loop[0] : 0; await player.play(from); updatePlayer(); };
  $('#tempo').oninput = e => { player.pct = +e.target.value; updatePlayer(); };
  p.querySelectorAll('[data-mute]').forEach(b => b.onclick = () => { const k = b.dataset.mute; player.mute[k] = !player.mute[k]; if (player.ctx) player.setMute(k, player.mute[k]); updatePlayer(); });
  $('#countin').onclick = () => { player.countIn = !player.countIn; updatePlayer(); };
  $('#loopinfo').onclick = () => { if (SEL != null) selectItem(SEL, false); };
}

// ---------- small helpers ----------
/** two-tap confirm on the same button (no browser dialogs) */
function confirmInline(btn, label) { if (btn.dataset.armed) return true; const old = btn.textContent; btn.dataset.armed = 1; btn.textContent = label;
  setTimeout(() => { delete btn.dataset.armed; btn.textContent = old; }, 3000); return false; }
function sheetDialog(html, wire) {
  const d = document.createElement('div'); d.className = 'dlg'; d.innerHTML = `<div class="card" role="dialog" aria-modal="true">${html}</div>`;
  d.onclick = e => { if (e.target === d) d.remove(); }; document.body.appendChild(d); wire(d, () => d.remove()); return d;
}

// ---------- setlists ----------
function songRef() { return { id: SONG.id, title: SONG.title, artist: SONG.artist, own: !!SONG.own, tempo: player.pct, transpose: SHIFT }; }
function addToSetDialog() {
  const sets = Sets.allSets();
  sheetDialog(`<h2>Add to a setlist</h2><p class="mut small">Saves ${esc(SONG.title)} at ${player.pct}% tempo${SHIFT ? `, transposed ${SHIFT > 0 ? '+' : ''}${SHIFT}` : ''}.</p>
    <ul class="list">${sets.map(s => `<li><button class="ghost wide" data-set="${s.id}">${esc(s.name)} <span class="mut">· ${s.songs.length} songs${s.songs.some(x => x.id === SONG.id) ? ' · already in it (updates tempo and key)' : ''}</span></button></li>`).join('')}</ul>
    <div class="tools"><input id="newset" placeholder="New setlist name" style="flex:1;min-width:0"><button class="pri" id="mkset">Create + add</button></div>
    <div class="tools"><button id="dlgclose">Close</button></div>`, (d, close) => {
    d.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { Sets.addToSet(b.dataset.set, songRef()); close(); toast('Added to ' + Sets.getSet(b.dataset.set).name); });
    d.querySelector('#mkset').onclick = () => { const s = Sets.newSet(d.querySelector('#newset').value.trim() || 'Setlist ' + (sets.length + 1)); Sets.addToSet(s.id, songRef()); close(); toast('Added to ' + s.name); };
    d.querySelector('#dlgclose').onclick = close;
  });
}
function setBanner() {
  if (!FROM) return ''; const s = Sets.getSet(FROM.set); if (!s) return '';
  return `<div class="setbar"><a href="#list=${s.id}">${esc(s.name)}</a><span class="mut">${FROM.i + 1} of ${s.songs.length}</span>
    <button id="setprev" ${FROM.i > 0 ? '' : 'disabled'} aria-label="Previous song">‹ Prev</button><button id="setnext" ${FROM.i < s.songs.length - 1 ? '' : 'disabled'} aria-label="Next song">Next ›</button></div>`;
}
function songHash(x, setId, i) { return `#${x.own ? 'own' : 'song'}=${encodeURIComponent(x.id)}&tempo=${x.tempo || 100}&transpose=${x.transpose || 0}` + (setId ? `&list=${setId}&i=${i}` : ''); }
function openFromSet(setId, i) { const s = Sets.getSet(setId); if (!s || !s.songs[i]) return; player.stop(); location.hash = songHash(s.songs[i], setId, i); }
async function showSets() {
  player.stop(); setPlayer(false); $('#where').textContent = 'Setlists';
  const sets = Sets.allSets();
  $('main').innerHTML = `<div class="sectitle"><h2>Setlists</h2></div>
    <div class="card">${sets.length ? `<ul class="list">${sets.map(s => `<li><a class="song" href="#list=${s.id}"><span class="t"><b>${esc(s.name)}</b><span>${s.songs.map(x => esc(x.title)).join(' · ') || 'empty'}</span></span><span class="m">${s.songs.length}<br>songs</span></a></li>`).join('')}</ul>`
      : '<div class="empty">No setlists yet. Open a song and tap <b>+ Setlist</b>.</div>'}</div>
    <div class="tools"><input id="newset" placeholder="New setlist name" style="flex:1;min-width:0"><button class="pri" id="mkset">Create</button></div>
    <p class="mut small">Setlists are kept in this browser. Share one as a link to open it on another phone.</p><p><a href="#">← Back to search</a></p>`;
  $('#mkset').onclick = () => { const s = Sets.newSet($('#newset').value.trim() || 'Setlist ' + (sets.length + 1)); location.hash = '#list=' + s.id; };
}
async function showSet(id) {
  player.stop(); setPlayer(false);
  const s = Sets.getSet(id); if (!s) { $('main').innerHTML = '<div class="empty">That setlist isn\'t on this device. <a href="#sets">All setlists</a></div>'; return; }
  $('#where').textContent = s.name;
  const sh = (x, i) => `${x.tempo && x.tempo !== 100 ? x.tempo + '%' : ''}${x.transpose ? ` ${x.transpose > 0 ? '+' : ''}${x.transpose}` : ''}`.trim();
  $('main').innerHTML = `<div class="sectitle"><h2>${esc(s.name)}</h2><span class="mut small">${s.songs.length} songs</span></div>
    <div class="card">${s.songs.length ? `<ol class="list setsongs">${s.songs.map((x, i) => `<li><div class="song"><a class="t" href="${songHash(x, id, i)}"><b>${i + 1}. ${esc(x.title)}</b><span>${esc(x.artist || '')}${x.own ? ' · my file' : ''}${sh(x) ? ' · ' + esc(sh(x)) : ''}</span></a>
      <span class="rowbtns"><button data-up="${i}" aria-label="Move up" ${i ? '' : 'disabled'}>↑</button><button data-dn="${i}" aria-label="Move down" ${i < s.songs.length - 1 ? '' : 'disabled'}>↓</button><button data-rm="${i}" aria-label="Remove">✕</button></span></div></li>`).join('')}</ol>`
      : '<div class="empty">Empty. Open a song and tap <b>+ Setlist</b>.</div>'}</div>
    <div class="tools"><button class="pri" id="start" ${s.songs.length ? '' : 'disabled'}>Start from song 1</button><button id="share" ${s.songs.length ? '' : 'disabled'}>Share link</button>
      <button id="rename">Rename</button><button id="delset">Delete setlist</button></div>
    ${s.songs.some(x => x.own) ? '<p class="mut small">Songs from your own MIDI files only open on this device; a shared link skips them.</p>' : ''}
    <p><a href="#sets">← All setlists</a></p>`;
  const m = $('main');
  m.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { Sets.moveInSet(id, +b.dataset.up, -1); showSet(id); });
  m.querySelectorAll('[data-dn]').forEach(b => b.onclick = () => { Sets.moveInSet(id, +b.dataset.dn, 1); showSet(id); });
  m.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { if (!confirmInline(b, 'Sure?')) return; Sets.removeFromSet(id, +b.dataset.rm); showSet(id); });
  $('#start').onclick = () => openFromSet(id, 0);
  $('#share').onclick = async () => { const link = Sets.shareLink({ ...s, songs: s.songs.filter(x => !x.own) }, location.href);
    try { if (navigator.share) { await navigator.share({ title: s.name, text: 'Setlist: ' + s.name, url: link }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch (e) { sheetDialog(`<h2>Share link</h2><input value="${esc(link)}" readonly style="width:100%"><div class="tools"><button id="dlgclose">Close</button></div>`, (d, close) => { d.querySelector('input').select(); d.querySelector('#dlgclose').onclick = close; }); } };
  $('#rename').onclick = () => sheetDialog(`<h2>Rename</h2><input id="nm" value="${esc(s.name)}" style="width:100%"><div class="tools"><button class="pri" id="ok">Save</button><button id="dlgclose">Cancel</button></div>`, (d, close) => {
    d.querySelector('#ok').onclick = () => { s.name = d.querySelector('#nm').value.trim() || s.name; Sets.putSet(s); close(); showSet(id); }; d.querySelector('#dlgclose').onclick = close; });
  $('#delset').onclick = () => { if (!confirmInline($('#delset'), 'Tap again to delete')) return; Sets.deleteSet(id); location.hash = '#sets'; };
}
async function showShared(code) {
  player.stop(); setPlayer(false); $('#where').textContent = 'Shared setlist';
  const sh = Sets.decodeShared(code);
  if (!sh) { $('main').innerHTML = '<div class="empty">This setlist link is broken or cut off. Ask for it again. <a href="#">Back to search</a></div>'; return; }
  let idx = null; try { idx = await loadIndex(); } catch (e) { /* offline: show ids */ }
  const rows = sh.songs.map(x => { const r = BYID && BYID.get(x.id); return { ...x, title: r ? r.title : x.id, artist: r ? r.artist : '', missing: idx && !r }; });
  $('main').innerHTML = `<div class="sectitle"><h2>${esc(sh.name)}</h2><span class="mut small">shared with you · ${rows.length} songs</span></div>
    <div class="card"><ol class="list">${rows.map((x, i) => `<li><div class="song"><span class="t"><b>${i + 1}. ${esc(x.title)}</b><span>${esc(x.artist)}${x.tempo !== 100 ? ' · ' + x.tempo + '%' : ''}${x.transpose ? ` · ${x.transpose > 0 ? '+' : ''}${x.transpose}` : ''}${x.missing ? ' · not in this index' : ''}</span></span></div></li>`).join('')}</ol></div>
    <div class="tools"><button class="pri" id="saveset">Save to my setlists</button><a class="btn" href="#">Not now</a></div>`;
  $('#saveset').onclick = () => { const s = Sets.newSet(sh.name); s.songs = rows.filter(x => !x.missing).map(x => ({ id: x.id, title: x.title, artist: x.artist, tempo: x.tempo, transpose: x.transpose })); Sets.putSet(s); toast('Saved'); location.hash = '#list=' + s.id; };
}

// ---------- jam mode: full screen, current chord large, next chord, bar and beat; screen stays awake ----------
async function openJam() {
  const K = keyInfo(), A = SONG.analysis;
  JAM = { K, wake: null, el: document.createElement('div') }; JAM.el.id = 'jam'; JAM.el.setAttribute('role', 'dialog'); JAM.el.setAttribute('aria-label', 'Jam mode');
  JAM.el.innerHTML = `<div class="jtop"><span class="jsec" id="jsec">${esc(SONG.title)}</span><span class="jbar mono" id="jbar"></span><button id="jx" aria-label="Close jam mode">✕</button></div>
    <div class="jmain"><div class="jnow" id="jnow">▶</div><div class="jnext"><span class="mut">next</span><b id="jnext"></b></div></div>
    <div class="jbeats" id="jbeats"></div>
    <div class="jctl"><button id="jplay" class="pri" aria-label="Play">▶</button><button id="jslow" aria-label="Slower">−5%</button><span class="mono" id="jtempo"></span><button id="jfast" aria-label="Faster">+5%</button>
      <span class="mut small" id="jloop">${SEL != null ? 'Loop: ' + esc(A.form[SEL].name || A.form[SEL].sec) : ''}</span></div>`;
  document.body.appendChild(JAM.el); document.body.classList.add('jamming');
  JAM.el.querySelector('#jx').onclick = closeJam;
  JAM.el.querySelector('#jplay').onclick = () => $('#player .play').click();
  JAM.el.querySelector('#jslow').onclick = () => { player.pct = Math.max(50, player.pct - 5); updatePlayer(); jamUpdate(); };
  JAM.el.querySelector('#jfast').onclick = () => { player.pct = Math.min(120, player.pct + 5); updatePlayer(); jamUpdate(); };
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
  j.el.remove(); document.body.classList.remove('jamming');
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
  J.querySelector('#jtempo').textContent = `${player.pct}% · ${Math.round(player.tempo)}`;
  J.querySelector('#jplay').textContent = player.playing ? '❚❚' : '▶';
  if (bar === -1) { J.querySelector('#jnow').textContent = beat + 1; J.querySelector('#jsec').textContent = 'Count-in'; return; }
  if (bar == null || bar < 0 || !TL[bar]) { const b0 = SEL != null && player.loop ? player.loop[0] : 0; J.querySelector('#jnow').innerHTML = name(chordAt(b0, 0) || (nextChord(b0, -1) || {}).c);
    const nx = nextChord(b0, 0); J.querySelector('#jsec').textContent = SONG.title; J.querySelector('#jbar').textContent = ''; J.querySelector('#jnext').innerHTML = nx ? name(nx.c) : '—'; J.querySelector('#jbeats').innerHTML = ''; return; }
  const b = TL[bar], f = SONG.analysis.form[b.item], nx = nextChord(bar, beat);
  J.querySelector('#jnow').innerHTML = name(chordAt(bar, beat));
  J.querySelector('#jnext').innerHTML = nx ? name(nx.c) + (nx.bar !== bar ? `<small class="mut"> · bar ${nx.bar + 1}</small>` : '') : '—';
  J.querySelector('#jsec').textContent = (f.name || f.sec).replace('?', '');
  J.querySelector('#jbar').textContent = `bar ${b.grooveBar + 1}/${f.bars} · ${bar + 1}`;
  J.querySelector('#jbeats').innerHTML = Array.from({ length: b.beats }, (_, k) => `<span class="${k === beat ? 'on' : ''} ${k === 0 ? 'one' : ''}"></span>`).join('');
}

// ---------- credits ----------
async function showCredits() {
  player.stop(); setPlayer(false); $('#where').textContent = 'Credits';
  let man = null; try { man = (await loadIndex()).manifest; } catch (e) { /* offline */ }
  $('main').innerHTML = `<div class="card credits"><h2>Credits</h2>
    <p>Song data is derived from the <a href="https://colinraffel.com/projects/lmd/" rel="noopener">Lakh MIDI Dataset v0.1</a> by Colin Raffel, licensed <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener">CC BY 4.0</a>. C. Raffel, <em>Learning-Based Methods for Comparing Sequences, with Applications to Audio-to-MIDI Alignment and Matching</em>, PhD thesis, Columbia University, 2016.</p>
    <p>The MIDI files are fan transcriptions and may be wrong. Backline publishes only what it works out from them: tempo, meter, key, chord names, section form and short drum patterns. No MIDI files, melodies or lyrics.</p>
    <p>All sounds are synthesised in your browser.</p>
    ${man ? `<p class="mut small">Index built ${esc(man.built)} with engine ${esc(man.engine)}: ${man.counts.songs.toLocaleString()} songs from ${man.counts.files.toLocaleString()} files.</p>` : ''}
    <p><a href="#">← Back to search</a></p></div>`;
}

// ---------- start ----------
function netChip() { $('#net').textContent = navigator.onLine ? '' : 'offline'; }
addEventListener('online', netChip); addEventListener('offline', netChip);
wirePlayer(); netChip(); route();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__bl = { player, Sets, get song() { return SONG; }, get tl() { return TL; }, get jam() { return JAM; } };   // for the headless checks
