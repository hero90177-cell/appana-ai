// voice-engine.js
// v5.0 FINAL - SKT "High Voltage" Edition
// Features: Dynamic Actor Engine (Switches between "Aggressive" and "Spiritual Deep" modes)
// Logic: Forces Male Voice (Ravi/UK) + Pitch Shifting based on Punctuation

let synth = window.speechSynthesis;
let voices = [];
let voiceLoadAttempts = 0;

/* =========================================
   1. VOICE LOADER (The "Male Voice" Hunter)
   ========================================= */
function loadVoices() {
    voices = synth.getVoices();
    
    // If no voices found, retry (Android/Chrome quirks)
    if (voices.length === 0 && voiceLoadAttempts < 5) {
        voiceLoadAttempts++;
        setTimeout(loadVoices, 300); 
    }
}

loadVoices();
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
}

// FORCE "SKT-STYLE" MALE VOICE
function getGuruVoice() {
    if (!voices.length) loadVoices();

    // PRIORITY 1: "Microsoft Ravi" (The Best Indian Male Voice on Windows)
    let selected = voices.find(v => v.name.includes("Ravi") && v.lang.includes("IN"));

    // PRIORITY 2: "Google UK English Male" (Deep, authoritative, spiritual vibe)
    if (!selected) selected = voices.find(v => v.name.includes("Google UK English Male"));

    // PRIORITY 3: Any Indian Male Voice
    if (!selected) selected = voices.find(v => v.lang.includes("IN") && v.name.toLowerCase().includes("male"));

    // PRIORITY 4: Any UK Male Voice (British accents sound more "Educator" like)
    if (!selected) selected = voices.find(v => v.lang.includes("GB") && v.name.toLowerCase().includes("male"));

    // PRIORITY 5: Fallback to any Male voice
    if (!selected) selected = voices.find(v => v.name.toLowerCase().includes("male"));

    // LAST RESORT: Default (but we try hard to avoid female voices if possible)
    return selected || voices[0];
}

/* =========================================
   2. TEXT CLEANER (Removes Visuals)
   ========================================= */
function cleanTextForSpeech(text) {
    return text
        // Remove markdown visuals
        .replace(/\*/g, "") 
        .replace(/#/g, "")
        .replace(/\[.*?\]/g, "") 
        .replace(/\(.*?\)/g, "") // Remove parenthetical notes like (Background music)
        // Remove emojis so he doesn't read "Fire emoji"
        .replace(/🎵|🔥|🦅|⚡|🛡️|💸|📈|🧠|📌|🏆|🎯|💡|🪜|⏳|📖|✍️|❌|⚠️/g, "")
        // Convert formatting to pauses
        .replace(/:/g, ". ") 
        .replace(/-/g, ", ")
        .trim();
}

/* =========================================
   3. THE "SKT" DYNAMIC ACTOR ENGINE
   ========================================= */
export function speakAI(text) {
    if (!synth) return;
    
    // 1. Stop previous speech immediately (Interrupt mode)
    if (synth.speaking || synth.pending) {
        synth.cancel();
    }

    const cleanText = cleanTextForSpeech(text);
    if (!cleanText) return;

    const targetVoice = getGuruVoice();
    
    // 2. INTELLIGENT SEGMENTATION
    // We split by punctuation to treat every sentence as a separate "acting" piece.
    // This allows us to change pitch/speed MID-PARAGRAPH.
    const segments = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];

    segments.forEach((segment) => {
        const txt = segment.trim();
        if (!txt) return;

        const utter = new SpeechSynthesisUtterance(txt);
        if (targetVoice) utter.voice = targetVoice;

        // --- THE "FEELING" ALGORITHM ---

        // MODE A: HIGH ENERGY (Aggression/Wake Up)
        // Trigger: Exclamation marks OR specific "Wake up" keywords
        if (txt.includes("!") || txt.match(/\b(Wake up|Fast|Now|Stop|Do it|Uth|Go)\b/i)) {
            utter.pitch = 1.1;   // Slightly higher (Projecting voice)
            utter.rate = 1.1;    // Faster (Urgency)
            utter.volume = 1.0;  // Full Volume
        }
        
        // MODE B: DEEP SPIRITUAL TRUTH (The "Guru" Whisper)
        // Trigger: Ellipsis (...) OR Long sentences OR Words of wisdom
        else if (txt.includes("...") || txt.length > 50 || txt.match(/\b(Focus|Listen|Pain|Life|Truth|Silence|Remember)\b/i)) {
            utter.pitch = 0.6;   // DEEP BASS (Very Low Pitch)
            utter.rate = 0.8;    // Slow (Hypnotic/Serious)
            utter.volume = 1.0;
        }

        // MODE C: QUESTION (Engagement)
        else if (txt.includes("?")) {
            utter.pitch = 1.2;   // High ending
            utter.rate = 0.95;   // Normal speed
        }

        // MODE D: DEFAULT (Authoritative)
        else {
            utter.pitch = 0.8;   // Slightly deep (Masculine default)
            utter.rate = 0.95;   // Measured pace
        }

        // Tweak for "Google UK Male" (It sounds too robotically slow at low rates)
        if (targetVoice && targetVoice.name.includes("UK Male")) {
            if (utter.rate < 0.9) utter.rate = 0.9;
        }

        // 3. Play the segment
        synth.speak(utter);
        
        // 4. Force a tiny pause between segments (Breath)
        // We do this by speaking a silent character, but usually the queue delay is enough.
    });
}

/* =========================================
   4. UTILITIES
   ========================================= */
export function stopSpeaking() {
    if (synth) synth.cancel();
}
