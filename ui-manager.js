// ui-manager.js (vFinal)
import { deleteMessagesFromCloud } from './auth-manager.js';

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

/* ---------------- TIMER LOGIC ---------------- */
let timerInterval = null;
let timerSeconds = 0;
let paused = false;
let timerMode = null;

export const timer = {
    startStopwatch() { timer.stop(); timerMode="stopwatch"; timerSeconds=0; paused=false; timer.run(); },
    startTimer(seconds) { timer.stop(); timerMode="timer"; timerSeconds=seconds; paused=false; timer.run(); },
    run() {
        if(timerInterval) clearInterval(timerInterval);
        const box=el("magic-timer"); 
        if(box) box.classList.remove("hidden");
        
        timerInterval=setInterval(()=>{
            if(paused) return;
            timerSeconds = timerMode==="stopwatch" ? timerSeconds+1 : timerSeconds-1;
            
            if(timerMode==="timer" && timerSeconds<=0){ 
                timer.stop(); 
                alert("⏰ Time is up!"); 
            }
            timer.update();
        },1000);
        timer.update();
    },
    stop(){ 
        clearInterval(timerInterval); 
        timerInterval=null; 
        timerMode=null; 
        el("magic-timer")?.classList.add("hidden"); 
    },
    update(){ 
        const m=String(Math.floor(timerSeconds/60)).padStart(2,"0"); 
        const s=String(timerSeconds%60).padStart(2,"0"); 
        const d = el("timer-val");
        if(d) d.innerText=`${m}:${s}`; 
    }
};

/* ---------------- UI INIT ---------------- */
export function setupUI() {
    console.log("🛠️ Initializing UI Tools...");

    // 1. Navigation (Tabs)
    const navBtns = document.querySelectorAll(".nav-btn");
    navBtns.forEach(btn=>{
        btn.onclick=()=>{
            navBtns.forEach(b=>b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".sidebar, .main-area, .right-panel").forEach(p=>p.classList.remove("active-panel"));
            const target = el(btn.dataset.target);
            if(target) target.classList.add("active-panel");
        };
    });

    // 2. Safe Event Listener Helper
    const click = (id, fn) => { const element = el(id); if(element) element.onclick = fn; };

    // Modals
    click("add-subject-btn", () => el("custom-subject-modal")?.classList.remove("hidden"));
    click("close-modal-btn", () => el("custom-subject-modal")?.classList.add("hidden"));
    click("save-subject-btn", saveCustomSubject);

    click("add-large-subject-btn", () => el("large-subject-modal")?.classList.remove("hidden"));
    click("save-large-subject-btn", saveLargeSubject);
    click("close-large-modal-btn", () => el("large-subject-modal")?.classList.add("hidden"));

    // Features
    click("mark-chapter-btn", addChapter);
    click("select-mode-btn", toggleSelectMode);
    click("cancel-select-btn", toggleSelectMode);
    click("confirm-delete-btn", confirmDelete);

    // Tools
    click("gen-notes-btn", () => sendToolRequest("Generate notes"));
    click("gen-mcq-btn", () => sendToolRequest("Generate MCQs"));
    click("gen-imp-btn", () => sendToolRequest("Generate important points"));
    click("gen-passage-btn", () => sendToolRequest("Generate passage"));

    click("pdf-btn", exportChatPDF);
    click("clear-db-btn", clearAllData);

    const subSel = el("subject-selector");
    if(subSel) {
        subSel.addEventListener("change", (e) => localStorage.setItem("appana_target_exam", e.target.value));
    }

    // Init DB
    initIndexedDB().then(loadLargeSubjects);
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
    if (savedTarget && el("subject-selector")) el("subject-selector").value = savedTarget;
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
    return new Promise((resolve)=>{
        const request=indexedDB.open("appana_large_subjects",1);
        request.onupgradeneeded=e=>{
            db=e.target.result;
            if(!db.objectStoreNames.contains("subjects")) db.createObjectStore("subjects",{keyPath:"id"});
        };
        request.onsuccess=e=>{ db=e.target.result; resolve(db); };
        request.onerror=e=>{ console.error("IDB Error", e); resolve(null); };
    });
}

