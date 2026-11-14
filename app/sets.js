// Backline — setlists (B5). Kept in this browser; shared as a link that carries the whole list:
// #set=<base64url(JSON {n: name, s: [[songId, tempo %, transpose], …]})>. Nothing is uploaded.
const KEY = 'bl.sets';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
const save = sets => { try { localStorage.setItem(KEY, JSON.stringify(sets)); } catch (e) { /* storage full or private mode */ } };
export const allSets = load;
export const getSet = id => load().find(s => s.id === id) || null;
export function putSet(set) { const sets = load(), i = sets.findIndex(s => s.id === set.id); if (i >= 0) sets[i] = set; else sets.unshift(set); save(sets); return set; }
export function deleteSet(id) { save(load().filter(s => s.id !== id)); }
export function newSet(name) { return putSet({ id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name || 'Setlist', songs: [], updated: Date.now() }); }
/** add or update a song in a set: {id, title, artist, tempo (50–120 %), transpose} */
export function addToSet(setId, song) {
  const s = getSet(setId); if (!s) return null; const i = s.songs.findIndex(x => x.id === song.id);
  if (i >= 0) s.songs[i] = { ...s.songs[i], ...song }; else s.songs.push(song); s.updated = Date.now(); return putSet(s);
}
export function moveInSet(setId, i, d) { const s = getSet(setId); const j = i + d; if (!s || j < 0 || j >= s.songs.length) return s; [s.songs[i], s.songs[j]] = [s.songs[j], s.songs[i]]; s.updated = Date.now(); return putSet(s); }
export function removeFromSet(setId, i) { const s = getSet(setId); if (!s) return null; s.songs.splice(i, 1); s.updated = Date.now(); return putSet(s); }

const b64u = str => btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
/** the share link for a set (song ids, tempo and transpose only; titles come from the index on the other phone) */
export function shareLink(set, base) {
  const payload = { n: set.name, s: set.songs.map(x => [x.id, x.tempo || 100, x.transpose || 0]) };
  return base.replace(/#.*$/, '') + '#set=' + b64u(JSON.stringify(payload));
}
/** decode a shared set; returns {name, songs:[{id, tempo, transpose}]} or null for a broken link */
export function decodeShared(code) {
  try { const p = JSON.parse(unb64u(code)); if (!p || !Array.isArray(p.s)) return null;
    return { name: String(p.n || 'Shared setlist').slice(0, 80), songs: p.s.filter(x => Array.isArray(x) && typeof x[0] === 'string').slice(0, 100)
      .map(([id, tempo, tr]) => ({ id: id.slice(0, 140), tempo: Math.min(120, Math.max(50, +tempo || 100)), transpose: Math.min(6, Math.max(-6, Math.round(+tr || 0))) })) };
  } catch (e) { return null; }
}
