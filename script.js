import { auth, db } from "./firebase-init.js";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, doc, setDoc, query, orderBy, limit, getDocs, serverTimestamp, writeBatch, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// === STATE ===
let STATE = { 
  xp: 0, streak: 0, timerId: null, recognition: null, 
  chapters: [], customSubjects: [], selectMode: false, selectedIds: new Set()
};

const API_URL = "/api/ai-chat";
const el = id => document.getElementById(id);

// === MAIN QUOTES (Header) ===
const QUOTES = [
  "Dream big, work hard.", "Consistency is key.", "Your future is created by what you do today.",
  "Don't stop until you're proud.", "Focus on the goal.", "Pain is temporary, GPA is forever.",
  "Study now, shine later.", "Believe you can.", "Action is the foundational key to all success.",
  "It always seems impossible until it's done.", "Success is the sum of small efforts repeated daily."
];

// === SIDEBAR MOTIVATION (Short & Punchy) ===
const SIDEBAR_QUOTES = [
    "Stay Hungry.", "Keep Grinding.", "Focus 100%.", "You got this.", "No Excuses.", 
    "Level Up.", "Be the Best.", "Prove them wrong.", "Make it happen.", "Do it now.",
    "Hustle Hard.", "Stay Humble.", "Dream Big.", "Just Start.", "Don't Quit.",
    "Rise Up.", "Shine Bright.", "Work Works.", "Stay Hard.", "Create Future.",
    "Believe.", "Execute.", "Conquer.", "Win Today.", "Study Smart."
];

document.addEventListener("DOMContentLoaded", () => {
  loadLocalData();
  loadDailyQuote();
  refreshSidebarMotivation(); // Initial Load
  renderCustomSubjects();
  renderChapters();
  checkSystemHealth();
  checkAIConnection(); // NEW: Check AI status specifically
  setupVoiceInput();
  
  // UI Bindings
  el("send-btn").onclick = () => handleSend();
  el("login-btn").onclick = () => signInWithPopup(auth, new GoogleAuthProvider());
  el("logout-btn").onclick = () => signOut(auth);
  
  // Custom Subject Logic
  el("add-subject-btn").onclick = () => el("custom-subject-modal").classList.remove("hidden");
  el("close-modal-btn").onclick = () => el("custom-subject-modal").classList.add("hidden");
  el("custom-sub-file").onchange = handleCustomSubjectOCR;
  el("save-subject-btn").onclick = saveCustomSubject;

  // Select Mode & Delete Logic
  el("select-mode-btn").onclick = toggleSelectMode;
  el("cancel-select-btn").onclick = toggleSelectMode;
  el("confirm-delete-btn").onclick = handleDeleteAction;

  // File Upload
  el("file-upload").onchange = async (e) => {
      const file = e.target.files[0];
      if(!file) return;
      el("file-preview").classList.remove("hidden");
      el("file-name").innerText = file.name;
      el("ocr-status").innerText = "Reading...";
      const text = await processFile(file);
      if(text) {
          el("user-input").value = text;
          el("user-input").dispatchEvent(new Event('input')); 
          el("ocr-status").innerText = "Ready to edit & send.";
      }
  };
  
  el("remove-file").onclick = () => { el("file-upload").value = ""; el("file-preview").classList.add("hidden"); el("user-input").value=""; };

  // Tools
  el("gen-notes-btn").onclick = () => triggerGenerator("Detailed Notes");
  el("gen-mcq-btn").onclick = () => triggerGenerator("Multiple Choice Quiz");
  el("gen-imp-btn").onclick = () => triggerGenerator("Important Questions");
  el("gen-passage-btn").onclick = () => triggerGenerator("Reading Comprehension Passage");
  el("pdf-btn").onclick = downloadPDF;
  el("mark-chapter-btn").onclick = addChapter;
  el("clear-db-btn").onclick = () => { 
      if(confirm("Reset all data?")) { localStorage.clear(); location.reload(); } 
  };

  // Mobile Navigation
  document.querySelectorAll(".nav-btn").forEach(btn => {
      btn.onclick = () => {
          document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          const target = btn.getAttribute("data-target");
          el("section-menu").classList.add("mobile-hidden");
          el("section-chat").classList.add("mobile-hidden");
          el("section-tools").classList.add("mobile-hidden");
          if(target === "menu") el("section-menu").classList.remove("mobile-hidden");
          if(target === "chat") el("section-chat").classList.remove("mobile-hidden");
          if(target === "tools") el("section-tools").classList.remove("mobile-hidden");
      };
  });
  
  // === NEW: AUTO REFRESH MOTIVATION ON RETURN ===
  document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === 'visible') {
          refreshSidebarMotivation();
      }
  });
});

