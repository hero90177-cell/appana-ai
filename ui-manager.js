// ui-manager.js (v3.3 Final - Stable & Persistent)

export const STATE = {
    xp: 0,
    customSubjects: [],
    chapters: [],
    selectMode: false,
    selectedIds: new Set(),
    chatHistory: [],
    largeSubjects: [] // IndexedDB
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
        const box=el("magic-timer"); if(!box) return;
        box.classList.remove("hidden");
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

/* ---------------- UI INIT ---------------- */
export function setupUI() {
    // 1. Navigation Logic
    document.querySelectorAll(".nav-btn").forEach(btn=>{
        btn.onclick=()=>{
            document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".panel, .main-area, .sidebar, .right-panel").forEach(p=>p.classList.remove("active-panel"));
            el(btn.dataset.target)?.classList.add("active-panel");
        };
    });

    // 2. Custom Subject Modal
    el("add-subject-btn")?.onclick=()=>el("custom-subject-modal").classList.remove("hidden");
    el("close-modal-btn")?.onclick=()=>el("custom-subject-modal").classList.add("hidden");
    el("save-subject-btn")?.onclick=saveCustomSubject;

    // 3. Chapter & Select Mode
    el("mark-chapter-btn")?.onclick=addChapter;
    el("select-mode-btn")?.onclick=toggleSelectMode;
    el("cancel-select-btn")?.onclick=toggleSelectMode;

    // 4. Large Subject Modal (Handlers)
    el("add-large-subject-btn")?.onclick=()=>el("large-subject-modal").classList.remove("hidden");
    el("save-large-subject-btn")?.onclick=saveLargeSubject;
    el("close-large-modal-btn")?.onclick=()=>el("large-subject-modal").classList.add("hidden"); // ✅ Added JS Handler

    // 5. Tools Panel - AI Connected
    el("gen-notes-btn")?.onclick=()=>sendToolRequest("Generate notes");
    el("gen-mcq-btn")?.onclick=()=>sendToolRequest("Generate MCQs");
    el("gen-imp-btn")?.onclick=()=>sendToolRequest("Generate important points");
    el("gen-passage-btn")?.onclick=()=>sendToolRequest("Generate passage");

    el("pdf-btn")?.onclick=exportChatPDF;
    el("clear-db-btn")?.onclick=clearAllData;

    // 6. Target Exam Persistence Listener
    el("subject-selector")?.addEventListener("change", (e) => {
        localStorage.setItem("appana_target_exam", e.target.value);
    });

    // 7. Load Data
    initIndexedDB().then(loadLargeSubjects);
    loadLocalData();
}

/* ---------------- LOCAL STORAGE ---------------- */
export function loadLocalData() {
    const raw=localStorage.getItem("appana_v3"); 
    if(raw) {
        const data=JSON.parse(raw);
        STATE.xp=data.xp||0;
        STATE.customSubjects=data.customSubjects||[];
        STATE.chapters=data.chapters||[];
        STATE.chatHistory=data.chatHistory||[];
        renderCustomSubjects();
        renderChapters();
    }

    // ✅ RESTORE SAVED TARGET EXAM
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
    const name=el("custom-sub-name").value.trim();
    const content=el("custom-sub-text").value.trim();
    if(!name) return alert("Subject name required");

    STATE.customSubjects.push({ id:crypto.randomUUID(), name, content });
    saveData();
    renderCustomSubjects();
    el("custom-subject-modal").classList.add("hidden");
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
    return new Promise((resolve,reject)=>{
        const request=indexedDB.open("appana_large_subjects",1);
        request.onupgradeneeded=e=>{
            db=e.target.result;
            db.createObjectStore("subjects",{keyPath:"id"});
        };
        request.onsuccess=e=>{ db=e.target.result; resolve(db); };
        request.onerror=e=>reject(e);
    });
}

async function saveLargeSubject(){
    const name=el("large-sub-name").value.trim();
    const fileInput=el("large-sub-file");
    if(!name || !fileInput.files.length) return alert("Name & file required");

    const file=fileInput.files[0];
    const reader=new FileReader();
    reader.onload = function(e) {
        const dataURL = e.target.result;
        const obj = { id: crypto.randomUUID(), name, content: dataURL };

        // ✅ FIXED: Standard IndexedDB Transaction Logic
        const tx = db.transaction("subjects", "readwrite");
        const store = tx.objectStore("subjects");
        store.add(obj);

        tx.oncomplete = () => {
            STATE.largeSubjects.push(obj);
            renderLargeSubjects();
            el("large-subject-modal").classList.add("hidden");
            el("large-sub-name").value = "";
            el("large-sub-file").value = "";
        };

        tx.onerror = () => alert("Error saving large file to database.");
    };
    reader.readAsDataURL(file);
}

async function loadLargeSubjects(){
    if(!db) return;
    const tx=db.transaction("subjects","readonly");
    const store=tx.objectStore("subjects");
    
    return new Promise((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => {
            STATE.largeSubjects = req.result || [];
            renderLargeSubjects();
            
            // Re-apply target selection in case it was a large file
            const savedTarget = localStorage.getItem("appana_target_exam");
            if(savedTarget && savedTarget.startsWith("large_")) {
                 el("subject-selector").value = savedTarget;
            }
            resolve();
        };
    });
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
    const v=el("chapter-name").value.trim();
    if(!v) return;
    STATE.chapters.push({ name:v, done:false });
    saveData();
    renderChapters();
    el("chapter-name").value="";
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

    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel, .main-area, .sidebar, .right-panel").forEach(p => p.classList.remove("active-panel"));

    const chatPanel = el("section-chat");
    if (chatPanel) chatPanel.classList.add("active-panel");

    const chatNavBtn = document.querySelector(`.nav-btn[data-target="section-chat"]`);
    if (chatNavBtn) chatNavBtn.classList.add("active");

    const inputBox = el("user-input");
    const sendBtn = el("send-btn");
    if (inputBox && sendBtn) {
        inputBox.value = fullMessage;
        sendBtn.click();
    }
}

function exportChatPDF(){
    import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js').then(jsPDF=>{
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
    });
}

function clearAllData(){
    if(!confirm("⚠ Are you sure? This will delete all history, subjects, and XP.")) return;
    localStorage.clear();
    if(db){
        const tx=db.transaction("subjects","readwrite");
        tx.objectStore("subjects").clear();
    }
    STATE.customSubjects=[];
    STATE.chapters=[];
    STATE.chatHistory=[];
    STATE.largeSubjects=[];
    renderCustomSubjects();
    renderChapters();
    renderLargeSubjects();
    window.location.reload();
}
