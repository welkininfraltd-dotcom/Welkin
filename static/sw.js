// Service Worker v2 — auto-updates when new version is deployed
const CACHE_NAME = "welkin-cash-v2";
const URLS_TO_CACHE = ["/", "/static/app.css"];

self.addEventListener("install", (e) => {
  // Skip waiting to activate immediately
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(URLS_TO_CACHE)));
});

self.addEventListener("activate", (e) => {
  // Delete old caches
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  // Take control of all clients immediately
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // Always go network-first for API and JS (to get latest code)
  if (e.request.url.includes("/api/") || e.request.url.endsWith(".js")) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  } else {
    // Stale-while-revalidate for other assets
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const fetched = fetch(e.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          return response;
        });
        return cached || fetched;
      })
    );
  }
});

// Listen for update messages from the app
self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});
