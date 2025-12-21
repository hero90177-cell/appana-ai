// main.js
import { loadComponents } from './loader.js';
import { setupAuthListener, checkSystemHealth } from './auth-manager.js';
import { setupUI, loadLocalData } from './ui-manager.js';
import { setupChat } from './chat-engine.js';

document.addEventListener("DOMContentLoaded", async () => {

    /* 1️⃣ Load HTML components */
    await loadComponents();

    /* 2️⃣ Load local storage (XP, subjects, chat history) */
    loadLocalData();

    /* 3️⃣ Setup UI (menus, buttons, tools) */
    setupUI();

    /* 4️⃣ Setup chat engine */
    setupChat();

    /* 5️⃣ Setup auth */
    setupAuthListener();

    /* 6️⃣ HEALTH CHECK — SAFE DELAY */
    setTimeout(() => {
        if (
            document.getElementById("net-status") &&
            document.getElementById("api-status")
        ) {
            checkSystemHealth();
        }
    }, 1200);

    /* 7️⃣ Default theme */
    document.body.classList.add("study-mode");

    /* 8️⃣ PWA INSTALL SUPPORT */
    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        window.deferredPrompt = e;
    });
});