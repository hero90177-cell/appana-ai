// ui-manager.js - colour-enhanced

export const STATE = {
    xp: 0,
    customSubjects: [],
    chapters: [],
    selectMode: false,
    selectedIds: new Set(),
    chatHistory: []
};

const el = id => document.getElementById(id);

// ---------------- TIMER ----------------
let timerInterval = null;
let timerSeconds = 0;
let timerMode = 'stopwatch';

export const timer = {
    startStopwatch: () => {
        timer.stop();
        timerMode = 'stopwatch';
        timerSeconds = 0;
        timer.run();
    },
    startTimer: (durationSeconds) => {
        timer.stop();
        timerMode = 'timer';
        timerSeconds = durationSeconds;
        timer.run();
    },
    run: () => {
        const magicEl = el("magic-timer");
        if(!magicEl) return;
        magicEl.classList.remove("hidden");
        el("timer-icon").innerText = timerMode === 'timer' ? '⏳' : '⏱';
        el("timer-icon").style.color = "var(--accent-blue)";
        el("timer-val").style.color = "var(--text-main)";

        timerInterval = setInterval(() => {
            if (timerMode === 'stopwatch') timerSeconds++;
            else {
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
    pause: () => clearInterval(timerInterval),
    stop: () => {
        clearInterval(timerInterval);
        const magicEl = el("magic-timer");
        if(magicEl) magicEl.classList.add("hidden");
        timerSeconds = 0;
        timer.updateDisplay();
    },
    reset: () => { timerSeconds = 0; timer.updateDisplay(); },
    updateDisplay: () => {
        const h = Math.floor(timerSeconds / 3600);
        const m = Math.floor((timerSeconds % 3600) / 60).toString().padStart(2,'0');
        const s = (timerSeconds % 60).toString().padStart(2,'0');
        el("timer-val").innerText = h>0?`${h}:${m}:${s}`:`${m}:${s}`;
    }
};

// ---------------- UI ----------------
export function setupUI() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const sections = ['section-menu','section-chat','section-tools'];

    navBtns.forEach(btn => {
        btn.onclick = () => {
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const targetId = btn.getAttribute('data-target');
            sections.forEach(secId => {
                const section = el(secId);
                if(section) {
                    if(secId===targetId) section.classList.add('active-panel');
                    else section.classList.remove('active-panel');
                }
            });
        };
    });

    // Motivation
    const quotes = ["Dream Big.","Work Hard.","Stay Focused.","No Excuses.","You Got This.","Believe.","Hustle."];
    const q = quotes[Math.floor(Math.random()*quotes.length)];
    if(el('sidebar-motivation-text')) {
        el('sidebar-motivation-text').innerText = q;
        el('sidebar-motivation-text').style.color = "var(--text-main)";
    }
    if(el('sticky-motivation')) {
        el('sticky-motivation').innerText = `💡 "${q}"`;
        el('sticky-motivation').style.color = "var(--nano-blue)";
    }

    // Modal & Tools buttons
    ["add-subject-btn","close-modal-btn","save-subject-btn","mark-chapter-btn","clear-db-btn","select-mode-btn","cancel-select-btn"].forEach(id=>{
        const e=el(id);
        if(e) e.style.color = "var(--text-main)";
    });

    el("add-subject-btn")?.addEventListener("click", ()=>el("custom-subject-modal").classList.remove("hidden"));
    el("close-modal-btn")?.addEventListener("click", ()=>el("custom-subject-modal").classList.add("hidden"));
    el("save-subject-btn")?.addEventListener("click", saveCustomSubject);
    el("mark-chapter-btn")?.addEventListener("click", addChapter);
    el("clear-db-btn")?.addEventListener("click", ()=>{ if(confirm("Reset all?")) { localStorage.clear(); location.reload(); } });

    // Select mode
    el("select-mode-btn")?.addEventListener("click", toggleSelectMode);
    el("cancel-select-btn")?.addEventListener("click", toggleSelectMode);
}

// ---------------- SELECT MODE ----------------
export function toggleSelectMode() {
    STATE.selectMode = !STATE.selectMode;
    STATE.selectedIds.clear();
    const box = el("chat-box");
    const toolbar = el("selection-toolbar");

    if (STATE.selectMode) {
        box?.classList.add("select-mode-active");
        toolbar?.classList.remove("hidden");
    } else {
        box?.classList.remove("select-mode-active");
        toolbar?.classList.add("hidden");
        document.querySelectorAll(".message.selected").forEach(m=>m.classList.remove("selected"));
    }
    el("selection-count").innerText = "0 Selected";
}

// ---------------- DATA ----------------
export function loadLocalData() {
    const s = JSON.parse(localStorage.getItem("appana_v3"));
    if(s) Object.assign(STATE,s);

    if(el("user-xp")) {
        el("user-xp").innerText = STATE.xp;
        el("user-xp").style.color = "var(--accent-blue)";
    }
    renderCustomSubjects();
    renderChapters();
}

export function saveData() {
    localStorage.setItem("appana_v3", JSON.stringify(STATE));
}

// ---------------- CUSTOM SUBJECTS ----------------
function saveCustomSubject() {
    const name = el("custom-sub-name").value;
    const content = el("custom-sub-text").value;
    if(!name) return alert("Please enter a subject name.");

    STATE.customSubjects.push({id:Date.now(),name,content:content||"No description."});
    saveData();
    renderCustomSubjects();

    el("custom-sub-name").value="";
    el("custom-sub-text").value="";
    el("custom-subject-modal").classList.add("hidden");
    alert(`Subject "${name}" saved to storage!`);
}

function renderCustomSubjects() {
    const group = el("custom-subjects-group");
    if(!group) return;
    group.innerHTML = "";
    STATE.customSubjects.forEach(s=>{
        const o=document.createElement("option");
        o.value = "custom_" + s.id;
        o.innerText = "★ "+s.name;
        o.style.color = "var(--text-main)";
        group.appendChild(o);
    });
}

// ---------------- CHAPTERS ----------------
function addChapter() {
    const val = el("chapter-name").value;
    if(val) {
        STATE.chapters.push({name:val,done:false});
        el("chapter-name").value="";
        saveData();
        renderChapters();
    }
}

function renderChapters() {
    const list = el("chapter-list");
    if(!list) return;
    list.innerHTML="";
    STATE.chapters.forEach((c,i)=>{
        const d = document.createElement("div");
        d.innerHTML=`<span style="color:${c.done?'#10b981':'var(--text-main)'}; text-decoration:${c.done?'line-through':'none'}">${c.name}</span> <button onclick="window.delChap(${i})" style="width:auto;padding:2px;color:var(--accent-blue);">x</button>`;
        d.onclick = e=>{
            if(e.target.tagName!=='BUTTON') {
                STATE.chapters[i].done=!STATE.chapters[i].done;
                saveData();
                renderChapters();
            }
        };
        list.appendChild(d);
    });
}
window.delChap = i=>{STATE.chapters.splice(i,1);saveData();renderChapters();};