// main.js
import { loadComponents } from './loader.js'; // Import the loader
import { setupAuthListener, checkSystemHealth } from './auth-manager.js';
import { setupUI, loadLocalData } from './ui-manager.js';
import { setupChat } from './chat-engine.js';

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Wait for HTML Components (Menu, Chat, Tools) to inject
    await loadComponents();

    // 2. Initialize UI (Nav, Buttons, Generators)
    // Now safe because elements exist in DOM
    setupUI();
    
    // 3. Initialize Chat Engine (Send button, Voice, etc)
    setupChat();
    
    // 4. Load Local Settings (XP, Custom Subjects)
    loadLocalData();

    // 5. Start Auth Listener (Login/Logout/History)
    setupAuthListener();

    // 6. Start Health Checks (Ping AI & Net)
    checkSystemHealth();
});
