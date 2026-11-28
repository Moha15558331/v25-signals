/* Deriv Analyzer + ATS service worker (v5: Analyzer is the home screen, ATS lives in ats.html).
 * ATS service worker v14: network-first for the app shell (HTML/JS/CSS),
 * so the phone always picks up a new version. Never caches trading/market traffic
 * (WebSockets and api.derivws.com are cross-origin and pass straight through). */
const CACHE = 'ats-shell-v40';
const SHELL = ['./', './index.html', './ats.html', './shell.js', './analyzer-bots.js', './nav.js', './theme.css', './style.css', './app.js', './remote.js', './mt5.js', './push.js', './shared/ats-engine.js',
  './manifest.json', './icons/favicon-32.png', './icons/ats-180.png', './icons/ats-192.png', './icons/ats-512.png', './icons/ats-192-maskable.png', './icons/ats-512-maskable.png'];
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

/* Push alerts (v4.10): show the server's alert; a tap opens the relevant tab. */
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'ATS', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'ATS', { body: d.body || '', tag: d.tag || undefined, icon: './icons/ats-192.png', badge: './icons/ats-192.png', data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close(); const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href; const go = new URL(url).searchParams.get('go');
  e.waitUntil((async () => { const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const own = cs.filter(c => c.url.startsWith(self.registration.scope) && c.frameType !== 'nested'); const c = own.find(x => !/ats\.html/.test(x.url)) || own[0];
    if (c) { await c.focus().catch(() => { }); c.postMessage({ type: 'go', go: go || 'home' }); return; }
    await self.clients.openWindow(go ? url : new URL('./?ats=1', self.registration.scope).href); })());
});
