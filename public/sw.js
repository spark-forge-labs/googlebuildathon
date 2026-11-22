/* India GP service worker: installable app + offline replays of cities you've already raced.
 *  - Hashed build files, car/tree models, HDRIs and the Draco decoder: cache-first (they never change in place)
 *  - The page itself: network-first, falling back to the last copy when offline
 *  - Anything cross-origin (the leaderboard API) is never cached
 */
const VERSION = 'v1';
const STATIC = `indiagp-static-${VERSION}`;
const PAGES = `indiagp-pages-${VERSION}`;
const SCOPE = self.registration.scope;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((c) => c.addAll([SCOPE, `${SCOPE}manifest.webmanifest`, `${SCOPE}icons/icon-192.png`]))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const CACHE_FIRST = /\/(assets|models|hdri|draco|icons)\//;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(SCOPE, copy));
          }
          return res;
        })
        .catch(() => caches.match(SCOPE).then((r) => r || Response.error()))
    );
    return;
  }

  if (CACHE_FIRST.test(url.pathname)) {
    event.respondWith(
      caches.open(STATIC).then((cache) =>
        cache.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok && res.status === 200) cache.put(req, res.clone());
              return res;
            })
        )
      )
    );
  }
});
