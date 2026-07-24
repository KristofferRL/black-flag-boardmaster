/* Black Flag Board Games — service worker
 * Bump VERSION on every release. The cache name is versioned, and any
 * cache that doesn't match the current version is deleted on activate,
 * so a new release cleanly replaces the old one and users are never
 * left stuck on a stale build. */
const VERSION = 'v1.2.0';
const CACHE = `bfbg-${VERSION}`;

/* Everything the app needs to run offline. The HTML has all JS/CSS
 * inline, so the shell is small; fonts are cached at runtime on first load. */
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())   // take over promptly on update
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('bfbg-') && k !== CACHE)
            .map((k) => caches.delete(k))      // drop obsolete versions
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const accept = req.headers.get('accept') || '';
  const isPage = req.mode === 'navigate' || accept.includes('text/html');

  if (isPage) {
    /* Network-first for the page itself: an online visitor always gets the
     * newest HTML (and we refresh the cache), while an offline visitor falls
     * back to the last cached copy. This is what prevents users getting
     * permanently stuck on an old cached version. */
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  /* Everything else (icons, manifest, Google Fonts CSS + font files):
   * cache-first, filling the cache at runtime so it's available offline
   * after the first successful online visit. */
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req));
    })
  );
});

/* Optional: lets the page trigger an immediate activation if it ever
 * chooses to. Not used to force reloads, so an active match is never
 * interrupted. */
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
