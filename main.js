// main.js (Full & Final)
import { loadComponents } from './loader.js';
import { setupAuthListener } from './auth-manager.js';
import { setupUI, loadLocalData, STATE } from './ui-manager.js';
import { setupChat } from './chat-engine.js';

async function initApp() {
    console.log("🦅 Appana Launching...");

    try {
        await loadComponents();
        
        // Let the browser settle for 200ms
        setTimeout(() => {
            setupUI();
            loadLocalData();
            setupChat();
            setupAuthListener();
            
            // ✅ START CONTINUOUS UPDATES
            startHeartbeat();
            loadLiveMotivation();
            enableSelectionTracking();
        }, 200);

    } catch (err) { console.error("Critical Launch Failure", err); }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
    }
}

/* --- ✅ FIXED: STATUS DOTS HEARTBEAT --- */
function startHeartbeat() {
    const updateDots = () => {
        const net = document.getElementById("net-status");
        const ai = document.getElementById("api-status");
        const isOnline = navigator.onLine;

        if (net) net.classList.toggle("active", isOnline);
        if (ai) ai.classList.toggle("active", isOnline); // Assumes AI is ready if net is up
    };

    setInterval(updateDots, 3000);
    updateDots();
}

/* --- ✅ FIXED: MOTIVATION LOADER --- */
function loadLiveMotivation() {
    const quotes = [
        "Small steps every day lead to big results! 🚀",
        "Believe you can and you're halfway there. ⭐",
        "Your future is created by what you do today. 🔥",
        "Don't stop until you're proud. 🦅",
        "Focus on the goal, not the obstacles. 🎯"
    ];

    const apply = () => {
        const q = quotes[Math.floor(Math.random() * quotes.length)];
        const el1 = document.getElementById("sticky-motivation");
        const el2 = document.getElementById("sidebar-motivation-text");
        if(el1) el1.innerHTML = `✨ ${q}`;
        if(el2) el2.innerText = q;
    };

    apply();
    // Refresh every 10 minutes to stay fresh
    setInterval(apply, 600000);
}

/* --- SELECTION TRACKER --- */
function enableSelectionTracking() {
    const box = document.getElementById("chat-box");
    if(!box) return;

    box.addEventListener("click", (e) => {
        if(!STATE.selectMode) return;
        const msg = e.target.closest(".message");
        if(msg) {
            msg.classList.toggle("selected");
            const count = document.querySelectorAll(".message.selected").length;
            const label = document.getElementById("selection-count");
            if(label) label.innerText = `${count} Selected`;
        }
    });
}

initApp();
