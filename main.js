// main.js (vFinal)
import { loadComponents } from './loader.js';
import { setupAuthListener } from './auth-manager.js';
import { setupUI, loadLocalData } from './ui-manager.js';
import { setupChat } from './chat-engine.js';

async function initApp() {
    console.log("🦅 Appana AI Launching...");
    try {
        await loadComponents();
        
        console.log("⚡ HTML Ready. Initializing Logic...");
        setupUI();
        loadLocalData();
        setupChat();
        setupAuthListener();
        
        // Visuals
        tryLoadMotivation();
        startSystemHeartbeat();
        
        console.log("✅ System Online");
    } catch (err) {
        console.error("Init Error:", err);
    }

    if ('serviceWorker' in navigator) {
        // Use 'reload' strategy for dev to ensure updates are seen
        navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' })
            .catch(console.warn);
    }
}

function tryLoadMotivation() {
    const el = document.getElementById("sticky-motivation");
    if(el) el.innerHTML = "✨ Ready to learn.";
}

function startSystemHeartbeat() {
    setInterval(() => {
        const net = document.getElementById("net-status");
        if(net) net.classList.toggle("active", navigator.onLine);
        
        // Active Ping to Backend
        fetch("/api/ai-chat", { method: "POST", body: JSON.stringify({type:"ping"}) })
            .then(r=>r.json())
            .then(d => document.getElementById("api-status")?.classList.toggle("active", d.status==="ok"))
            .catch(() => document.getElementById("api-status")?.classList.remove("active"));
    }, 5000);
}

initApp();
