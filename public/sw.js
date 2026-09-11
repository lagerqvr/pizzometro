/*
 * Offline shell for the PWA. Ratings and photos already live in IndexedDB;
 * this only keeps the app itself loadable with no signal — the normal case
 * inside a Naples pizzeria.
 */
// Every screen the app can reach is a static page, so the whole thing is
// precacheable — including a rating opened with no signal.
const CACHE = "pizzometro-v5";
const SHELL = [
  "/",
  "/new",
  "/entry",
  "/leaderboard",
  "/map",
  "/settings",
  "/join",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /*
   * Streets do not move, so the map's data is worth keeping: a view you have
   * already seen then draws with no signal at all. Everything else under
   * /api/ is a live answer and must never be served stale.
   */
  if (url.pathname === "/api/roads") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || Response.json({ roads: [], labels: [] }))),
    );
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  // Network-first for navigations so a deploy is picked up immediately,
  // cache-first for static assets.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only keep a good page. A 502 during a deploy is still a response,
          // and caching it would serve the failure back offline for good.
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        // Ignoring the query is what makes an offline "/entry?id=abc" find
        // the cached "/entry": the page is the same either way, and the id
        // is read from the URL once it is running.
        .catch(() =>
          caches
            .match(request, { ignoreSearch: true })
            .then((hit) => hit || caches.match("/")),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
