// Service worker: uygulama kabuğunu önbelleğe alır, ilk yüklemeden sonra tamamen çevrimdışı çalışır.
const CACHE = 'md-bilet-v3';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './seed.js',
  './vendor/html5-qrcode.min.js', './vendor/qrcode-generator.js',
  './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(resp => {
      if (resp.ok) { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return resp;
    }).catch(() => caches.match('./index.html')))
  );
});
