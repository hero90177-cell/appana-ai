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

  // Listeners
  window.addEventListener("online", () => updateStatus("net-status", true));
  window.addEventListener("offline", () => updateStatus("net-status", false));

  el("send-btn").onclick = () => handleSend();
  el("user-input").onkeypress = e => e.key === "Enter" && handleSend();
  
  el("login-btn").onclick = () => signInWithPopup(auth, new GoogleAuthProvider());
  el("logout-btn").onclick = () => signOut(auth);

  el("zen-mode-btn").onclick = () => el("app").classList.toggle("zen-active");

  // Generators & Actions
  el("gen-notes-btn").onclick = () => runGenerator('notes');
  el("gen-mcq-btn").onclick = () => runGenerator('mcq');
  el("gen-imp-btn").onclick = () => runGenerator('imp');
  el("pdf-btn").onclick = downloadPDF;
  
  // Timer Stop
  if(el("stop-timer-btn")) el("stop-timer-btn").onclick = stopTimer;

  // File Upload
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
  
  el("clear-db-btn").onclick = () => {
      if(confirm("Clear chat history?")) {
          el("chat-box").innerHTML = "";
          appendMsg("🦅 Appana AI", "Chat cleared.", "ai-message");
      }
  }
});

/* ---------------- CORE CHAT LOGIC ---------------- */

async function handleSend(manualText = null) {
  const inputEl = el("user-input");
  const t = manualText || inputEl.value.trim();
  const fileInput = el("file-upload");
  const file = fileInput.files[0];
  
  if (!t && !file) return;

  // 1. Show User Message
  appendMsg("You", t + (file ? ` [Attached: ${file.name}]` : ""), "user-message");
  
  if (!manualText) inputEl.value = "";
  
  // 2. Convert Image to Base64 (FIX for Uploads)
  let imageData = null;
  if (file && file.type.startsWith("image/")) {
      try {
          imageData = await readFileAsBase64(file);
      } catch(e) { console.error("File error", e); }
  }

  // Clear file input
  el("file-upload").value = "";
  el("file-preview").classList.add("hidden");

  // 3. MAGIC TIMER COMMANDS (FIX for Timer)
  const lowerMsg = t.toLowerCase();
  if (lowerMsg.includes("start timer") || lowerMsg.includes("set timer")) {
    const minutes = lowerMsg.match(/\d+/) ? parseInt(lowerMsg.match(/\d+/)[0]) : 25;
    startTimer(minutes);
    appendMsg("🦅 Appana AI", `Timer started for ${minutes} mins!`, "ai-message");
    saveToCloud(t, `Started timer for ${minutes} mins`);
    return;
  }
  if (lowerMsg.includes("stop timer")) {
    stopTimer();
    appendMsg("🦅 Appana AI", "Timer stopped.", "ai-message");
    return;
  }
  
  // 4. Trigger AI
  triggerAI(t, imageData);
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1]; // Remove data url prefix
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function triggerAI(msg, imageData) {
  appendMsg("🦅 Appana AI", "Thinking...", "ai-message", "temp");

  fetch("/api/ai-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: msg,
      image: imageData, // Send image data
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
      
      if (el("tts-toggle").checked && d.reply) speak(d.reply);
      saveToCloud(msg, d.reply);
    })
    .catch(() => {
      document.getElementById("temp")?.remove();
      updateStatus("api-status", false);
      appendMsg("🦅 Appana AI", "Offline. Check API Key or Connection.", "ai-message");
    });
}

/* ---------------- FEATURES ---------------- */

function runGenerator(type) {
    const topic = el("topic-input").value || el("subject-selector").value;
    const prompts = {
        notes: `Generate concise revision notes (bullet points) for: ${topic}`,
        mcq: `Create 5 challenging multiple choice questions for: ${topic} with answers at the end.`,
        imp: `List the most important exam questions for: ${topic}`
    };
    handleSend(prompts[type]);
}

function startTimer(min = 25) {
    clearInterval(STATE.timerId);
    el("mini-timer").classList.remove("hidden");
    el("mini-timer").style.display = "flex";

    let seconds = min * 60;
    
    STATE.timerId = setInterval(() => {
        seconds--;
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        el("timer-display").innerText = `${m}:${s}`;
        
        if (seconds <= 0) {
            stopTimer();
            alert("Time's up! Take a break.");
            speak("Time is up.");
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(STATE.timerId);
    el("mini-timer").classList.add("hidden");
    el("mini-timer").style.display = "none";
}

function downloadPDF() {
    if (!window.jspdf) { alert("PDF Library loading..."); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Appana AI Notes", 10, 10);
    let y = 20;
    document.querySelectorAll(".message").forEach(msg => {
        const txt = msg.innerText;
        const splitText = doc.splitTextToSize(txt, 180);
        if (y + (splitText.length * 5) > 280) { doc.addPage(); y = 10; }
        doc.text(splitText, 10, y);
        y += (splitText.length * 5) + 5;
    });
    doc.save("Appana-Notes.pdf");
}

function setupVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        STATE.recognition = new SpeechRecognition();
        STATE.recognition.lang = "en-IN";
        STATE.recognition.onresult = (event) => {
            el("user-input").value = event.results[0][0].transcript;
            handleSend();
        };
        el("voice-btn").onclick = () => STATE.recognition.start();
    } else {
        el("voice-btn").style.display = "none";
    }
}

function speak(text) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-IN";
    window.speechSynthesis.speak(u);
}

/* ---------------- UTILS ---------------- */
function appendMsg(who, txt, cls, id) {
  const d = document.createElement("div");
  d.className = `message ${cls}`;
  if (id) d.id = id;
  const formatted = txt.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  d.innerHTML = `<strong>${who}:</strong> ${formatted}`;
  el("chat-box").appendChild(d);
  el("chat-box").scrollTop = el("chat-box").scrollHeight;
  if (window.MathJax) window.MathJax.typesetPromise([d]).catch(() => {});
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

function loadState() {
  const s = localStorage.getItem("appana");
  if (s) STATE = { ...STATE, ...JSON.parse(s) };
}

function saveToCloud(u, a) {
  if (!auth.currentUser || !a) return;
  setDoc(doc(collection(db, "users", auth.currentUser.uid, "chats")), { u, a, ts: serverTimestamp() }).catch(() => {});
}

onAuthStateChanged(auth, u => {
  el("login-btn").classList.toggle("hidden", !!u);
  el("logout-btn").classList.toggle("hidden", !u);
});
