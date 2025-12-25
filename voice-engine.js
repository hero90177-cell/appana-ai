// voice-engine.js
// v4.0 SKT Edition – Dynamic Male Voice (Free/Native)
// Features: "Dynamic Expression" (Changes tone based on punctuation)

let synth = window.speechSynthesis;
let voices = [];
let voiceLoadAttempts = 0;

// 1. Robust Voice Loading (Retries if browser is slow)
function loadVoices() {
    voices = synth.getVoices();
    if (voices.length === 0 && voiceLoadAttempts < 5) {
        voiceLoadAttempts++;
        setTimeout(loadVoices, 200); // Retry every 200ms
    }
}

loadVoices();
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
}

// 2. Select the Best "Guru/SKT" Male Voice
function getGuruVoice() {
    if (!voices.length) loadVoices();

    // Priority List for that "Deep/Strong" Male Vibe
    // 1. "Microsoft Ravi" is the BEST free Indian Male voice on Windows.
    // 2. "Google UK English Male" is very authoritative/spiritual.
    // 3. Any voice explicitly marked "Male".
    
    return voices.find(v => v.name.includes("Ravi") && v.lang.includes("IN")) || 
           voices.find(v => v.name.includes("Google UK English Male")) ||
           voices.find(v => v.name.toLowerCase().includes("male") && v.lang.includes("en-IN")) ||
           voices.find(v => v.name.toLowerCase().includes("male") && v.lang.includes("en")) ||
           voices.find(v => v.lang === "en-GB") || // British accents often sound more "spiritual/educational"
           voices.find(v => v.lang === "en-IN");   // Fallback
}

// 3. Clean Text & Add Psychological Pauses
function cleanTextForSpeech(text) {
    return text
        .replace(/\*/g, "") 
        .replace(/#/g, "")
        .replace(/\[.*?\]/g, "") // Remove [Background Music]
        .replace(/🎵|🔥|🦅|⚡|🛡️|💸|📈|🧠|📌|🏆|🎯|💡/g, "")
        // Convert "Mentor Pauses" into long silence for TTS
        .replace(/\(pause.*?\)/gi, " ... ... ") 
        .replace(/\(silence.*?\)/gi, " ... ... ... ")
        .replace(/(\r\n|\n|\r)/gm, " ... ") // New lines = pauses
        .trim();
}

// 4. The "SKT" Dynamic Engine
// Splits text into chunks to simulate emotion (Loud Commands vs Deep Truths)
export function speakAI(text) {
    if (!synth) return;
    
    // Stop any current speech
    if (synth.speaking || synth.pending) {
        synth.cancel();
    }

    const cleanText = cleanTextForSpeech(text);
    if (!cleanText) return;

    const targetVoice = getGuruVoice();
    
    // Split by punctuation to handle tone shifts
    // senteces ending in ! = ENERGY
    // sentences ending in . or ... = DEPTH
    const segments = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];

    segments.forEach((segment) => {
        const utter = new SpeechSynthesisUtterance(segment.trim());
        if (targetVoice) utter.voice = targetVoice;

        // --- THE SKT ALGORITHM ---
        
        // CASE A: High Energy / Commands ("Wake up!", "Do it now!")
        if (segment.includes("!") || segment.includes("?")) {
            utter.pitch = 1.0;  // Normal pitch (Human-like)
            utter.rate = 1.05;  // Slightly faster (Urgency)
            utter.volume = 1.0; // Loud
        } 
        // CASE B: Deep Spiritual Truths / Pauses ("Consistency is power...", "Silence...")
        else {
            utter.pitch = 0.7;  // Deep Bass (God-mode)
            utter.rate = 0.85;  // Slow & Deliberate (Hypnotic)
            utter.volume = 1.0;
        }

        // Slight tweak for British voices to not sound too robotically slow
        if (targetVoice && targetVoice.name.includes("UK")) {
            if (utter.pitch < 1) utter.pitch = 0.8; 
        }

        synth.speak(utter);
    });
}

// 5. Stop Function
export function stopSpeaking() {
    if (synth) synth.cancel();
}
