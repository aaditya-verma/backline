// Backline app (B4): search → song sheet (form, chords, drums) → backing-track player. No build step, no libraries.
import { transposeChord, chordHTML, flatKey, pcOf, keyLabel, capoHint } from './music.js';
import { Player } from './player.js';

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
function route() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('song')) return showSong(h.get('song'), { sec: h.get('sec'), tempo: +h.get('tempo') || null, transpose: h.has('transpose') ? +h.get('transpose') : null });
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
    <div id="results"><div class="empty">Loading the song list…</div></div>`;
  const q = $('#q');
  $('#ftoggle').onclick = () => { F.open = !F.open; store.set('filters', F); $('#filters').hidden = !F.open; $('#ftoggle').classList.toggle('on', F.open); $('#ftoggle').setAttribute('aria-expanded', F.open); };
  const bind = (id, k) => { const el = $(id); el[el.tagName === 'SELECT' ? 'onchange' : 'oninput'] = () => { if (F[k] === el.value) return; F[k] = el.value; store.set('filters', F); render(); }; };
  bind('#q', 'q'); bind('#f_bmin', 'bmin'); bind('#f_bmax', 'bmax'); bind('#f_key', 'key'); bind('#f_meter', 'meter'); bind('#f_feel', 'feel'); bind('#f_minq', 'minq'); bind('#f_dmax', 'dmax'); bind('#f_gmax', 'gmax');
  let idx; try { idx = await loadIndex(); } catch (e) { $('#results').innerHTML = `<div class="empty">Couldn't load the song list. You're probably offline and haven't opened Backline online yet.</div>`; return; }
  function render() {
    const words = norm(F.q).split(' ').filter(Boolean), out = $('#results'); if (!out) return;
    if (!words.length) {
      const fav = store.get('favs', []).map(id => BYID.get(id)).filter(Boolean), rec = store.get('recent', []).map(id => BYID.get(id)).filter(Boolean);
      out.innerHTML = (fav.length ? `<div class="sectitle"><h2>Favourites</h2></div><div class="card"><ul class="list">${fav.map(rowHTML).join('')}</ul></div>` : '') +
        (rec.length ? `<div class="sectitle"><h2>Recent</h2></div><div class="card"><ul class="list">${rec.map(rowHTML).join('')}</ul></div>` : '') +
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
  render(); if (!matchMedia('(pointer:coarse)').matches) q.focus();
}

// ---------- song sheet ----------
const player = new Player();
let SONG = null, VIEW = store.get('view', 'both'), ROMAN = false, SHIFT = 0, SEL = null, TL = [];

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
    try { SONG = await loadSong(id); } catch (e) { m.innerHTML = `<div class="empty">Couldn't load this song${navigator.onLine ? '' : ': you\'re offline and it hasn\'t been opened before'}. <a href="#">Back to search</a></div>`; return; }
    SHIFT = 0; SEL = null; const rec = store.get('recent', []).filter(x => x !== id); rec.unshift(id); store.set('recent', rec.slice(0, 20));
    const A = SONG.analysis; TL = timeline(A);
    player.load({ bars: TL, bpm: A.bpm, swing: A.swing }); player.pct = 100;
  }
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
    <button id="fav" class="${isFav ? 'on' : ''}" aria-pressed="${isFav}">${isFav ? '★ Favourite' : '☆ Favourite'}</button></div>
  <div class="facts">
    <span class="fact">Key<b>${K.shownPc == null ? '—' : keyLabel(K.shownPc, K.minor, K.flats)}</b></span>
    <span class="fact">BPM<b>${Math.round(c.bpm || A.bpm)}${c.bpmSure ? '' : ' ≈'}</b></span>
    <span class="fact">Meter<b>${esc(c.meter || A.meter)}</b></span>
    <span class="fact">Feel<b>${esc(A.feel || '—')}</b></span>
    <span class="fact">Quality<b><span class="badge ${g}">${g}</span></b></span>
    <span class="fact">Drums<b>${A.difficulty.drums ?? '—'}/10</b></span><span class="fact">Guitar<b>${A.difficulty.guitar ?? '—'}/10</b></span>
  </div>
  ${S.versions.length > 1 ? `<div class="note">Version ${S.primary} of ${S.versions.length} in Lakh (the best one that agrees with the others). ${c.keyVotes ? `${c.keyAgree} of ${c.keyVotes} versions agree on the key.` : ''}</div>` : ''}
  ${S.transpose ? `<div class="warnbox">This file was written in ${esc(A.key)} ${esc(A.mode)}; the other versions say ${esc(c.key)} ${esc(c.mode)}, so the chords are shifted ${S.transpose > 0 ? '+' : ''}${S.transpose} to match.</div>` : ''}
  <div class="tools">
    <span class="seg" role="group" aria-label="View"><button data-view="guitar" class="${VIEW === 'guitar' ? 'on' : ''}">Guitar</button><button data-view="drums" class="${VIEW === 'drums' ? 'on' : ''}">Drums</button><button data-view="both" class="${VIEW === 'both' ? 'on' : ''}">Both</button></span>
    <span class="seg" role="group" aria-label="Chord names"><button data-roman="0" class="${ROMAN ? '' : 'on'}">C G Am</button><button data-roman="1" class="${ROMAN ? 'on' : ''}">I V vi</button></span>
    <span class="stepper" aria-label="Transpose"><button id="tdn" aria-label="Transpose down">−</button><span id="tval">${SHIFT === 0 ? 'Original' : (SHIFT > 0 ? '+' : '') + SHIFT}</span><button id="tup" aria-label="Transpose up">+</button></span>
  </div>
  <div class="note">${capo.capo ? `Capo ${capo.capo}: play the shapes of ${keyLabel(((K.shownPc ?? 0) - capo.capo + 12) % 12, K.minor, flatKey(((K.shownPc ?? 0) - capo.capo + 12) % 12, K.minor))} (barre chords ${Math.round(capo.barre * 100)}% → ${Math.round(capo.barreWithCapo * 100)}%).` : allChords.length ? 'No capo needed.' : ''}
    Section names with “?” and the chords are the engine's guesses from a fan-made file.</div>
  <div class="formstrip" id="strip" role="list">${A.form.map((f, i) => `<button role="listitem" data-item="${i}" class="${SEL === i ? 'sel' : ''}" style="background:${SEC_COL(f.sec.charCodeAt(0) - 65)};flex-grow:${f.bars};width:${Math.max(34, f.bars * 6)}px" title="${esc(f.name || f.sec)}: ${f.bars} bars">${esc((f.name || f.sec).replace('?', ''))}<small>${f.bars}</small></button>`).join('')}</div>
  <div class="view-${VIEW}" id="body" style="display:flex;flex-direction:column">
    <div class="chart" id="chart">${A.form.map((f, i) => itemHTML(f, i, K)).join('')}</div>
    <div class="drums-block">${A.drums ? `<div class="sectitle"><h2>Drum grooves</h2><span class="mut small">${esc(A.drums.features.feel || '')}${A.drums.features.halfTime ? ' · half-time' : ''}</span></div><div class="grooves">${grooveCards(A)}</div>` : '<p class="mut">No drum part in this file.</p>'}</div>
  </div>`;
  $('#fav').onclick = () => { const f = store.get('favs', []), i = f.indexOf(S.id); if (i >= 0) f.splice(i, 1); else f.unshift(S.id); store.set('favs', f); renderSheet(); };
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
player.onBar = bar => {
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
player.onStop = () => { updatePlayer(); if (lastNow) lastNow.classList.remove('now'); };
function wirePlayer() {
  const p = $('#player');
  p.querySelector('.play').onclick = async () => { if (player.playing) { player.stop(); updatePlayer(); return; }
    player.shift = keyInfo().total; const from = SEL != null ? player.loop[0] : 0; await player.play(from); updatePlayer(); };
  $('#tempo').oninput = e => { player.pct = +e.target.value; updatePlayer(); };
  p.querySelectorAll('[data-mute]').forEach(b => b.onclick = () => { const k = b.dataset.mute; player.mute[k] = !player.mute[k]; if (player.ctx) player.setMute(k, player.mute[k]); updatePlayer(); });
  $('#countin').onclick = () => { player.countIn = !player.countIn; updatePlayer(); };
  $('#loopinfo').onclick = () => { if (SEL != null) selectItem(SEL, false); };
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
window.__bl = { player, get song() { return SONG; }, get tl() { return TL; } };   // for the headless checks
