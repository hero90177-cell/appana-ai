// chat-engine.js (vFinal - Robust & Connected)
import { auth, db } from './firebase-init.js';
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { STATE, saveData, timer } from './ui-manager.js';

const el = id => document.getElementById(id);

// ⚠️ CONFIGURATION: Change these if deploying!
const API_URL = "/api/ai-chat"; // Points to Cloudflare Worker or Proxy
const OCR_URL = "http://localhost:8000"; // Python Backend URL

let currentFile = null; 

/* ---------------------- SETUP CHAT ---------------------- */
export function setupChat() {
    console.log("💬 Setting up Chat Engine...");
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

/* ---------------------- LOAD HISTORY ---------------------- */
function loadChatHistory() {
    if (!STATE.chatHistory?.length) return;
    const chatBox = el("chat-box");
    if (!chatBox) return;
    
    chatBox.innerHTML = ""; // Clear welcome message
    STATE.chatHistory.forEach(msg =>
        appendMsg(msg.who, msg.text, msg.cls, msg.id, false)
    );
}

/* ---------------------- HANDLERS ---------------------- */

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
    // Browser compatibility check
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Voice not supported. Try Chrome or Edge.");
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;

    const btn = el("voice-btn");
    btn.style.color = "#ef4444"; // Red indicating recording

    recognition.start();

    recognition.onresult = (event) => {
        const txt = event.results[0][0].transcript;
        const input = el("user-input");
        if (input) input.value += (input.value ? " " : "") + txt;
        btn.style.color = ""; 
    };

    recognition.onerror = (e) => {
        console.warn("Voice Error:", e.error);
        btn.style.color = "";
    };
    recognition.onend = () => { btn.style.color = ""; };
}

/* ---------------------- SEND MESSAGE ---------------------- */
async function handleSend() {
    const input = el("user-input");
    let txt = input.value.trim();
    
    if (!txt && !currentFile) return;

    // --- COMMAND CHECK (Timers) ---
    const lower = txt.toLowerCase().replace(/\s+/g, ' ').trim();

    if (lower === "stop" || lower.includes("stop timer")) {
        timer.stop();
        appendMsg("System", "⏹ Timer stopped.", "ai-message", "sys_" + Date.now());
        input.value = "";
        return;
    }

    if (lower.includes("start stopwatch") || lower === "stopwatch") {
        timer.startStopwatch();
        appendMsg("System", "⏱ **Stopwatch Started!**", "ai-message", "sys_" + Date.now());
        input.value = "";
        return;
    }

    if (lower.includes("timer") && /\d+/.test(lower)) {
        const numMatch = lower.match(/(\d+)/);
        const minutes = numMatch ? parseInt(numMatch[1]) : 25;
        timer.startTimer(minutes * 60);
        appendMsg("System", `⏳ **Timer Set:** ${minutes} mins.`, "ai-message", "sys_" + Date.now());
        input.value = "";
        return;
    }

    // --- CHAT LOGIC ---
    const id = "u_" + Date.now();
    const displayTxt = currentFile ? `[File: ${currentFile.name}] ${txt}` : txt;
    appendMsg("You", displayTxt, "user-message", id, true);
    input.value = ""; 

    const aiId = "a_" + Date.now();
    appendMsg("🦅 Appana AI", "Thinking…", "ai-message", aiId, true);

    // OCR PROCESSING
    if (currentFile) {
        const aiEl = el(aiId);
        if(aiEl) aiEl.innerHTML = `<strong>🦅 Appana AI:</strong> 👁 Scanning document...`;
        
        try {
            const formData = new FormData();
            formData.append('file', currentFile);
            const endpoint = currentFile.type === "application/pdf" ? "/ocr/pdf" : "/ocr/image";
            
            // Attempt OCR Fetch
            const ocrResp = await fetch(`${OCR_URL}${endpoint}`, { method: 'POST', body: formData })
                .catch(() => { throw new Error("Backend Offline"); });

            if (!ocrResp.ok) throw new Error("OCR Service Error");
            
            const ocrData = await ocrResp.json();
            txt += `\n\n[CONTEXT FROM FILE]:\n${ocrData.text || ""}`;
            clearFile();
            
        } catch (err) {
            console.error("OCR Fail:", err);
            txt += "\n(Note: File scan failed. Analyzing text only.)";
            clearFile();
        }
    }

    // GATHER CONTEXT
    let context = "";
    let largeSubjectPayload = [];
    const sub = el("subject-selector")?.value;
    
    if (sub) {
        if (sub.startsWith("custom_")) {
            const s = STATE.customSubjects?.find(x => x.id === sub.split("_")[1]);
            if (s) context = `\nContext:\n${s.content}`;
        } else if (sub.startsWith("large_")) {
            const subjectId = sub.split("_")[1];
            try {
                // Fetch from IndexedDB
                const dbReq = indexedDB.open("appana_large_subjects", 1);
                const largeSubContent = await new Promise((resolve) => {
                    dbReq.onsuccess = (e) => {
                        const db = e.target.result;
                        if (!db.objectStoreNames.contains("subjects")) return resolve(null);
                        const tx = db.transaction("subjects", "readonly");
                        const req = tx.objectStore("subjects").get(subjectId);
                        req.onsuccess = () => resolve(req.result);
                        req.onerror = () => resolve(null);
                    };
                    dbReq.onerror = () => resolve(null);
                });

                if (largeSubContent) {
                    largeSubjectPayload.push({
                        name: largeSubContent.name,
                        content: largeSubContent.content
                    });
                    context = `\n(Analyzing large subject: ${largeSubContent.name})`;
                }
            } catch (e) { console.error("IDB Error", e); }
        } else {
            context = `\nSubject Context: ${sub}`;
        }
    }

    // SEND TO AI API
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
        const reply = d.reply || "Error: No response from AI.";

        // Update UI
        const aiEl = el(aiId);
        if (aiEl) {
            const formatted = (typeof marked !== 'undefined' && marked.parse) 
                ? marked.parse(reply) 
                : reply.replace(/\n/g, "<br>");
            aiEl.innerHTML = `<strong>🦅 Appana AI:</strong><div class="ai-text">${formatted}</div>`;
        }

        // Save History
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
        if (aiEl) aiEl.innerHTML = `<strong>🦅 Appana AI:</strong><br>⚠️ Network Error. Check connection or API URL.`;
    }
}

/* ---------------------- APPEND MESSAGE ---------------------- */
export function appendMsg(who, txt, cls, id, save = true) {
    const chatBox = el("chat-box");
    if (!chatBox) return;

    const d = document.createElement("div");
    d.className = `message ${cls}`;
    d.id = id;

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
