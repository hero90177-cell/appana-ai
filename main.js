// main.js (vFinal - Race Condition Fixed)
import { loadComponents } from './loader.js';
import { setupAuthListener } from './auth-manager.js';
import { setupUI, loadLocalData, STATE } from './ui-manager.js';
import { setupChat } from './chat-engine.js';

// 1. Ensure Chat Panel is visible immediately (prevents black screen)
const chatSection = document.getElementById("section-chat");
if (chatSection) {
    chatSection.style.display = "flex"; 
    chatSection.classList.add("active-panel");
}

async function initApp() {
    console.log("🦅 Appana AI Launching...");

    try {
        // STEP 1: LOAD HTML (Wait here until finished!)
        await loadComponents();
        
        // STEP 2: NOW it is safe to attach listeners
        console.log("⚡ HTML Ready. Initializing Logic...");
        
        setupUI();           // Attach tool/menu buttons
        loadLocalData();     // Load XP/History
        setupChat();         // Attach Send/Mic/File buttons
        setupAuthListener(); // Attach Login/Logout

        // STEP 3: Visual Polish
        tryLoadMotivation();
        startSystemHeartbeat();
        enableMessageSelection();

        console.log("✅ All Systems Go");

    } catch (err) {
        console.error("🔥 Critical Init Error:", err);
        alert("App failed to load. Please refresh.");
    }

    // Register Service Worker for Offline Mode
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(() => console.log("📡 Service Worker Registered"))
            .catch(e => console.warn("Service Worker Failed:", e));
    }
}

/* --- FEATURE: DAILY MOTIVATION --- */
function tryLoadMotivation() {
    const el = document.getElementById("sticky-motivation");
    const el2 = document.getElementById("sidebar-motivation-text");
    
    const quotes = [
        "Small steps every day lead to big results! 🚀",
        "Believe you can and you're halfway there. ⭐",
        "Your future is created by what you do today. 🔥",
        "Don't stop until you're proud. 🦅",
        "Focus on the goal, not the obstacles. 🎯",
        "Dream big, work hard, stay focused. 💡"
    ];
    const q = quotes[Math.floor(Math.random() * quotes.length)];
    
    if(el) el.innerHTML = `✨ ${q}`;
    if(el2) el2.innerText = q;
}

/* --- FEATURE: GREEN DOTS HEARTBEAT --- */
function startSystemHeartbeat() {
    setInterval(() => {
        // NET Dot
        const netDot = document.getElementById("net-status");
        if(netDot) {
            netDot.classList.toggle("active", navigator.onLine);
        }
        
        // AI Dot (Simulated connection check)
        const aiDot = document.getElementById("api-status");
        if(aiDot) {
            aiDot.classList.toggle("active", navigator.onLine);
        }
    }, 2000);
}

/* --- FEATURE: SELECTION CLICK FIX --- */
function enableMessageSelection() {
    const box = document.getElementById("chat-box");
    if(!box) return;
    
    box.addEventListener("click", (e) => {
        if(STATE && STATE.selectMode) {
            const msgDiv = e.target.closest(".message");
            if(msgDiv) {
                msgDiv.classList.toggle("selected");
                
                if(msgDiv.classList.contains("selected")) {
                    STATE.selectedIds.add(msgDiv.id);
                } else {
                    STATE.selectedIds.delete(msgDiv.id);
                }
                
                const count = STATE.selectedIds.size;
                const countLabel = document.getElementById("selection-count");
                if(countLabel) countLabel.innerText = `${count} Selected`;
            }
        }
    });
}

// Start the App
initApp();
