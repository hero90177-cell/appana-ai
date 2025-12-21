// chat-engine.js
import { auth, db } from './firebase-init.js';
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { STATE, toggleSelectMode, saveData, timer } from './ui-manager.js';
import { deleteMessagesFromCloud } from './auth-manager.js';

const el = id => document.getElementById(id);
const API_URL = "/api/ai-chat";

export function setupChat() {
    // 1. Load Past Messages from Local Storage
    loadChatHistory();

    el("send-btn").onclick = handleSend;
    
    // File Upload
    el("file-upload").onchange = handleFileUpload;
    el("remove-file").onclick = () => { el("file-preview").classList.add("hidden"); el("file-upload").value=""; };

    // Voice
    if('webkitSpeechRecognition' in window) {
        const r = new webkitSpeechRecognition();
        r.onresult = e => { el("user-input").value += " " + e.results[0][0].transcript; };
        el("voice-btn").onclick = () => r.start();
    } else { el("voice-btn").style.display = 'none'; }

    // Generators
    const gens = {
        "gen-notes-btn": "Detailed Notes",
        "gen-mcq-btn": "Multiple Choice Quiz",
        "gen-imp-btn": "Important Questions",
        "gen-passage-btn": "Reading Comprehension"
    };
    Object.keys(gens).forEach(id => {
        const btn = el(id);
        if(btn) {
            btn.onclick = () => {
                const topic = el("topic-input").value;
                if(!topic) return alert("Enter topic first");
                el("user-input").value = `Generate ${gens[id]} for: ${topic}`;
                handleSend();
            };
        }
    });

    // ✅ FIXED DELETE LOGIC with Persistence
    el("confirm-delete-btn").onclick = async () => {
        if(STATE.selectedIds.size === 0) return;
        
        const idsToDelete = Array.from(STATE.selectedIds);
        
        // 1. Remove from DOM
        idsToDelete.forEach(id => {
            const div = document.getElementById(id);
            if(div) div.remove();
        });

        // 2. Remove from Local Storage History
        STATE.chatHistory = STATE.chatHistory.filter(msg => !idsToDelete.includes(msg.id));
        saveData(); // Save new state to ensure they don't come back on refresh

        // 3. Remove from Cloud (Fire & Forget)
        try {
            await deleteMessagesFromCloud(idsToDelete);
        } catch(err) {
            console.log("Cloud delete skipped or failed (offline mode).");
        }
        
        toggleSelectMode(); // Exit mode
    };
    
    el("pdf-btn").onclick = downloadPDF;
}

// --- RESTORE HISTORY ---
function loadChatHistory() {
    const box = el("chat-box");
    // Clear default welcome if we have history
    if(STATE.chatHistory && STATE.chatHistory.length > 0) {
        box.innerHTML = ""; 
        STATE.chatHistory.forEach(msg => {
            appendMsg(msg.who, msg.text, msg.cls, msg.id, false); // false = don't save again
        });
        box.scrollTop = box.scrollHeight;
    }
}

