// ui-manager.js (vFixed)
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

/* ---------------- TOOLS (FIXED) ---------------- */

function sendToolRequest(command) {
    const topic = el("topic-input")?.value.trim() || "";
    // 1. Force switch to Chat Tab
    document.querySelector(`.nav-btn[data-target="section-chat"]`)?.click();
    
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

/* ---------------- (Rest of the file remains same, ensure export list matches) ---------------- */
// ... [Keep the Timer, Local Storage, Custom/Large Subjects, and Chapter logic exactly as provided in your upload] ...

// Ensure these functions are exported or assigned globally if needed by HTML onclicks
// For module usage, we attach to window/document in setupUI
export function setupUI() {
    // ... [Previous logic] ...
    
    // Tools Wiring
    const click = (id, fn) => { const element = el(id); if(element) element.onclick = fn; };
    click("gen-notes-btn", () => sendToolRequest("Generate detailed study notes"));
    click("gen-mcq-btn", () => sendToolRequest("Create 5 Multiple Choice Questions"));
    click("gen-imp-btn", () => sendToolRequest("List the most important exam questions"));
    click("gen-passage-btn", () => sendToolRequest("Write a reading comprehension passage"));
    click("pdf-btn", exportChatPDF);
    
    // ... [Rest of setupUI] ...
}
// ... [Rest of file] ...
