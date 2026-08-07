const CACHE_NAME = "gosojang-helper-v20260807";
const APP_SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/styles.css?v=trust-20260807",
  "/info.css?v=trust-20260807",
  "/app.js?v=security-performance-fix-20260704",
  "/draft-consistency.js?v=security-performance-fix-20260704",
  "/photo-attachments.js?v=security-performance-fix-20260704",
  "/pwa.js?v=pwa-ready-20260718",
  "/manifest.webmanifest",
  "/guide.html",
  "/glossary.html",
  "/checklist.html",
  "/examples.html",
  "/evidence-guide.html",
  "/filing-process.html",
  "/about.html",
  "/privacy.html",
  "/terms.html",
  "/data/case-types.json",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/") || request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/offline.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
