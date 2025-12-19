export async function onRequestPost({ request, env }) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const body = await request.json();

    /* ===============================
       1️⃣ HEALTH CHECK & KEY DIAGNOSIS
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

    const {
      message = "",
      image = null,
      subject = "General",
      language = "English",
      uid = "guest",
    } = body;

    if (!message && !image) throw new Error("No input provided");

    /* ===============================
       2️⃣ RATE LIMIT (KV)
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
       3️⃣ LOAD MEMORY
       =============================== */
    let memory = "";
    if (uid !== "guest" && env.APPANA_KV) {
      memory = (await env.APPANA_KV.get(`mem:${uid}`)) || "";
    }

    const SYSTEM_PROMPT = `
You are Appana AI 🦅, an Indian Study Mentor.
Subject: ${subject}
Language: ${language}
Previous Context:
${memory}

Instructions:
- Be encouraging and exam-focused.
- If an image is sent, analyze it carefully.
- Keep answers concise and helpful.
`;

    const prompt = `${SYSTEM_PROMPT}\n\nStudent: ${message}`;
    let reply = null;
    let debugLog = []; 

    /* ===============================
       4️⃣ GEMINI (Primary - Image + Text)
       =============================== */
    if (env.GEMINI_API_KEY) {
      try {
        const parts = [{ text: prompt }];
        if (image) parts.push({ inline_data: { mime_type: "image/jpeg", data: image } });

        // FIX 1: Updated Model Name for Stability
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${env.GEMINI_API_KEY}`,
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
       5️⃣ GROQ (Fallback 1 - Text Only)
       =============================== */
    if (!reply && !image && env.GROQ_API_KEY) {
      try {
        // FIX 2: Updated to Llama 3.3 (Latest supported)
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
        console.error("Groq Error:", e);
        debugLog.push(`❌ Groq: ${e.message}`);
      }
    }

    /* ===============================
       6️⃣ COHERE (Fallback 2 - Text Only)
       =============================== */
    if (!reply && !image && env.COHERE_API_KEY) {
      try {
        // FIX 3: Updated to 'command-r-08-2024' (Newest supported)
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
        console.error("Cohere Error:", e);
        debugLog.push(`❌ Cohere: ${e.message}`);
      }
    }

    /* ===============================
       7️⃣ HUGGING FACE (Fallback 3 - Text Only)
       =============================== */
    if (!reply && !image && env.HF_API_KEY) {
      try {
        // FIX 4: Updated URL to 'router.huggingface.co'
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
        console.error("HF Error:", e);
        debugLog.push(`❌ HuggingFace: ${e.message}`);
      }
    }

    /* ===============================
       8️⃣ FINAL RESPONSE OR ERROR REPORT
       =============================== */
    if (!reply) {
      return new Response(
        JSON.stringify({ 
          reply: "⚠️ **System Diagnosis:**\nAll AI brains failed. Here is why:\n\n" + debugLog.join("\n") + "\n\n💡 _Check your Cloudflare 'Settings > Variables' to fix the keys._"
        }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // Success! Save Memory & Return
    if (uid !== "guest" && env.APPANA_KV && !image) {
      const updated = (memory + `\nUser: ${message}\nAI: ${reply}`).split("\n").slice(-20).join("\n");
      await env.APPANA_KV.put(`mem:${uid}`, updated, { expirationTtl: 86400 * 7 });
    }

    return new Response(JSON.stringify({ reply }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(
      JSON.stringify({ reply: "🔥 Critical System Error: " + err.message }), 
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
  
