/* ATS service worker: caches the app shell only. Never caches trading/market traffic
 * (WebSockets and api.derivws.com are cross-origin and pass straight through). */
const CACHE = 'ats-legacy-v1';
const SHELL = ['./', './index.html', './style.css', './app.js', './ats.js', './remote.js', './config/deriv.js', './shared/core.js', './shared/deriv-account.js', './shared/ats-engine.js',
  './manifest.json', '../icons/icon-192.png', '../icons/icon-512.png', '../icons/icon-192-maskable.png', '../icons/icon-512-maskable.png', '../icons/apple-touch-icon.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k.startsWith('ats-legacy-')).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    try { const res = await fetch(req); if (res && res.ok && res.type === 'basic') { const c = await caches.open(CACHE); await c.put(req, res.clone()); } return res; }
    catch (err) { if (cached) return cached; if (req.mode === 'navigate') { const i = await caches.match('./index.html'); if (i) return i; } throw err; }
  })());
});
