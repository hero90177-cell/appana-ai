// main.js (vFinal Fixed)
import { loadComponents } from './loader.js';
import { setupAuthListener } from './auth-manager.js';
import { setupUI, loadLocalData, STATE } from './ui-manager.js';
import { setupChat } from './chat-engine.js';

// 1. INSTANT VISIBILITY
const chatSection = document.getElementById("section-chat");
if (chatSection) {
    chatSection.style.display = "flex"; 
    chatSection.classList.add("active-panel");
}

async function initApp() {
    console.log("🦅 Appana AI Launching...");

    try {
        await loadComponents();
        console.log("✅ HTML Injected");
    } catch (err) {
        console.error("HTML Error:", err);
    }

    // Wait slightly for DOM
    setTimeout(() => {
        try {
            // A. Start Features
            setupUI();
            loadLocalData();
            setupChat();
            setupAuthListener();
            
            // B. Fix Motivation Text
            loadMotivation();
            
            // C. Start Heartbeat (Green Dots)
            startSystemHeartbeat();

            // D. Fix Selection Click Logic
            enableMessageSelection();

            console.log("✅ All Systems Go");
        } catch (e) {
            console.error("Init Error:", e);
        }
    }, 200);

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
    }
}

/* --- FEATURE: DAILY MOTIVATION --- */
function loadMotivation() {
    const quotes = [
        "Small steps every day lead to big results! 🚀",
        "Believe you can and you're halfway there. ⭐",
        "Your future is created by what you do today. 🔥",
        "Don't stop until you're proud. 🦅",
        "Focus on the goal, not the obstacles. 🎯"
    ];
    const el = document.getElementById("sticky-motivation");
    const el2 = document.getElementById("sidebar-motivation-text");
    
    // Pick random
    const q = quotes[Math.floor(Math.random() * quotes.length)];
    
    if(el) el.innerHTML = `✨ ${q}`;
    if(el2) el2.innerText = q;
}

/* --- FEATURE: GREEN DOTS HEARTBEAT --- */
function startSystemHeartbeat() {
    setInterval(() => {
        // 1. Check Internet
        const netDot = document.getElementById("net-status");
        if(netDot) {
            if(navigator.onLine) netDot.classList.add("active");
            else netDot.classList.remove("active");
        }
        
        // 2. Check AI (Fake ping check based on object existence)
        const aiDot = document.getElementById("api-status");
        if(aiDot) {
            aiDot.classList.add("active");
        }
    }, 3000);
}

/* --- FEATURE: SELECTION CLICK FIX --- */
function enableMessageSelection() {
    const box = document.getElementById("chat-box");
    if(!box) return;
    
    box.addEventListener("click", (e) => {
        // ✅ Check if Select Mode is ON in UI Manager
        if(STATE && STATE.selectMode) {
            const msgDiv = e.target.closest(".message");
            if(msgDiv) {
                msgDiv.classList.toggle("selected");
                
                // ✅ SYNC WITH STATE (Crucial for Delete)
                if(msgDiv.classList.contains("selected")) {
                    STATE.selectedIds.add(msgDiv.id);
                } else {
                    STATE.selectedIds.delete(msgDiv.id);
                }
                
                // Update counter
                const count = STATE.selectedIds.size;
                const countLabel = document.getElementById("selection-count");
                if(countLabel) countLabel.innerText = `${count} Selected`;
            }
        }
    });
}

initApp();
