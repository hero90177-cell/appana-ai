// voice-engine.js
// Handles Text-to-Speech using the Browser's Native API (Free & Offline)
// Optimized for "Appana Guru" Mentor Tone (Deep, Calm, Paced)

let synth = window.speechSynthesis;
let voices = [];

// 1. Load Voices (Chrome loads them asynchronously)
function loadVoices() {
    voices = synth.getVoices();
}

// Force load immediately if possible, else wait for event
loadVoices();
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
}

// 2. Clean Text & Inject Mentor Pauses
function cleanTextForSpeech(text) {
    return text
        // Step A: Remove Markdown & Emojis
        .replace(/\*/g, "") // Remove asterisks (bold)
        .replace(/#/g, "")  // Remove hash signs
        .replace(/\[.*?\]/g, "") // Remove [Background Music] text completely
        .replace(/🎵|🔥|🦅|⚡|🛡️|💸|📈|🧠|📌|🏆|🎯|💡/g, "") // Remove Emojis
        
        // Step B: Convert "Stage Directions" into Natural Pauses (The Mentor Trick)
        // Replaces "(Pause)" or "(Silence)" with periods/commas to force TTS to wait.
        .replace(/\(pause.*?\)/gi, "... ...") 
        .replace(/\(silence.*?\)/gi, "... ... ...")
        .replace(/\(deep breath.*?\)/gi, "... ")
        
        // Step C: Clean lingering parenthesis
        .replace(/\(.*?\)/g, "") 
        .trim();
}

// 3. The Speak Function (The Voice)
export function speakAI(text) {
    if (!synth) return; // Browser doesn't support it

    // ALWAYS Stop previous speech before starting new one (Prevents overlapping chaos)
    if (synth.speaking || synth.pending) {
        synth.cancel();
    }

    // Prepare text
    const cleanText = cleanTextForSpeech(text);
    if (!cleanText) return;

    // Create Utterance
    const utterThis = new SpeechSynthesisUtterance(cleanText);

    // 4. Select Voice (Prioritize Indian English/Hindi for that "Desi Mentor" feel)
    if (!voices.length) loadVoices(); // Double check voices are loaded

    const preferredVoice = voices.find(v => v.name.includes("Google हिन्दी") || v.name.includes("Hindi")) 
                        || voices.find(v => v.lang === "en-IN")
                        || voices.find(v => v.lang === "en-US");

    if (preferredVoice) utterThis.voice = preferredVoice;

    // 5. Mentor Settings (Crucial for Psychology)
    // Slightly slower and deeper = More Authority
    utterThis.pitch = 0.9; // 1.0 is normal, 0.9 is slightly deeper
    utterThis.rate = 0.95; // 1.0 is normal, 0.95 is deliberate/calm
    utterThis.volume = 1;

    // Speak
    synth.speak(utterThis);
}

// 6. Stop Function (Exported for Stop Button / Mic Button)
export function stopSpeaking() {
    if (synth) synth.cancel();
}
