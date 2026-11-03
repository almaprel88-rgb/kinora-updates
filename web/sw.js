'use strict';
// Kinora без интернета. Код и список фильмов: сначала сеть, а без сети берутся из кэша.
// Постеры: сначала кэш, чтобы каталог открывался быстро и офлайн.
// При изменении состава файлов увеличьте номер версии.
const SHELL = 'kinora-shell-v1', POSTERS = 'kinora-posters-v1';
const FILES = ['./index.html', './app.css', './app.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable.png', '../data/movies.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== POSTERS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.includes('/posters/')) {
    e.respondWith(caches.open(POSTERS).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
