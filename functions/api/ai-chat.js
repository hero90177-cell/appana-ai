export async function onRequestPost({ request, env }) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const body = await request.json();

    /* ===============================
       1️⃣ HEALTH CHECK
       =============================== */
    if (body.type === "ping") {
      const ok = !!(
        env.GEMINI_API_KEY ||
        env.GROQ_API_KEY ||
        env.COHERE_API_KEY ||
        env.HF_API_KEY
      );

      return new Response(
        JSON.stringify({ status: ok ? "ok" : "fail" }),
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
       2️⃣ RATE LIMIT
       =============================== */
    if (env.APPANA_KV) {
      const rateKey = `rate:${uid}`;
      const count = Number(await env.APPANA_KV.get(rateKey)) || 0;

      if (count >= 50)
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded." }),
          { status: 429, headers: { ...cors, "Content-Type": "application/json" } }
        );

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
- Be encouraging and exam-focused
- If an image is sent, analyze it carefully
`;

    const prompt = `${SYSTEM_PROMPT}\n\nStudent: ${message}`;
    let reply = null;

    /* ===============================
       4️⃣ GEMINI (IMAGE + TEXT)
       =============================== */
    if (env.GEMINI_API_KEY) {
      try {
        const parts = [{ text: prompt }];
        if (image) {
          parts.push({
            inline_data: { mime_type: "image/jpeg", data: image },
          });
        }

        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts }] }),
          }
        );
        const d = await r.json();
        reply = d?.candidates?.[0]?.content?.parts?.[0]?.text || null;
      } catch (e) { console.log("❌ Gemini failed", e); }
    }

    /* ===============================
       5️⃣ GROQ (TEXT ONLY)
       =============================== */
    if (!reply && !image && env.GROQ_API_KEY) {
      try {
        const r = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.GROQ_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "llama3-8b-8192",
              messages: [{ role: "user", content: prompt }],
            }),
          }
        );
        const d = await r.json();
        reply = d?.choices?.[0]?.message?.content || null;
      } catch (e) { console.log("❌ Groq failed", e); }
    }

    /* ===============================
       6️⃣ COHERE (TEXT ONLY)
       =============================== */
    if (!reply && !image && env.COHERE_API_KEY) {
      try {
        const r = await fetch("https://api.cohere.com/v1/chat", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.COHERE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: "command-r", message, preamble: SYSTEM_PROMPT }),
        });
        const d = await r.json();
        reply = d?.text || null;
      } catch (e) { console.log("❌ Cohere failed", e); }
    }

    /* ===============================
       7️⃣ HUGGING FACE (TEXT ONLY)
       =============================== */
    if (!reply && !image && env.HF_API_KEY) {
      try {
        const r = await fetch(
          "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3",
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
        if (Array.isArray(d)) reply = d[0]?.generated_text || null;
      } catch (e) { console.log("❌ HuggingFace failed", e); }
    }

    if (!reply) throw new Error("All AI Brains are offline.");

    /* ===============================
       8️⃣ SAVE MEMORY
       =============================== */
    if (uid !== "guest" && env.APPANA_KV && !image) {
      const updated = (memory + `\nUser: ${message}\nAI: ${reply}`).split("\n").slice(-20).join("\n");
      await env.APPANA_KV.put(`mem:${uid}`, updated, { expirationTtl: 86400 * 7 });
    }

    return new Response(JSON.stringify({ reply }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
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
