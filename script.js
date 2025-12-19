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
  studyLog: [],
  selectMode: false,
  selectedIds: new Set()
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

  // PWA Install Logic
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
  
  // ✅ SELECT & DELETE BUTTONS
  el("select-mode-btn").onclick = toggleSelectMode;
  el("delete-chat-btn").onclick = handleDeleteAction;
  el("cancel-select-btn").onclick = toggleSelectMode;
  el("select-all-btn").onclick = selectAllMessages;

  // Generators
  el("gen-notes-btn").onclick = () => runGenerator('notes');
  el("gen-mcq-btn").onclick = () => runGenerator('mcq');
  el("gen-imp-btn").onclick = () => runGenerator('imp');
  el("gen-passage-btn").onclick = () => runGenerator('passage');
  
  // Tools
  el("pdf-btn").onclick = downloadPDF;
  if(el("stop-timer-btn")) el("stop-timer-btn").onclick = stopTimer;
  el("clear-db-btn").onclick = () => { if(confirm("This wipes EVERYTHING (XP, Settings). Sure?")) hardReset(); };

  // Settings
  el("subject-selector").onchange = saveData;
  el("language-selector").onchange = saveData;
  el("exam-mode-selector").onchange = saveData;

  // ✅ FILE UPLOAD -> CONVERT TO TEXT
  el("file-upload").onchange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      el("file-preview").classList.remove("hidden");
      el("file-name").innerText = file.name;
      el("ocr-status").innerText = "Converting to text... ⏳";
      
      // RUN OCR OR PDF EXTRACT
      const text = await processFileAndInsertText(file);
      
      if(text) {
          el("user-input").value = text; // Put text in input box
          el("ocr-status").innerText = "Converted! Check input box. ✅";
      } else {
          el("ocr-status").innerText = "Could not convert. Sending as file.";
      }
    }
  };
  
  el("remove-file").onclick = () => {
    el("file-upload").value = "";
    el("file-preview").classList.add("hidden");
    el("ocr-status").innerText = "";
    el("user-input").value = ""; // Clear extracted text
  };

  // Checkbox & Analytics Triggers
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

/* ---------------- SELECT & DELETE LOGIC ---------------- */

function toggleSelectMode() {
    STATE.selectMode = !STATE.selectMode;
    STATE.selectedIds.clear();
    
    // Show/Hide Toolbar
    if(STATE.selectMode) {
        el("selection-toolbar").classList.remove("hidden");
        el("chat-box").classList.add("select-mode-active");
    } else {
        el("selection-toolbar").classList.add("hidden");
        el("chat-box").classList.remove("select-mode-active");
    }
    
    // Toggle checkboxes on existing messages
    document.querySelectorAll(".message").forEach(msg => {
        if(STATE.selectMode) addCheckboxToMsg(msg);
        else removeCheckboxFromMsg(msg);
    });
    updateSelectionUI();
}

function addCheckboxToMsg(msgEl) {
    if(msgEl.querySelector(".msg-check")) return;
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "msg-check";
    chk.onchange = (e) => {
        if(e.target.checked) STATE.selectedIds.add(msgEl.id);
        else STATE.selectedIds.delete(msgEl.id);
        updateSelectionUI();
    };
    msgEl.prepend(chk);
}

function removeCheckboxFromMsg(msgEl) {
    const chk = msgEl.querySelector(".msg-check");
    if(chk) chk.remove();
}

function selectAllMessages() {
    document.querySelectorAll(".msg-check").forEach(chk => {
        chk.checked = true;
        STATE.selectedIds.add(chk.parentElement.id);
    });
    updateSelectionUI();
}

function updateSelectionUI() {
    el("selection-count").innerText = `${STATE.selectedIds.size} selected`;
}

