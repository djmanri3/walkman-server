const CACHE_NAME = 'walkman-v53';
const SHELL_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/utils.js',
  './js/i18n.js',
  './js/servers.js',
  './js/local.js',
  './js/audio.js',
  './js/open-bass-core.js',
  './js/open-bass-worklet.js',
  './js/visualizer.js',
  './js/sony-visualizer.js?v=gate-rectangles-3',
  './js/effects.js',
  './js/lyrics.js',
  './js/queue.js',
  './js/favorites.js',
  './js/ui.js',
  './js/app.js',
  './manifest.json',
  './icons/Walkman.png',
  './images/default-album-cover.png',
  './images/z1/artists-variant.png',
  './images/z1/songs-variant.png',
  './images/z1/albums-variant.png',
  './images/z1/playlists-variant.png',
  './images/z1/favorites-variant.png',
  './images/music-previews/songs.png',
  './images/music-previews/albums.png',
  './images/music-previews/artists.png',
  './images/music-previews/playlists.png',
  './images/music-previews/favorites.png',
  'https://unpkg.com/colorthief@3/dist/umd/color-thief.global.js',
  'https://fonts.googleapis.com/icon?family=Material+Icons'
];

const CACHE_OPEN_PROMISE = caches.open(CACHE_NAME);

// Cache app resources only. Media-server responses and authenticated requests
// always go straight to the network, regardless of the server's URL layout.
const APP_BASE = new URL(self.registration.scope);
const INDEX_URL = new URL('./index.html', APP_BASE).href;
const APP_PATHS = new Set(SHELL_ASSETS.map(path => new URL(path, APP_BASE))
  .filter(url => url.origin === APP_BASE.origin).map(url => url.pathname));
APP_PATHS.add(new URL('./config.js', APP_BASE).pathname);
const PUBLIC_EXTERNAL_URLS = new Set(SHELL_ASSETS.map(path => new URL(path, APP_BASE))
  .filter(url => url.origin !== APP_BASE.origin).map(url => url.href));
PUBLIC_EXTERNAL_URLS.add('https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js');

function isPrivateRequest(request, url) {
  const sensitive = new Set(['token', 'access_token', 'auth_token', 'authtoken', 'auth', 'authorization', 'api_key', 'apikey', 'x-plex-token']);
  return request.cache === 'no-store' || [...url.searchParams.keys()].some(key => sensitive.has(key.toLowerCase())) ||
    ['Authorization', 'X-Emby-Token', 'X-Emby-Authorization', 'X-Plex-Token'].some(header => request.headers.has(header));
}

function isAppAsset(url) {
  if (url.origin !== APP_BASE.origin || !url.pathname.startsWith(APP_BASE.pathname)) return false;
  const path = url.pathname.slice(APP_BASE.pathname.length);
  return APP_PATHS.has(url.pathname) ||
    /^vendor\/sony-visualizer\/(?:visualizer\.(?:js|wasm|data)|visualizer-file\.js|manifest\.json)$/.test(path) ||
    /^(?:icons|backgrounds)\/[^/]+\.(?:png|jpe?g|webp|svg|ico)$/i.test(path);
}

function isPublicExternalAsset(url) {
  return PUBLIC_EXTERNAL_URLS.has(url.href) ||
    (url.origin === 'https://fonts.gstatic.com' && /^\/s\/materialicons\/[^?#]+\.(?:woff2?|ttf)$/.test(url.pathname));
}

function saveResponse(event, request, response) {
  const control = response.headers.get('Cache-Control') || '';
  if (response.status === 200 && !response.redirected && !/\b(?:private|no-store)\b/i.test(control)) {
    const copy = response.clone();
    event.waitUntil(CACHE_OPEN_PROMISE.then(cache => cache.put(request, copy)).catch(() => {}));
  }
  return response;
}

self.addEventListener('install', event => {
  event.waitUntil(CACHE_OPEN_PROMISE.then(cache => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('walkman-') && key !== CACHE_NAME).map(key => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isPrivateRequest(request, url)) return;

  if (request.mode === 'navigate') {
    if (url.origin !== APP_BASE.origin ||
        ![APP_BASE.pathname, APP_BASE.pathname.replace(/\/$/, ''), new URL(INDEX_URL).pathname].includes(url.pathname)) return;
    event.respondWith(fetch(request, {cache: 'no-cache'})
      .catch(() => caches.match(INDEX_URL).then(cached => cached || Response.error())));
    return;
  }

  if (isAppAsset(url)) {
    event.respondWith(fetch(request, {cache: 'no-cache'})
      .then(response => saveResponse(event, request, response))
      .catch(() => caches.match(request).then(cached => cached || Response.error())));
  } else if (isPublicExternalAsset(url)) {
    event.respondWith(caches.match(request).then(cached => {
      const refresh = fetch(request).then(response => saveResponse(event, request, response));
      if (cached) { event.waitUntil(refresh.catch(() => {})); return cached; }
      return refresh;
    }));
  }
});
