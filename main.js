// main.js (v6.0 - Visual Priority)
import { loadComponents } from './loader.js';
import { setupAuthListener, checkSystemHealth } from './auth-manager.js';
import { setupUI, loadLocalData } from './ui-manager.js';
import { setupChat } from './chat-engine.js';

// 🚨 EMERGENCY UN-HIDE (Runs instantly)
// This guarantees the screen is NOT black, even if code crashes later.
const chatSection = document.getElementById("section-chat");
if (chatSection) {
    chatSection.style.display = "flex"; 
    chatSection.classList.add("active-panel");
}

async function initApp() {
    console.log("🦅 Appana AI Launching...");

    // 1. Load HTML (Menu, Tools, Chat)
    try {
        await loadComponents();
        console.log("✅ Components Loaded");
    } catch (err) {
        console.error("HTML Load Fail:", err);
    }

    // 2. Initialize Features
    // We wrap setupUI in a timeout to ensure HTML is 100% ready in the DOM
    setTimeout(() => {
        try {
            setupUI();       // Activates buttons
            loadLocalData(); // Loads XP/Subjects
            setupChat();     // Connects AI
            setupAuthListener(); // Connects Firebase
            console.log("✅ Features Active");
        } catch (e) {
            console.error("Feature Init Error:", e);
        }
    }, 100);

    // 3. Register PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }
}

initApp();
