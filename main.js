// main.js - Fixed Initialization
import { loadComponents } from './loader.js';
import { setupAuthListener, checkSystemHealth } from './auth-manager.js';
import { setupUI, loadLocalData } from './ui-manager.js';
import { setupChat } from './chat-engine.js';

// Define the init function
async function initApp() {
    console.log("🚀 Appana AI Starting...");

    try {
        /* 1️⃣ Load HTML components (Wait for this!) */
        await loadComponents();
        console.log("✅ Components Loaded");

        /* 2️⃣ Load local storage */
        loadLocalData();

        /* 3️⃣ Setup UI */
        try {
            setupUI();
        } catch (uiErr) {
            console.warn("UI Setup Warning:", uiErr);
        }

        /* 4️⃣ Setup chat engine */
        setupChat();

        /* 5️⃣ Setup auth (Firebase) */
        setupAuthListener();

        /* 6️⃣ HEALTH CHECK */
        setTimeout(() => {
            if (document.getElementById("net-status")) {
                checkSystemHealth();
            }
        }, 1500);

        /* 7️⃣ Default theme & VISIBILITY FORCE */
        document.body.classList.add("study-mode");
        
        // Ensure Chat is visible on Mobile
        const chatPanel = document.getElementById("section-chat");
        if(chatPanel && window.innerWidth < 900) {
            chatPanel.classList.add("active-panel");
        }

        /* 8️⃣ REMOVE LOADING SCREEN */
        const loader = document.getElementById("app-loader");
        if (loader) {
            loader.style.opacity = "0";
            setTimeout(() => loader.remove(), 500); 
        }

    } catch (criticalError) {
        console.error("🔥 Critical Init Error:", criticalError);
        // Fallback: Remove loader anyway so user sees whatever is there
        const loader = document.getElementById("app-loader");
        if (loader) {
            loader.innerHTML = `<div style="color:red; text-align:center;">Error Loading App.<br>Please Clear Cache.<br>${criticalError.message}</div>`;
        }
    }

    /* 9️⃣ PWA INSTALL SUPPORT */
    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        window.deferredPrompt = e;
    });
}

// EXECUTE IMMEDIATELY
initApp();
