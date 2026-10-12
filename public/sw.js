// Service worker mínimo: permite instalar la app y abrir la página aunque la conexión esté lenta.
// Los precios (/api) siempre se piden en vivo; solo se guardan los archivos de la página.
const CACHE = 'pinky-v1';
const BASE = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'img/logo.png', 'img/favicon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Red primero; si no hay conexión, la copia guardada
  e.respondWith(fetch(e.request).then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});