// --- SENDING LOGIC ---
async function handleSend() {
    const txt = el("user-input").value.trim();
    if(!txt) return;

    // 🕵️ SMART MAGIC TIMER COMMAND DETECTION
    const lowerTxt = txt.toLowerCase();
    
    if (lowerTxt === "stop" || lowerTxt === "stop timer" || lowerTxt === "end timer") {
        timer.stop();
        el("user-input").value = "";
        return; 
    }
    
    const timerMatch = lowerTxt.match(/timer\s+(\d+)\s*(min|sec|hour|h|m|s)?/);
    if (timerMatch) {
        let val = parseInt(timerMatch[1]);
        const unit = timerMatch[2] || 'min';
        if (unit.startsWith('h')) val *= 3600;
        else if (unit.startsWith('m')) val *= 60;
        timer.startTimer(val);
        appendMsg("System", `⏳ Timer set for ${val/60} minutes.`, "ai-message");
        el("user-input").value = "";
        return;
    }

    if (lowerTxt.includes("stopwatch") || lowerTxt.includes("start timer")) {
        timer.startStopwatch();
        appendMsg("System", "⏱ Stopwatch started.", "ai-message");
        el("user-input").value = "";
        return;
    }

    // --- NORMAL CHAT FLOW ---
    const msgId = "msg_" + Date.now();
    appendMsg("You", txt, "user-message", msgId, true); // true = save to storage
    el("user-input").value = "";

    const aiId = "ai_" + Date.now();
    appendMsg("🦅 Appana AI", "Thinking...", "ai-message", aiId, true);

    // Context from Custom Subject
    let context = "";
    const subSelector = el("subject-selector");
    const subVal = subSelector ? subSelector.value : "General";
    
    if(subVal.startsWith("custom_")) {
        const s = STATE.customSubjects.find(x => x.id == subVal.split("_")[1]);
        if(s) context = `\nContext: ${s.content}`;
    }

    try {
        const examModeEl = el("exam-mode-selector");
        const res = await fetch(API_URL, {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({
                message: txt + context,
                uid: auth.currentUser ? auth.currentUser.uid : "guest",
                subject: subVal,
                examMode: examModeEl ? examModeEl.value : "normal"
            })
        });
        const data = await res.json();
        const reply = data.reply || "Error";
        
        // Update DOM
        const aiDiv = document.getElementById(aiId);
        if(aiDiv) aiDiv.innerHTML = `<strong>🦅 Appana AI:</strong> ${typeof marked !== 'undefined' ? marked.parse(reply) : reply}`;

        // Update Local Storage History with the actual reply (replace "Thinking...")
        const histItem = STATE.chatHistory.find(m => m.id === aiId);
        if(histItem) {
            histItem.text = reply;
            saveData();
        }

        if(auth.currentUser) {
            setDoc(doc(db, "users", auth.currentUser.uid, "chats", msgId), { msg: txt, sender: "user", ts: serverTimestamp() });
            setDoc(doc(db, "users", auth.currentUser.uid, "chats", aiId), { msg: reply, sender: "ai", ts: serverTimestamp() });
        }
        
        STATE.xp += 15;
        if(el("user-xp")) el("user-xp").innerText = STATE.xp;
        saveData();

    } catch(e) {
        const aiDiv = document.getElementById(aiId);
        if(aiDiv) aiDiv.innerText = "Error: Offline.";
    }
}

// --- MESSAGE RENDERER ---
export function appendMsg(who, txt, cls, id, saveToState = true) {
    const div = document.createElement("div");
    div.className = `message ${cls}`;
    if(id) div.id = id;
    
    // Check if text is "Thinking..." or real content
    div.innerHTML = `<strong>${who}:</strong> ${typeof marked !== 'undefined' ? marked.parse(txt) : txt}`;
    
    // CLICK TO SELECT
    div.onclick = () => {
        if(!STATE.selectMode) return;
        
        if(STATE.selectedIds.has(id)) {
            STATE.selectedIds.delete(id);
            div.classList.remove("selected");
        } else {
            STATE.selectedIds.add(id);
            div.classList.add("selected");
        }
        el("selection-count").innerText = `${STATE.selectedIds.size} Selected`;
    };

    el("chat-box").appendChild(div);
    el("chat-box").scrollTop = el("chat-box").scrollHeight;

    // ✅ SAVE TO HISTORY
    if(saveToState) {
        STATE.chatHistory.push({ id, who, text: txt, cls });
        saveData();
    }
}

async function handleFileUpload(e) {
    const f = e.target.files[0];
    if(!f) return;
    el("file-preview").classList.remove("hidden");
    el("file-name").innerText = f.name;
    
    if(f.type.includes("image")) {
        const { data } = await Tesseract.recognize(f, 'eng');
        el("user-input").value = data.text;
        el("ocr-status").innerText = "Done";
    }
}

function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Appana AI Chat History", 10, 10);
    let y = 20;
    document.querySelectorAll(".message").forEach(m => {
        const t = m.innerText;
        const lines = doc.splitTextToSize(t, 180);
        doc.text(lines, 10, y);
        y += (lines.length * 7) + 5;
        if(y > 280) { doc.addPage(); y = 10; }
    });
    doc.save("Appana-Chat.pdf");
}