/* ================= MOTIVATION LOGIC ================= */
function refreshSidebarMotivation() {
    // Pick random index
    const idx = Math.floor(Math.random() * SIDEBAR_QUOTES.length);
    const txt = SIDEBAR_QUOTES[idx];
    
    // Animate fade
    const box = el("sidebar-motivation-text");
    box.style.opacity = 0;
    setTimeout(() => {
        box.innerText = `"${txt}"`;
        box.style.opacity = 1;
        box.style.transition = "opacity 0.5s ease";
    }, 200);
}

/* ================= SYSTEM HEALTH (DOTS) ================= */
function checkSystemHealth() {
    const netDot = el("net-status");
    
    // Initial check
    if(navigator.onLine) netDot.classList.add("active");
    else netDot.classList.remove("active");

    // Listeners
    window.addEventListener('online', () => netDot.classList.add("active")); // Green
    window.addEventListener('offline', () => netDot.classList.remove("active")); // White
}

async function checkAIConnection() {
    const aiDot = el("api-status");
    try {
        // Simple ping to backend
        const res = await fetch(API_URL, { 
            method: "POST", 
            body: JSON.stringify({ type: "ping" }),
            headers: { "Content-Type": "application/json" }
        });
        const d = await res.json();
        if(d.status === "ok") {
            aiDot.classList.add("active"); // Green if connected
        } else {
            aiDot.classList.remove("active"); // White if fail
        }
    } catch(e) {
        aiDot.classList.remove("active"); // White if error
    }
}

/* ================= CUSTOM SUBJECTS ================= */
async function handleCustomSubjectOCR(e) {
    const file = e.target.files[0];
    if(!file) return;
    el("custom-sub-status").innerText = "Extracting text... please wait.";
    const text = await processFile(file);
    if(text) {
        el("custom-sub-text").value = text;
        el("custom-sub-status").innerText = "Done! Review text below.";
    } else {
        el("custom-sub-status").innerText = "Failed to read file.";
    }
}

function saveCustomSubject() {
    const name = el("custom-sub-name").value.trim();
    const content = el("custom-sub-text").value.trim();
    
    if(!name || !content) return alert("Please fill name and content.");
    
    STATE.customSubjects.push({ id: Date.now(), name, content });
    saveData();
    renderCustomSubjects();
    el("custom-subject-modal").classList.add("hidden");
    el("custom-sub-name").value = ""; el("custom-sub-text").value = ""; el("custom-sub-file").value = "";
    alert("Subject Added!");
}

function renderCustomSubjects() {
    const group = el("custom-subjects-group");
    group.innerHTML = "";
    STATE.customSubjects.forEach(sub => {
        const opt = document.createElement("option");
        opt.value = "custom_" + sub.id;
        opt.innerText = "★ " + sub.name;
        group.appendChild(opt);
    });
}

function getCustomSubjectContext() {
    const val = el("subject-selector").value;
    if(val.startsWith("custom_")) {
        const id = parseInt(val.split("_")[1]);
        const sub = STATE.customSubjects.find(s => s.id === id);
        return sub ? `\n[CONTEXT FROM USER NOTES (${sub.name})]:\n${sub.content}\n` : "";
    }
    return "";
}

/* ================= DAILY QUOTE ================= */
function loadDailyQuote() {
    const today = new Date().toDateString();
    const stored = JSON.parse(localStorage.getItem("appana_quote"));
    
    let quote = "";
    if (stored && stored.date === today) {
        quote = stored.text;
    } else {
        const hash = today.split("").reduce((a,b)=>a+b.charCodeAt(0),0);
        quote = QUOTES[hash % QUOTES.length];
        localStorage.setItem("appana_quote", JSON.stringify({ date: today, text: quote }));
    }
    el("sticky-motivation").innerText = `💡 "${quote}"`;
}

/* ================= SELECT & DELETE (CRITICAL) ================= */
function toggleSelectMode() {
    STATE.selectMode = !STATE.selectMode;
    STATE.selectedIds.clear();
    
    const box = el("chat-box");
    const toolbar = el("selection-toolbar");
    
    if(STATE.selectMode) {
        box.classList.add("select-mode-active");
        toolbar.classList.remove("hidden");
    } else {
        box.classList.remove("select-mode-active");
        toolbar.classList.add("hidden");
        // Clear UI selection
        document.querySelectorAll(".message.selected").forEach(m => m.classList.remove("selected"));
        document.querySelectorAll(".msg-check").forEach(c => c.checked = false);
    }
}

