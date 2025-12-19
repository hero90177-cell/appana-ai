import { auth, db } from "./firebase-init.js";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, doc, setDoc, query, orderBy, limit, getDocs, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

const ENC_SECRET = "Appana_Ultra_Safe_Key_2025"; 
const el = id => document.getElementById(id);
const API_URL = "/api/ai-chat";
let deferredPrompt; 

document.addEventListener("DOMContentLoaded", () => {
  loadLocalData();
  checkSystemHealth();
  
  setupVoiceInput();
  renderChapters();
  updateGamificationUI();
  updateMotivation();

  // PWA Install
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    const btn = el('install-btn');
    if(btn) { btn.classList.remove('hidden'); btn.onclick = () => deferredPrompt.prompt(); }
  });

  // Basic UI
  el("send-btn").onclick = () => handleSend();
  el("user-input").onkeypress = e => e.key === "Enter" && handleSend();
  el("login-btn").onclick = () => signInWithPopup(auth, new GoogleAuthProvider());
  el("logout-btn").onclick = () => { signOut(auth); el("chat-box").innerHTML = ""; appendMsg("🦅 Appana AI", "Logged out.", "ai-message"); };
  
  // Tools
  el("zen-mode-btn").onclick = () => el("app").classList.toggle("zen-active");
  el("delete-chat-btn").onclick = clearChatHistory; // ✅ TRASH BUTTON LINKED
  
  // Generators
  el("gen-notes-btn").onclick = () => runGenerator('notes');
  el("gen-mcq-btn").onclick = () => runGenerator('mcq');
  el("gen-imp-btn").onclick = () => runGenerator('imp');
  el("gen-passage-btn").onclick = () => runGenerator('passage');
  
  el("pdf-btn").onclick = downloadPDF;
  if(el("stop-timer-btn")) el("stop-timer-btn").onclick = stopTimer;
  el("clear-db-btn").onclick = () => { if(confirm("This wipes EVERYTHING (XP, Settings). Sure?")) hardReset(); };

  // Settings
  el("subject-selector").onchange = saveData;
  el("language-selector").onchange = saveData;
  el("exam-mode-selector").onchange = saveData;

  // File Upload - OPTIMIZED
  el("file-upload").onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      el("file-preview").classList.remove("hidden");
      el("file-name").innerText = file.name;
      // Show different status based on type
      if (file.type.startsWith('image/')) {
        el("ocr-status").innerText = "Image Ready (AI Vision) 📸";
      } else if (file.type === 'application/pdf') {
        el("ocr-status").innerText = "PDF Ready (Text Extract) 📄";
      }
    }
  };
  el("remove-file").onclick = () => {
    el("file-upload").value = "";
    el("file-preview").classList.add("hidden");
    el("ocr-status").innerText = "";
  };

  // Chapter & Analytics
  el("mark-chapter-btn").onclick = () => {
    const val = el("chapter-name").value.trim();
    if(val) {
        STATE.chapters.push({ name: val, done: false });
        el("chapter-name").value = "";
        saveData(); renderChapters();
    }
  };
  el("view-analytics-btn").onclick = showAnalytics;
  el("fix-weakness-btn").onclick = () => {
      const topic = el("weak-topic-name").innerText;
      handleSend(`Give me a hard quiz on ${topic} to fix my weakness.`);
      el("weakness-alert").classList.add("hidden");
  };
});

/* ---------------- NETWORK & HEALTH ---------------- */
async function checkSystemHealth() {
    updateStatus("net-status", navigator.onLine);
    window.addEventListener("online", () => updateStatus("net-status", true));
    window.addEventListener("offline", () => updateStatus("net-status", false));

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "ping" })
        });
        const data = await res.json();
        updateStatus("api-status", data.status === "ok");
    } catch (e) {
        updateStatus("api-status", false);
    }
}
function updateStatus(id, ok) { el(id).className = `status-dot ${ok?"green":"white"}`; }

/* ---------------- CORE CHAT & LOGIC ---------------- */
async function handleSend(manualText = null) {
  const inputEl = el("user-input");
  const t = manualText || inputEl.value.trim();
  const fileInput = el("file-upload");
  const file = fileInput.files[0];
  
  if (!t && !file) return;

  appendMsg("You", t + (file ? ` [File: ${file.name}]` : ""), "user-message");
  if (!manualText) inputEl.value = "";

  let extractedContext = "";

  // 1. PDF Handling (Local Extraction)
  if (file && file.type === "application/pdf") {
      el("ocr-status").innerText = "Reading PDF... ⏳";
      try {
          extractedContext = await extractTextFromPDF(file);
          el("ocr-status").innerText = "PDF Read Successfully ✅";
      } catch (e) {
          console.error(e);
          appendMsg("System", "PDF too large or unreadable. Try a smaller file.", "ai-message");
          el("ocr-status").innerText = "Failed ❌";
          return; // Stop if PDF fails
      }
  }

  // 2. Image Handling (Direct to AI - No Local Processing)
  // We DO NOT extract text from images locally anymore. It crashes phones.
  // We send the raw image to Gemini.

  el("file-upload").value = "";
  el("file-preview").classList.add("hidden");

  // Timer Command
  if (t.toLowerCase().includes("start timer")) {
    const min = t.match(/\d+/) ? parseInt(t.match(/\d+/)[0]) : 25;
    startTimer(min);
    appendMsg("🦅 Appana AI", `Timer started: ${min} mins.`, "ai-message");
    saveToCloud(t, `Started timer: ${min} mins`);
    return;
  }
  
  triggerAI(t, extractedContext, file);
}

