import { auth, db } from "./firebase-init.js";
import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let STATE = { xp: 0, streak: 1, timerId: null, recognition: null };
const el = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  loadState();
  checkConnection();
  setupVoiceInput();

  // --- Network Listeners ---
  window.addEventListener("online", () => updateStatus("net-status", true));
  window.addEventListener("offline", () => updateStatus("net-status", false));

  // --- Chat Controls ---
  el("send-btn").onclick = () => handleSend();
  el("user-input").onkeypress = e => e.key === "Enter" && handleSend();
  
  // --- Auth Controls ---
  el("login-btn").onclick = () => signInWithPopup(auth, new GoogleAuthProvider());
  el("logout-btn").onclick = () => signOut(auth);

  // --- Zen Mode (FIXED) ---
  el("zen-mode-btn").onclick = () => {
    el("app").classList.toggle("zen-active");
  };

  // --- Timer Controls (FIXED) ---
  el("start-timer-btn").onclick = startTimer;

  // --- Generator Buttons (FIXED) ---
  el("gen-notes-btn").onclick = () => runGenerator('notes');
  el("gen-mcq-btn").onclick = () => runGenerator('mcq');
  el("gen-imp-btn").onclick = () => runGenerator('imp');

  // --- PDF Download (FIXED) ---
  el("pdf-btn").onclick = downloadPDF;

  // --- File Upload UI ---
  el("file-upload").onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      el("file-preview").classList.remove("hidden");
      el("file-name").innerText = file.name;
    }
  };
  el("remove-file").onclick = () => {
    el("file-upload").value = "";
    el("file-preview").classList.add("hidden");
  };
  
  // --- Reset ---
  el("clear-db-btn").onclick = () => {
      if(confirm("Clear chat history?")) {
          el("chat-box").innerHTML = "";
          appendMsg("🦅 Appana AI", "Chat cleared.", "ai-message");
      }
  }
});

/* ---------------- CORE CHAT LOGIC ---------------- */

function handleSend(manualText = null) {
  const inputEl = el("user-input");
  const t = manualText || inputEl.value.trim();
  
  if (!t) return;

  // 1. Show User Message
  appendMsg("You", t, "user-message");
  
  // 2. Clear Input
  if (!manualText) inputEl.value = "";
  
  // 3. Add XP
  addXP(10);
  
  // 4. Trigger AI
  triggerAI(t);
}

function triggerAI(msg) {
  appendMsg("🦅 Appana AI", "Thinking...", "ai-message", "temp");

  const fileInput = el("file-upload");
  const hasFile = fileInput.files.length > 0 ? `[User attached file: ${fileInput.files[0].name}] ` : "";

  fetch("/api/ai-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: hasFile + msg,
      subject: el("subject-selector").value,
      language: el("language-selector").value,
      uid: auth.currentUser?.uid || "guest"
    })
  })
    .then(r => r.json())
    .then(d => {
      document.getElementById("temp")?.remove();
      updateStatus("api-status", !!d.reply);
      
      const replyText = d.reply || d.error || "No response.";
      appendMsg("🦅 Appana AI", replyText, "ai-message");
      
      // Auto-Speak if enabled
      if (el("tts-toggle").checked && d.reply) {
        speak(d.reply);
      }

      saveToCloud(msg, d.reply);
    })
    .catch(() => {
      document.getElementById("temp")?.remove();
      updateStatus("api-status", false);
      appendMsg("🦅 Appana AI", "Offline or server error.", "ai-message");
    });
}

/* ---------------- FEATURE: GENERATORS ---------------- */
function runGenerator(type) {
    const topic = el("topic-input").value || el("subject-selector").value;
    const prompts = {
        notes: `Generate concise revision notes (bullet points) for: ${topic}`,
        mcq: `Create 5 challenging multiple choice questions for: ${topic} with answers at the end.`,
        imp: `List the most important exam questions for: ${topic}`
    };
    handleSend(prompts[type]);
}

