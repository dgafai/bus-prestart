// Network-first with a 4-second timeout, falling back to the cache.
const V = 'prestart-v3';
const ASSETS = ['./', 'index.html', 'app.js', 'checklists.js', 'mock.js', 'config.js', 'manifest.json', 'logo.svg', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(V);
    try {
      const net = await Promise.race([fetch(e.request), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 4000))]);
      if (net && net.ok) c.put(e.request, net.clone());
      return net;
    } catch (_) {
      return (await c.match(e.request, { ignoreSearch: true })) || (await c.match('index.html')) || Response.error();
    }
  })());
});
