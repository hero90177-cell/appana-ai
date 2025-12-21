// chat-engine.js
import { auth, db } from './firebase-init.js';
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { STATE, saveData, timer } from './ui-manager.js';
// ❌ REMOVED: import { deleteMessagesFromCloud } ... (This caused the crash)

const el = id => document.getElementById(id);
const API_URL = "/api/ai-chat";

/* ---------------------- SETUP CHAT ---------------------- */
export function setupChat() {
    loadChatHistory();

    // Send message button
    const sendBtn = el("send-btn");
    if (sendBtn) sendBtn.onclick = handleSend;

    // Handle Enter key in textarea
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

    // 🕒 Timer Safety
    if (txt.toLowerCase() === "stop") {
        timer.stop();
        input.value = "";
        return;
    }

    // User Message
    const id = "u_" + Date.now();
    appendMsg("You", txt, "user-message", id, true);
    input.value = "";

    // AI Placeholder
    const aiId = "a_" + Date.now();
    appendMsg("🦅 Appana AI", "Thinking…", "ai-message ai-big", aiId, true);

    // Subject Context (Custom + Default)
    let context = "";
    const sub = el("subject-selector")?.value;
    if (sub) {
        if (sub.startsWith("custom_")) {
            const s = STATE.customSubjects?.find(x => x.id === sub.split("_")[1]);
            if (s) context = `\nExplain simply in Indian English.\nTopic info:\n${s.content}`;
        } else if (sub.startsWith("large_")) {
             // Handled by UI manager context injection usually, but we keep this safe
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

        const aiEl = el(aiId);
        if (aiEl) {
            aiEl.innerHTML = `<strong>🦅 Appana AI:</strong><div class="ai-text">${reply}</div>`;
        }

        // Update chat history state
        const h = STATE.chatHistory.find(x => x.id === aiId);
        if (h) h.text = reply;
        saveData();

        // Save to Firebase if logged in
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
    d.innerHTML = `<strong>${who}:</strong> ${txt}`;
    chatBox.appendChild(d);
    chatBox.scrollTop = chatBox.scrollHeight;

    if (save) {
        STATE.chatHistory.push({ id, who, text: txt, cls });
        saveData();
    }
}
