import { auth, db } from "./firebase-init.js";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, doc, setDoc, query, orderBy, limit, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// STATE MANAGEMENT
let STATE = { 
  xp: 0, 
  streak: 0, 
  lastStudyDate: null,
  timerId: null, 
  recognition: null,
  weaknessMap: {}, 
  chapters: [],
  studyLog: [] 
};

// 🔒 SECRET KEY (For client-side AES - in production use env vars)
const ENC_SECRET = "Appana_Ultra_Safe_Key_2025"; 

let deferredPrompt; 
const el = id => document.getElementById(id);
const API_URL = "/api/ai-chat";

document.addEventListener("DOMContentLoaded", () => {
  loadLocalData();
  checkConnection();
  setupVoiceInput();
  renderChapters();
  updateGamificationUI();

  // PWA Install
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    const btn = el('install-btn');
    if(btn) { btn.classList.remove('hidden'); btn.onclick = () => deferredPrompt.prompt(); }
  });

  // UI Event Listeners
  el("send-btn").onclick = () => handleSend();
  el("user-input").onkeypress = e => e.key === "Enter" && handleSend();
  
  el("login-btn").onclick = () => signInWithPopup(auth, new GoogleAuthProvider());
  el("logout-btn").onclick = () => { signOut(auth); el("chat-box").innerHTML = ""; appendMsg("🦅 Appana AI", "Logged out.", "ai-message"); };

  el("zen-mode-btn").onclick = () => el("app").classList.toggle("zen-active");
  
  // Generators
  el("gen-notes-btn").onclick = () => runGenerator('notes');
  el("gen-mcq-btn").onclick = () => runGenerator('mcq');
  el("gen-imp-btn").onclick = () => runGenerator('imp');
  el("gen-passage-btn").onclick = () => runGenerator('passage');
  
  el("pdf-btn").onclick = downloadPDF;
  if(el("stop-timer-btn")) el("stop-timer-btn").onclick = stopTimer;
  el("clear-db-btn").onclick = () => { if(confirm("Reset everything?")) hardReset(); };

  // Settings Save
  el("subject-selector").onchange = saveData;
  el("language-selector").onchange = saveData;
  el("exam-mode-selector").onchange = saveData;

  // File Upload Handling (Enhanced for OCR/PDF)
  el("file-upload").onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      el("file-preview").classList.remove("hidden");
      el("file-name").innerText = file.name;
      if(file.type.startsWith('image/')) el("ocr-status").innerText = "Image loaded";
      else if(file.type === 'application/pdf') el("ocr-status").innerText = "PDF loaded";
    }
  };
  el("remove-file").onclick = () => {
    el("file-upload").value = "";
    el("file-preview").classList.add("hidden");
    el("ocr-status").innerText = "";
  };

  // Chapter Tracking
  el("mark-chapter-btn").onclick = () => {
    const val = el("chapter-name").value.trim();
    if(val) {
        STATE.chapters.push({ name: val, done: false });
        el("chapter-name").value = "";
        saveData(); renderChapters();
    }
  };

  // Analytics View
  el("view-analytics-btn").onclick = showAnalytics;
  el("fix-weakness-btn").onclick = () => {
      const topic = el("weak-topic-name").innerText;
      handleSend(`Give me a hard quiz on ${topic} to fix my weakness.`);
      el("weakness-alert").classList.add("hidden");
  };
});

/* ---------------- CORE CHAT & LOGIC ---------------- */

