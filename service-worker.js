// ✅ Appana Service Worker v20 (Robust API/OCR Handling)

const CACHE_NAME="appana-v20-offline-ready";

const ASSETS=[
  "/", "/index.html", "/global.css", "/manifest.json", "/firebase-init.js",
  "/main.js","/loader.js","/auth-manager.js","/ui-manager.js","/chat-engine.js",
  "/menu.html","/chat.html","/tools.html","/menu.css","/chat.css","/tools.css",

  // Firebase
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js",

  // External Libraries
  "https://cdn.jsdelivr.net/npm/marked/marked.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",

  // Icons
  "https://cdn-icons-png.flaticon.com/512/809/809052.png",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
];

self.addEventListener("install",e=>{
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'}))))
    );
});

self.addEventListener("activate",e=>{
    e.waitUntil(
        caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE_NAME && caches.delete(k))))
    );
    self.clients.claim();
});

self.addEventListener("fetch",e=>{
    const url = new URL(e.request.url);

    // 🚨 CRITICAL FIX: Ignore API and OCR endpoints from cache
    // This forces the browser to go to the network for these operations
    if(url.pathname.startsWith("/api/") || url.pathname.startsWith("/ocr/")) {
        return; 
    }

    if(url.host.includes("firebase") || url.host.includes("googleapis.com")) {
        return;
    }

    // Default Cache Strategy for Static Files
    e.respondWith(
        caches.match(e.request).then(cached=>{
            if(cached) return cached;
            return fetch(e.request).then(response=>{
                // Cache external assets (CDNs)
                if(response.status===200 && (url.host.includes("cdn") || url.host.includes("gstatic") || url.pathname.endsWith(".png"))){
                    const clone=response.clone();
                    caches.open(CACHE_NAME).then(c=>c.put(e.request,clone));
                }
                return response;
            }).catch(()=>cached);
        })
    );
});
