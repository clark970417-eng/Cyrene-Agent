const CACHE_NAME = "cyrene-mobile-v1";
const ASSETS_TO_CACHE = [
  "/mobile/",
  "/mobile/index.html",
  "/mobile/style.css",
  "/mobile/app.js",
  "/mobile/manifest.json",
  "/mobile/icon-192.png",
  "/mobile/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn("[PWA SW] Partial cache load:", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // 免快取 WebSocket / API 請求
  if (url.pathname.startsWith("/mobile/sessions") || url.pathname.startsWith("/mobile/healthz") || url.pathname.includes("/chat")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request);
    })
  );
});