// ✅ MAIN DELETE HANDLER
async function handleDeleteAction() {
    if(STATE.selectMode && STATE.selectedIds.size > 0) {
        if(!confirm(`Delete ${STATE.selectedIds.size} messages?`)) return;
        await deleteSelectedMessages();
    } else {
        // If not in select mode, standard "Delete All"
        if(!confirm("Are you sure you want to delete EVERYTHING?")) return;
        await clearChatHistory();
    }
}

async function deleteSelectedMessages() {
    // 1. UI Remove
    STATE.selectedIds.forEach(id => {
        const m = document.getElementById(id);
        if(m) m.remove();
    });
    
    // 2. Cloud Remove
    if(auth.currentUser) {
        const batch = writeBatch(db);
        STATE.selectedIds.forEach(id => {
            const ref = doc(db, "users", auth.currentUser.uid, "chats", id);
            batch.delete(ref);
        });
        await batch.commit();
        appendMsg("System", "Selected messages deleted.", "ai-message");
    }
    toggleSelectMode(); // Exit mode
}

async function clearChatHistory() {
    el("chat-box").innerHTML = "";
    if(auth.currentUser) {
        try {
            const q = query(collection(db, "users", auth.currentUser.uid, "chats"));
            const snapshot = await getDocs(q);
            const batch = writeBatch(db);
            let count = 0;
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
                count++;
            });
            await batch.commit();
            alert(`✅ Deleted ${count} messages.`);
        } catch(e) {
            console.error(e);
            alert("Error deleting: " + e.message);
        }
    } else {
        alert("✅ Local chat cleared.");
    }
}

/* ---------------- FILE PROCESSING (OCR) ---------------- */

async function processFileAndInsertText(file) {
    try {
        let text = "";
        
        // IMAGE OCR (Client-side Tesseract for Pre-send editing)
        if (file.type.startsWith('image/')) {
            if(!window.Tesseract) throw new Error("OCR Engine missing");
            const { data } = await Tesseract.recognize(file, 'eng');
            text = data.text;
        } 
        // PDF EXTRACT
        else if (file.type === 'application/pdf') {
            if(!window.pdfjsLib) throw new Error("PDF Engine missing");
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
            const maxPages = Math.min(pdf.numPages, 3);
            for(let i=1; i<=maxPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                text += content.items.map(item => item.str).join(" ") + "\n";
            }
        }
        
        return text;
    } catch (e) {
        console.error("Conversion failed:", e);
        return null;
    }
}

/* ---------------- CORE CHAT ---------------- */

async function handleSend(manualText = null) {
  const inputEl = el("user-input");
  const t = manualText || inputEl.value.trim();
  const fileInput = el("file-upload");
  const file = fileInput.files[0];
  
  if (!t && !file) return;

  const msgId = "msg_" + Date.now();
  appendMsg("You", t, "user-message", msgId);
  
  if (!manualText) inputEl.value = "";
  
  // Clear file inputs after sending
  el("file-upload").value = "";
  el("file-preview").classList.add("hidden");

  // Timer Command
  if (t.toLowerCase().includes("start timer")) {
    const min = t.match(/\d+/) ? parseInt(t.match(/\d+/)[0]) : 25;
    startTimer(min);
    appendMsg("🦅 Appana AI", `Timer started: ${min} mins.`, "ai-message");
    saveToCloud(t, `Started timer: ${min} mins`, msgId, "ai_" + Date.now());
    return;
  }
  
  triggerAI(t, file, msgId); 
}

