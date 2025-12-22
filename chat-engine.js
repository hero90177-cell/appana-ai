// chat-engine.js (Full & Final)
import { auth, db } from './firebase-init.js';
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { STATE, saveData, timer } from './ui-manager.js';

const el = id => document.getElementById(id);
const API_URL = "/api/ai-chat";

export function setupChat() {
    loadChatHistory();
    const sendBtn = el("send-btn");
    if (sendBtn) sendBtn.onclick = handleSend;
    const input = el("user-input");
    if (input) {
        input.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };
    }
}

function loadChatHistory() {
    const chatBox = el("chat-box");
    if (!chatBox || !STATE.chatHistory.length) return;
    chatBox.innerHTML = "";
    STATE.chatHistory.forEach(msg => appendMsg(msg.who, msg.text, msg.cls, msg.id, false));
}

async function handleSend() {
    const input = el("user-input");
    const txt = input.value.trim();
    if (!txt) return;

    // ✅ YOUR SMART TIMER LOGIC (100% Preserved)
    const lower = txt.toLowerCase();
    if (lower === "stop" || lower.includes("stop timer")) {
        timer.stop(); appendMsg("System", "⏹ Timer stopped.", "ai-message", "sys_"+Date.now());
        input.value = ""; return;
    }
    if (lower.includes("start stopwatch") || lower === "stopwatch") {
        timer.startStopwatch(); appendMsg("System", "⏱ Stopwatch active.", "ai-message", "sys_"+Date.now());
        input.value = ""; return;
    }
    if (lower.includes("timer")) {
        const mins = parseInt(lower.match(/\d+/)) || 25;
        timer.startTimer(mins * 60);
        appendMsg("System", `⏳ Timer: ${mins} mins.`, "ai-message", "sys_"+Date.now());
        input.value = ""; return;
    }

    // Standard Chat
    const id = "u_" + Date.now();
    appendMsg("You", txt, "user-message", id, true);
    input.value = "";

    const aiId = "a_" + Date.now();
    appendMsg("🦅 Appana AI", "Thinking...", "ai-message", aiId, true);

    try {
        const r = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: txt, uid: auth.currentUser?.uid || "guest" })
        });
        const d = await r.json();
        const reply = d.reply || "Error.";

        // ✅ FIXED FORMATTING (Injecting ai-text class)
        const aiEl = el(aiId);
        if (aiEl) {
            const formatted = (typeof marked !== 'undefined') ? marked.parse(reply) : reply.replace(/\n/g, "<br>");
            aiEl.innerHTML = `<strong>🦅 Appana AI:</strong><div class="ai-text">${formatted}</div>`;
        }

        const h = STATE.chatHistory.find(x => x.id === aiId);
        if (h) h.text = reply;
        saveData();

        if (auth.currentUser) {
            await setDoc(doc(db, "users", auth.currentUser.uid, "chats", aiId), { msg: reply, sender: "ai", ts: serverTimestamp() });
        }
    } catch (err) {
        if (el(aiId)) el(aiId).innerText = "Connection error.";
    }
}

export function appendMsg(who, txt, cls, id, save = true) {
    const chatBox = el("chat-box");
    if (!chatBox) return;

    const d = document.createElement("div");
    d.className = `message ${cls}`;
    d.id = id;

    const formatted = (typeof marked !== 'undefined' && cls.includes('ai-message')) 
        ? marked.parse(txt) 
        : txt.replace(/\n/g, "<br>");

    if (cls.includes("ai-message")) {
        d.innerHTML = `<strong>${who}:</strong><div class="ai-text">${formatted}</div>`;
    } else {
        d.innerHTML = `<strong>${who}:</strong> ${formatted}`;
    }

    chatBox.appendChild(d);
    chatBox.scrollTop = chatBox.scrollHeight;

    if (save) {
        STATE.chatHistory.push({ id, who, text: txt, cls });
        saveData();
    }
}
