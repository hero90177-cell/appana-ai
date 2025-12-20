// chat-engine.js
import { auth, db } from './firebase-init.js';
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { STATE, toggleSelectMode, saveData, timer } from './ui-manager.js';
import { deleteMessagesFromCloud } from './auth-manager.js';

const el = id => document.getElementById(id);
const API_URL = "/api/ai-chat";

export function setupChat() {
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
        el(id).onclick = () => {
            const topic = el("topic-input").value;
            if(!topic) return alert("Enter topic first");
            el("user-input").value = `Generate ${gens[id]} for: ${topic}`;
            handleSend();
        };
    });

    // Delete Button Logic (Fixed)
    el("confirm-delete-btn").onclick = async () => {
        if(STATE.selectedIds.size === 0) return;
        const ids = Array.from(STATE.selectedIds);
        
        // Remove from DOM
        ids.forEach(id => {
            const div = document.getElementById(id);
            if(div) div.remove();
        });

        // Remove from Cloud
        await deleteMessagesFromCloud(ids);
        
        toggleSelectMode(); // Exit mode
    };
    
    el("pdf-btn").onclick = downloadPDF;
}

// --- SENDING LOGIC ---
async function handleSend() {
    const txt = el("user-input").value.trim();
    if(!txt) return;

    // 🕵️ SMART MAGIC TIMER COMMAND DETECTION
    const lowerTxt = txt.toLowerCase();
    
    // 1. Check for Stop/Pause/Reset
    if (lowerTxt === "stop" || lowerTxt === "stop timer" || lowerTxt === "end timer") {
        timer.stop();
        el("user-input").value = "";
        return; // Don't send to AI
    }
    
    // 2. Check for Timer (Countdown) e.g., "Timer 10 mins"
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

    // 3. Check for Stopwatch (Count Up)
    if (lowerTxt.includes("stopwatch") || lowerTxt.includes("start timer")) {
        timer.startStopwatch();
        appendMsg("System", "⏱ Stopwatch started.", "ai-message");
        el("user-input").value = "";
        return;
    }

    // --- NORMAL CHAT FLOW ---
    const msgId = "msg_" + Date.now();
    appendMsg("You", txt, "user-message", msgId);
    el("user-input").value = "";

    const aiId = "ai_" + Date.now();
    appendMsg("🦅 Appana AI", "Thinking...", "ai-message", aiId);

    // Context from Custom Subject
    let context = "";
    const subVal = el("subject-selector").value;
    if(subVal.startsWith("custom_")) {
        const s = STATE.customSubjects.find(x => x.id == subVal.split("_")[1]);
        if(s) context = `\nContext: ${s.content}`;
    }

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({
                message: txt + context,
                uid: auth.currentUser ? auth.currentUser.uid : "guest",
                subject: subVal,
                examMode: el("exam-mode-selector").value
            })
        });
        const data = await res.json();
        const reply = data.reply || "Error";
        
        const aiDiv = document.getElementById(aiId);
        if(aiDiv) aiDiv.innerHTML = `<strong>🦅 Appana AI:</strong> ${marked.parse(reply)}`;

        if(auth.currentUser) {
            setDoc(doc(db, "users", auth.currentUser.uid, "chats", msgId), { msg: txt, sender: "user", ts: serverTimestamp() });
            setDoc(doc(db, "users", auth.currentUser.uid, "chats", aiId), { msg: reply, sender: "ai", ts: serverTimestamp() });
        }
        
        STATE.xp += 15;
        el("user-xp").innerText = STATE.xp;
        saveData();

    } catch(e) {
        document.getElementById(aiId).innerText = "Error: Offline.";
    }
}

// --- MESSAGE RENDERER ---
export function appendMsg(who, txt, cls, id) {
    const div = document.createElement("div");
    div.className = `message ${cls}`;
    if(id) div.id = id;
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
