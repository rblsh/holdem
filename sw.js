// Network first with a three second deadline, falling back to the cached shell.
// The deadline matters: on a weak connection fetch does not fail, it hangs, and
// the game would hang with it.
const CACHE = 'holdem-v4';
const SHELL = [
  './', './index.html', './css/style.css',
  './js/app.js', './js/engine.js', './js/eval.js', './js/cards.js',
  './js/bots.js', './js/spring.js', './js/sound.js',
  './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png',
  './icons/icon-512.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const net = fetch(req).then(r => {
        if (r && r.ok) caches.open(CACHE).then(c => c.put(req, r.clone()));
        return r;
      });
      const timed = new Promise((_, bad) => setTimeout(() => bad(new Error('slow')), 3000));
      return await Promise.race([net, timed]);
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
