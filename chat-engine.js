// chat-engine.js (vFinal - Fixed Connection & IDB)
import { auth, db } from './firebase-init.js';
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { STATE, saveData, timer } from './ui-manager.js';

const el = id => document.getElementById(id);

// ✅ AUTO-DETECT BACKEND URL
const API_URL = "/api/ai-chat"; 
const OCR_URL = ""; 

let currentFile = null; 

export function setupChat() {
    console.log("💬 Chat Engine Ready");
    loadChatHistory();

    const sendBtn = el("send-btn");
    const input = el("user-input");
    const fileInput = el("file-upload");
    const removeBtn = el("remove-file");
    const voiceBtn = el("voice-btn");

    if (sendBtn) sendBtn.onclick = handleSend;
    if (input) {
        input.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });
    }
    if (fileInput) fileInput.addEventListener("change", handleFileSelect);
    if (removeBtn) removeBtn.onclick = clearFile;
    if (voiceBtn) voiceBtn.onclick = handleVoice;
}

function loadChatHistory() {
    if (!STATE.chatHistory?.length) return;
    const chatBox = el("chat-box");
    if (!chatBox) return;
    chatBox.innerHTML = ""; 
    STATE.chatHistory.forEach(msg => appendMsg(msg.who, msg.text, msg.cls, msg.id, false));
}

function handleFileSelect(e) {
    if (e.target.files && e.target.files[0]) {
        currentFile = e.target.files[0];
        el("file-preview").classList.remove("hidden");
        el("file-name").innerText = currentFile.name;
        el("ocr-status").innerText = "Ready to scan";
        el("ocr-status").style.color = "#fbbf24";
    }
}

function clearFile() {
    currentFile = null;
    el("file-upload").value = "";
    el("file-preview").classList.add("hidden");
}

function handleVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Voice not supported in this browser.");
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    
    const btn = el("voice-btn");
    btn.style.color = "#ef4444"; 
    
    recognition.start();
    
    recognition.onresult = (event) => {
        const txt = event.results[0][0].transcript;
        const input = el("user-input");
        if (input) input.value += (input.value ? " " : "") + txt;
        btn.style.color = ""; 
    };
    recognition.onend = () => { btn.style.color = ""; };
}

async function handleSend() {
    const input = el("user-input");
    let txt = input.value.trim();
    
    if (!txt && !currentFile) return;

    // --- TIMERS ---
    const lower = txt.toLowerCase();
    if (lower === "stop" || lower.includes("stop timer")) {
        timer.stop();
        appendMsg("System", "⏹ Timer stopped.", "ai-message", "sys_" + Date.now());
        input.value = ""; return;
    }
    if (lower.includes("start stopwatch")) {
        timer.startStopwatch();
        appendMsg("System", "⏱ **Stopwatch Started!**", "ai-message", "sys_" + Date.now());
        input.value = ""; return;
    }

    const id = "u_" + Date.now();
    const displayTxt = currentFile ? `[File: ${currentFile.name}] ${txt}` : txt;
    appendMsg("You", displayTxt, "user-message", id, true);
    input.value = ""; 

    const aiId = "a_" + Date.now();
    appendMsg("🦅 Appana AI", "Thinking...", "ai-message", aiId, true);

    // --- OCR SCANNING ---
    if (currentFile) {
        const aiEl = el(aiId);
        if(aiEl) aiEl.innerHTML = `<strong>🦅 Appana AI:</strong> 👁 Scanning document...`;
        
        try {
            const formData = new FormData();
            formData.append('file', currentFile);
            const endpoint = currentFile.type === "application/pdf" ? "/ocr/pdf" : "/ocr/image";
            
            const ocrResp = await fetch(`${OCR_URL}${endpoint}`, { method: 'POST', body: formData });
            if (!ocrResp.ok) throw new Error(`OCR Error: ${ocrResp.status}`);
            
            const ocrData = await ocrResp.json();
            txt += `\n\n[FILE CONTENT]:\n${ocrData.text}`;
            clearFile();
        } catch (err) {
            console.error(err);
            txt += `\n(File scan failed: ${err.message})`;
            clearFile();
        }
    }

    // --- GATHER CONTEXT ---
    let largeSubjectPayload = [];
    const sub = el("subject-selector")?.value;
    let context = sub ? `\nSubject: ${sub}` : "";

    if (sub && sub.startsWith("large_")) {
        const subjectId = sub.split("_")[1];
        try {
            const largeSubContent = await getLargeSubjectFromDB(subjectId);
            if (largeSubContent) {
                largeSubjectPayload.push({
                    name: largeSubContent.name,
                    content: largeSubContent.content
                });
                context += ` (Analyzed Large Subject: ${largeSubContent.name})`;
            }
        } catch (e) { console.error("IDB Error", e); }
    } else if (sub && sub.startsWith("custom_")) {
         const s = STATE.customSubjects?.find(x => x.id === sub.split("_")[1]);
         if (s) context += `\nCustom Context: ${s.content}`;
    }

    // --- API CALL ---
    try {
        const r = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: txt + context,
                largeSubjects: largeSubjectPayload,
                uid: auth.currentUser?.uid || "guest",
                examMode: el("exam-mode-selector")?.value || "normal"
            })
        });

        const d = await r.json();
        const reply = d.reply || "Error: No response.";

        // Update UI
        const aiEl = el(aiId);
        if (aiEl) {
            const formatted = (typeof marked !== 'undefined' && marked.parse) 
                ? marked.parse(reply) : reply.replace(/\n/g, "<br>");
            aiEl.innerHTML = `<strong>🦅 Appana AI:</strong><div class="ai-text">${formatted}</div>`;
        }

        // Save
        const h = STATE.chatHistory.find(x => x.id === aiId);
        if (h) h.text = reply;
        saveData();

        if (auth.currentUser) {
            await setDoc(doc(db, "users", auth.currentUser.uid, "chats", aiId), { 
                msg: reply, sender: "ai", ts: serverTimestamp() 
            });
        }

    } catch (err) {
        console.error(err);
        const aiEl = el(aiId);
        if (aiEl) aiEl.innerHTML = `<strong>🦅 Appana AI:</strong><br>⚠️ Network Error. Is Python backend running?`;
    }
}

// Helper to wrap IDB in Promise
function getLargeSubjectFromDB(id) {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open("appana_large_subjects", 1);
        req.onsuccess = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("subjects")) return resolve(null);
            const tx = db.transaction("subjects", "readonly");
            const getReq = tx.objectStore("subjects").get(id);
            getReq.onsuccess = () => resolve(getReq.result);
            getReq.onerror = () => resolve(null);
        };
        req.onerror = () => reject(req.error);
    });
}

export function appendMsg(who, txt, cls, id, save = true) {
    const chatBox = el("chat-box");
    if (!chatBox) return;
    const d = document.createElement("div");
    d.className = `message ${cls}`;
    d.id = id;
    const displayTxt = (typeof marked !== 'undefined' && marked.parse && cls.includes('ai-message')) 
        ? marked.parse(txt) : txt.replace(/\n/g, "<br>");
    d.innerHTML = `<strong>${who}:</strong> ${displayTxt}`;
    chatBox.appendChild(d);
    chatBox.scrollTop = chatBox.scrollHeight;
    if (save) {
        STATE.chatHistory.push({ id, who, text: txt, cls });
        saveData();
    }
}
