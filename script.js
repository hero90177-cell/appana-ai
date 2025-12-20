import { auth, db } from "./firebase-init.js";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, doc, setDoc, query, orderBy, limit, getDocs, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// STATE MANAGEMENT
let STATE = { 
  xp: 0, streak: 0, lastStudyDate: null, timerId: null, recognition: null, weaknessMap: {}, 
  chapters: [], studyLog: [], selectMode: false, selectedIds: new Set()
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

  // ✅ Auto-Resize Textarea
  const textarea = el("user-input");
  textarea.addEventListener("input", function() {
    this.style.height = "auto";
    this.style.height = (this.scrollHeight) + "px";
  });
  
  // Enter key sends, Shift+Enter adds new line
  textarea.onkeypress = e => {
      if(e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSend();
      }
  };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    const btn = el('install-btn');
    if(btn) { btn.classList.remove('hidden'); btn.onclick = () => deferredPrompt.prompt(); }
  });

  el("send-btn").onclick = () => handleSend();
  el("login-btn").onclick = () => signInWithPopup(auth, new GoogleAuthProvider());
  el("logout-btn").onclick = () => { signOut(auth); el("chat-box").innerHTML = ""; appendMsg("🦅 Appana AI", "Logged out.", "ai-message"); };

  // Select Mode Logic
  const selectBtn = el("select-mode-btn");
  if(selectBtn) selectBtn.onclick = toggleSelectMode;

  el("cancel-select-btn").onclick = toggleSelectMode;
  el("select-all-btn").onclick = selectAllMessages;
  el("confirm-delete-btn").onclick = handleDeleteAction;

  el("gen-notes-btn").onclick = () => runGenerator('notes');
  el("gen-mcq-btn").onclick = () => runGenerator('mcq');
  el("gen-imp-btn").onclick = () => runGenerator('imp');
  el("gen-passage-btn").onclick = () => runGenerator('passage');
  el("pdf-btn").onclick = downloadPDF;
  if(el("stop-timer-btn")) el("stop-timer-btn").onclick = stopTimer;
  el("clear-db-btn").onclick = () => { if(confirm("This wipes XP too. Sure?")) hardReset(); };

  el("subject-selector").onchange = saveData;
  el("language-selector").onchange = saveData;
  el("exam-mode-selector").onchange = saveData;

  el("file-upload").onchange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      el("file-preview").classList.remove("hidden");
      el("file-name").innerText = file.name;
      el("ocr-status").innerText = "Reading file... ⏳";
      const text = await processFileAndInsertText(file);
      if(text) { 
          el("user-input").value = text; 
          el("user-input").dispatchEvent(new Event('input')); // Trigger resize
          el("ocr-status").innerText = "Done! ✅"; 
      } 
      else { el("ocr-status").innerText = "Sent as file."; }
    }
  };
  
  el("remove-file").onclick = () => {
    el("file-upload").value = ""; el("file-preview").classList.add("hidden"); el("user-input").value = "";
  };
  el("mark-chapter-btn").onclick = () => {
    const val = el("chapter-name").value.trim();
    if(val) { STATE.chapters.push({ name: val, done: false }); el("chapter-name").value = ""; saveData(); renderChapters(); }
  };
  el("view-analytics-btn").onclick = showAnalytics;
  el("fix-weakness-btn").onclick = () => {
      const topic = el("weak-topic-name").innerText;
      handleSend(`Give me a hard quiz on ${topic} to fix my weakness.`);
      el("weakness-alert").classList.add("hidden");
  };
});

/* ---------------- UPDATED SELECT & DELETE LOGIC ---------------- */

function toggleSelectMode() {
    STATE.selectMode = !STATE.selectMode;
    STATE.selectedIds.clear();
    
    if(STATE.selectMode) {
        el("selection-toolbar").classList.remove("hidden");
        el("chat-box").classList.add("select-mode-active");
    } else {
        el("selection-toolbar").classList.add("hidden");
        el("chat-box").classList.remove("select-mode-active");
    }
    
    document.querySelectorAll(".message").forEach(msg => {
        if(STATE.selectMode) setupMessageSelection(msg);
        else cleanupMessageSelection(msg);
    });
    
    updateSelectionUI();
}

function setupMessageSelection(msgEl) {
    if(msgEl.querySelector(".msg-check")) return;
    
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "msg-check";
    msgEl.prepend(chk);

    // Make the WHOLE message clickable
    msgEl.onclick = (e) => {
        if(!STATE.selectMode) return;
        chk.checked = !chk.checked;
        if(chk.checked) {
            STATE.selectedIds.add(msgEl.id);
            msgEl.classList.add("selected");
        } else {
            STATE.selectedIds.delete(msgEl.id);
            msgEl.classList.remove("selected");
        }
        updateSelectionUI();
    };
}

