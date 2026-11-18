/* ATS service worker v14: network-first for the app shell (HTML/JS/CSS),
 * so the phone always picks up a new version. Never caches trading/market traffic
 * (WebSockets and api.derivws.com are cross-origin and pass straight through). */
const CACHE = 'ats-shell-v17';
const SHELL = ['./', './index.html', './style.css', './app.js', './remote.js', './mt5.js', './shared/ats-engine.js', './shared/hybrid.js',
  './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-192-maskable.png', './icons/icon-512-maskable.png', './icons/apple-touch-icon.png'];
const FRESH = /\.(html|js|css)$/;
function networkFirst(req) {
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return req;
  if (FRESH.test(url.pathname) || req.mode === 'navigate' || url.pathname.endsWith('/')) {
    return new Request(req, { cache: 'no-store' });
  }
  return req;
}
self.addEventListener('install', e => e.waitUntil((async () => {
  const c = await caches.open(CACHE);
  await Promise.all(SHELL.map(async u => {
    const res = await fetch(u, { cache: 'no-store' });
    if (res && res.ok) await c.put(u, res);
  }));
  await self.skipWaiting();
})()));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && (k.startsWith('ats-shell-') || k.startsWith('ats-legacy-'))).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));
self.addEventListener('message', e => { if (e.data === 'skipWaiting' || (e.data && e.data.type === 'skipWaiting')) self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/legacy/') || /\/sw\.js$/.test(url.pathname)) return;
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    try {
      const res = await fetch(networkFirst(req));
      if (res && res.ok && res.type === 'basic') { const c = await caches.open(CACHE); await c.put(req, res.clone()); }
      return res;
    } catch (err) {
      if (cached) return cached;
      if (req.mode === 'navigate') { const i = await caches.match('./index.html') || await caches.match('./'); if (i) return i; }
      throw err;
    }
  })());
});
