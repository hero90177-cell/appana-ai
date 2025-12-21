// chat-engine.js (vFinal Fixed)
import { auth, db } from './firebase-init.js';
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { STATE, saveData, timer } from './ui-manager.js';

const el = id => document.getElementById(id);
const API_URL = "/api/ai-chat";

/* ---------------------- SETUP CHAT ---------------------- */
export function setupChat() {
    loadChatHistory();

    const sendBtn = el("send-btn");
    if (sendBtn) sendBtn.onclick = handleSend;

    const input = el("user-input");
    if (input) {
        input.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });
    }
}

/* ---------------------- LOAD HISTORY ---------------------- */
function loadChatHistory() {
    if (!STATE.chatHistory?.length) return;
    const chatBox = el("chat-box");
    if (!chatBox) return;
    
    chatBox.innerHTML = "";
    STATE.chatHistory.forEach(msg =>
        appendMsg(msg.who, msg.text, msg.cls, msg.id, false)
    );
}

/* ---------------------- SEND MESSAGE ---------------------- */
async function handleSend() {
    const input = el("user-input");
    const txt = input.value.trim();
    if (!txt) return;

    // ✅ FIXED: ROBUST COMMAND DETECTION
    const lower = txt.toLowerCase().replace(/\s+/g, ' ').trim(); // Normalize spaces

    // 1. Stop Command
    if (lower === "stop" || lower === "stop timer" || lower === "stop stopwatch") {
        timer.stop();
        appendMsg("System", "⏹ Timer/Stopwatch stopped.", "ai-message", "sys_" + Date.now());
        input.value = "";
        return;
    }

    // 2. Stopwatch Command
    if (lower.includes("start stopwatch")) {
        timer.startStopwatch();
        appendMsg("System", "⏱ **Stopwatch Started!** Good luck.", "ai-message", "sys_" + Date.now());
        input.value = "";
        return;
    }

    // 3. Timer Command (Matches: "set timer 20 min", "set timer 20 mins", "timer 20 min")
    // Regex explanation: look for number followed optionally by space and min/sec
    const timerMatch = lower.match(/(?:set\s*)?timer\s+(\d+)\s*(min|sec)/);
    
    if (timerMatch) {
        let val = parseInt(timerMatch[1]);
        const unit = timerMatch[2];
        
        if (unit.startsWith("min")) val *= 60; // Convert minutes to seconds
        
        timer.startTimer(val);
        appendMsg("System", `⏳ **Timer Set:** ${Math.floor(val/60)}m ${val%60}s. Focus!`, "ai-message", "sys_" + Date.now());
        input.value = "";
        return;
    }

    // --- Standard AI Chat Logic Below ---

    // User Message
    const id = "u_" + Date.now();
    appendMsg("You", txt, "user-message", id, true);
    input.value = "";

    // AI Placeholder
    const aiId = "a_" + Date.now();
    appendMsg("🦅 Appana AI", "Thinking…", "ai-message", aiId, true);

    let context = "";
    const sub = el("subject-selector")?.value;
    if (sub) {
        if (sub.startsWith("custom_")) {
            const s = STATE.customSubjects?.find(x => x.id === sub.split("_")[1]);
            if (s) context = `\nExplain simply in Indian English.\nTopic info:\n${s.content}`;
        } else if (sub.startsWith("large_")) {
             context = `\nUse the large subject file context if available.`;
        } else {
            context = `\nUse syllabus context: ${sub}`;
        }
    }

    try {
        const r = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: txt + context,
                uid: auth.currentUser?.uid || "guest"
            })
        });

        const d = await r.json();
        const reply = d.reply || "Error occurred. Try again.";

        // ✅ FORMATTING: Attractive Text
        const aiEl = el(aiId);
        if (aiEl) {
            const formatted = (typeof marked !== 'undefined' && marked.parse) 
                ? marked.parse(reply) 
                : reply.replace(/\n/g, "<br>");
                
            aiEl.innerHTML = `<strong>🦅 Appana AI:</strong><div class="ai-text">${formatted}</div>`;
        }

        // Update chat history state
        const h = STATE.chatHistory.find(x => x.id === aiId);
        if (h) h.text = reply;
        saveData();

        if (auth.currentUser) {
            await setDoc(
                doc(db, "users", auth.currentUser.uid, "chats", aiId),
                { msg: reply, sender: "ai", ts: serverTimestamp() }
            );
        }

    } catch (err) {
        console.error(err);
        const aiEl = el(aiId);
        if (aiEl) aiEl.innerText = "Offline. Please check internet.";
    }
}

/* ---------------------- APPEND MESSAGE ---------------------- */
export function appendMsg(who, txt, cls, id, save = true) {
    const chatBox = el("chat-box");
    if (!chatBox) return;

    const d = document.createElement("div");
    d.className = `message ${cls}`;
    d.id = id;

    // Initial Render
    const displayTxt = (typeof marked !== 'undefined' && marked.parse && cls.includes('ai-message')) 
        ? marked.parse(txt) 
        : txt.replace(/\n/g, "<br>");

    d.innerHTML = `<strong>${who}:</strong> ${displayTxt}`;
    chatBox.appendChild(d);
    chatBox.scrollTop = chatBox.scrollHeight;

    if (save) {
        STATE.chatHistory.push({ id, who, text: txt, cls });
        saveData();
    }
}
