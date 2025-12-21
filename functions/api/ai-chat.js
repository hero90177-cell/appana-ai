// ai-chat.js (v2.0 Improved Ultra-Powerful AI Response)

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
        hf: !!env.HF_API_KEY
      };
      const ok = Object.values(keys).some(k => k);
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
      goal = "",         // ✅ Optional Goal/Target
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
    let tone = "friendly, encouraging, and exam-focused mentor";
    let format = "concise and clear bullet points";

    // Adjust tone/format per examMode
    if (examMode === "teacher") {
        tone = "strict, formal, precise teacher, Indian syllabus aware";
    } else if (examMode === "2marks") {
        format = "short 2-3 sentences max, exam-style";
    } else if (examMode === "5marks") {
        format = "structured paragraph with 5 key points";
    } else if (examMode === "8marks") {
        format = "detailed essay style with introduction, body, conclusion";
    }

    // Add goal and subject in prompt
    const SYSTEM_PROMPT = `
You are Appana AI 🦅
Role: ${tone}
Subject: ${subject}
Language: ${language} (Use plain Indian English if requested)
Exam Mode: ${examMode}
Goal/Target: ${goal}
Format Requirement: ${format}

Context History:
${memory}

Instructions:
1. Access IndexedDB large subjects automatically for context.
2. Be Indian-context aware (CBSE/ICSE/NBSE/state boards style).
3. Always include friendly, motivating, syllabus-aligned advice.
4. Dynamically insert emojis per sentence to enhance readability and engagement.
5. Can access school boards, college portals, competitive exams websites for live guidance (placeholder).
6. If message contains file text or PDF content, analyze it first.
7. For passage generation, create unique reading comprehension passages with questions.
`;

    // Append message
    let prompt = `${SYSTEM_PROMPT}\n\nStudent: ${message}`;

    /* ===============================
       6️⃣ INDEXEDDB CONTEXT INJECTION
       =============================== */
    // ✅ Inject large subjects from IndexedDB (auto-access)
    // Placeholder: in Cloudflare Worker cannot access IndexedDB directly,
    // but on client-side ui-manager.js handles it. AI gets content via "context injection"
    // If body.largeSubjects sent, append their content:
    if (body.largeSubjects && Array.isArray(body.largeSubjects)) {
      const largeText = body.largeSubjects.map(s => `\n[${s.name}]: ${s.content}`).join("\n");
      prompt += `\n\nAdditional Context (Large Subjects): ${largeText}`;
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
        if (d.error) throw new Error(d.error.message);
        reply = d?.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch (e) {
        console.error("Gemini Error:", e);
        debugLog.push(`❌ Gemini: ${e.message || "Unknown Error"}`);
      }
    } else debugLog.push("⚠️ Gemini: No API Key found");

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
        if (d.error) throw new Error(d.error.message);
        reply = d?.choices?.[0]?.message?.content;
      } catch (e) { debugLog.push(`❌ Groq: ${e.message}`); }
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
              preamble: SYSTEM_PROMPT
          }),
        });
        const d = await r.json();
        if (d.message) throw new Error(d.message);
        reply = d?.text;
      } catch (e) { debugLog.push(`❌ Cohere: ${e.message}`); }
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
        if (d.error) throw new Error(d.error);
        if (Array.isArray(d)) reply = d[0]?.generated_text;
      } catch (e) { debugLog.push(`❌ HuggingFace: ${e.message}`); }
    }

    /* ===============================
       1️⃣1️⃣ EMOJI LOGIC (DYNAMIC) 
       =============================== */
    if (reply) {
      const sentences = reply.split(/([.!?]\s)/g);
      reply = sentences.map(s => {
        const trim = s.trim();
        if (!trim) return s;
        let emoji = "";
        if (trim.toLowerCase().includes("good") || trim.toLowerCase().includes("well")) emoji = "✅";
        else if (trim.toLowerCase().includes("warning") || trim.toLowerCase().includes("fast")) emoji = "⚠️";
        else if (trim.toLowerCase().includes("error") || trim.toLowerCase().includes("fail")) emoji = "❌";
        else if (trim.toLowerCase().includes("exam") || trim.toLowerCase().includes("time")) emoji = "⏰";
        else if (trim.toLowerCase().includes("note") || trim.toLowerCase().includes("tip")) emoji = "💡";
        else if (trim.toLowerCase().includes("amazing") || trim.toLowerCase().includes("great")) emoji = "🎉";
        return trim + " " + emoji;
      }).join(" ");
    }

    /* ===============================
       🔁 SAVE MEMORY (Smart Trim)
       =============================== */
    if (uid !== "guest" && env.APPANA_KV && !image) {
      let newMem = memory + `\nQ: ${message}\nA: ${reply}`;
      if (newMem.length > 2000) newMem = newMem.substring(newMem.length - 2000);
      await env.APPANA_KV.put(`mem:${uid}`, newMem, { expirationTtl: 86400 * 3 });
    }

    /* ===============================
       🔟 FINAL RESPONSE
       =============================== */
    if (!reply) {
      return new Response(
        JSON.stringify({
          reply: "⚠️ **System Diagnosis:**\nAll AI brains failed. Debug Info:\n\n" + debugLog.join("\n") + "\n\n💡 _Check Cloudflare Keys._"
        }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ reply }), { headers: { ...cors, "Content-Type": "application/json" } });

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
