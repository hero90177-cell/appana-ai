// ✅ Appana Service Worker v15 (Fixed for Offline Firebase)
const CACHE_NAME = "appana-v15-offline-ready";

// ⚠️ CRITICAL: All external dependencies (CDNs) must be listed here 
// so the app can load even if the internet is disconnected.
const ASSETS = [
  "/",
  "/index.html",
  "/global.css",
  "/manifest.json",
  "/firebase-init.js",
  
  // ✅ CORE JS MODULES
  "/main.js",
  "/loader.js",
  "/auth-manager.js",
  "/ui-manager.js",
  "/chat-engine.js",

  // ✅ UI FRAGMENTS
  "/menu.html",
  "/chat.html",
  "/tools.html",
  "/menu.css",
  "/chat.css",
  "/tools.css",

  // ✅ FIREBASE SDKS (CRITICAL FOR OFFLINE LOADING)
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js",

  // ✅ EXTERNAL LIBRARIES
  "https://cdn.jsdelivr.net/npm/marked/marked.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  
  // ✅ ASSETS
  "https://cdn-icons-png.flaticon.com/512/809/809052.png",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
];

// 1. INSTALL: Cache everything
self.addEventListener("install", (e) => {
  self.skipWaiting(); 
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 'reload' ensures we fetch fresh versions from the network
      return cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
    })
  );
});

// 2. ACTIVATE: Clean up old caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((k) => k !== CACHE_NAME && caches.delete(k))
    ))
  );
  self.clients.claim();
});

// 3. FETCH: Smart Strategy
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // A. NETWORK ONLY: APIs, Auth interactions, and non-static Firebase interactions
  // (We exclude specific SDK .js files from this check so they can be cached)
  if ((url.pathname.startsWith("/api/") || 
       url.host.includes("googleapis.com") || 
       url.host.includes("firebase")) &&
      !url.pathname.endsWith(".js") && 
      !url.pathname.endsWith(".css")) {
       return; // Go strictly to network
  }

  // B. CACHE FIRST: Everything else (Assets, Scripts, HTML)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;

      return fetch(e.request).then((response) => {
        // Dynamic Caching for allowed external assets
        // Added 'gstatic' to allow caching other Firebase bits if needed
        if (response.status === 200 && 
           (url.host.includes("cdn") || 
            url.host.includes("gstatic") || 
            url.pathname.endsWith(".png"))) {
           const clone = response.clone();
           caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return response;
      });
    })
  );
});
