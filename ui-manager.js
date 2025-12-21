// ui-manager.js

// ✅ FIX: Added chatHistory to STATE for persistence
export const STATE = { 
  xp: 0, 
  customSubjects: [], 
  chapters: [],
  selectMode: false, 
  selectedIds: new Set(),
  chatHistory: [] // New: Stores messages locally
};

const el = id => document.getElementById(id);

// --- 🔴 MAGIC TIMER & STOPWATCH (RED) ---
let timerInterval = null;
let timerSeconds = 0;
let timerMode = 'stopwatch'; // 'stopwatch' (up) or 'timer' (down)

export const timer = {
    // START STOPWATCH (Count UP)
    startStopwatch: () => {
        timer.stop();
        timerMode = 'stopwatch';
        timerSeconds = 0;
        timer.run();
    },

    // START TIMER (Count DOWN)
    startTimer: (durationSeconds) => {
        timer.stop();
        timerMode = 'timer';
        timerSeconds = durationSeconds;
        timer.run();
    },

    run: () => {
        el("magic-timer").classList.remove("hidden");
        el("timer-icon").innerText = timerMode === 'timer' ? '⏳' : '⏱'; 
        
        timerInterval = setInterval(() => {
            if (timerMode === 'stopwatch') {
                timerSeconds++;
            } else {
                timerSeconds--;
                if (timerSeconds <= 0) {
                    timer.stop();
                    alert("⏰ Time is up!");
                    return;
                }
            }
            timer.updateDisplay();
        }, 1000);
        timer.updateDisplay();
    },

    pause: () => {
        clearInterval(timerInterval);
    },

    stop: () => {
        clearInterval(timerInterval);
        el("magic-timer").classList.add("hidden");
        timerSeconds = 0;
        timer.updateDisplay();
    },

    reset: () => {
        timerSeconds = 0; 
        timer.updateDisplay();
    },

    updateDisplay: () => {
        const h = Math.floor(timerSeconds / 3600);
        const m = Math.floor((timerSeconds % 3600) / 60).toString().padStart(2, '0');
        const s = (timerSeconds % 60).toString().padStart(2, '0');
        el("timer-val").innerText = h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
    }
};

export function setupUI() {
    // --- MOBILE NAVIGATION LOGIC ---
    const navBtns = document.querySelectorAll('.nav-btn');
    const sections = ['section-menu', 'section-chat', 'section-tools'];

    navBtns.forEach(btn => {
        btn.onclick = () => {
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const targetId = btn.getAttribute('data-target');
            sections.forEach(secId => {
                const section = document.getElementById(secId);
                if (secId === targetId) section.classList.add('active-panel');
                else section.classList.remove('active-panel');
            });
        };
    });

    // --- MOTIVATION ---
    const quotes = ["Dream Big.", "Work Hard.", "Stay Focused.", "No Excuses.", "You Got This.", "Believe.", "Hustle."];
    const q = quotes[Math.floor(Math.random() * quotes.length)];
    if(el('sidebar-motivation-text')) el('sidebar-motivation-text').innerText = q;
    if(el('sticky-motivation')) el('sticky-motivation').innerText = `💡 "${q}"`;

    // --- MODAL & TOOLS ---
    el("add-subject-btn").onclick = () => el("custom-subject-modal").classList.remove("hidden");
    el("close-modal-btn").onclick = () => el("custom-subject-modal").classList.add("hidden");
    el("save-subject-btn").onclick = saveCustomSubject;
    el("mark-chapter-btn").onclick = addChapter;
    el("clear-db-btn").onclick = () => { if(confirm("Reset all?")) { localStorage.clear(); location.reload(); } };
    
    // --- SELECT MODE ---
    el("select-mode-btn").onclick = toggleSelectMode;
    el("cancel-select-btn").onclick = toggleSelectMode;
}

export function toggleSelectMode() {
    STATE.selectMode = !STATE.selectMode;
    STATE.selectedIds.clear(); // Reset selection on toggle
    const box = el("chat-box");
    const toolbar = el("selection-toolbar");

    if (STATE.selectMode) {
        box.classList.add("select-mode-active");
        toolbar.classList.remove("hidden");
    } else {
        box.classList.remove("select-mode-active");
        toolbar.classList.add("hidden");
        document.querySelectorAll(".message.selected").forEach(m => m.classList.remove("selected"));
    }
    
    el("selection-count").innerText = "0 Selected";
}

// --- DATA HANDLING ---
export function loadLocalData() {
    // Reads from Phone/Local Storage
    const s = JSON.parse(localStorage.getItem("appana_v3"));
    if(s) { 
        // Merge saved state into current STATE
        Object.assign(STATE, s);
        
        if(el("user-xp")) el("user-xp").innerText = STATE.xp;
        renderCustomSubjects();
        renderChapters();
    }
}

export function saveData() {
    // Writes to Phone/Local Storage
    // NOTE: This now saves chatHistory as well
    localStorage.setItem("appana_v3", JSON.stringify(STATE));
}

// --- CUSTOM SUBJECTS ---
function saveCustomSubject() {
    const name = el("custom-sub-name").value;
    const content = el("custom-sub-text").value;
    
    if(!name) return alert("Please enter a subject name.");
    
    STATE.customSubjects.push({ 
        id: Date.now(), 
        name, 
        content: content || "No description." 
    });
    
    saveData(); 
    renderCustomSubjects();
    
    el("custom-sub-name").value = "";
    el("custom-sub-text").value = "";
    el("custom-subject-modal").classList.add("hidden");
    
    alert(`Subject "${name}" saved to storage!`);
}

function renderCustomSubjects() {
    const group = el("custom-subjects-group");
    if(!group) return;
    group.innerHTML = "";
    STATE.customSubjects.forEach(s => {
        const o = document.createElement("option");
        o.value = "custom_" + s.id; 
        o.innerText = "★ " + s.name;
        group.appendChild(o);
    });
}

function addChapter() {
    const val = el("chapter-name").value;
    if(val) { STATE.chapters.push({name:val, done:false}); el("chapter-name").value=""; saveData(); renderChapters(); }
}

function renderChapters() {
    const list = el("chapter-list");
    if(!list) return;
    list.innerHTML = "";
    STATE.chapters.forEach((c, i) => {
        const d = document.createElement("div");
        d.innerHTML = `<span style="color:${c.done?'#10b981':'#fff'}; text-decoration:${c.done?'line-through':'none'}">${c.name}</span> <button onclick="window.delChap(${i})" style="width:auto;padding:2px;color:red;">x</button>`;
        d.onclick = (e) => { if(e.target.tagName !== 'BUTTON') { STATE.chapters[i].done = !STATE.chapters[i].done; saveData(); renderChapters(); }};
        list.appendChild(d);
    });
}
window.delChap = (i) => { STATE.chapters.splice(i,1); saveData(); renderChapters(); };
