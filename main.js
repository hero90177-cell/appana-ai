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

        /* 3️⃣ Setup UI (menus, buttons, tools) */
        // We wrap this in a try-catch so one UI error doesn't kill the whole app
        try {
            setupUI();
        } catch (uiErr) {
            console.warn("UI Setup Warning:", uiErr);
        }

        /* 4️⃣ Setup chat engine */
        setupChat();

        /* 5️⃣ Setup auth (Firebase) */
        // This initiates the listener, doesn't need await
        setupAuthListener();

        /* 6️⃣ HEALTH CHECK */
        setTimeout(() => {
            if (document.getElementById("net-status")) {
                checkSystemHealth();
            }
        }, 1500);

        /* 7️⃣ Default theme */
        document.body.classList.add("study-mode");

        /* 8️⃣ REMOVE LOADING SCREEN */
        const loader = document.getElementById("app-loader");
        if (loader) {
            loader.style.opacity = "0";
            setTimeout(() => loader.remove(), 500); // Smooth fade out
        }

    } catch (criticalError) {
        console.error("🔥 Critical Init Error:", criticalError);
        alert("Appana AI failed to load resources. Please reload.");
    }

    /* 9️⃣ PWA INSTALL SUPPORT */
    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        window.deferredPrompt = e;
    });
}

// EXECUTE IMMEDIATELY (Do not wait for DOMContentLoaded inside a module)
initApp();
