// ✅ Appana Service Worker v20 (FORCE REFRESH)
const CACHE_NAME = "appana-v20-final-sync";

const ASSETS = [
  "/", "/index.html", "/global.css", "/manifest.json", "/firebase-init.js",
  "/main.js", "/loader.js", "/auth-manager.js", "/ui-manager.js", "/chat-engine.js",
  "/menu.html", "/chat.html", "/tools.html", "/menu.css", "/chat.css", "/tools.css"
];

self.addEventListener("install", e => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => 
            cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))
        )
    );
});

self.addEventListener("activate", e => {
    e.waitUntil(
        caches.keys().then(keys => 
            Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", e => {
    const url = new URL(e.request.url);
    // Bypass cache for API calls and Firebase Auth/Firestore
    if (url.pathname.startsWith("/api/") || url.host.includes("firebase")) return;

    e.respondWith(
        caches.match(e.request).then(cached => {
            return cached || fetch(e.request);
        })
    );
});
