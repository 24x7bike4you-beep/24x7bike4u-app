// 24x7 Bike4u -- app-shell service worker.
// Goal: once someone has loaded the site once, it should open instantly on a slow or
// flaky connection (or fully offline) instead of hanging on a network request. This
// caches the page itself (and a couple of small same-origin assets) and serves them
// straight from cache, refreshing the cache quietly in the background for next time.
// Cross-origin CDN scripts (fonts, jsPDF, Supabase, Razorpay) are left untouched here --
// the browser's normal HTTP cache already handles those, and this file intentionally
// does not try to cache opaque cross-origin responses.

const CACHE_NAME = 'bike4u-shell-v1';
const APP_SHELL = ['/', '/index.html', '/og-image.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {}) // a shell asset 404ing (e.g. no /index.html at that exact path) shouldn't block install
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let CDN/font/API requests go straight to the network as normal

  // Stale-while-revalidate: answer from cache immediately if we have it (zero wait, works
  // offline), and separately fetch a fresh copy in the background to update the cache for
  // next time. If there's no cached copy yet, wait on the network but fall back to
  // whatever's cached (even a different page) rather than failing outright.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
