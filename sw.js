// Backline service worker: the app shell is cached on install; the song list is network-first (falls back to the
// cached copy offline); every song that has been opened is kept, so it plays offline later.
const VER = 'bl-6.0.0';
const SHELL = ['./', 'index.html', 'app/app.css', 'app/app.js', 'app/music.js', 'app/player.js', 'app/sets.js', 'app/own.js', 'app/shell.js', 'engine/backline.js', 'app/icon.svg', 'app/manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VER + '-app').then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('bl-') && !k.startsWith(VER) && !k.endsWith('-songs')).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET') return;
  const put = (cache, req, res) => { if (res && res.ok) caches.open(cache).then(c => c.put(req, res.clone())); return res; };
  if (u.origin === location.origin && u.pathname.includes('/data/v1/songs/')) {           // songs: cached copy first, refreshed in the background
    e.respondWith(caches.match(e.request).then(hit => { const net = fetch(e.request).then(r => put('bl-songs', e.request, r)).catch(() => hit); return hit || net; }));
  } else if (u.origin === location.origin && u.pathname.includes('/data/v1/')) {            // manifest + search: network first
    e.respondWith(fetch(e.request).then(r => put(VER + '-data', e.request, r)).catch(() => caches.match(e.request)));
  } else if (u.origin === location.origin) {                                                  // app shell: cache first
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(r => put(VER + '-app', e.request, r))));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {                          // fonts: cache when seen
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => put(VER + '-fonts', e.request, r))));
  }
});
