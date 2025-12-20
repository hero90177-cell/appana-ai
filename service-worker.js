// ✅ Appana Service Worker v13 (Updated for Modular Files)
const CACHE_NAME = "appana-v13-modular";

// We must cache ALL new files, or the app will break offline.
const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/manifest.json",
  "/firebase-init.js",
  // ✅ NEW FILES (Replaces old script.js)
  "/main.js",
  "/auth-manager.js",
  "/ui-manager.js",
  "/chat-engine.js",
  // External Libraries
  "https://cdn.jsdelivr.net/npm/marked/marked.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  "https://cdn-icons-png.flaticon.com/512/809/809052.png",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
];

self.addEventListener("install", (e) => {
  self.skipWaiting(); 
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
    })
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((k) => k !== CACHE_NAME && caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // 1. API & Auth: Network Only
  if (url.pathname.startsWith("/api/") || url.host.includes("googleapis.com") || url.host.includes("firebase")) {
    // Exception for static JS/CSS from CDNs
    if (!url.pathname.endsWith(".js") && !url.pathname.endsWith(".css")) {
       return; 
    }
  }

  // 2. Cache First, Fallback to Network
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((response) => {
        // Dynamic Caching for new fonts/icons
        if (response.status === 200 && (url.host.includes("cdn") || url.pathname.endsWith(".png"))) {
           const clone = response.clone();
           caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return response;
      });
    })
  );
});
