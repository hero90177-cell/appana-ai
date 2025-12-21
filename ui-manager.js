// ui-manager.js (v4.0 Crash-Proof)

export const STATE = {
    xp: 0,
    customSubjects: [],
    chapters: [],
    selectMode: false,
    selectedIds: new Set(),
    chatHistory: [],
    largeSubjects: []
};

const el = id => document.getElementById(id);

/* ---------------- TIMER ---------------- */
let timerInterval = null;
let timerSeconds = 0;
let paused = false;
let timerMode = null;

export const timer = {
    startStopwatch() { timer.stop(); timerMode="stopwatch"; timerSeconds=0; paused=false; timer.run(); },
    startTimer(seconds) { timer.stop(); timerMode="timer"; timerSeconds=seconds; paused=false; timer.run(); },
    run() {
        if(timerInterval) clearInterval(timerInterval);
        const box=el("magic-timer"); if(box) box.classList.remove("hidden");
        timerInterval=setInterval(()=>{
            if(paused) return;
            timerSeconds = timerMode==="stopwatch" ? timerSeconds+1 : timerSeconds-1;
            if(timerMode==="timer" && timerSeconds<=0){ timer.stop(); alert("⏰ Time is up!"); }
            timer.update();
        },1000);
        timer.update();
    },
    pause(){ paused=true; },
    resume(){ paused=false; },
    reset(){ timerSeconds=0; timer.update(); },
    stop(){ clearInterval(timerInterval); timerInterval=null; timerSeconds=0; paused=false; timerMode=null; el("magic-timer")?.classList.add("hidden"); },
    update(){ const m=String(Math.floor(timerSeconds/60)).padStart(2,"0"); const s=String(timerSeconds%60).padStart(2,"0"); el("timer-val")&&(el("timer-val").innerText=`${m}:${s}`); }
};

/* ---------------- UI INIT (FIXED) ---------------- */
export function setupUI() {
    console.log("🛠️ Setting up UI Managers...");

    // 1. Navigation Logic (Safe)
    const navBtns = document.querySelectorAll(".nav-btn");
    if(navBtns.length > 0) {
        navBtns.forEach(btn=>{
            btn.onclick=()=>{
                document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));
                btn.classList.add("active");
                document.querySelectorAll(".panel, .main-area, .sidebar, .right-panel").forEach(p=>p.classList.remove("active-panel"));
                const target = el(btn.dataset.target);
                if(target) target.classList.add("active-panel");
            };
        });
    }

    // 2. Event Listeners (Wrapped in Safety Checks)
    // If these elements aren't loaded yet, we skip them instead of crashing
    const click = (id, fn) => { const element = el(id); if(element) element.onclick = fn; };

    click("add-subject-btn", () => el("custom-subject-modal")?.classList.remove("hidden"));
    click("close-modal-btn", () => el("custom-subject-modal")?.classList.add("hidden"));
    click("save-subject-btn", saveCustomSubject);

    click("mark-chapter-btn", addChapter);
    click("select-mode-btn", toggleSelectMode);
    click("cancel-select-btn", toggleSelectMode);

    click("add-large-subject-btn", () => el("large-subject-modal")?.classList.remove("hidden"));
    click("save-large-subject-btn", saveLargeSubject);
    click("close-large-modal-btn", () => el("large-subject-modal")?.classList.add("hidden"));

    // Tools
    click("gen-notes-btn", () => sendToolRequest("Generate notes"));
    click("gen-mcq-btn", () => sendToolRequest("Generate MCQs"));
    click("gen-imp-btn", () => sendToolRequest("Generate important points"));
    click("gen-passage-btn", () => sendToolRequest("Generate passage"));

    click("pdf-btn", exportChatPDF);
    click("clear-db-btn", clearAllData);

    // 3. Inputs
    const subSel = el("subject-selector");
    if(subSel) {
        subSel.addEventListener("change", (e) => localStorage.setItem("appana_target_exam", e.target.value));
    }

    // 4. Data Load
    try {
        initIndexedDB().then(loadLargeSubjects);
        loadLocalData();
    } catch(err) { console.log("Data load warning:", err); }
}

/* ---------------- LOCAL STORAGE ---------------- */
export function loadLocalData() {
    const raw=localStorage.getItem("appana_v3"); 
    if(raw) {
        try {
            const data=JSON.parse(raw);
            STATE.xp=data.xp||0;
            STATE.customSubjects=data.customSubjects||[];
            STATE.chapters=data.chapters||[];
            STATE.chatHistory=data.chatHistory||[];
            renderCustomSubjects();
            renderChapters();
        } catch(e) { console.error("Save file corrupted"); }
    }

    const savedTarget = localStorage.getItem("appana_target_exam");
    if (savedTarget && el("subject-selector")) {
        el("subject-selector").value = savedTarget;
    }
}

export function saveData(){
    localStorage.setItem("appana_v3",JSON.stringify({
        xp:STATE.xp,
        customSubjects:STATE.customSubjects,
        chapters:STATE.chapters,
        chatHistory:STATE.chatHistory
    }));
}

/* ---------------- CUSTOM SUBJECTS ---------------- */
function saveCustomSubject(){
    const name=el("custom-sub-name")?.value.trim();
    const content=el("custom-sub-text")?.value.trim();
    if(!name) return alert("Subject name required");

    STATE.customSubjects.push({ id:crypto.randomUUID(), name, content });
    saveData();
    renderCustomSubjects();
    el("custom-subject-modal")?.classList.add("hidden");
}