function attachSelectLogic(msgEl) {
    // Add checkbox if not present
    if(!msgEl.querySelector(".msg-check")) {
        const chk = document.createElement("input");
        chk.type = "checkbox"; chk.className = "msg-check";
        msgEl.prepend(chk);
    }
    
    // Override click for selection
    msgEl.onclick = (e) => {
        if(!STATE.selectMode) return;
        
        const chk = msgEl.querySelector(".msg-check");
        const isSelected = !msgEl.classList.contains("selected");
        
        if(isSelected) {
            msgEl.classList.add("selected");
            chk.checked = true;
            STATE.selectedIds.add(msgEl.id);
        } else {
            msgEl.classList.remove("selected");
            chk.checked = false;
            STATE.selectedIds.delete(msgEl.id);
        }
        el("selection-count").innerText = `${STATE.selectedIds.size} selected`;
    };
}

async function handleDeleteAction() {
    if(STATE.selectedIds.size === 0) return;
    if(!confirm("Delete selected messages permanently?")) return;
    
    const ids = Array.from(STATE.selectedIds);
    
    // 1. Remove from Screen immediately
    ids.forEach(id => {
        const div = document.getElementById(id);
        if(div) div.remove();
    });

    // 2. Remove from Firebase Storage (if logged in)
    if(auth.currentUser) {
        const batch = writeBatch(db);
        ids.forEach(id => {
            // Uses the ID assigned during creation, which matches the Doc ID
            const ref = doc(db, "users", auth.currentUser.uid, "chats", id);
            batch.delete(ref);
        });
        await batch.commit();
    }
    
    toggleSelectMode(); // Exit mode
}

/* ================= CHAT LOGIC ================= */
async function handleSend() {
    const txt = el("user-input").value.trim();
    if(!txt) return;
    
    // IMPORTANT: ID must match what we use for Firebase Doc ID later
    const msgId = "msg_" + Date.now();
    appendMsg("You", txt, "user-message", msgId);
    
    el("user-input").value = "";
    el("file-upload").value = "";
    el("file-preview").classList.add("hidden");

    if(txt.toLowerCase().includes("start timer")) {
        startTimer(25); appendMsg("AI", "Timer Started.", "ai-message"); return;
    }

    const aiId = "ai_" + Date.now();
    appendMsg("Appana AI", " Thinking...", "ai-message", aiId);

    const customContext = getCustomSubjectContext();
    const finalPrompt = customContext ? (customContext + "\nQuestion: " + txt) : txt;

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: finalPrompt,
                uid: auth.currentUser ? auth.currentUser.uid : "guest",
                subject: el("subject-selector").value,
                examMode: el("exam-mode-selector").value,
                language: el("language-selector") ? el("language-selector").value : "English"
            })
        });
        const data = await res.json();
        const reply = data.reply || "Error.";
        
        document.getElementById(aiId).innerHTML = `<strong>🦅 Appana AI:</strong> ${marked.parse(reply)}`;
        
        if(el("tts-toggle").checked && window.speechSynthesis) {
             const u = new SpeechSynthesisUtterance(reply.replace(/[*#]/g, ''));
             window.speechSynthesis.speak(u);
        }

        if(auth.currentUser) {
            saveToCloud(txt, reply, msgId, aiId);
        }
        
        STATE.xp += 10;
        el("user-xp").innerText = STATE.xp;
        saveData();

    } catch (e) {
        document.getElementById(aiId).innerText = "Error: Offline or Server Down.";
    }
}

function appendMsg(who, txt, cls, id) {
    const div = document.createElement("div");
    div.className = `message ${cls}`;
    if(id) div.id = id;
    div.innerHTML = `<strong>${who}</strong> ${marked.parse ? marked.parse(txt) : txt}`;
    el("chat-box").appendChild(div);
    el("chat-box").scrollTop = el("chat-box").scrollHeight;
    
    // VITAL: Attach select logic to every new message
    attachSelectLogic(div); 
}

/* ================= UTILS ================= */
async function processFile(file) {
    try {
        if(file.type.includes("image")) {
            const { data } = await Tesseract.recognize(file, 'eng');
            return data.text;
        } else if(file.type === "application/pdf") {
            const ab = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(ab).promise;
            let str = "";
            for(let i=1; i<=Math.min(pdf.numPages, 5); i++) {
                const page = await pdf.getPage(i);
                const tc = await page.getTextContent();
                str += tc.items.map(s => s.str).join(" ") + "\n";
            }
            return str;
        }
    } catch(e) { console.error(e); return null; }
}

function saveToCloud(u, a, uId, aId) {
    const r = doc(db, "users", auth.currentUser.uid, "chats", uId);
    setDoc(r, { msg: u, sender: "user", ts: serverTimestamp() });
    const r2 = doc(db, "users", auth.currentUser.uid, "chats", aId);
    setDoc(r2, { msg: a, sender: "ai", ts: serverTimestamp() });
}

function triggerGenerator(type) {
    const topic = el("topic-input").value.trim();
    if(!topic) return alert("Please enter a topic first!");
    el("user-input").value = `Generate ${type} for the topic: ${topic}.`;
    handleSend();
}

async function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let y = 10;
    
    doc.setFontSize(16); doc.text("Appana AI - Study Session", 10, y); y += 10;
    doc.setFontSize(10); doc.text(`Date: ${new Date().toLocaleString()}`, 10, y); y += 10;

    const msgs = document.querySelectorAll(".message");
    msgs.forEach(m => {
        const text = m.innerText.replace(/🦅|Appana AI:|You/g, "").trim();
        const sender = m.classList.contains("ai-message") ? "AI: " : "You: ";
        const splitText = doc.splitTextToSize(sender + text, 180);
        if(y + (splitText.length * 5) > 280) { doc.addPage(); y = 10; }
        doc.setFont(undefined, m.classList.contains("ai-message") ? "normal" : "bold");
        doc.text(splitText, 10, y);
        y += (splitText.length * 5) + 5;
    });
    doc.save("Appana-Notes.pdf");
}

