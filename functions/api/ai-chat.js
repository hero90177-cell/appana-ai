// ai-chat.js (v3.0 FINAL – "Appana Guru" Mentor Edition)
// Implements: Spiritual Tone, Fear Killers, Psychology Layer, & Multi-Provider Fallback

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
        JSON.stringify({ status: ok ? "ok" : "fail", mode: "Mentor-Engine", keys_detected: keys }),
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
      examMode = "normal",
      uid = "guest",
      goal = "",
    } = body;

    if (!message && !image) throw new Error("No input provided");

    /* ===============================
       3️⃣ RATE LIMIT (KV) - PRESERVED
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
       4️⃣ SMART CONTEXT (MEMORY) & STREAK
       =============================== */
    let memory = "";
    let motivationPrefix = "";

    if (uid !== "guest" && env.APPANA_KV) {
      // Memory
      memory = (await env.APPANA_KV.get(`mem:${uid}`)) || "";

      // Streak Logic
      const today = new Date().toISOString().split('T')[0];
      const lastSeen = await env.APPANA_KV.get(`last_seen:${uid}`);
      
      if (lastSeen !== today) {
        let streak = Number(await env.APPANA_KV.get(`streak:${uid}`)) || 0;
        // Check if yesterday
        const yesterday = new Date(Date.now() - 864e5).toISOString().split('T')[0];
        
        if (lastSeen === yesterday) {
          streak++;
          motivationPrefix = `🔥 **${streak} Day Streak.** consistency hi safalta hai.\n\n`;
        } else {
          streak = 1;
          motivationPrefix = `🚀 **Day 1.** Aaj shuru kiya hai. Ab rukna mat.\n\n`;
        }
        await env.APPANA_KV.put(`last_seen:${uid}`, today);
        await env.APPANA_KV.put(`streak:${uid}`, streak);
      }
    }

    /* ===============================
       5️⃣ FEAR KILLER INJECTION (Dynamic Wisdom)
       =============================== */
    let specializedWisdom = "";
    const lowerMsg = message.toLowerCase();

    // Subject-Wise Fear Killers (The "Golden Scripts")
    if (lowerMsg.includes("math") || lowerMsg.includes("calculation")) {
      specializedWisdom = `WISDOM: "Maths tumhara dushman nahi hai. Tumhara darr tumhara dushman hai. Maths sirf practice maangta hai, bahana nahi."`;
    } 
    else if (lowerMsg.includes("account") || lowerMsg.includes("balance sheet")) {
      specializedWisdom = `WISDOM: "Accounts yaad rakhne ka subject nahi, samajhne ka hai. Jo samajh gaya, use exam hall mein darr nahi lagta."`;
    }
    else if (lowerMsg.includes("english") || lowerMsg.includes("essay")) {
      specializedWisdom = `WISDOM: "English marks ka game nahi, clarity ka game hai. Simple likho, seedha likho. Exam Shakespeare nahi maang raha."`;
    }
    else if (lowerMsg.includes("fear") || lowerMsg.includes("scared") || lowerMsg.includes("darr")) {
      specializedWisdom = `WISDOM: "Ruk. Bhaag mat. Main sach bol raha hoon. Aaj padhai se bhaag rahe ho, kal zindagi bhaagne nahi degi. Darr ko fuel banao."`;
    }

    /* ===============================
       6️⃣ DYNAMIC SYSTEM PROMPT (The Mentor Blueprint)
       =============================== */
    
    // Default Persona: The Guru (Mentor)
    let basePersona = `You are 'Appana Guru'. You are NOT an AI assistant. You are a Mentor (Guru).
    Tone: Heavy, Calm, Unshakeable, Spiritual but Logical.
    Style: Short punchy sentences. Blend English and Hinglish naturally.
    Philosophy: Truth > Comfort. Discipline > Motivation.
    Core Rule: Never say "You can do it". Say "You have no choice but to do it."`;
    
    let format = "clear bullet points with psychological pauses";
    let moodInstruction = "Be authoritative. Use 'Command -> Pause -> Truth' structure.";

    // Mode Overrides
    if (examMode === "teacher") {
        basePersona = "You are a strict, formal Indian syllabus teacher. No emotion. Just facts.";
        moodInstruction = "Precise definitions only.";
    }
    else if (examMode === "2marks") format = "2–3 sentences, sharp & precise";
    else if (examMode === "5marks") format = "structured paragraph with 5 key points";
    else if (examMode === "8marks") format = "detailed essay with introduction, body, conclusion";

    const SYSTEM_PROMPT = `
${basePersona}

Subject: ${subject}
Language: ${language}
Exam Mode: ${examMode}
Goal: ${goal}
Format: ${format}
Current Instruction: ${moodInstruction}
${specializedWisdom}

Context History:
${memory}

Directives:
1. If the student is lazy, WAKE THEM UP. Do not coddle.
2. Use silences effectively (e.g., "(Pause)...").
3. Be Indian syllabus aware (CBSE / ICSE / State Boards).
4. Never say "As an AI". You are a presence.
5. If analyzing a file, be extremely accurate.
6. End with a "Dagger Line" - one sharp truth that stays in their mind.
`;

    let prompt = `${SYSTEM_PROMPT}\n\nStudent: ${message}`;

    /* ===============================
       7️⃣ INDEXEDDB CONTEXT INJECTION
       =============================== */
    if (Array.isArray(body.largeSubjects)) {
      const extra = body.largeSubjects
        .map(s => `[${s.name}]\n${s.content}`)
        .join("\n\n");
      prompt += `\n\nAdditional Context:\n${extra}`;
    }

    let reply = null;

    /* ===============================
       8️⃣ AI PROVIDER LOGIC (Gemini -> Groq -> Cohere -> HF)
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
       9️⃣ MENTOR FLAVOR ENGINE (Post-Processing)
       =============================== */
    if (reply) {
      reply = addMentorFlavor(reply, examMode);
      
      // Add Streak Message (If applicable)
      if (motivationPrefix) reply = motivationPrefix + reply;
    }

    /* ===============================
       🔟 SAVE MEMORY
       =============================== */
    if (uid !== "guest" && env.APPANA_KV && reply) {
      let mem = `${memory}\nQ: ${message}\nA: ${reply}`;
      if (mem.length > 2000) mem = mem.slice(-2000);
      await env.APPANA_KV.put(`mem:${uid}`, mem, { expirationTtl: 86400 * 3 });
    }

    /* ===============================
       1️⃣1️⃣ FINAL RESPONSE
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
function addMentorFlavor(text, examMode) {
  if (examMode === "teacher") return text;

  // 1. Psychological Atmosphere (Silence > Music)
  const atmospheres = [
    "_(Silence... focus only on this)_",
    "_(Deep Breath... Listen)_",
    "🎵 _(Background: Slow Intensity)_"
  ];
  // Randomly add atmosphere at the end (30% chance) to not annoy
  const atmosphere = Math.random() > 0.7 ? `\n\n${atmospheres[Math.floor(Math.random() * atmospheres.length)]}` : "";

  // 2. Character Lock: Strip Casualness
  let refinedText = text
    .replace(/\b(haha|lol|lmao|rofl)\b/gi, "") // Remove laughter
    .replace(/\b(buddy|pal|dude)\b/gi, "dost"); // Use heavy words

  // 3. Smart Emoji Injection (Controlled)
  const keywords = {
    "secure": "🛡️", "safe": "🛡️",
    "fast": "⚡", "speed": "⚡",
    "free": "💸", "money": "💸",
    "growth": "📈", "scale": "📈",
    "brain": "🧠", "smart": "🧠",
    "important": "📌", "note": "📌",
    "success": "🏆", "win": "🏆",
    "focus": "🎯", "goal": "🎯",
    "idea": "💡", "truth": "🔥"
  };

  let lines = refinedText.split("\n");
  let emojiCount = 0;
  
  // Strict Limits for Mentor Tone
  let maxEmojis = 3; 
  if (examMode === "2marks") maxEmojis = 1;

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

  return processedLines.join("\n") + atmosphere;
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
    