function cleanupMessageSelection(msgEl) {
    const chk = msgEl.querySelector(".msg-check");
    if(chk) chk.remove();
    msgEl.classList.remove("selected");
    msgEl.onclick = null; 
}

function selectAllMessages() {
    document.querySelectorAll(".message").forEach(msg => {
        const chk = msg.querySelector(".msg-check");
        if(chk) {
            chk.checked = true;
            STATE.selectedIds.add(msg.id);
            msg.classList.add("selected");
        }
    });
    updateSelectionUI();
}

function updateSelectionUI() {
    el("selection-count").innerText = `${STATE.selectedIds.size} selected`;
}

async function handleDeleteAction() {
    if(STATE.selectedIds.size > 0) {
        if(!confirm(`Delete ${STATE.selectedIds.size} messages?`)) return;
        await deleteSelectedMessages();
    } else {
        alert("Select something first!");
    }
}

async function deleteSelectedMessages() {
    STATE.selectedIds.forEach(id => {
        const m = document.getElementById(id);
        if(m) m.remove();
    });
    
    if(auth.currentUser) {
        try {
            const batch = writeBatch(db);
            STATE.selectedIds.forEach(id => {
                const ref = doc(db, "users", auth.currentUser.uid, "chats", id);
                batch.delete(ref);
            });
            await batch.commit();
        } catch(e) { console.error(e); }
    }
    toggleSelectMode(); 
}

/* ---------------- REST OF CODE ---------------- */

async function processFileAndInsertText(file) {
    try {
        let text = "";
        if (file.type.startsWith('image/')) {
            if(!window.Tesseract) throw new Error("OCR Missing");
            const { data } = await Tesseract.recognize(file, 'eng'); text = data.text;
        } else if (file.type === 'application/pdf') {
            if(!window.pdfjsLib) throw new Error("PDF Missing");
            const ab = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(ab).promise;
            for(let i=1; i<=Math.min(pdf.numPages, 3); i++) {
                text += (await (await pdf.getPage(i)).getTextContent()).items.map(s=>s.str).join(" ")+"\n";
            }
        }
        return text;
    } catch (e) { console.error(e); return null; }
}

async function handleSend(manualText = null) {
  const inputEl = el("user-input");
  const t = manualText || inputEl.value.trim();
  const file = el("file-upload").files[0];
  if (!t && !file) return;

  const msgId = "msg_" + Date.now();
  appendMsg("You", t, "user-message", msgId);
  if (!manualText) {
      inputEl.value = "";
      inputEl.style.height = "auto"; // Reset height
  }
  el("file-upload").value = ""; el("file-preview").classList.add("hidden");

  if (t.toLowerCase().includes("start timer")) {
    const min = parseInt(t.match(/\d+/)?.[0] || 25);
    startTimer(min); appendMsg("🦅 Appana AI", `Timer: ${min}m started.`, "ai-message");
    return;
  }
  triggerAI(t, file, msgId); 
}

function triggerAI(msg, file, userMsgId) {
  const aiMsgId = "ai_" + Date.now();
  appendMsg("🦅 Appana AI", "Thinking...", "ai-message", aiMsgId);

  const req = (img) => {
    fetch(API_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg, image: img, subject: el("subject-selector").value, language: el("language-selector").value, examMode: el("exam-mode-selector").value, uid: auth.currentUser?.uid || "guest" })
    })
    .then(r => r.json()).then(d => {
      const div = document.getElementById(aiMsgId);
      if(div) div.innerHTML = `<strong>🦅 Appana AI:</strong> ${marked.parse(d.reply || d.error)}`;
      updateStatus("api-status", true);
      if (el("tts-toggle").checked) speak(d.reply);
      saveToCloud(msg, d.reply, userMsgId, aiMsgId);
      updateXP(10);
    }).catch(() => {
       const div = document.getElementById(aiMsgId);
       if(div) div.innerHTML = `<strong>🦅 Appana AI:</strong> Offline.`;
       updateStatus("api-status", false);
    });
  };

  if(file && file.type.startsWith("image/")) {
     const r = new FileReader(); r.onload = () => req(r.result.split(',')[1]); r.readAsDataURL(file);
  } else req(null);
}

function saveToCloud(u, a, uId, aId) {
  if (!auth.currentUser) return;
  setDoc(doc(db, "users", auth.currentUser.uid, "chats", uId), { msg: encryptData(u), sender: "user", ts: serverTimestamp(), enc: true });
  setDoc(doc(db, "users", auth.currentUser.uid, "chats", aId), { msg: encryptData(a), sender: "ai", ts: serverTimestamp(), enc: true });
}

async function loadChatHistory(user) {
    if (!user || el("chat-box").childElementCount > 1) return; 
    const q = query(collection(db, "users", user.uid, "chats"), orderBy("ts", "asc"), limit(50));
    const snapshot = await getDocs(q);
    snapshot.forEach(d => {
        const data = d.data();
        let txt = data.u || data.msg;
        if (data.enc || (txt && typeof txt === 'string' && txt.startsWith('U2FsdGVk'))) {
            txt = decryptData(txt);
        }
        appendMsg(data.sender==="ai"?"🦅 Appana AI":"You", txt, data.sender==="ai"?"ai-message":"user-message", d.id);
    });
}

