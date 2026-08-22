const CACHE_NAME = "pharmacy-hr-shell-v1";
const CACHE_NAME = "pharmacy-hr-shell-v3";
const APP_SHELL = ["/", "/offline.html", "/manifest.webmanifest", "/icons/pharmacy-hr.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
      caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put("/", copy));
      }
      return response;
    }).catch(() => caches.match(request).then(cached => cached || caches.match("/offline.html"))));
    return;
  }

  event.respondWith(caches.match(request).then(cached => {
    const network = fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(() => cached || Response.error());
    return cached || network;
  }));
});
