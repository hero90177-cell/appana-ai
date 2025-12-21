// ✅ Appana Service Worker v14 (Updated for Modular Layout)
const CACHE_NAME = "appana-v14-modular-split";

// ⚠️ CRITICAL: All new modular files must be listed here.
// If missing, the app will show blank sections when offline.
const ASSETS = [
  "/",
  "/index.html",
  "/global.css",       // Replaces style.css
  "/manifest.json",
  "/firebase-init.js",
  
  // ✅ CORE JS MODULES
  "/main.js",
  "/loader.js",        // NEW: Handles the split loading
  "/auth-manager.js",
  "/ui-manager.js",
  "/chat-engine.js",

  // ✅ NEW UI FRAGMENTS (HTML)
  "/menu.html",
  "/chat.html",
  "/tools.html",

  // ✅ NEW UI FRAGMENTS (CSS)
  "/menu.css",
  "/chat.css",
  "/tools.css",

  // ✅ EXTERNAL LIBRARIES (Keep these)
  "https://cdn.jsdelivr.net/npm/marked/marked.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  "https://cdn-icons-png.flaticon.com/512/809/809052.png",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
];

// 1. INSTALL: Cache everything
self.addEventListener("install", (e) => {
  self.skipWaiting(); 
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 'reload' ensures we get fresh versions from server during install
      return cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
    })
  );
});

// 2. ACTIVATE: Clean up old caches (v13 and older)
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((k) => k !== CACHE_NAME && caches.delete(k))
    ))
  );
  self.clients.claim();
});

// 3. FETCH: Network for API, Cache for Assets
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // A. API & Auth: Always Network Only
  if (url.pathname.startsWith("/api/") || url.host.includes("googleapis.com") || url.host.includes("firebase")) {
    // Exception: Allow caching of static scripts/css from CDNs (fonts, firebase SDKs if used via CDN)
    if (!url.pathname.endsWith(".js") && !url.pathname.endsWith(".css") && !url.pathname.endsWith(".woff2")) {
       return; 
    }
  }

  // B. Stale-While-Revalidate for HTML/CSS fragments?
  // No, Stick to Cache First for speed, rely on version bump to update.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;

      return fetch(e.request).then((response) => {
        // Dynamic Caching for new assets not in ASSETS list (like user uploaded images or new font files)
        if (response.status === 200 && (url.host.includes("cdn") || url.pathname.endsWith(".png"))) {
           const clone = response.clone();
           caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return response;
      });
    })
  );
});
