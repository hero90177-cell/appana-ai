import { auth, db } from './firebase-init.js';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, orderBy, limit, getDocs, doc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { appendMsg } from './chat-engine.js';

const el = id => document.getElementById(id);

export function setupAuthListener() {
    el("login-btn").onclick = () => signInWithPopup(auth, new GoogleAuthProvider());
    el("logout-btn").onclick = () => signOut(auth);

    onAuthStateChanged(auth, (user) => {
        if (user) {
            el("login-btn").classList.add("hidden");
            el("logout-btn").classList.remove("hidden");
            el("user-rank").innerText = "Pro User";
            loadHistory(user);
        } else {
            el("login-btn").classList.remove("hidden");
            el("logout-btn").classList.add("hidden");
            // Only show default if chat is empty
            if(el("chat-box").children.length === 0) {
                 // ✅ Added ID 'welcome-msg-dynamic' to match new compact CSS
                 el("chat-box").innerHTML = `<div id="welcome-msg-dynamic" class="message ai-message"><strong>🦅 Appana AI:</strong><p>Hello! Login to save your study history.</p></div>`;
            }
        }
    });
}

async function loadHistory(user) {
    el("chat-box").innerHTML = ""; // 1. Clear existing static messages
    
    try {
        const q = query(collection(db, "users", user.uid, "chats"), orderBy("ts", "asc"), limit(50));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            // ✅ Added ID 'welcome-msg-dynamic' here too
            el("chat-box").innerHTML = `<div id="welcome-msg-dynamic" class="message ai-message"><strong>🦅 Appana AI:</strong><p>Welcome! No history found. Start a new topic.</p></div>`;
        } else {
            snap.forEach(doc => {
                const d = doc.data();
                const senderName = d.sender === 'ai' ? '🦅 Appana AI' : 'You';
                const styleClass = d.sender === 'ai' ? 'ai-message' : 'user-message';
                appendMsg(senderName, d.msg, styleClass, doc.id);
            });
        }
    } catch (e) {
        console.error("History Error", e);
    }
}

export function checkSystemHealth() {
    const netDot = el("net-status");
    const aiDot = el("api-status");

    // Net Check
    const updateNet = () => { netDot.classList.toggle("active", navigator.onLine); };
    window.addEventListener('online', updateNet);
    window.addEventListener('offline', updateNet);
    updateNet();

    // AI Check (Ping)
    fetch("/api/ai-chat", { method: "POST", body: JSON.stringify({ type: "ping" }) })
        .then(res => res.json())
        .then(d => aiDot.classList.toggle("active", d.status === "ok"))
        .catch(() => aiDot.classList.remove("active"));
}

export async function deleteMessagesFromCloud(ids) {
    if (!auth.currentUser) return;
    const batch = writeBatch(db);
    ids.forEach(id => {
        const ref = doc(db, "users", auth.currentUser.uid, "chats", id);
        batch.delete(ref);
    });
    await batch.commit();
}
