let STATE = { 
  xp: 0, 
  customSubjects: [], 
  chapters: [],
  selectMode: false, 
  selectedIds: new Set() 
};

const el = id => document.getElementById(id);

export function setupUI() {
    // --- MOBILE NAVIGATION LOGIC ---
    const navBtns = document.querySelectorAll('.nav-btn');
    const sections = ['section-menu', 'section-chat', 'section-tools'];

    navBtns.forEach(btn => {
        btn.onclick = () => {
            // 1. Highlight Button
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 2. Show Panel (Hide others completely using display:none via CSS class)
            const targetId = btn.getAttribute('data-target');
            sections.forEach(secId => {
                const section = document.getElementById(secId);
                if (secId === targetId) {
                    section.classList.add('active-panel');
                } else {
                    section.classList.remove('active-panel');
                }
            });
        };
    });

    // --- MOTIVATION ---
    const quotes = ["Dream Big.", "Work Hard.", "Stay Focused.", "No Excuses.", "You Got This.", "Believe.", "Hustle."];
    el('sidebar-motivation-text').innerText = quotes[Math.floor(Math.random() * quotes.length)];
    el('sticky-motivation').innerText = `💡 "${quotes[Math.floor(Math.random() * quotes.length)]}"`;

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
    STATE.selectedIds.clear();
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
}

// --- DATA HANDLING ---
export function loadLocalData() {
    const s = JSON.parse(localStorage.getItem("appana_v3"));
    if(s) { 
        STATE = {...STATE, ...s}; 
        el("user-xp").innerText = STATE.xp;
        renderCustomSubjects();
        renderChapters();
    }
}

export function saveData() {
    localStorage.setItem("appana_v3", JSON.stringify(STATE));
}

// --- CUSTOM SUBJECTS ---
function saveCustomSubject() {
    const name = el("custom-sub-name").value;
    const content = el("custom-sub-text").value;
    if(!name) return;
    STATE.customSubjects.push({ id: Date.now(), name, content });
    saveData();
    renderCustomSubjects();
    el("custom-subject-modal").classList.add("hidden");
}

function renderCustomSubjects() {
    const group = el("custom-subjects-group");
    group.innerHTML = "";
    STATE.customSubjects.forEach(s => {
        const o = document.createElement("option");
        o.value = "custom_" + s.id; o.innerText = "★ " + s.name;
        group.appendChild(o);
    });
}

function addChapter() {
    const val = el("chapter-name").value;
    if(val) { STATE.chapters.push({name:val, done:false}); el("chapter-name").value=""; saveData(); renderChapters(); }
}

function renderChapters() {
    const list = el("chapter-list");
    list.innerHTML = "";
    STATE.chapters.forEach((c, i) => {
        const d = document.createElement("div");
        d.innerHTML = `<span style="color:${c.done?'#10b981':'#fff'}; text-decoration:${c.done?'line-through':'none'}">${c.name}</span> <button onclick="window.delChap(${i})" style="width:auto;padding:2px;color:red;">x</button>`;
        d.onclick = (e) => { if(e.target.tagName !== 'BUTTON') { STATE.chapters[i].done = !STATE.chapters[i].done; saveData(); renderChapters(); }};
        list.appendChild(d);
    });
}
window.delChap = (i) => { STATE.chapters.splice(i,1); saveData(); renderChapters(); };

export { STATE };