async function saveLargeSubject(){
    const name=el("large-sub-name")?.value.trim();
    const fileInput=el("large-sub-file");
    if(!name || !fileInput?.files.length) return alert("Name & file required");
    
    const file=fileInput.files[0];
    const reader=new FileReader();
    
    reader.onload = function(e) {
        if(!db) return alert("Database not ready yet.");
        const obj = { id: crypto.randomUUID(), name, content: e.target.result }; // Store as base64 string
        const tx = db.transaction("subjects", "readwrite");
        tx.objectStore("subjects").add(obj);
        tx.oncomplete = () => {
            STATE.largeSubjects.push(obj);
            renderLargeSubjects();
            el("large-subject-modal")?.classList.add("hidden");
        };
    };
    reader.readAsDataURL(file); // Convert file to text/base64 for storage
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
        d.style.display="flex"; d.style.justifyContent="space-between";
        d.innerHTML=`<span style="text-decoration:${c.done?"line-through":"none"}; color:white;">${c.name}</span><button data-i="${i}" style="padding:2px 6px;">✖</button>`;
        d.onclick=e=>{
            if(e.target.tagName==="BUTTON") {
                STATE.chapters.splice(i,1);
            } else {
                c.done=!c.done;
            }
            saveData();
            renderChapters();
        };
        list.appendChild(d);
    });
}

/* ---------------- SELECTION & DELETE ---------------- */
export function toggleSelectMode(){
    STATE.selectMode=!STATE.selectMode;
    STATE.selectedIds.clear();
    const toolbar = el("selection-toolbar");
    if(toolbar) toolbar.classList.toggle("hidden",!STATE.selectMode);
    
    if(!STATE.selectMode) {
        document.querySelectorAll(".message.selected").forEach(m => m.classList.remove("selected"));
    }
    el("selection-count")&&(el("selection-count").innerText="0 Selected");
}

async function confirmDelete() {
    const selectedElements = document.querySelectorAll(".message.selected");
    if(selectedElements.length === 0) return alert("No messages selected.");
    if(!confirm(`Delete ${selectedElements.length} messages?`)) return;

    const idsToDelete = [];
    selectedElements.forEach(domEl => {
        idsToDelete.push(domEl.id);
        domEl.remove();
    });

    STATE.chatHistory = STATE.chatHistory.filter(msg => !idsToDelete.includes(msg.id));
    STATE.selectedIds.clear();
    saveData();
    await deleteMessagesFromCloud(idsToDelete);
    toggleSelectMode();
}

/* ---------------- TOOLS ---------------- */
function sendToolRequest(command) {
    const topic = el("topic-input")?.value.trim() || "";
    const msg = topic ? `${command} for ${topic}` : command;
    // Switch to Chat Tab
    document.querySelector(`.nav-btn[data-target="section-chat"]`)?.click();
    
    setTimeout(() => {
        const inp = el("user-input");
        const btn = el("send-btn");
        if(inp && btn) { inp.value=msg; btn.click(); }
    }, 200);
}

function exportChatPDF(){
    // Basic Alert as fallback
    if(!window.jspdf) return alert("PDF Library loading... wait a moment.");
    const { jsPDF } = window.jspdf;
    const doc=new jsPDF();
    
    let y=10;
    doc.setFontSize(16);
    doc.text("Appana AI - Study Notes", 10, y);
    y+=10;
    doc.setFontSize(12);

    STATE.chatHistory.forEach(m=>{
        const prefix = m.who==="You" ? "You: " : "AI: ";
        const txt = prefix + (m.text || m.msg || "");
        
        const lines = doc.splitTextToSize(txt, 180);
        
        // Page break check
        if(y + (lines.length*7) > 280) {
            doc.addPage();
            y=10;
        }
        
        doc.text(lines, 10, y);
        y += lines.length * 7 + 5; 
    });
    doc.save("Appana_Chat.pdf");
}

function clearAllData(){
    if(!confirm("⚠ Are you sure? This will delete all history.")) return;
    localStorage.clear();
    if(db) {
        const tx = db.transaction("subjects","readwrite");
        tx.objectStore("subjects").clear();
    }
    window.location.reload();
}