async function handleSend(manualText = null) {
  const inputEl = el("user-input");
  const t = manualText || inputEl.value.trim();
  const fileInput = el("file-upload");
  const file = fileInput.files[0];
  
  if (!t && !file) return;

  // 1. Show User Message
  appendMsg("You", t + (file ? ` [File: ${file.name}]` : ""), "user-message");
  if (!manualText) inputEl.value = "";

  // 2. Handle Text Extraction (OCR / PDF)
  let extractedContext = "";
  if (file) {
      el("ocr-status").innerText = "Extracting text... ⏳";
      try {
          if (file.type.startsWith("image/")) {
              extractedContext = await extractTextFromImage(file);
          } else if (file.type === "application/pdf") {
              extractedContext = await extractTextFromPDF(file);
          }
      } catch (e) {
          console.error(e);
          appendMsg("System", "Text extraction failed, sending raw file.", "ai-message");
      }
      el("ocr-status").innerText = "Done!";
  }

  el("file-upload").value = "";
  el("file-preview").classList.add("hidden");

  // 3. Command Handling
  const lowerMsg = t.toLowerCase();
  
  if (lowerMsg.includes("start timer")) {
    const min = lowerMsg.match(/\d+/) ? parseInt(lowerMsg.match(/\d+/)[0]) : 25;
    startTimer(min);
    appendMsg("🦅 Appana AI", `Timer started: ${min} mins. Good luck!`, "ai-message");
    saveToCloud(t, `Started timer: ${min} mins`);
    return;
  }
  
  // 4. Trigger AI
  triggerAI(t, extractedContext, file);
}

// ✅ NEW: OCR & PDF Extraction
async function extractTextFromImage(file) {
    if(!window.Tesseract) return "";
    const { data: { text } } = await Tesseract.recognize(file, 'eng');
    return text;
}

async function extractTextFromPDF(file) {
    if(!window.pdfjsLib) return "";
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    let text = "";
    const maxPages = Math.min(pdf.numPages, 3); // Limit to 3 pages
    for(let i=1; i<=maxPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(" ") + "\n";
    }
    return text;
}

// --- AI Trigger ---
function triggerAI(msg, extractedText, file) {
  appendMsg("🦅 Appana AI", "Thinking...", "ai-message", "temp");

  // Prepare Image Data (for Gemini Vision fallback)
  let imageData = null;
  if(file && file.type.startsWith("image/")) {
     const reader = new FileReader();
     reader.onload = () => sendRequest(reader.result.split(',')[1]);
     reader.readAsDataURL(file);
  } else {
      sendRequest(null);
  }

  function sendRequest(imgBase64) {
    // Merge msg + extracted text
    const fullMessage = extractedText 
        ? `[Analyzed File Content]: ${extractedText}\n\n[User Question]: ${msg}` 
        : msg;

    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: fullMessage,
        image: imgBase64, 
        subject: el("subject-selector").value,
        language: el("language-selector").value,
        examMode: el("exam-mode-selector").value, // Passing the mode!
        uid: auth.currentUser?.uid || "guest"
      })
    })
    .then(r => r.json())
    .then(d => {
      document.getElementById("temp")?.remove();
      const reply = d.reply || d.error || "No response.";
      
      appendMsg("🦅 Appana AI", reply, "ai-message");
      if (el("tts-toggle").checked) speak(reply);
      
      // Post-Response Logic
      saveToCloud(msg, reply); // Encrypted Save
      updateXP(10); // Reward XP
      detectWeakness(reply, msg); // Check if user struggled
    })
    .catch(err => {
      document.getElementById("temp")?.remove();
      appendMsg("🦅 Appana AI", "Offline. (Check connection).", "ai-message");
    });
  }
}

/* ---------------- GAMIFICATION & ENCRYPTION ---------------- */

// ✅ NEW: AES Encryption
function encryptData(text) {
    return CryptoJS.AES.encrypt(text, ENC_SECRET).toString();
}

function decryptData(ciphertext) {
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, ENC_SECRET);
        return bytes.toString(CryptoJS.enc.Utf8);
    } catch (e) { return ciphertext; } // Fallback for old unencrypted msgs
}

