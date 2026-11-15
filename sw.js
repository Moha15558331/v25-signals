/* V25 Signals service worker.
 * Caches the static app shell so the home-screen app opens offline.
 * Never caches live market data (WebSocket ticks do not go through fetch)
 * and never caches the published signal log (always network, no-store).
 */
const CACHE = 'v25-shell-v3';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config/deriv.js',
  './shared/core.js',
  './shared/deriv-account.js',
  './vendor/lightweight-charts.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png'
];

function isLiveData(url) {
  try {
    const u = new URL(url);
    const p = u.pathname;
    if (p.endsWith('signals.json') || p.endsWith('signals.csv') || p.includes('/data/')) return true;
    if (u.protocol === 'ws:' || u.protocol === 'wss:') return true;
  } catch (_) {}
  return false;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Never intercept or cache live log / market HTTP fetches.
  if (isLiveData(req.url)) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let CDN / APIs pass through uncached

  // App shell: network-first so deploys show up, cache fallback when offline.
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    try {
      const res = await fetch(req);
      if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
        const copy = res.clone();
        const cache = await caches.open(CACHE);
        await cache.put(req, copy);
      }
      return res;
    } catch (err) {
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const index = await caches.match('./index.html');
        if (index) return index;
      }
      throw err;
    }
  })());
});
