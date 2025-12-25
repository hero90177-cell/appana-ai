// ai-chat.js (v4.0 FINAL – SKT Spirit + Fear Killers + Visuals)
// Features: Dynamic Verbosity, Context-Aware Hooks, Precision 6AM Ping, Deep Psychology, Richer Emojis
// Special: Subject-Wise Fear Engines, Confidence Scoring, "Dagger" Truths.

export async function onRequestPost({ request, env }) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const body = await request.json();

    /* ===============================
       1️⃣ HEALTH CHECK & DIAGNOSIS
       =============================== */
    if (body.type === "ping") {
      const keys = {
        gemini: !!env.GEMINI_API_KEY,
        groq: !!env.GROQ_API_KEY,
        cohere: !!env.COHERE_API_KEY,
        hf: !!env.HF_API_KEY,
      };
      const ok = Object.values(keys).some(Boolean);
      return new Response(
        JSON.stringify({ status: ok ? "ok" : "fail", mode: "Appana-v4.0-Final", keys_detected: keys }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    /* ===============================
       2️⃣ INPUT PARSING & DEFAULTS
       =============================== */
    const {
      message = "",
      image = null,
      subject = "General",
      language = "English",
      examMode = "normal", // normal, 2marks, 5marks, 8marks, teacher, parent, hard, pre_exam
      uid = "guest",
      goal = "",
    } = body;

    if (!message && !image) throw new Error("No input provided");

    /* ===============================
       3️⃣ RATE LIMIT (KV)
       =============================== */
    if (env.APPANA_KV) {
      const rateKey = `rate:${uid}`;
      const count = Number(await env.APPANA_KV.get(rateKey)) || 0;
      if (count >= 100) {
        return new Response(
          JSON.stringify({ reply: "⚠️ You are chatting too fast. Pause. Breathe. Try in 1 minute." }),
          { headers: { ...cors, "Content-Type": "application/json" } }
        );
      }
      await env.APPANA_KV.put(rateKey, count + 1, { expirationTtl: 60 });
    }

    /* ===============================
       4️⃣ SMART CONTEXT (MEMORY) & WEEKLY GROWTH
       =============================== */
    let memory = "";
    let motivationPrefix = "";
    let growthStage = "Rookie Student"; 

    // PSYCHOLOGY PRE-DETECT
    let studentState = "neutral";
    const lowerMsg = message.toLowerCase();
    
    if (lowerMsg.match(/(scared|fear|panic|anxious|can't do it|fail|nervous|darr)/)) studentState = "fearful";
    else if (lowerMsg.match(/(lazy|tired|bored|sleepy|tomorrow|procrastinat)/)) studentState = "lazy";
    else if (lowerMsg.match(/(ready|confident|prepared|let's go|done)/)) studentState = "confident";
    else if (lowerMsg.match(/(overwhelmed|stressed|pressure|burden)/)) studentState = "stressed";
    else if (lowerMsg.match(/(angry|frustrated|irritated)/)) studentState = "frustrated";

    if (uid !== "guest" && env.APPANA_KV) {
      // Memory
      memory = (await env.APPANA_KV.get(`mem:${uid}`)) || "";

      // Streak & Weekly History Logic
      const today = new Date().toISOString().split('T')[0];
      const lastSeen = await env.APPANA_KV.get(`last_seen:${uid}`);
      let streak = Number(await env.APPANA_KV.get(`streak:${uid}`)) || 0;

      if (lastSeen !== today) {
        const yesterday = new Date(Date.now() - 864e5).toISOString().split('T')[0];
        
        if (lastSeen === yesterday) {
          streak++;
          motivationPrefix = `🔥 **${streak} Day Streak!** Consistency is power.\n\n`;
        } else {
          streak = 1;
          motivationPrefix = `🚀 **Day 1.** The best time to start is now.\n\n`;
        }
        await env.APPANA_KV.put(`last_seen:${uid}`, today);
        await env.APPANA_KV.put(`streak:${uid}`, streak);

        // Update Weekly History (FIFO Queue)
        const historyKey = `week_history:${uid}`;
        let weekHistory = [];
        try {
            weekHistory = JSON.parse(await env.APPANA_KV.get(historyKey) || "[]");
        } catch(e) { weekHistory = []; }
        
        weekHistory.push({ date: today, streak: streak, state: studentState });
        if(weekHistory.length > 30) weekHistory.shift(); 
        await env.APPANA_KV.put(historyKey, JSON.stringify(weekHistory));
      }

      if (streak > 30) growthStage = "Legendary Disciple (Unstoppable)";
      else if (streak > 14) growthStage = "Consistent Warrior (Focused)";
      else if (streak > 7) growthStage = "Rising Star (Building Habit)";
    }

    /* ===============================
       5️⃣ SUBJECT-WISE LOGIC (FEAR & CONFIDENCE)
       =============================== */
    
    // A. Confidence Scoring (Internal Metric for Tone Calibration)
    const confidenceMap = {
        "Maths": 65, "Mathematics": 65,
        "Accounts": 70, "Accountancy": 70,
        "Physics": 60, "Chemistry": 60,
        "Economics": 75,
        "English": 85,
        "Business": 80,
        "General": 72
    };
    // Default to 70 if subject unknown
    const currentSubjectConfidence = confidenceMap[subject] || 70;

    // B. Fear Killers (Specific "Dagger Lines" for Subjects)
    const fearKillers = {
        "Maths": "Maths fear is not about the answer. It is about the first step. Don't look at the mountain, look at your feet.",
        "Accounts": "Accounts fear comes from mixing logic with memory. Separate them. Debit what comes in, Credit what goes out. Simple.",
        "English": "English is not a subject, it is a flow. Do not build a dam of grammar rules, let the river flow.",
        "Physics": "Physics is just nature explained in math. Don't memorize the formula, visualize the phenomenon.",
        "Economics": "Economics is your life on paper. Stop treating it like theory.",
        "General": "Fear is a liar. It tells you 'you can't' before you even try."
    };

    let fearKillerScript = "";
    if (studentState === "fearful" || studentState === "stressed") {
        const killerLine = fearKillers[subject] || fearKillers["General"];
        fearKillerScript = `\nMENTOR INTERVENTION: The student is afraid. You must start your response with this EXACT thought: "${killerLine}"\nThen, tell them: "Ruk. Saans le." (Stop. Breathe).`;
    }

    /* ===============================
       6️⃣ PSYCHOLOGY, MODE & VERBOSITY ENGINE
       =============================== */
    
    let toneBase = "";
    let moodInstruction = "";
    let extraHookInstruction = ""; 
    
    // 🧠 DYNAMIC VERBOSITY LOGIC
    let verbosityLevel = "Medium"; 
    const wordCount = message.trim().split(/\s+/).length;
    
    if (examMode === "normal") {
        // Casual / Short Message
        if (wordCount < 4 || lowerMsg.match(/^(hi|hello|hey|yo|namaste|good morning)/)) {
            verbosityLevel = "Low (Conversational, 1-2 sentences, witty)";
            extraHookInstruction = "Start with a fun, engaging, or metaphorical hook (e.g., 'Imagine you are a hero...', 'Think like a grandmaster...').";
        } else {
            verbosityLevel = "Medium (Structured Mentor)";
        }
    } 
    else if (examMode === "2marks") verbosityLevel = "Low (Precise)";
    else if (examMode === "5marks") verbosityLevel = "Medium (Paragraph)";
    else if (examMode === "8marks") verbosityLevel = "High (Detailed)";

    // 🅰️ TONE SELECTION MAP (SKT FEELING - NO NAME)
    // The "Hard" and "Default" tones below are engineered to mimic the specific "Revolutionary Educator" vibe.
    const TONES = {
        default: "You are Appana AI — a revolutionary Indian educator. You are strict but deeply loving. You speak with high energy, heavy pauses, and absolute conviction. You are not just a teacher; you are a 'Guru' preparing a disciple for war.",
        calm: "You are Appana AI — a calm, authoritative Indian mentor. You speak slowly, word by word, grounding the student. Your voice is deep and steady, like a captain in a storm.",
        hard: "You are Appana AI — a high-voltage, aggressive motivator. You do not tolerate laziness. You shout (metaphorically) to wake the student up. You use lines like 'Kya kar raha hai tu?' and 'Uth!'."
    };

    // 🅱️ MODE SWITCHING LOGIC
    if (examMode === "teacher") {
        toneBase = "You are a strict, formal Indian syllabus teacher. No emotion. Just facts.";
        moodInstruction = "Precise definitions only. No motivation. No hooks.";
        extraHookInstruction = ""; 
    } 
    else if (examMode === "parent") {
        toneBase = TONES.calm;
        moodInstruction = "Speak like a concerned Indian parent. Warn them about the future but with love. Be firm but protective.";
    }
    else if (examMode === "hard") {
        toneBase = TONES.hard;
        moodInstruction = "Hard Mentor Mode. No excuses. Short sentences. Command authority. Wake them up.";
    }
    else if (examMode === "pre_exam") {
        toneBase = TONES.hard;
        moodInstruction = "Generate a 1-minute high-energy motivational speech. Structure: (1) Focus Reminder, (2) Confidence Boost, (3) Last-Minute Command -> Pause -> Truth.";
    }
    else if (studentState === "fearful" || studentState === "stressed") {
        toneBase = TONES.calm;
        moodInstruction = "Student is panicking. Use 'Visual Metaphors' (e.g., Fear is a dragon/fog). Speak word-by-word. Say 'Ruk. Saans le.' (Stop. Breathe).";
    }
    else if (studentState === "lazy") {
        toneBase = TONES.hard;
        moodInstruction = "Student is lazy. Roast them politely. Use storytelling metaphors (e.g., Rust vs Iron). WAKE THEM UP.";
    }
    else {
        toneBase = TONES.default;
        moodInstruction = "Be authoritative, inspiring, and clear. Use 'Command -> Pause -> Truth' structure. Use Storytelling Hooks instead of lectures.";
    }

    /* ===============================
       7️⃣ SYSTEM PROMPT CONSTRUCTION
       =============================== */
    let format = "clear bullet points with psychological pauses";
    if (examMode === "2marks") format = "2–3 sentences, sharp & precise";
    else if (examMode === "5marks") format = "structured paragraph with 5 key points";
    else if (examMode === "8marks") format = "detailed essay with introduction, body, conclusion";

    const SYSTEM_PROMPT = `
${toneBase}

Subject: ${subject}
Subject Confidence Score: ${currentSubjectConfidence}/100
Language: ${language}
Exam Mode: ${examMode}
Current State: ${studentState}
Verbosity Level: ${verbosityLevel}
Growth Level: ${growthStage}
Goal: ${goal}
Format: ${format}
Instruction: ${moodInstruction}
Additional Style: ${extraHookInstruction}
${fearKillerScript}

Context History:
${memory}

Directives:
1. NEVER break character. You are the Mentor.
2. If analyzing a file, be extremely accurate.
3. Use silences effectively (e.g., "(Pause)...").
4. Be Indian syllabus aware (CBSE / ICSE / State Boards).
5. End with a "Dagger Line" - one sharp truth that stays in their mind.
6. Do not over-scold if the student is already down. Lift them up.
7. Dynamic Length: If user says 'Hi', reply short & witty. If they ask a complex question, explain deeply.
8. Use Metaphors: Use visual examples (e.g., Fear is fog, Laziness is rust) to make it interesting.
`;

    let prompt = `${SYSTEM_PROMPT}\n\nStudent: ${message}`;

    /* ===============================
       8️⃣ INDEXEDDB CONTEXT INJECTION
       =============================== */
    if (Array.isArray(body.largeSubjects)) {
      const extra = body.largeSubjects
        .map(s => `[${s.name}]\n${s.content}`)
        .join("\n\n");
      prompt += `\n\nAdditional Context:\n${extra}`;
    }

    let reply = null;

    /* ===============================
       9️⃣ AI PROVIDER LOGIC (Fallback Chain)
       =============================== */
    
    // 1. Gemini
    if (env.GEMINI_API_KEY) {
      try {
        const parts = [{ text: prompt }];
        if (image) parts.push({ inline_data: { mime_type: "image/jpeg", data: image } });

        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts }] }),
          }
        );
        const d = await r.json();
        reply = d?.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch (e) {}
    }

    // 2. Groq
    if (!reply && !image && env.GROQ_API_KEY) {
      try {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const d = await r.json();
        reply = d?.choices?.[0]?.message?.content;
      } catch {}
    }

    // 3. Cohere
    if (!reply && !image && env.COHERE_API_KEY) {
      try {
        const r = await fetch("https://api.cohere.com/v1/chat", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.COHERE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "command-r-08-2024",
            message,
            preamble: SYSTEM_PROMPT,
          }),
        });
        const d = await r.json();
        reply = d?.text;
      } catch {}
    }

    // 4. Hugging Face
    if (!reply && !image && env.HF_API_KEY) {
      try {
        const r = await fetch(
          "https://router.huggingface.co/hf-inference/models/mistralai/Mistral-7B-Instruct-v0.3",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.HF_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ inputs: `<s>[INST] ${prompt} [/INST]` }),
          }
        );
        const d = await r.json();
        reply = Array.isArray(d) ? d[0]?.generated_text : null;
      } catch {}
    }

    /* ===============================
       🔟 MENTOR FLAVOR ENGINE (Post-Processing)
       =============================== */
    if (reply) {
      reply = addMentorFlavor(reply, examMode, studentState);
      
      // ✅ 6 AM Precision Discipline Ping (UTC -> IST)
      // IST is UTC + 5:30. 6:00 AM IST = 00:30 UTC
      // Window: 6:00 AM to 6:15 AM IST
      const date = new Date();
      const currentUTCMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
      const istTotalMinutes = (currentUTCMinutes + 330) % 1440; // Add 5h 30m offset
      const istHour = Math.floor(istTotalMinutes / 60);
      const istMinute = istTotalMinutes % 60;

      if (istHour === 6 && istMinute >= 0 && istMinute <= 15) {
         reply = "🌅 **6AM Club Alert!** While others sleep, you conquer. Let's start.\n\n" + reply;
      }

      // Add Streak Message
      if (motivationPrefix) reply = motivationPrefix + reply;
    }

    /* ===============================
       1️⃣1️⃣ SAVE MEMORY
       =============================== */
    if (uid !== "guest" && env.APPANA_KV && reply) {
      let mem = `${memory}\nQ: ${message}\nA: ${reply}`;
      if (mem.length > 2000) mem = mem.slice(-2000);
      await env.APPANA_KV.put(`mem:${uid}`, mem, { expirationTtl: 86400 * 3 });
    }

    /* ===============================
       1️⃣2️⃣ FINAL RESPONSE
       =============================== */
    if (!reply) {
      return new Response(
        JSON.stringify({ reply: "⚠️ Connection unclear. Meditate on your connection settings (API Keys)." }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ reply }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ reply: "🔥 Critical Error: " + err.message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
}

// --- HELPER: MENTOR FLAVOR ENGINE (Style & Atmosphere) ---
function addMentorFlavor(text, examMode, studentState) {
  if (examMode === "teacher") return text;

  // 1. Music/Atmosphere Hint (Psychology based)
  const atmospheres = [
    "🎵 _(Background: 'Lakshya' Title Track - Focus Mode)_",
    "🎵 _(Background: Epic Cinematic Drums - Battle Mode)_",
    "🎵 _(Background: Soft Piano & Rain - Deep Study)_",
    "_(Silence... focus only on this)_"
  ];
  
  // High Intensity for Hard/Pre-Exam
  if(examMode === "hard" || examMode === "pre_exam") {
      text += "\n\n🎵 _(Background: High Intensity Beats)_";
  } else {
      // Logic adjustment: Don't add music to every short message to keep it "Hooks" focused
      const isShort = text.length < 100;
      if (!isShort) {
          const music = atmospheres[Math.floor(Math.random() * atmospheres.length)];
          if(Math.random() > 0.6) text += `\n\n${music}`;
      }
  }

  // 2. Character Lock: Strip Casualness
  let refinedText = text
    .replace(/\b(haha|lol|lmao|rofl)\b/gi, "") 
    .replace(/\b(buddy|pal|dude)\b/gi, "dost"); 

  // 3. Smart Emoji Injection (Visual Observation)
  // ✅ ENHANCED DICTIONARY: Added more relevant keywords for richer visuals
  const keywords = {
    // Motivation & Wealth
    "secure": "🛡️", "safe": "🛡️",
    "fast": "⚡", "speed": "⚡",
    "free": "💸", "money": "💸",
    "growth": "📈", "scale": "📈", "success": "🏆", "win": "🏆",
    
    // Academic & Structure
    "brain": "🧠", "smart": "🧠", "think": "🧠",
    "important": "📌", "note": "📌", "remember": "🎗️",
    "focus": "🎯", "goal": "🎯", "target": "🎯",
    "idea": "💡", "truth": "🔥", "concept": "💡",
    
    // New Smart Keys
    "question": "❓", "ask": "❓", "why": "❓",
    "answer": "✅", "solution": "✅", "result": "✅",
    "example": "📝", "sample": "📝",
    "step": "🪜", "process": "🪜",
    "time": "⏳", "clock": "⏳", "minute": "⏳",
    "book": "📖", "read": "📖", "study": "📖",
    "write": "✍️", "exam": "✍️",
    "fail": "❌", "mistake": "❌", "error": "❌",
    "alert": "⚠️", "warning": "⚠️"
  };

  let lines = refinedText.split("\n");
  let emojiCount = 0;
  
  // ✅ INCREASED LIMITS: Slightly higher thresholds for more visuals
  let maxEmojis = 7; // Up from 4
  if (examMode === "2marks") maxEmojis = 2; // Up from 1
  if (examMode === "hard" || examMode === "parent") maxEmojis = 4; // Up from 2

  const processedLines = lines.map(line => {
    if (emojiCount >= maxEmojis) return line;
    
    for (let key in keywords) {
      const regex = new RegExp(`\\b${key}\\b`, 'i');
      if (regex.test(line) && !line.includes(keywords[key])) {
         // Mentor style: Emoji at start, not middle
         line = `${keywords[key]} ${line}`; 
         emojiCount++;
         break; 
      }
    }
    return line;
  });

  return processedLines.join("\n");
}

export function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
                    }
    