// ✅ ROBUST DELETE FUNCTION
async function clearChatHistory() {
    if(!confirm("Are you sure you want to delete the chat history?")) return;
    
    // 1. Clear Screen
    el("chat-box").innerHTML = "";
    
    // 2. Clear Cloud
    if(auth.currentUser) {
        try {
            const q = query(collection(db, "users", auth.currentUser.uid, "chats"));
            const snapshot = await getDocs(q);
            
            // Batch delete
            const batch = writeBatch(db);
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            
            alert("✅ History successfully deleted from Cloud.");
            appendMsg("System", "Chat history wiped.", "ai-message");
        } catch(e) {
            console.error(e);
            alert("❌ Error deleting: " + e.message + "\nCheck your Internet or Permissions.");
        }
    } else {
        alert("✅ Local chat cleared.");
        appendMsg("System", "Chat cleared (Local).", "ai-message");
    }
}

// PDF Reader (Optimized)
async function extractTextFromPDF(file) {
    if(!window.pdfjsLib) return "";
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    let text = "";
    // Limit to 4 pages to save memory
    const maxPages = Math.min(pdf.numPages, 4);
    for(let i=1; i<=maxPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(" ") + "\n";
    }
    return text;
}

// AI Trigger
function triggerAI(msg, extractedText, file) {
  appendMsg("🦅 Appana AI", "Thinking...", "ai-message", "temp");

  // If Image, convert to Base64 for Gemini
  if(file && file.type.startsWith("image/")) {
     const reader = new FileReader();
     reader.onload = () => sendRequest(reader.result.split(',')[1]); // Send Base64
     reader.readAsDataURL(file);
  } else {
      sendRequest(null);
  }

  function sendRequest(imgBase64) {
    // Combine PDF text with User Question
    const fullMessage = extractedText 
        ? `[PDF Content]: ${extractedText}\n\n[Student Question]: ${msg}` 
        : msg;

    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: fullMessage,
        image: imgBase64, // Send image directly to Cloudflare -> Gemini
        subject: el("subject-selector").value || "General",
        language: el("language-selector").value,
        examMode: el("exam-mode-selector").value, 
        uid: auth.currentUser?.uid || "guest"
      })
    })
    .then(r => r.json())
    .then(d => {
      document.getElementById("temp")?.remove();
      const reply = d.reply || d.error || "No response.";
      
      appendMsg("🦅 Appana AI", reply, "ai-message");
      updateStatus("api-status", true);
      
      if (el("tts-toggle").checked) speak(reply);
      
      saveToCloud(msg, reply);
      updateXP(10);
      detectWeakness(reply, msg);
    })
    .catch(err => {
      document.getElementById("temp")?.remove();
      appendMsg("🦅 Appana AI", "Offline. Check connection.", "ai-message");
      updateStatus("api-status", false);
    });
  }
}

/* ---------------- UTILS ---------------- */
function encryptData(text) { return CryptoJS.AES.encrypt(text, ENC_SECRET).toString(); }
function decryptData(ciphertext) {
    try { return CryptoJS.AES.decrypt(ciphertext, ENC_SECRET).toString(CryptoJS.enc.Utf8); } 
    catch (e) { return ciphertext; }
}

function saveToCloud(u, a) {
  if (!auth.currentUser) return;
  setDoc(doc(collection(db, "users", auth.currentUser.uid, "chats")), {
    u: encryptData(u), a: encryptData(a), enc: true,
    ts: serverTimestamp() 
  });
}

async function loadChatHistory(user) {
    if (!user || el("chat-box").childElementCount > 1) return; 
    const q = query(collection(db, "users", user.uid, "chats"), orderBy("ts", "asc"), limit(30));
    const snapshot = await getDocs(q);
    snapshot.forEach(doc => {
        const d = doc.data();
        appendMsg("You", d.enc ? decryptData(d.u) : d.u, "user-message");
        appendMsg("🦅 Appana AI", d.enc ? decryptData(d.a) : d.a, "ai-message");
    });
}

