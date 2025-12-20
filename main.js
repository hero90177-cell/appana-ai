import { setupAuthListener, checkSystemHealth } from './auth-manager.js';
import { setupUI, loadLocalData } from './ui-manager.js';
import { setupChat } from './chat-engine.js';

document.addEventListener("DOMContentLoaded", () => {
    // 1. Initialize UI (Nav, Buttons, Generators)
    setupUI();
    
    // 2. Initialize Chat Engine (Send button, Voice, etc)
    setupChat();
    
    // 3. Load Local Settings (XP, Custom Subjects)
    loadLocalData();

    // 4. Start Auth Listener (Login/Logout/History)
    setupAuthListener();

    // 5. Start Health Checks (Ping AI & Net)
    checkSystemHealth();
});