function renderCustomSubjects(){
    const sel=el("custom-subjects-group"); if(!sel) return;
    sel.innerHTML="";
    STATE.customSubjects.forEach(s=>{
        const o=document.createElement("option");
        o.value=`custom_${s.id}`;
        o.textContent=`★ ${s.name}`;
        sel.appendChild(o);
    });
}

/* ---------------- LARGE SUBJECTS (IndexedDB) ---------------- */
let db=null;
async function initIndexedDB(){
    if (!window.indexedDB) return;
    return new Promise((resolve,reject)=>{
        const request=indexedDB.open("appana_large_subjects",1);
        request.onupgradeneeded=e=>{
            db=e.target.result;
            if(!db.objectStoreNames.contains("subjects")) {
                db.createObjectStore("subjects",{keyPath:"id"});
            }
        };
        request.onsuccess=e=>{ db=e.target.result; resolve(db); };
        request.onerror=e=>resolve(null); // Don't crash on DB error
    });
}

async function saveLargeSubject(){
    const name=el("large-sub-name")?.value.trim();
    const fileInput=el("large-sub-file");
    if(!name || !fileInput?.files.length) return alert("Name & file required");

    const file=fileInput.files[0];
    const reader=new FileReader();
    reader.onload = function(e) {
        if(!db) return alert("Database not ready");
        const dataURL = e.target.result;
        const obj = { id: crypto.randomUUID(), name, content: dataURL };
        const tx = db.transaction("subjects", "readwrite");
        tx.objectStore("subjects").add(obj);
        tx.oncomplete = () => {
            STATE.largeSubjects.push(obj);
            renderLargeSubjects();
            el("large-subject-modal")?.classList.add("hidden");
        };
    };
    reader.readAsDataURL(file);
}

async function loadLargeSubjects(){
    if(!db) return;
    const tx=db.transaction("subjects","readonly");
    const req = tx.objectStore("subjects").getAll();
    req.onsuccess = () => {
        STATE.largeSubjects = req.result || [];
        renderLargeSubjects();
    };
}

function renderLargeSubjects(){
    const sel=el("large-subjects-group"); if(!sel) return;
    sel.innerHTML="";
    STATE.largeSubjects.forEach(s=>{
        const o=document.createElement("option");
        o.value=`large_${s.id}`;
        o.textContent=`📂 ${s.name}`;
        sel.appendChild(o);
    });
}

/* ---------------- CHAPTERS ---------------- */
function addChapter(){
    const input = el("chapter-name");
    const v = input?.value.trim();
    if(!v) return;
    STATE.chapters.push({ name:v, done:false });
    saveData();
    renderChapters();
    input.value="";
}

function renderChapters(){
    const list=el("chapter-list"); if(!list) return;
    list.innerHTML="";
    STATE.chapters.forEach((c,i)=>{
        const d=document.createElement("div");
        d.innerHTML=`<span style="text-decoration:${c.done?"line-through":"none"}">${c.name}</span>
                     <button data-i="${i}">✖</button>`;
        d.onclick=e=>{
            if(e.target.tagName==="BUTTON") STATE.chapters.splice(i,1);
            else c.done=!c.done;
            saveData();
            renderChapters();
        };
        list.appendChild(d);
    });
}

/* ---------------- SELECT MODE ---------------- */
export function toggleSelectMode(){
    STATE.selectMode=!STATE.selectMode;
    STATE.selectedIds.clear();
    el("selection-toolbar")?.classList.toggle("hidden",!STATE.selectMode);
    el("selection-count")&&(el("selection-count").innerText="0 Selected");
}

/* ---------------- TOOLS PANEL LOGIC ---------------- */
function sendToolRequest(command) {
    const topicInput = el("topic-input"); 
    const topic = topicInput?.value.trim() || "";
    const fullMessage = topic ? `${command} for ${topic}` : command;

    // Switch to chat panel
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel, .main-area, .sidebar, .right-panel").forEach(p => p.classList.remove("active-panel"));
    
    el("section-chat")?.classList.add("active-panel");
    const chatBtn = document.querySelector(`.nav-btn[data-target="section-chat"]`);
    if(chatBtn) chatBtn.classList.add("active");

    const inputBox = el("user-input");
    const sendBtn = el("send-btn");
    if (inputBox && sendBtn) {
        inputBox.value = fullMessage;
        sendBtn.click();
    }
}

function exportChatPDF(){
    // Dynamic import to prevent crash if library missing
    import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
    .then(jsPDF=>{
        const doc=new jsPDF.jsPDF();
        let y=10;
        STATE.chatHistory.forEach(m=>{
            const txt=(m.who==="You"?"👤 ":"🤖 ") + (m.text || m.msg || "");
            const lines = doc.splitTextToSize(txt, 180);
            doc.text(lines,10,y);
            y += lines.length * 7; 
            if (y > 280) { doc.addPage(); y = 10; }
        });
        doc.save("Appana_Chat.pdf");
    })
    .catch(e => alert("PDF Library loading... try again in 5 seconds."));
}

function clearAllData(){
    if(!confirm("⚠ Are you sure? This will delete all history.")) return;
    localStorage.clear();
    if(db){
        const tx=db.transaction("subjects","readwrite");
        tx.objectStore("subjects").clear();
    }
    window.location.reload();
}
