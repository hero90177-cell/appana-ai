// ✅ Appana Service Worker v12 (Pro Offline Support)
const CACHE_NAME = "appana-v12-pro";

// We must cache ALL external libraries, or the app will break offline.
const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/firebase-init.js",
  "/manifest.json",
  // External Libraries (Crucial for Offline functionality)
  "https://cdn.jsdelivr.net/npm/marked/marked.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js",
  "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  "https://cdn-icons-png.flaticon.com/512/809/809052.png",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
];

self.addEventListener("install", (e) => {
  // Force new files to download immediately
  self.skipWaiting(); 
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // {cache: 'reload'} ensures we get the latest version from the web, not browser cache
      return cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
    })
  );
});

self.addEventListener("activate", (e) => {
  // Clean up old caches (v11, v10, etc.)
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((k) => k !== CACHE_NAME && caches.delete(k))
    ))
  );
  self.clients.claim(); // Take control immediately
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // 1. API Calls: Always go to Network (Never Cache Chat)
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(fetch(e.request));
    return;
  }

  // 2. Firebase & Google Auth: Network First (Don't cache auth states)
  if (url.host.includes("googleapis.com") || url.host.includes("firebase")) {
    if (!url.pathname.endsWith(".js") && !url.pathname.endsWith(".css")) {
       return; // Let browser handle Auth/Database connections naturally
    }
  }

  // 3. UI Assets: Cache First, Fallback to Network
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;

      // If not in cache, fetch it
      return fetch(e.request).then((response) => {
        // DYNAMIC CACHING:
        // If we fetched a new Font or Icon successfully, save it for next time
        if (
          response.status === 200 && 
          (url.host.includes("fonts") || url.host.includes("cdn") || url.pathname.endsWith(".png"))
        ) {
           const clone = response.clone();
           caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return response;
      });
    })
  );
});
