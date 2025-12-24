// ai-chat.js (v2.2 FINAL – Mentor Edition, SKT Name Removed)
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
          JSON.stringify({ reply: "⚠️ You are chatting too fast. Please wait 1 minute." }),
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

      // Streak Logic (New)
      const today = new Date().toISOString().split('T')[0];
      const lastSeen = await env.APPANA_KV.get(`last_seen:${uid}`);
      
      if (lastSeen !== today) {
        let streak = Number(await env.APPANA_KV.get(`streak:${uid}`)) || 0;
        const yesterday = new Date(Date.now() - 864e5).toISOString().split('T')[0];
        
        if (lastSeen === yesterday) {
          streak++;
          motivationPrefix = `🔥 **${streak} Day Streak!** You are on fire!\n\n`;
        } else {
          streak = 1;
          motivationPrefix = `🚀 **Day 1.** New beginnings. Let's conquer this!\n\n`;
        }
        await env.APPANA_KV.put(`last_seen:${uid}`, today);
        await env.APPANA_KV.put(`streak:${uid}`, streak);
      }
    }

    /* ===============================
       5️⃣ MENTOR SYSTEM PROMPT
       =============================== */
    
    // Psychology/Mood Check
    let moodInstruction = "Be High Energy, Inspiring, and punchy.";
    if (message.match(/(scared|fail|can't|fear)/i)) {
      moodInstruction = "Student is fearful. Be calm, brotherly, and supportive. Say 'I believe in you'.";
    }

    let tone = "You are a Wise Mentor, guiding students with clarity, discipline, and heart.";
    let format = "clear and concise bullet points";

    if (examMode === "teacher") {
        tone = "You are a strict, formal, precise Indian syllabus teacher.";
        moodInstruction = "No motivation. Just facts.";
    }
    else if (examMode === "2marks") format = "2–3 sentences, exam-oriented";
    else if (examMode === "5marks") format = "structured paragraph with 5 key points";
    else if (examMode === "8marks") format = "detailed essay with introduction, body, conclusion";

    const SYSTEM_PROMPT = `
${tone}
Subject: ${subject}
Language: ${language}
Exam Mode: ${examMode}
Goal/Target: ${goal}
Format Requirement: ${format}
Current Mood Instruction: ${moodInstruction}

Context History:
${memory}

Instructions:
1. Use IndexedDB large subjects automatically when provided.
2. Be Indian syllabus aware (CBSE / ICSE / NBSE / State Boards).
3. Keep explanations clear, accurate, and exam-relevant.
4. Use emojis sparingly and professionally (Visual Observation logic).
5. If the user is lazy, politely roast them to wake them up.
6. Generate original passages when asked for comprehension.
`;

    let prompt = `${SYSTEM_PROMPT}\n\nStudent: ${message}`;

    /* ===============================
       6️⃣ INDEXEDDB CONTEXT INJECTION
       =============================== */
    if (Array.isArray(body.largeSubjects)) {
      const extra = body.largeSubjects
        .map(s => `[${s.name}]\n${s.content}`)
        .join("\n\n");
      prompt += `\n\nAdditional Context:\n${extra}`;
    }

    let reply = null;

    /* ===============================
       7️⃣ GEMINI
       =============================== */
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

    /* ===============================
       8️⃣ GROQ
       =============================== */
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

    /* ===============================
       9️⃣ COHERE
       =============================== */
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

    /* ===============================
       🔟 HUGGING FACE
       =============================== */
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
       1️⃣1️⃣ MENTOR FLAVOR (VISUAL EMOJIS + MUSIC)
       =============================== */
    if (reply) {
      reply = addMentorFlavor(reply, examMode);
      
      // Add Streak Message
      if (motivationPrefix) reply = motivationPrefix + reply;
    }

    /* ===============================
       🔁 SAVE MEMORY
       =============================== */
    if (uid !== "guest" && env.APPANA_KV && reply) {
      let mem = `${memory}\nQ: ${message}\nA: ${reply}`;
      if (mem.length > 2000) mem = mem.slice(-2000);
      await env.APPANA_KV.put(`mem:${uid}`, mem, { expirationTtl: 86400 * 3 });
    }

    /* ===============================
       🔟 FINAL RESPONSE
       =============================== */
    if (!reply) {
      return new Response(
        JSON.stringify({ reply: "⚠️ All AI providers failed. Check API keys." }),
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

// --- HELPER: MENTOR FLAVOR ENGINE ---
function addMentorFlavor(text, examMode) {
  if (examMode === "teacher") return text;

  // 1. Music Hint
  const tracks = [
    "🎵 _Background: 'Lakshya' Title Track (Focus Mode)_",
    "🎵 _Background: Epic Cinematic Drums (Battle Mode)_",
    "🎵 _Background: Soft Piano & Rain (Deep Study)_"
  ];
  const music = tracks[Math.floor(Math.random() * tracks.length)];

  // 2. Smart Emoji Injection (Visual Observation)
  const keywords = {
    "secure": "🛡️", "safe": "🛡️",
    "fast": "⚡", "speed": "⚡",
    "free": "💸", "money": "💸",
    "growth": "📈", "scale": "📈",
    "brain": "🧠", "smart": "🧠",
    "important": "📌", "note": "📌",
    "success": "🏆", "win": "🏆",
    "focus": "🎯", "goal": "🎯",
    "idea": "💡"
  };

  let lines = text.split("\n");
  let emojiCount = 0;
  
  // Set Limits
  let maxEmojis = 4;
  if (examMode === "2marks") maxEmojis = 1;
  if (examMode === "5marks") maxEmojis = 2;

  const processedLines = lines.map(line => {
    if (emojiCount >= maxEmojis) return line;
    
    for (let key in keywords) {
      const regex = new RegExp(`\\b${key}\\b`, 'i');
      if (regex.test(line) && !line.includes(keywords[key])) {
         line = `${keywords[key]} ${line}`; 
         emojiCount++;
         break;
      }
    }
    return line;
  });

  return processedLines.join("\n") + `\n\n${music}`;
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
