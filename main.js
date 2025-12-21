// main.js
import { loadComponents } from './loader.js'; 
import { setupAuthListener, checkSystemHealth } from './auth-manager.js';
import { setupUI, loadLocalData } from './ui-manager.js';
import { setupChat } from './chat-engine.js';

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Wait for HTML Components (Menu, Chat, Tools) to inject
    await loadComponents();

    // 2. Load Local Settings & History (XP, Subjects, Chat)
    // ✅ MOVED UP: Must run BEFORE setupChat so the history is ready to display!
    loadLocalData();

    // 3. Initialize UI (Nav, Buttons, Generators)
    setupUI();
    
    // 4. Initialize Chat Engine (Send button, Voice, Render History)
    setupChat();
    
    // 5. Start Auth Listener (Login/Logout)
    setupAuthListener();

    // 6. Start Health Checks (Ping AI & Net)
    checkSystemHealth();
});