async function loadChatHistory(user) {
    if (!user || el("chat-box").childElementCount > 1) return; 
    
    const q = query(collection(db, "users", user.uid, "chats"), orderBy("ts", "asc"), limit(30));
    const snapshot = await getDocs(q);
    
    snapshot.forEach(doc => {
        const d = doc.data();
        // Decrypt if encrypted flag is present
        const uMsg = d.enc ? decryptData(d.u) : d.u;
        const aMsg = d.enc ? decryptData(d.a) : d.a;
        appendMsg("You", uMsg, "user-message");
        appendMsg("🦅 Appana AI", aMsg, "ai-message");
    });
}

function saveToCloud(u, a) {
  if (!auth.currentUser) return;
  // Encrypt before saving
  const encU = encryptData(u);
  const encA = encryptData(a);
  
  setDoc(doc(collection(db, "users", auth.currentUser.uid, "chats")), {
    u: encU, a: encA, enc: true, // Mark as encrypted
    ts: serverTimestamp() 
  });
}

// ✅ NEW: Weakness Detection
function detectWeakness(aiReply, userMsg) {
    // If AI says "Incorrect" or "The right answer is", track the topic
    if(aiReply.includes("Incorrect") || aiReply.includes("Mistake") || aiReply.includes("not correct")) {
        const sub = el("subject-selector").value;
        STATE.weaknessMap[sub] = (STATE.weaknessMap[sub] || 0) + 1;
        
        if(STATE.weaknessMap[sub] > 2) {
            el("weakness-alert").classList.remove("hidden");
            el("weak-topic-name").innerText = sub;
        }
        saveData();
    }
}

// ✅ NEW: XP & Streak
function updateXP(amount) {
    STATE.xp += amount;
    updateGamificationUI();
    
    const today = new Date().toDateString();
    if(STATE.lastStudyDate !== today) {
        STATE.streak++;
        STATE.lastStudyDate = today;
    }
    saveData();
}

function updateGamificationUI() {
    el("user-xp").innerText = STATE.xp;
    el("streak").innerText = STATE.streak + " Days";
    
    let rank = "Novice";
    if(STATE.xp > 500) rank = "Scholar";
    if(STATE.xp > 2000) rank = "Topper";
    if(STATE.xp > 5000) rank = "🦅 Legend";
    el("user-rank").innerText = rank;
}

/* ---------------- UTILS & ANALYTICS ---------------- */

function runGenerator(type) {
    const topic = el("topic-input").value || "General";
    const mode = el("exam-mode-selector").value;
    
    let prompt = "";
    if(type === 'notes') prompt = `Generate structured revision notes for: ${topic}. Mode: ${mode}`;
    if(type === 'mcq') prompt = `Create 5 hard MCQs on ${topic} with answers hidden at bottom.`;
    if(type === 'imp') prompt = `List 10 most probable exam questions for ${topic}.`;
    if(type === 'passage') prompt = `Generate a reading comprehension passage about ${topic} with 3 questions.`;

    handleSend(prompt);
}