function updateXP(amount) {
    STATE.xp += amount;
    el("user-xp").innerText = STATE.xp;
    
    let rank = "Novice";
    if(STATE.xp > 500) rank = "Scholar";
    if(STATE.xp > 2000) rank = "Topper";
    if(STATE.xp > 5000) rank = "🦅 Legend";
    el("user-rank").innerText = rank;
    
    const today = new Date().toDateString();
    if(STATE.lastStudyDate !== today) {
        STATE.streak++;
        STATE.lastStudyDate = today;
        el("streak").innerText = STATE.streak + " Days";
    }
    saveData();
}

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
    if(s) { 
        STATE = {...STATE, ...s}; 
        el("user-xp").innerText = STATE.xp;
        el("streak").innerText = STATE.streak + " Days";
    }
    const p = JSON.parse(localStorage.getItem("appana_pref"));
    if(p) {
        if(p.sub) {
            const dropdown = el("subject-selector");
            dropdown.value = p.sub; 
            // Fallback if option missing (e.g. old data)
            if(dropdown.value !== p.sub) dropdown.value = "General"; 
        }
        if(p.lang) el("language-selector").value = p.lang;
        if(p.mode) el("exam-mode-selector").value = p.mode;
    }
}

function hardReset() { localStorage.clear(); location.reload(); }

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

function updateMotivation() {
    const quotes = [
        "Padhai kar lo, future ban jayega.",
        "Consistency is key.",
        "Dream big, study hard.",
        "Your only limit is your mind."
    ];
    el("daily-quote").innerText = quotes[Math.floor(Math.random() * quotes.length)];
}

function runGenerator(type) {
    const topic = el("topic-input").value || "General";
    const mode = el("exam-mode-selector").value;
    let prompt = "";
    if(type === 'notes') prompt = `Generate structured notes for: ${topic}. Mode: ${mode}`;
    if(type === 'mcq') prompt = `Create 5 MCQs on ${topic}`;
    if(type === 'imp') prompt = `List important questions for ${topic}`;
    if(type === 'passage') prompt = `Generate a passage about ${topic} with questions.`;
    handleSend(prompt);
}
function downloadPDF() {
    if (!window.jspdf) return alert("Loading...");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Appana AI Notes", 10, 10);
    let y=20;
    document.querySelectorAll(".message").forEach(m => {
        doc.text(doc.splitTextToSize(m.innerText, 180), 10, y);
        y+=20;
    });
    doc.save("notes.pdf");
}
function startTimer(min) {
    if(STATE.timerId) clearInterval(STATE.timerId);
    el("mini-timer").classList.remove("hidden");
    el("mini-timer").style.display = "flex";
    let s = min * 60;
    const start = new Date();
    STATE.timerId = setInterval(() => {
        s--;
        el("timer-display").innerText = `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
        if (s <= 0) { 
            clearInterval(STATE.timerId); 
            speak("Time up"); 
            alert("Time's Up!"); 
            STATE.studyLog.push({ date: new Date().toLocaleDateString(), min: Math.round((new Date()-start)/60000) });
            updateXP(50);
        }
    }, 1000);
}
function stopTimer() { clearInterval(STATE.timerId); el("mini-timer").classList.add("hidden"); }
function showAnalytics() {
    el("analytics-modal").classList.remove("hidden");
    const total = STATE.studyLog.reduce((a,b)=>a+b.min,0);
    el("analytics-content").innerHTML = `<h3>Stats</h3><ul><li>Total Time: ${total} mins</li><li>XP: ${STATE.xp}</li></ul>`;
}
function detectWeakness(aiReply, userMsg) {
    if(aiReply.includes("Incorrect") || aiReply.includes("Mistake")) {
        const sub = el("subject-selector").value;
        STATE.weaknessMap[sub] = (STATE.weaknessMap[sub] || 0) + 1;
        if(STATE.weaknessMap[sub] > 2) {
            el("weakness-alert").classList.remove("hidden");
            el("weak-topic-name").innerText = sub;
        }
    }
}
function renderChapters() {
    const list = el("chapter-list");
    list.innerHTML = "";
    STATE.chapters.forEach((ch, idx) => {
        const d = document.createElement("div");
        d.className = `chapter-item ${ch.done?'done':''}`;
        d.innerHTML = `<span>${ch.name}</span> <input type="checkbox" ${ch.done?'checked':''} onchange="toggleChapter(${idx})">`;
        list.appendChild(d);
    });
}
window.toggleChapter = (idx) => { STATE.chapters[idx].done = !STATE.chapters[idx].done; saveData(); renderChapters(); };

onAuthStateChanged(auth, u => {
  el("login-btn").classList.toggle("hidden", !!u);
  el("logout-btn").classList.toggle("hidden", !u);
  if(u) loadChatHistory(u);
});