/* ---------------- FEATURE: TIMER ---------------- */
function startTimer() {
    const min = parseInt(el("timer-input").value) || 25;
    let seconds = min * 60;
    
    if (STATE.timerId) clearInterval(STATE.timerId);
    
    STATE.timerId = setInterval(() => {
        seconds--;
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        el("timer-display").innerText = `${m}:${s}`;
        
        if (seconds <= 0) {
            clearInterval(STATE.timerId);
            el("timer-display").innerText = "00:00";
            alert("Time's up! Take a break.");
        }
    }, 1000);
}

/* ---------------- FEATURE: PDF DOWNLOAD ---------------- */
function downloadPDF() {
    if (!window.jspdf) {
        alert("PDF Library loading... wait a moment.");
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text("Appana AI Notes", 10, 10);
    doc.setFontSize(10);
    
    let y = 20;
    document.querySelectorAll(".message").forEach(msg => {
        const txt = msg.innerText;
        const splitText = doc.splitTextToSize(txt, 180);
        
        if (y + (splitText.length * 5) > 280) {
            doc.addPage();
            y = 10;
        }
        
        doc.text(splitText, 10, y);
        y += (splitText.length * 5) + 5;
    });
    
    doc.save("Appana-Notes.pdf");
}

/* ---------------- FEATURE: VOICE INPUT ---------------- */
function setupVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        STATE.recognition = new SpeechRecognition();
        STATE.recognition.lang = "en-IN";
        
        STATE.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            el("user-input").value = transcript;
            handleSend();
        };
        
        el("voice-btn").onclick = () => {
            el("voice-btn").style.color = "red";
            STATE.recognition.start();
        };
        
        STATE.recognition.onend = () => {
            el("voice-btn").style.color = "";
        };
    } else {
        el("voice-btn").style.display = "none";
    }
}

function speak(text) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-IN";
    u.rate = 1.1;
    window.speechSynthesis.speak(u);
}

/* ---------------- UTILS & STATE ---------------- */
function appendMsg(who, txt, cls, id) {
  const d = document.createElement("div");
  d.className = `message ${cls}`;
  if (id) d.id = id;
  
  // Format bold text
  const formatted = txt.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  d.innerHTML = `<strong>${who}:</strong> ${formatted}`;
  
  el("chat-box").appendChild(d);
  el("chat-box").scrollTop = el("chat-box").scrollHeight;
  
  // Trigger MathJax
  if (window.MathJax) {
      window.MathJax.typesetPromise([d]).catch(() => {});
  }
}

function updateStatus(id, ok) {
  const d = el(id);
  if (d) d.className = `status-dot ${ok ? "green" : "white"}`;
}

async function checkConnection() {
  updateStatus("net-status", navigator.onLine);
  try {
    const r = await fetch("/api/ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "ping" })
    });
    const d = await r.json();
    updateStatus("api-status", d.status === "ok");
  } catch {
    updateStatus("api-status", false);
  }
}

function addXP(n) {
  STATE.xp += n;
  localStorage.setItem("appana", JSON.stringify(STATE));
  if(STATE.xp > 200) el("user-rank").innerText = "Scholar";
  if(STATE.xp > 1000) el("user-rank").innerText = "Master";
}

function loadState() {
  const s = localStorage.getItem("appana");
  if (s) STATE = { ...STATE, ...JSON.parse(s) };
}

function saveToCloud(u, a) {
  if (!auth.currentUser || !a) return;
  setDoc(
    doc(collection(db, "users", auth.currentUser.uid, "chats")),
    { u, a, ts: serverTimestamp() }
  ).catch(() => {});
}

onAuthStateChanged(auth, u => {
  el("login-btn").classList.toggle("hidden", !!u);
  el("logout-btn").classList.toggle("hidden", !u);
  if(u) appendMsg("System", `Welcome, ${u.displayName}`, "ai-message");
});
