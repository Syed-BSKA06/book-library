/* My Shelf · service worker
   Strategy: pre-cache the app shell, serve it network-first (so updates land
   immediately) with the cache as an offline fallback. Fonts and book covers
   are cached as they're fetched. Book-lookup API calls always go to the
   network (results shouldn't go stale). */

const SHELL_CACHE = "shelf-shell-v1";
const RUNTIME_CACHE = "shelf-runtime-v1";

const SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./books-bg.svg",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  // Lookup APIs: network only — never serve stale search results
  if (url.hostname === "openlibrary.org" || url.hostname === "www.googleapis.com") return;

  // App shell: network first (fresh updates), cache fallback (offline)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        try {
          const fresh = await fetch(event.request);
          if (fresh.ok) cache.put(event.request, fresh.clone());
          return fresh;
        } catch (err) {
          const hit = await cache.match(event.request);
          if (hit) return hit;
          throw err;
        }
      })
    );
    return;
  }

  // Everything else (fonts, cover images): cache as we go, fall back to cache offline
  event.respondWith(
    caches.open(RUNTIME_CACHE).then(async (cache) => {
      try {
        const fresh = await fetch(event.request);
        if (fresh.ok || fresh.type === "opaque") cache.put(event.request, fresh.clone());
        return fresh;
      } catch (err) {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        throw err;
      }
    })
  );
});
