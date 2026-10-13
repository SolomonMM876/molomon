/* Public static shells only. No API responses, calendar/notes data, or URLs
 * with private query strings are cached. Only public category selection
 * queries are allowed. Room fragments never enter HTTP requests.
 * Network first makes a refresh fetch the current published config and files.
 */
"use strict";
const CACHE = "molomon-static-v10-notes";
const STATIC_FILES = [
  "./", "./index.html", "./config.js", "./app.js", "./styles.css",
  "./install.js", "./manifest.webmanifest", "./assets/favicon.svg", "./assets/nook.svg",
  "./assets/app-icon-192.png", "./assets/app-icon-512.png",
  "./backgammon.html", "./backgammon.css", "./backgammon.js", "./assets/vendor/peerjs.min.js",
  "./calendar.html", "./calendar.css", "./calendar.js", "./assets/vendor/ical.min.js",
  "./notes.html", "./notes.css", "./notes.js",
  "./memories.html", "./memories.css",
  "./category.html", "./category.css", "./category.js",
  "./suggestions.html", "./suggestions.css", "./suggestions.js",
  "./watchroom.html", "./watchroom.css", "./watchroom.js",
  "./secret.html", "./secret.css", "./secret.js", "./assets/fish-bone.svg"
];
const PUBLIC_URLS = new Set(STATIC_FILES.map(path => new URL(path, self.registration.scope).href));
const CATEGORY_URL = new URL("./category.html", self.registration.scope).href;
const CATEGORY_IDS = ["watch", "talk", "play", "together", "favorites"];
for (const id of CATEGORY_IDS) PUBLIC_URLS.add(`${CATEGORY_URL}?section=${id}`);
function publicCacheKey(url) {
  if (!url.search) return PUBLIC_URLS.has(url.href) ? url.href : null;
  const entries = [...url.searchParams];
  if (url.origin + url.pathname !== CATEGORY_URL || entries.length !== 1 || entries[0][0] !== "section" || !CATEGORY_IDS.includes(entries[0][1])) return null;
  return `${CATEGORY_URL}?section=${entries[0][1]}`;
}
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all([...PUBLIC_URLS].map(async url => {
      try {
        const response = await fetch(url, { cache: "reload", credentials: "omit" });
        if (response.ok && !response.redirected && response.type !== "opaque") await cache.put(url, response);
      } catch { /* An optional page may not be published yet. */ }
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(key => key.startsWith("molomon-static-") && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  const cacheKey = publicCacheKey(url);
  if (request.method !== "GET" || !cacheKey) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request, { cache: "no-cache" });
      if (response.ok && !response.redirected && response.type !== "opaque") {
        const cache = await caches.open(CACHE);
        await cache.put(cacheKey, response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(cacheKey, { cacheName: CACHE });
      return cached || new Response("This page is not available offline yet. Reconnect and refresh.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});
