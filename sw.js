const CACHE_NAME = 'walkman-v14';
const SHELL_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/utils.js',
  './js/i18n.js',
  './js/servers.js',
  './js/local.js',
  './js/audio.js',
  './js/visualizer.js',
  './js/effects.js',
  './js/lyrics.js',
  './js/queue.js',
  './js/ui.js',
  './js/app.js',
  './manifest.json',
  './icons/Walkman.png',
  'https://unpkg.com/colorthief@3/dist/umd/color-thief.global.js',
  'https://fonts.googleapis.com/icon?family=Material+Icons'
];

const CACHE_OPEN_PROMISE = caches.open(CACHE_NAME);

const BYPASS_PATTERNS = [
  '/Audio/', '/Items/', '/Users/', '/Views',
  '/library/parts/', '/library/sections/', '/search?',
  'plex.tv/api/', 'plex.tv/devices/',
  'emby.auth', 'Connect/Validate'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    CACHE_OPEN_PROMISE.then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = e.request.url;
  if (BYPASS_PATTERNS.some((p) => url.includes(p))) return;

  if (e.request.mode === 'navigate') {
    // Revalidar siempre contra la red: evita que el navegador sirva un
    // index.html viejo (cache del HTTP o del SW) tras cada desplegue.
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).catch(() => caches.match('./index.html')));
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(e.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            CACHE_OPEN_PROMISE.then((cache) => cache.put(e.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(e.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          CACHE_OPEN_PROMISE.then((cache) => cache.put(e.request, responseClone));
        }
        return networkResponse;
      });
    })
  );
});
