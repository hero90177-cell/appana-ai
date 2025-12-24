// chat-engine.js (vFinal - Hybrid Auto OCR)
import { auth, db } from './firebase-init.js';
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { STATE, saveData, timer } from './ui-manager.js';

const el = id => document.getElementById(id);

// ⚠️ BACKEND CONFIGURATION (Kept as Fallback)
const OCR_URL = "https://appana-ai-backend.onrender.com"; 
const API_URL = "/api/ai-chat"; 

let currentFile = null; 
let scannedText = ""; 

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
    
    chatBox.innerHTML = ""; 
    STATE.chatHistory.forEach(msg =>
        appendMsg(msg.who, msg.text, msg.cls, msg.id, false)
    );
}

/* ---------------------- HANDLERS ---------------------- */

function handleFileSelect(e) {
    if (e.target.files && e.target.files[0]) {
        currentFile = e.target.files[0];
        scannedText = ""; 
        
        el("file-preview").classList.remove("hidden");
        el("file-name").innerText = currentFile.name;
        
        // TRIGGER HYBRID SCAN
        performHybridAutoOCR(); 
    }
}

// ✅ HYBRID OCR LOGIC (Client First -> Server Fallback)
async function performHybridAutoOCR() {
    if (!currentFile) return;

    const statusEl = el("ocr-status");
    if(statusEl) {
        statusEl.innerText = "🧠 Reading on device...";
        statusEl.style.color = "#fbbf24"; 
    }

    try {
        // STEP 1: Try Client-Side (Fast, Free, No Server Sleep)
        let text = "";
        
        if (currentFile.type === "application/pdf") {
             text = await performLocalPDFOCR(currentFile);
        } else {
             text = await performLocalImageOCR(currentFile);
        }

        // Validation: If local scan is too empty, it might be a scanned PDF image
        if (!text || text.trim().length < 20) {
            throw new Error("Local scan insufficient");
        }
        
        scannedText = text;
        if(statusEl) {
            statusEl.innerText = "✓ Read locally";
            statusEl.style.color = "#22c55e"; 
        }
        
    } catch (clientErr) {
        console.warn("⚠️ Client OCR incomplete, switching to Server...", clientErr);
        
        // STEP 2: Fallback to Render Server (Powerful, Handles Hindi/Scans)
        if(statusEl) {
            statusEl.innerText = "☁️ Server Scanning..."; // Let user know it might take a moment
        }
        await performServerOCR(); 
    }
}

// 📱 Local Image OCR (Tesseract.js)
async function performLocalImageOCR(file) {
    if (!window.Tesseract) throw new Error("Tesseract not loaded");
    const { data } = await window.Tesseract.recognize(file, 'eng+hin', { 
        logger: m => console.log(m) 
    });
    return data.text;
}

// 📱 Local PDF Text Extractor (PDF.js)
async function performLocalPDFOCR(file) {
    if (!window.pdfjsLib) throw new Error("PDF.js not loaded");
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise;
    let fullText = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map(item => item.str).join(" ") + "\n";
    }
    return fullText;
}

// ☁️ Server OCR (Render Fallback)
async function performServerOCR() {
    const statusEl = el("ocr-status");
    try {
        const formData = new FormData();
        formData.append('file', currentFile);
        const endpoint = currentFile.type === "application/pdf" ? "/ocr/pdf" : "/ocr/image";
        
        const ocrResp = await fetch(`${OCR_URL}${endpoint}`, { method: 'POST', body: formData });
        if (!ocrResp.ok) throw new Error(`Server Error: ${ocrResp.status}`);
        
        const ocrData = await ocrResp.json();
        scannedText = ocrData.text || ""; 

        if(statusEl) {
            if(scannedText && scannedText !== "(No text found)") {
                statusEl.innerText = "✓ Server Scanned";
                statusEl.style.color = "#22c55e"; 
            } else {
                statusEl.innerText = "⚠ No Text Found";
            }
        }
    } catch (err) {
        console.error("Server OCR Fail:", err);
        scannedText = ""; 
        if(statusEl) {
            statusEl.innerText = "⚠ Scan Failed";
            statusEl.style.color = "#ef4444"; 
        }
    }
}

function clearFile() {
    currentFile = null;
    scannedText = "";
    el("file-upload").value = "";
    el("file-preview").classList.add("hidden");
}

function handleVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Voice not supported. Try Chrome.");
        return;
    }

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

    recognition.onerror = (e) => { btn.style.color = ""; };
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

    // ATTACH SCANNED CONTEXT
    if (currentFile) {
        if (scannedText) {
             txt += `\n\n[CONTEXT FROM FILE]:\n${scannedText}`;
        } else {
             txt += `\n\n(Note: File '${currentFile.name}' attached but no text could be extracted.)`;
        }
        clearFile();
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

        const aiEl = el(aiId);
        if (aiEl) {
            const formatted = (typeof marked !== 'undefined' && marked.parse) 
                ? marked.parse(reply) 
                : reply.replace(/\n/g, "<br>");
            aiEl.innerHTML = `<strong>🦅 Appana AI:</strong><div class="ai-text">${formatted}</div>`;
        }

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
        if (aiEl) aiEl.innerHTML = `<strong>🦅 Appana AI:</strong><br>⚠️ Network Error.`;
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
