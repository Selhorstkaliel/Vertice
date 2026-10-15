/*
 * Vértice service worker. Deliberately small:
 * - static build assets (/_next/static) are cached, they are immutable;
 * - the offline review page (/revisao-offline) is kept for use without internet;
 * - any page that fails to load while offline falls back to that page;
 * - nothing else is cached: no API responses, no pages with student data.
 */
const VERSION = "v1";
const STATIC_CACHE = `vertice-static-${VERSION}`;
const PAGE_CACHE = `vertice-pages-${VERSION}`;
const OFFLINE_URL = "/revisao-offline";

self.addEventListener("install", (event) => {
  // The offline page and the scripts it needs, so it works on the very first offline visit.
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch(new Request(OFFLINE_URL, { cache: "reload" }));
        if (res.ok && !res.redirected) {
          const html = await res.clone().text();
          await (await caches.open(PAGE_CACHE)).put(OFFLINE_URL, res);
          const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])];
          const cache = await caches.open(STATIC_CACHE);
          await Promise.all(assets.map((a) => cache.add(a).catch(() => undefined)));
        }
      } catch {
        // Offline during install: the page is cached on the next online visit.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("vertice-") && ![STATIC_CACHE, PAGE_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("vertice-")).map((k) => caches.delete(k)))));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (request.mode !== "navigate") return;

  if (url.pathname === OFFLINE_URL) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && !res.redirected) caches.open(PAGE_CACHE).then((cache) => cache.put(OFFLINE_URL, res.clone()));
          return res;
        })
        .catch(() => caches.match(OFFLINE_URL).then((hit) => hit || Response.error())),
    );
    return;
  }

  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL).then((hit) => hit || Response.error())));
});