function addChapter() {
    const name = el("chapter-name").value.trim();
    if(!name) return;
    STATE.chapters.push({ name, done: false });
    el("chapter-name").value = "";
    saveData();
    renderChapters();
}

function renderChapters() {
    const list = el("chapter-list");
    list.innerHTML = "";
    STATE.chapters.forEach((ch, i) => {
        const div = document.createElement("div");
        div.style.cssText = "display:flex; justify-content:space-between; padding:4px; border-bottom:1px solid #333;";
        div.innerHTML = `
            <span style="text-decoration:${ch.done ? 'line-through' : 'none'}; color:${ch.done ? '#00ff00' : 'inherit'}">${ch.name}</span>
            <button onclick="toggleChapter(${i})" style="width:auto; padding:2px 5px; font-size:10px;">${ch.done ? 'Undo' : 'Done'}</button>
            <button onclick="deleteChapter(${i})" style="width:auto; padding:2px 5px; font-size:10px; color:red;">x</button>
        `;
        list.appendChild(div);
    });
}
window.toggleChapter = (i) => { STATE.chapters[i].done = !STATE.chapters[i].done; saveData(); renderChapters(); };
window.deleteChapter = (i) => { STATE.chapters.splice(i, 1); saveData(); renderChapters(); };

function saveData() { localStorage.setItem("appana_v2", JSON.stringify(STATE)); }
function loadLocalData() { 
    const s = JSON.parse(localStorage.getItem("appana_v2")); 
    if(s) { STATE = {...STATE, ...s}; el("user-xp").innerText = STATE.xp; if(STATE.chapters) renderChapters(); }
}

function setupVoiceInput() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(SR) {
        const r = new SR();
        r.onresult = e => { el("user-input").value += " " + e.results[0][0].transcript; };
        el("voice-btn").onclick = () => r.start();
    } else { el("voice-btn").style.display = 'none'; }
}

let timerInterval;
function startTimer(min) {
    el("mini-timer").classList.remove("hidden");
    let sec = min * 60;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        el("timer-display").innerText = `${m}:${s < 10 ? '0'+s : s}`;
        sec--;
        if(sec < 0) { clearInterval(timerInterval); alert("Time's up!"); }
    }, 1000);
    el("stop-timer-btn").onclick = () => { clearInterval(timerInterval); el("mini-timer").classList.add("hidden"); };
}

onAuthStateChanged(auth, u => {
    el("login-btn").classList.toggle("hidden", !!u);
    el("logout-btn").classList.toggle("hidden", !u);
    if(u) loadHistory(u);
});

async function loadHistory(user) {
    const q = query(collection(db, "users", user.uid, "chats"), orderBy("ts", "asc"), limit(30));
    const snap = await getDocs(q);
    snap.forEach(d => appendMsg(d.data().sender==="ai"?"Appana AI":"You", d.data().msg, d.data().sender==="ai"?"ai-message":"user-message", d.id));
}
