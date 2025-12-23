// chat-engine.js (vFinal - Smart Timer, Voice, OCR & Large Subjects)
import { auth, db } from './firebase-init.js';
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { STATE, saveData, timer } from './ui-manager.js';

const el = id => document.getElementById(id);
const API_URL = "/api/ai-chat";
const OCR_URL = "http://localhost:8000"; // Python Backend URL

let currentFile = null; // Store selected file temporarily

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

    // 📎 1. FILE UPLOAD LISTENERS
    const fileInput = el("file-upload");
    if (fileInput) {
        fileInput.addEventListener("change", handleFileSelect);
    }
    const removeBtn = el("remove-file");
    if (removeBtn) {
        removeBtn.onclick = clearFile;
    }

    // 🎤 2. VOICE LISTENER
    const voiceBtn = el("voice-btn");
    if (voiceBtn) {
        voiceBtn.onclick = handleVoice;
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

/* ---------------------- HANDLERS ---------------------- */

// 📎 Handle File Selection
function handleFileSelect(e) {
    if (e.target.files && e.target.files[0]) {
        currentFile = e.target.files[0];
        
        // Update UI
        el("file-preview").classList.remove("hidden");
        el("file-name").innerText = currentFile.name;
        el("ocr-status").innerText = "Ready to scan";
        el("ocr-status").style.color = "#fbbf24"; // Yellow
    }
}

function clearFile() {
    currentFile = null;
    el("file-upload").value = "";
    el("file-preview").classList.add("hidden");
}

// 🎤 Handle Voice Recognition
function handleVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Voice not supported in this browser. Try Chrome.");
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN'; // Indian English default
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // Visual Feedback
    const btn = el("voice-btn");
    btn.style.color = "#ef4444"; // Red to show recording

    recognition.start();

    recognition.onresult = (event) => {
        const txt = event.results[0][0].transcript;
        const input = el("user-input");
        if (input) input.value += (input.value ? " " : "") + txt;
        btn.style.color = ""; // Reset color
    };

    recognition.onerror = () => {
        btn.style.color = "";
        alert("Voice Error. Check microphone.");
    };
    
    recognition.onend = () => {
        btn.style.color = "";
    };
}

/* ---------------------- SEND MESSAGE ---------------------- */
async function handleSend() {
    const input = el("user-input");
    let txt = input.value.trim();
    
    // Prevent empty send UNLESS there is a file (which we will process)
    if (!txt && !currentFile) return;

    // ✅ SMART TIMER DETECTION
    // We lowercase and clean up the input to check for commands
    const lower = txt.toLowerCase().replace(/\s+/g, ' ').trim();

    // 1. Stop Command (Stopwatch or Timer)
    if (lower === "stop" || lower.includes("stop timer") || lower.includes("stop stopwatch")) {
        timer.stop();
        appendMsg("System", "⏹ Timer/Stopwatch stopped.", "ai-message", "sys_" + Date.now());
        input.value = "";
        return;
    }

    // 2. Stopwatch Command
    if (lower.includes("start stopwatch") || lower === "stopwatch") {
        timer.startStopwatch();
        appendMsg("System", "⏱ **Stopwatch Started!** Focus time.", "ai-message", "sys_" + Date.now());
        input.value = "";
        return;
    }

    // 3. Smart Timer Command (Flexible)
    if (lower.includes("timer")) {
        const numMatch = lower.match(/(\d+)/);
        let minutes = 25; 
        if (numMatch) minutes = parseInt(numMatch[1]);
        const seconds = minutes * 60;
        timer.startTimer(seconds);
        appendMsg("System", `⏳ **Timer Set:** ${minutes} minutes. Let's study!`, "ai-message", "sys_" + Date.now());
        input.value = "";
        return;
    }

    // --- Standard AI Chat Logic Below ---

    // User Message (Show immediately)
    const id = "u_" + Date.now();
    const displayTxt = currentFile ? `[File: ${currentFile.name}] ${txt}` : txt;
    appendMsg("You", displayTxt, "user-message", id, true);
    input.value = ""; // Clear input immediately

    // AI Placeholder
    const aiId = "a_" + Date.now();
    appendMsg("🦅 Appana AI", "Thinking…", "ai-message", aiId, true);

    // 🔍 4. PROCESS FILE (OCR BRIDGE)
    if (currentFile) {
        const aiEl = el(aiId);
        if(aiEl) aiEl.innerHTML = `<strong>🦅 Appana AI:</strong> 👁 Scanning document...`;
        el("ocr-status").innerText = "Scanning...";

        try {
            const formData = new FormData();
            formData.append('file', currentFile);

            // Determine endpoint based on file type
            const endpoint = currentFile.type === "application/pdf" ? "/ocr/pdf" : "/ocr/image";
            
            const ocrResp = await fetch(`${OCR_URL}${endpoint}`, {
                method: 'POST',
                body: formData
            });

            if (!ocrResp.ok) throw new Error("OCR Service Offline");
            
            const ocrData = await ocrResp.json();
            const extractedText = ocrData.text || "";
            
            // Append extracted text to the user's message invisible logic
            txt += `\n\n[CONTEXT FROM FILE]:\n${extractedText}`;
            
            // Clear file from UI after processing
            clearFile();
            
        } catch (err) {
            console.error("OCR Error:", err);
            txt += "\n(File upload failed or backend offline. Analyzing text only.)";
            clearFile();
        }
    }

    // 🔍 5. CONTEXT PREPARATION (Large Subjects & Standard)
    let context = "";
    let largeSubjectPayload = []; // Array for backend
    
    const sub = el("subject-selector")?.value;
    
    if (sub) {
        if (sub.startsWith("custom_")) {
            const s = STATE.customSubjects?.find(x => x.id === sub.split("_")[1]);
            if (s) context = `\nExplain simply in Indian English.\nTopic info:\n${s.content}`;
        } else if (sub.startsWith("large_")) {
            // 📂 Fetch from IndexedDB
            const subjectId = sub.split("_")[1];
            try {
                const dbReq = indexedDB.open("appana_large_subjects", 1);
                
                // We wrap IDB in a promise to await it
                const largeSubContent = await new Promise((resolve, reject) => {
                    dbReq.onsuccess = (e) => {
                        const db = e.target.result;
                        const tx = db.transaction("subjects", "readonly");
                        const store = tx.objectStore("subjects");
                        const getReq = store.get(subjectId);
                        
                        getReq.onsuccess = () => resolve(getReq.result);
                        getReq.onerror = () => resolve(null);
                    };
                    dbReq.onerror = () => resolve(null);
                });

                if (largeSubContent) {
                    // Pass to backend as structured object
                    largeSubjectPayload.push({
                        name: largeSubContent.name,
                        content: largeSubContent.content // Base64 or Text
                    });
                    context = `\n(Analyzing large subject: ${largeSubContent.name})`;
                }
            } catch (e) {
                console.error("IDB Error", e);
            }
        } else {
            context = `\nUse syllabus context: ${sub}`;
        }
    }

    // 🚀 6. SEND TO CLOUDFLARE WORKER
    try {
        const r = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: txt + context,
                largeSubjects: largeSubjectPayload, // ✅ Sending DB content
                uid: auth.currentUser?.uid || "guest",
                examMode: el("exam-mode-selector")?.value || "normal"
            })
        });

        const d = await r.json();
        const reply = d.reply || "Error occurred. Try again.";

        // ✅ FORMATTING: Attractive Text (Markdown)
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
