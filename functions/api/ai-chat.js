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
      examMode = "normal", // ✅ NEW: Capture Exam Mode
      uid = "guest",
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
       5️⃣ DYNAMIC SYSTEM PROMPT (NEW FEATURES)
       =============================== */
    // ✅ Logic: Change personality based on Exam Mode
    let tone = "friendly, encouraging, and exam-focused mentor";
    let format = "concise and clear bullet points";
    
    if (examMode === "teacher") {
        tone = "strict, formal, and precise teacher. Do not be overly friendly. Focus on accuracy.";
    } else if (examMode === "2marks") {
        format = "very short, 2-3 sentences max (Standard 2 Marks Exam Style).";
    } else if (examMode === "5marks") {
        format = "structured paragraph with 5 key points (Standard 5 Marks Exam Style).";
    } else if (examMode === "8marks") {
        format = "detailed essay style with introduction, body, and conclusion (Standard 8 Marks Exam Style).";
    }

    const SYSTEM_PROMPT = `
You are Appana AI 🦅.
Role: ${tone}
Subject: ${subject}
Language: ${language}
Format Requirement: ${format}

Context History:
${memory}

Instructions:
1. If the user sends text extracted from a file, analyze it first.
2. If the user asks to "Generate a Passage", create a unique reading comprehension passage with questions.
3. Be Indian-context aware (CBSE/ICSE/State Board style).
`;

    const prompt = `${SYSTEM_PROMPT}\n\nStudent: ${message}`;
    let reply = null;
    let debugLog = []; 

    /* ===============================
       6️⃣ GEMINI (Primary - Best for Vision & Logic)
       =============================== */
    if (env.GEMINI_API_KEY) {
      try {
        const parts = [{ text: prompt }];
        if (image) parts.push({ inline_data: { mime_type: "image/jpeg", data: image } });

        // ✅ Using 'gemini-1.5-flash' for speed and cost-efficiency
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
    } else {
      debugLog.push("⚠️ Gemini: No API Key found");
    }

    /* ===============================
       7️⃣ GROQ (Fallback 1 - Fast Text)
       =============================== */
    if (!reply && !image && env.GROQ_API_KEY) {
      try {
        // ✅ Using Llama 3.3 Versatile
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
      } catch (e) {
        debugLog.push(`❌ Groq: ${e.message}`);
      }
    }

    /* ===============================
       8️⃣ COHERE (Fallback 2 - Stable)
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
      } catch (e) {
        debugLog.push(`❌ Cohere: ${e.message}`);
      }
    }

    /* ===============================
       9️⃣ HUGGING FACE (Fallback 3 - Last Resort)
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
      } catch (e) {
        debugLog.push(`❌ HuggingFace: ${e.message}`);
      }
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

    // ✅ SAVE MEMORY (Smart Trimming - Last 2000 chars)
    if (uid !== "guest" && env.APPANA_KV && !image) {
      let newMem = (memory + `\nQ: ${message}\nA: ${reply}`);
      if(newMem.length > 2000) newMem = newMem.substring(newMem.length - 2000); // Keep tokens low
      await env.APPANA_KV.put(`mem:${uid}`, newMem, { expirationTtl: 86400 * 3 }); // 3 Days
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
    
