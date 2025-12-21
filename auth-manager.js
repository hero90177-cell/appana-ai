// auth-manager.js
import { auth, db } from './firebase-init.js';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, orderBy, limit, getDocs, doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { appendMsg } from './chat-engine.js';

const el = id => document.getElementById(id);

/* ---------------------- AUTH SETUP ---------------------- */
export function setupAuthListener() {
    el("login-btn").onclick = () => signInWithPopup(auth, new GoogleAuthProvider());
    el("logout-btn").onclick = () => signOut(auth);

    onAuthStateChanged(auth, user => {
        if (user) {
            el("login-btn").classList.add("hidden");
            el("logout-btn").classList.remove("hidden");
            el("user-rank").innerText = "Pro User";
            loadHistory(user);
        } else {
            el("login-btn").classList.remove("hidden");
            el("logout-btn").classList.add("hidden");

            if (el("chat-box")?.children.length === 0) {
                el("chat-box").innerHTML = `
                  <div class="message ai-message">
                    <strong>🦅 Appana AI:</strong>
                    <p>Login to save your progress.</p>
                  </div>`;
            }
        }
    });
}

/* ---------------------- LOAD CHAT HISTORY ---------------------- */
async function loadHistory(user) {
    const chatBox = el("chat-box");
    if (!chatBox) return;
    chatBox.innerHTML = "";

    const q = query(collection(db, "users", user.uid, "chats"), orderBy("ts", "asc"), limit(50));
    const snap = await getDocs(q);

    if (snap.empty) return;

    snap.forEach(d => {
        const m = d.data();
        appendMsg(
            m.sender === "ai" ? "🦅 Appana AI" : "You",
            m.msg,
            m.sender === "ai" ? "ai-message" : "user-message",
            d.id,
            false
        );
    });
}

/* ---------------------- SYSTEM HEALTH ---------------------- */
export function checkSystemHealth() {
    const net = el("net-status");
    const api = el("api-status");

    const updateNet = () => {
        net.classList.remove("offline");
        net.classList.add(navigator.onLine ? "active" : "offline");
    };

    window.addEventListener("online", updateNet);
    window.addEventListener("offline", updateNet);
    updateNet();

    fetch("/api/ai-chat", { method: "POST", body: JSON.stringify({ type: "ping" }) })
        .then(r => r.json())
        .then(d => {
            api.classList.remove("offline");
            api.classList.add(d.status === "ok" ? "active" : "offline");
        })
        .catch(() => {
            api.classList.remove("active");
            api.classList.add("offline");
        });
}

/* ---------------------- DELETE CLOUD MESSAGES ---------------------- */
export async function deleteMessagesFromCloud(ids) {
    if (!auth.currentUser || !ids.length) return;
    const batch = writeBatch(db);
    ids.forEach(id =>
        batch.delete(doc(db, "users", auth.currentUser.uid, "chats", id))
    );
    await batch.commit();
}