// ui-manager.js (vFixed - Restored Missing Logic)
import { deleteMessagesFromCloud } from './auth-manager.js';

export const STATE = {
    xp: 0,
    customSubjects: [],
    chapters: [],
    selectMode: false,
    selectedIds: new Set(),
    chatHistory: [],
    largeSubjects: []
};

const el = id => document.getElementById(id);

/* ---------------- LOCAL STORAGE & STATE MANAGEMENT ---------------- */

export function saveData() {
    try {
        // Convert Set to Array for storage
        const stateToSave = { ...STATE, selectedIds: Array.from(STATE.selectedIds) };
        localStorage.setItem("appana_state_v1", JSON.stringify(stateToSave));
    } catch (e) {
        console.warn("Save failed", e);
    }
}

export function loadLocalData() {
    try {
        const raw = localStorage.getItem("appana_state_v1");
        if (raw) {
            const data = JSON.parse(raw);
            // Merge loaded data into STATE
            Object.keys(data).forEach(k => {
                if (STATE.hasOwnProperty(k)) STATE[k] = data[k];
            });
            // Restore Set
            if (Array.isArray(STATE.selectedIds)) {
                STATE.selectedIds = new Set(STATE.selectedIds);
            }
        }
    } catch (e) {
        console.error("Load failed", e);
    }
}

/* ---------------- TIMER LOGIC ---------------- */

export const timer = {
    interval: null,
    startTime: 0,
    
    startStopwatch: function() {
        if (this.interval) clearInterval(this.interval);
        this.startTime = Date.now();
        const display = el("timer-display"); // Ensure you have this ID in HTML
        
        this.interval = setInterval(() => {
            const seconds = Math.floor((Date.now() - this.startTime) / 1000);
            const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
            const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
            const s = (seconds % 60).toString().padStart(2, '0');
            if(display) display.innerText = `${h}:${m}:${s}`;
        }, 1000);
    },
    
    stop: function() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            const display = el("timer-display");
            if(display) display.innerText = "00:00:00";
        }
    }
};

/* ---------------- TOOLS ---------------- */

function sendToolRequest(command) {
    const topic = el("topic-input")?.value.trim() || "";
    // 1. Force switch to Chat Tab
    const chatTabBtn = document.querySelector(`.nav-btn[data-target="section-chat"]`);
    if(chatTabBtn) chatTabBtn.click();
    
    setTimeout(() => {
        // 2. Populate and Click Send
        const inp = el("user-input");
        const btn = el("send-btn");
        if(inp && btn) { 
            inp.value = topic ? `${command} regarding: ${topic}` : command;
            btn.click(); 
        }
    }, 300); // Slight delay to allow tab switch
}

function exportChatPDF() {
    if(!window.jspdf) return alert("PDF Library loading... please wait.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    let y = 10;
    doc.setFont("helvetica", "bold");
    doc.text("Appana AI - Study Session", 10, y);
    y += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    STATE.chatHistory.forEach(m => {
        const prefix = m.who === "You" ? "You: " : "AI: ";
        // Clean markdown for PDF
        const cleanText = (m.text || "").replace(/\*\*/g, "").replace(/\#/g, ""); 
        const lines = doc.splitTextToSize(prefix + cleanText, 180);
        
        if (y + (lines.length * 5) > 280) { doc.addPage(); y = 10; }
        
        doc.setTextColor(m.who === "You" ? 0 : 50); // Black for User, Dark Gray for AI
        doc.text(lines, 10, y);
        y += lines.length * 5 + 4;
    });
    doc.save("Appana_Chat_History.pdf");
}

/* ---------------- UI SETUP ---------------- */

export function setupUI() {
    // Tools Wiring
    const click = (id, fn) => { const element = el(id); if(element) element.onclick = fn; };
    click("gen-notes-btn", () => sendToolRequest("Generate detailed study notes"));
    click("gen-mcq-btn", () => sendToolRequest("Create 5 Multiple Choice Questions"));
    click("gen-imp-btn", () => sendToolRequest("List the most important exam questions"));
    click("gen-passage-btn", () => sendToolRequest("Write a reading comprehension passage"));
    click("pdf-btn", exportChatPDF);
    
    // Initialize XP Display if it exists
    const xpEl = el("xp-display");
    if(xpEl) xpEl.innerText = `${STATE.xp} XP`;
}
