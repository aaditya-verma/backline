// Backline — app shell, taken from DrumPath's src/js/05-shell.js: theme (system / light / dark), line icons, header with
// status chip + theme + search buttons, tab row on wide screens, floating bottom bar + More sheet on phones, floating dock
// with Back, a back stack that restores the exact screen and scroll, and bottom sheets.
export const $ = (s, el = document) => el.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- theme ---------- */
const THEME_KEY = 'backline-theme';
export const themeMode = () => { try { return localStorage.getItem(THEME_KEY) || 'system'; } catch (e) { return 'system'; } };
export function applyTheme() {
  const m = themeMode(), dark = m === 'dark' || (m === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const b = $('#themebtn'); if (b) { b.innerHTML = icon(dark ? 'sun' : 'moon', 16) + '<span class="lb">' + (dark ? 'Light' : 'Dark') + '</span>'; b.title = 'Theme: ' + ({ system: 'follow device', light: 'light', dark: 'dark' }[m]); }
  const tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = dark ? '#2e333a' : '#e7e9ec';
}
export function setTheme(m) { try { localStorage.setItem(THEME_KEY, m); } catch (e) { /* private mode */ } applyTheme(); }
export function cycleTheme() { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); }
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (themeMode() === 'system') applyTheme(); }); } catch (e) { /* old browsers */ }

/* ---------- icons (24-px line icons, 1.9 stroke, as DrumPath) ---------- */
const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  browse: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  sets: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  files: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M10 17v-5l4-1v5"/><circle cx="9" cy="17" r="1.3"/><circle cx="13" cy="16" r="1.3"/>',
  songs: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  credits: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  back: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  play: '<path d="M7 4l13 8-13 8z"/>', pause: '<path d="M7 4h4v16H7zM14 4h4v16h-4z"/>',
  jam: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 15V9l3 3 3-3v6"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  chev: '<path d="M9 6l6 6-6 6"/>', star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
};
export const icon = (k, sz = 22) => `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ''}</svg>`;

/* ---------- sections ---------- */
export const NAVI = {
  home: ['Home', 'Recent songs, favourites, setlists', '#'],
  search: ['Search', 'Find a song or an artist', '#search'],
  browse: ['Browse', 'By key, tempo, meter, feel, artist', '#browse'],
  sets: ['Setlists', 'Your lists, share with a friend', '#sets'],
  files: ['My files', 'Your own MIDI files, on this device', '#files'],
  settings: ['Settings', 'Theme, offline songs, storage', '#settings'],
  credits: ['Credits', 'Lakh MIDI Dataset and how the data is made', '#credits'],
};
export const PRIMARY = ['home', 'search', 'browse', 'sets'];
export const ALLNAV = ['home', 'search', 'browse', 'sets', 'files', 'settings', 'credits'];

/* ---------- back stack: every navigation leaves a snapshot; Back restores the screen and its scroll ---------- */
export const NAV = { stack: [], cur: null, backing: false };
export function noteView(section, label) {        // called by each view after it renders
  NAV.cur = { hash: location.hash || '#', label, section };
  syncNav(section);
}
export function beforeRoute() {                    // called on every hash change, before the next view renders
  if (NAV.backing) { NAV.backing = false; return null; }
  const prev = NAV.cur; if (prev && prev.hash !== (location.hash || '#')) { const top = NAV.stack[NAV.stack.length - 1];
    if (!top || top.hash !== prev.hash) NAV.stack.push({ ...prev, y: scrollY }); if (NAV.stack.length > 30) NAV.stack.shift(); }
  return null;
}
export function back() {
  const sn = NAV.stack.pop();
  if (!sn) { if ((location.hash || '#') !== '#') location.hash = ''; return; }
  NAV.backing = true; NAV.restoreY = sn.y; location.hash = sn.hash === '#' ? '' : sn.hash;
}
export function restoreScroll() { if (NAV.restoreY != null) { const y = NAV.restoreY; NAV.restoreY = null; requestAnimationFrame(() => scrollTo(0, y)); } else scrollTo(0, 0); }

/* ---------- shell DOM ---------- */
export function buildShell() {
  $('#tabs').innerHTML = ALLNAV.map(k => `<a class="tab" data-nav="${k}" href="${NAVI[k][2]}" title="${NAVI[k][1]}">${NAVI[k][0]}</a>`).join('');
  $('#bnav').innerHTML = PRIMARY.map(k => `<a class="bbtn" data-nav="${k}" href="${NAVI[k][2]}"><span class="nic">${icon(k)}</span>${NAVI[k][0]}</a>`).join('') +
    `<button class="bbtn" id="morebtn" data-act="more"><span class="nic">${icon('more')}</span>More</button>`;
  $('#searchbtn').innerHTML = icon('search', 16) + '<span class="lb">Search</span>';
  $('.dk-nav').innerHTML = icon('more', 22); $('#backb').innerHTML = icon('back', 22);
  applyTheme();
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    if (act === 'more') { e.preventDefault(); $('#msheet').classList.contains('hidden') ? openMore() : closeMore(); }
    else if (act === 'back') back();
    else if (act === 'theme') cycleTheme();
    else if (act === 'search') location.hash = '#search';
    else if (act === 'home') location.hash = '';
  });
}
export function syncNav(section) {
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === section));
  const m = $('#morebtn'); if (m) m.classList.toggle('on', !!section && !PRIMARY.includes(section));
  const bb = $('#backb'), top = NAV.stack[NAV.stack.length - 1];
  bb.title = top ? 'Back to ' + top.label : 'Home'; bb.setAttribute('aria-label', bb.title); bb.classList.toggle('dim', !top && section === 'home');
  closeMore();
}
export function openMore() {
  const s = $('#msheet');
  s.innerHTML = `<div class="grip"><span></span></div><div class="h2" style="margin:0 0 12px">All sections</div><div class="mgrid">${ALLNAV.map(k => `<a class="mtile" href="${NAVI[k][2]}" data-nav="${k}" style="text-decoration:none;color:inherit">${icon(k)}<b>${NAVI[k][0]}</b><span>${NAVI[k][1]}</span></a>`).join('')}</div>`;
  s.classList.remove('hidden'); $('#scrim').classList.remove('hidden');
}
export function closeMore() { const s = $('#msheet'); if (s) { s.classList.add('hidden'); $('#scrim').classList.add('hidden'); } }

/* ---------- sheets + toast ---------- */
export function openSheet(title, html, mount) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="card sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-h"><h2>${esc(title)}</h2><span class="sp"></span><button class="icon ghost" data-close aria-label="Close">${icon('close')}</button></div><div class="sbody">${html}</div></div>`;
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) close(); });
  document.body.appendChild(m); if (mount) mount(m, close); return m;
}
export function closeSheets() { document.querySelectorAll('.modal').forEach(m => m.remove()); }
export function toast(t, ms = 2600) { const d = document.createElement('div'); d.className = 'toast'; d.setAttribute('role', 'status'); d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), ms); }
/** two-tap confirm on the same button (no browser dialogs) */
export function confirmInline(btn, label) { if (btn.dataset.armed) return true; const old = btn.innerHTML; btn.dataset.armed = 1; btn.textContent = label;
  setTimeout(() => { delete btn.dataset.armed; btn.innerHTML = old; }, 3000); return false; }
