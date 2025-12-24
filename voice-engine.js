// voice-engine.js
// Handles Text-to-Speech using the Browser's Native API (Free & Offline)

let synth = window.speechSynthesis;
let voices = [];

// 1. Load Voices (Chrome loads them asynchronously)
function loadVoices() {
    voices = synth.getVoices();
}
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
}

// 2. Clean Text (Remove Markdown, Emojis, and Music Text)
function cleanTextForSpeech(text) {
    return text
        .replace(/\*/g, "") // Remove asterisks
        .replace(/#/g, "")  // Remove hash signs
        .replace(/\[.*?\]/g, "") // Remove [Music text]
        .replace(/\(.*?\)/g, "") // Remove (Parenthesis text)
        .replace(/🎵|🔥|🦅|⚡|🛡️|💸|📈|🧠|📌|🏆|🎯|💡/g, "") // Remove Emojis
        .trim();
}

// 3. The Speak Function
export function speakAI(text) {
    if (!synth) return; // Browser doesn't support it

    // Stop any current speech
    if (synth.speaking) synth.cancel();

    // Prepare text
    const cleanText = cleanTextForSpeech(text);
    if (!cleanText) return;

    const utterThis = new SpeechSynthesisUtterance(cleanText);

    // 4. Select Voice (Prioritize Hindi/Indian English)
    // Try to find Google Hindi, or Microsoft India, or fallback to any English
    const preferredVoice = voices.find(v => v.name.includes("Google हिन्दी") || v.name.includes("Hindi")) 
                        || voices.find(v => v.lang === "en-IN")
                        || voices.find(v => v.lang === "en-US");

    if (preferredVoice) utterThis.voice = preferredVoice;

    // 5. Settings
    utterThis.pitch = 1;
    utterThis.rate = 1; // 1 = Normal speed
    utterThis.volume = 1;

    // Speak
    synth.speak(utterThis);
}

// 6. Stop Function (Exported for Stop Button)
export function stopSpeaking() {
    if (synth) synth.cancel();
}