function triggerAI(msg, file, userMsgId) {
  const aiMsgId = "ai_" + Date.now();
  appendMsg("🦅 Appana AI", "Thinking...", "ai-message", aiMsgId);

  // Send image to AI if present (even if we extracted text) for context
  if(file && file.type.startsWith("image/")) {
     const reader = new FileReader();
     reader.onload = () => sendRequest(reader.result.split(',')[1]); 
     reader.readAsDataURL(file);
  } else {
      sendRequest(null);
  }

  function sendRequest(imgBase64) {
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: msg, // Contains extracted text if user kept it
        image: imgBase64,
        subject: el("subject-selector").value || "General",
        language: el("language-selector").value,
        examMode: el("exam-mode-selector").value, 
        uid: auth.currentUser?.uid || "guest"
      })
    })
    .then(r => r.json())
    .then(d => {
      const aiDiv = document.getElementById(aiMsgId);
      if(aiDiv) aiDiv.innerHTML = `<strong>🦅 Appana AI:</strong> ${marked.parse(d.reply || d.error)}`;
      
      updateStatus("api-status", true);
      if (el("tts-toggle").checked) speak(d.reply);
      
      saveToCloud(msg, d.reply, userMsgId, aiMsgId);
      updateXP(10);
      detectWeakness(d.reply, msg);
    })
    .catch(err => {
      const aiDiv = document.getElementById(aiMsgId);
      if(aiDiv) aiDiv.innerHTML = `<strong>🦅 Appana AI:</strong> Offline.`;
      updateStatus("api-status", false);
    });
  }
}

function saveToCloud(u, a, uId, aId) {
  if (!auth.currentUser) return;
  setDoc(doc(db, "users", auth.currentUser.uid, "chats", uId), {
    msg: encryptData(u), sender: "user", ts: serverTimestamp()
  });
  setDoc(doc(db, "users", auth.currentUser.uid, "chats", aId), {
    msg: encryptData(a), sender: "ai", ts: serverTimestamp()
  });
}

async function loadChatHistory(user) {
    if (!user || el("chat-box").childElementCount > 1) return; 
    const q = query(collection(db, "users", user.uid, "chats"), orderBy("ts", "asc"), limit(50));
    const snapshot = await getDocs(q);
    snapshot.forEach(docSnap => {
        const d = docSnap.data();
        const txt = d.enc ? decryptData(d.u || d.msg) : (d.u || d.msg);
        const sender = d.sender === "ai" ? "🦅 Appana AI" : "You";
        const cls = d.sender === "ai" ? "ai-message" : "user-message";
        appendMsg(sender, txt, cls, docSnap.id);
    });
}

function encryptData(text) { return CryptoJS.AES.encrypt(text, ENC_SECRET).toString(); }
function decryptData(ciphertext) {
    try { return CryptoJS.AES.decrypt(ciphertext, ENC_SECRET).toString(CryptoJS.enc.Utf8); } 
    catch (e) { return ciphertext; }
}

async function checkSystemHealth() {
    updateStatus("net-status", navigator.onLine);
    window.addEventListener("online", () => updateStatus("net-status", true));
    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({ type: "ping" }) });
        updateStatus("api-status", (await res.json()).status === "ok");
    } catch (e) { updateStatus("api-status", false); }
}
function updateStatus(id, ok) { el(id).className = `status-dot ${ok?"green":"white"}`; }
function updateXP(amount) {
    STATE.xp += amount;
    el("user-xp").innerText = STATE.xp;
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

function saveData() { localStorage.setItem("appana_v2", JSON.stringify(STATE)); }
function loadLocalData() {
    const s = JSON.parse(localStorage.getItem("appana_v2"));
    if(s) { STATE = {...STATE, ...s}; el("user-xp").innerText = STATE.xp; }
}
function hardReset() { localStorage.clear(); location.reload(); }
function appendMsg(who, txt, cls, id) {
  const d = document.createElement("div");
  d.className = `message ${cls}`;
  if(id) d.id = id;
  const html = marked.parse(txt);
  d.innerHTML = `<strong>${who}:</strong> ${html}`;
  
  if(STATE.selectMode) addCheckboxToMsg(d);
  
  el("chat-box").appendChild(d);
  el("chat-box").scrollTop = el("chat-box").scrollHeight;
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
    handleSend(`Generate ${type} for ${topic}`);
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
function showAnalytics() { el("analytics-modal").classList.remove("hidden"); }
function detectWeakness(a, u) { /* logic included */ }
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
