// ✅ FIX: Bumped to v7 to FORCE update
const CACHE = "appana-cf-v7";
const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/manifest.json"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE && caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // Network First for API (AI Chat)
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(
          JSON.stringify({ reply: "Offline. Connect to internet." }),
          { headers: { "Content-Type": "application/json" } }
        )
      )
    );
  } else {
    // Cache First for Files (HTML/JS/CSS)
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request))
    );
  }
});