function encryptData(text) { return CryptoJS.AES.encrypt(text, ENC_SECRET).toString(); }
function decryptData(ciphertext) { try { return CryptoJS.AES.decrypt(ciphertext, ENC_SECRET).toString(CryptoJS.enc.Utf8); } catch { return ciphertext; } }

async function checkSystemHealth() {
    updateStatus("net-status", navigator.onLine);
    window.addEventListener("online", () => updateStatus("net-status", true));
    try { const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({ type: "ping" }) }); updateStatus("api-status", (await res.json()).status === "ok"); } catch { updateStatus("api-status", false); }
}
function updateStatus(id, ok) { el(id).className = `status-dot ${ok?"green":"white"}`; }
function updateXP(amount) { STATE.xp += amount; el("user-xp").innerText = STATE.xp; saveData(); }
function updateGamificationUI() { el("user-xp").innerText = STATE.xp; el("streak").innerText = STATE.streak+"d"; el("user-rank").innerText = STATE.xp>5000?"🦅 Legend":STATE.xp>2000?"Topper":STATE.xp>500?"Scholar":"Novice"; }
function saveData() { localStorage.setItem("appana_v2", JSON.stringify(STATE)); }
function loadLocalData() { const s = JSON.parse(localStorage.getItem("appana_v2")); if(s) { STATE = {...STATE, ...s}; el("user-xp").innerText = STATE.xp; } }
function hardReset() { localStorage.clear(); if('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(r=>r.forEach(x=>x.unregister())); location.reload(); }

function appendMsg(who, txt, cls, id) {
  const d = document.createElement("div"); d.className = `message ${cls}`; if(id) d.id = id;
  d.innerHTML = `<strong>${who}:</strong> ${marked.parse(txt)}`;
  if(STATE.selectMode) setupMessageSelection(d);
  el("chat-box").appendChild(d); el("chat-box").scrollTop = el("chat-box").scrollHeight;
}

function setupVoiceInput() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) { STATE.recognition = new SR(); STATE.recognition.lang = "en-IN"; STATE.recognition.onresult = (e) => { el("user-input").value = e.results[0][0].transcript; handleSend(); }; el("voice-btn").onclick = () => STATE.recognition.start(); } else el("voice-btn").style.display = "none";
}
function speak(text) { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.replace(/[*#]/g, '')); u.lang = "en-IN"; window.speechSynthesis.speak(u); }
function updateMotivation() { el("daily-quote").innerText = ["Padhai kar lo.", "Consistency is key.", "Dream big.", "Just do it."][Math.floor(Math.random()*4)]; }
function runGenerator(type) { handleSend(`Generate ${type} for ${el("topic-input").value || "General"}`); }
function downloadPDF() {
    if (!window.jspdf) return alert("Loading...");
    const doc = new window.jspdf.jsPDF(); doc.text("Appana AI Notes", 10, 10);
    let y=20; document.querySelectorAll(".message").forEach(m => { doc.text(doc.splitTextToSize(m.innerText, 180), 10, y); y+=20; });
    doc.save("notes.pdf");
}
function startTimer(min) {
    if(STATE.timerId) clearInterval(STATE.timerId); el("mini-timer").classList.remove("hidden"); el("mini-timer").style.display = "flex";
    let s = min * 60; const start = new Date();
    STATE.timerId = setInterval(() => { s--; el("timer-display").innerText = `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; if (s <= 0) { clearInterval(STATE.timerId); speak("Time up"); alert("Time's Up!"); STATE.studyLog.push({ date: new Date().toLocaleDateString(), min: Math.round((new Date()-start)/60000) }); updateXP(50); } }, 1000);
}
function stopTimer() { clearInterval(STATE.timerId); el("mini-timer").classList.add("hidden"); }
function showAnalytics() { el("analytics-modal").classList.remove("hidden"); }
function renderChapters() {
    const list = el("chapter-list"); list.innerHTML = "";
    STATE.chapters.forEach((ch, idx) => {
        const d = document.createElement("div"); d.className = `chapter-item ${ch.done?'done':''}`;
        d.innerHTML = `<span>${ch.name}</span> <input type="checkbox" ${ch.done?'checked':''} onchange="toggleChapter(${idx})">`;
        list.appendChild(d);
    });
}
window.toggleChapter = (idx) => { STATE.chapters[idx].done = !STATE.chapters[idx].done; saveData(); renderChapters(); };
onAuthStateChanged(auth, u => { el("login-btn").classList.toggle("hidden", !!u); el("logout-btn").classList.toggle("hidden", !u); if(u) loadChatHistory(u); });