function startTimer(min) {
    if(STATE.timerId) clearInterval(STATE.timerId);
    el("mini-timer").classList.remove("hidden");
    el("mini-timer").style.display = "flex";
    let s = min * 60;
    
    const sessionStart = new Date();
    
    STATE.timerId = setInterval(() => {
        s--;
        el("timer-display").innerText = `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
        if (s <= 0) { 
            stopTimer(); 
            speak("Time is up."); 
            alert("Time's up!");
            const duration = (new Date() - sessionStart) / 60000;
            STATE.studyLog.push({ date: new Date().toLocaleDateString(), min: Math.round(duration) });
            updateXP(50); 
            saveData();
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(STATE.timerId);
    el("mini-timer").classList.add("hidden");
    el("mini-timer").style.display = "none";
}

function showAnalytics() {
    el("analytics-modal").classList.remove("hidden");
    const totalMins = STATE.studyLog.reduce((acc, cur) => acc + cur.min, 0);
    const content = `
        <h3>Your Progress</h3>
        <ul>
            <li><strong>Total Study Time:</strong> ${totalMins} minutes</li>
            <li><strong>Current Streak:</strong> ${STATE.streak} days</li>
            <li><strong>Total XP:</strong> ${STATE.xp}</li>
            <li><strong>Weak Areas:</strong> ${Object.keys(STATE.weaknessMap).join(", ") || "None yet!"}</li>
        </ul>
    `;
    el("analytics-content").innerHTML = content;
}

function renderChapters() {
    const list = el("chapter-list");
    list.innerHTML = "";
    STATE.chapters.forEach((ch, idx) => {
        const div = document.createElement("div");
        div.className = `chapter-item ${ch.done ? 'done' : ''}`;
        div.innerHTML = `<span>${ch.name}</span> <input type="checkbox" ${ch.done?'checked':''} onchange="toggleChapter(${idx})">`;
        list.appendChild(div);
    });
}
window.toggleChapter = (idx) => {
    STATE.chapters[idx].done = !STATE.chapters[idx].done;
    if(STATE.chapters[idx].done) updateXP(20);
    saveData(); renderChapters();
};

function saveData() {
    localStorage.setItem("appana_v2", JSON.stringify(STATE));
    localStorage.setItem("appana_pref", JSON.stringify({
        sub: el("subject-selector").value,
        lang: el("language-selector").value,
        mode: el("exam-mode-selector").value
    }));
}

function loadLocalData() {
    const s = JSON.parse(localStorage.getItem("appana_v2"));
    if(s) { STATE = {...STATE, ...s}; updateXP(0); }
    const p = JSON.parse(localStorage.getItem("appana_pref"));
    if(p) {
        if(p.sub) el("subject-selector").value = p.sub;
        if(p.lang) el("language-selector").value = p.lang;
        if(p.mode) el("exam-mode-selector").value = p.mode;
    }
}

function hardReset() {
    localStorage.clear();
    location.reload();
}

function appendMsg(who, txt, cls, id) {
  const d = document.createElement("div");
  d.className = `message ${cls}`;
  if(id) d.id = id;
  const html = marked.parse(txt);
  d.innerHTML = `<strong>${who}:</strong> ${html}`;
  el("chat-box").appendChild(d);
  el("chat-box").scrollTop = el("chat-box").scrollHeight;
  if (window.MathJax) window.MathJax.typesetPromise([d]).catch(() => {});
}

function setupVoiceInput() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
        STATE.recognition = new SR();
        STATE.recognition.lang = "en-IN";
        STATE.recognition.onresult = (e) => { el("user-input").value = e.results[0][0].transcript; handleSend(); };
        el("voice-btn").onclick = () => STATE.recognition.start();
    } else el("voice-btn").style.display = "none";
}

function speak(text) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[*#]/g, ''));
    u.lang = "en-IN";
    window.speechSynthesis.speak(u);
}

function downloadPDF() {
    if (!window.jspdf) return alert("Loading PDF engine...");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Appana AI - Study Session", 10, 10);
    let y = 20;
    document.querySelectorAll(".message").forEach(msg => {
        const t = msg.innerText;
        const lines = doc.splitTextToSize(t, 180);
        if(y + (lines.length*7) > 280) { doc.addPage(); y=10; }
        doc.text(lines, 10, y);
        y += (lines.length*7) + 5;
    });
    doc.save("Appana-Notes.pdf");
}

async function checkConnection() {
    updateStatus("net-status", navigator.onLine);
    window.addEventListener("online", () => updateStatus("net-status", true));
    window.addEventListener("offline", () => updateStatus("net-status", false));
}
function updateStatus(id, ok) { el(id).className = `status-dot ${ok?"green":"white"}`; }

onAuthStateChanged(auth, u => {
  el("login-btn").classList.toggle("hidden", !!u);
  el("logout-btn").classList.toggle("hidden", !u);
  if(u) loadChatHistory(u);
});
