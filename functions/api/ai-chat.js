// ai-chat.js (v2.1 FINAL – Professional & Exam-Ready)

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
        JSON.stringify({ status: ok ? "ok" : "fail", keys_detected: keys }),
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
       3️⃣ RATE LIMIT (KV)
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
       4️⃣ SMART CONTEXT (MEMORY)
       =============================== */
    let memory = "";
    if (uid !== "guest" && env.APPANA_KV) {
      memory = (await env.APPANA_KV.get(`mem:${uid}`)) || "";
    }

    /* ===============================
       5️⃣ DYNAMIC SYSTEM PROMPT
       =============================== */
    let tone = "friendly, encouraging, exam-focused mentor";
    let format = "clear and concise bullet points";

    if (examMode === "teacher") tone = "strict, formal, precise Indian syllabus teacher";
    else if (examMode === "2marks") format = "2–3 sentences, exam-oriented";
    else if (examMode === "5marks") format = "structured paragraph with 5 key points";
    else if (examMode === "8marks") format = "detailed essay with introduction, body, conclusion";

    const SYSTEM_PROMPT = `
You are Appana AI.
Role: ${tone}
Subject: ${subject}
Language: ${language}
Exam Mode: ${examMode}
Goal/Target: ${goal}
Format Requirement: ${format}

Context History:
${memory}

Instructions:
1. Use IndexedDB large subjects automatically when provided.
2. Be Indian syllabus aware (CBSE / ICSE / NBSE / State Boards).
3. Keep explanations clear, accurate, and exam-relevant.
4. Use emojis sparingly and professionally:
   - Maximum ONE emoji per full response
   - NEVER use emojis in definitions, formulas, or exam answers
   - Emojis allowed only for guidance or motivation
5. Analyze any provided file or PDF content first.
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
    let debugLog = [];

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
      } catch (e) {
        debugLog.push(`Gemini failed`);
      }
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
       1️⃣1️⃣ PROFESSIONAL EMOJI LOGIC
       =============================== */
    if (reply && !["2marks", "5marks", "8marks", "teacher"].includes(examMode)) {
      const text = reply.toLowerCase();
      let emoji = "";
      if (text.includes("important")) emoji = "📌";
      else if (text.includes("remember")) emoji = "💡";
      else if (text.includes("warning")) emoji = "⚠️";
      else if (text.includes("excellent")) emoji = "✅";

      if (emoji) reply = `${emoji} ${reply}`;
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

export function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
  }
