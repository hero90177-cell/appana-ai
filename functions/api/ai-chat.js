export async function onRequestPost({ request, env }) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const body = await request.json();

    // 1. Health Check
    if (body.type === "ping") {
      const ok = !!(env.GEMINI_API_KEY || env.GROQ_API_KEY);
      return new Response(JSON.stringify({ status: ok ? "ok" : "fail" }), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    const {
      message = "",
      subject = "General",
      language = "English",
      uid = "guest",
    } = body;

    // 2. Rate Limit (KV)
    if (env.APPANA_KV) {
        const rateKey = `rate:${uid}`;
        const count = Number((await env.APPANA_KV.get(rateKey)) || 0);
        if (count > 50) {
            return new Response(
                JSON.stringify({ error: "Rate limit exceeded." }),
                { status: 429, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }
        await env.APPANA_KV.put(rateKey, count + 1, { expirationTtl: 60 });
    }

    // 3. Load Memory (RESTORED)
    let memory = "";
    if (uid !== "guest" && env.APPANA_KV) {
      memory = (await env.APPANA_KV.get(`mem:${uid}`)) || "";
    }

    const SYSTEM_PROMPT = `
You are Appana AI 🦅, an Indian Study Mentor.
Subject: ${subject} | Language: ${language}
Previous Context: ${memory}

Instructions:
- Be encouraging and exam-focused.
- If asked for notes, provide bullet points.
- If asked for a quiz, provide questions with answers hidden at the end.
`;

    const prompt = SYSTEM_PROMPT + "\n\nStudent: " + message;
    let reply = "";

    // 4. AI Cascade (RESTORED ALL 4)
    
    // --- Attempt 1: Gemini ---
    if (env.GEMINI_API_KEY) {
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          }
        );
        const d = await r.json();
        reply = d?.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch (e) { console.log("Gemini failed", e); }
    }

    // --- Attempt 2: Groq ---
    if (!reply && env.GROQ_API_KEY) {
      try {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama3-8b-8192",
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const d = await r.json();
        reply = d?.choices?.[0]?.message?.content;
      } catch (e) { console.log("Groq failed", e); }
    }

    // --- Attempt 3: Cohere ---
    if (!reply && env.COHERE_API_KEY) {
      try {
        const r = await fetch("https://api.cohere.com/v1/chat", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.COHERE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "command-r",
            message: message,
            preamble: SYSTEM_PROMPT,
          }),
        });
        const d = await r.json();
        reply = d?.text;
      } catch (e) { console.log("Cohere failed", e); }
    }

    // --- Attempt 4: HuggingFace ---
    if (!reply && env.HF_API_KEY) {
      try {
        const r = await fetch(
          "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.HF_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ inputs: `[INST] ${prompt} [/INST]` }),
          }
        );
        const d = await r.json();
        reply = Array.isArray(d) ? d[0]?.generated_text : "";
      } catch (e) { console.log("HF failed", e); }
    }

    if (!reply) throw new Error("All AI Brains are offline.");

    // 5. Save Memory (RESTORED)
    if (uid !== "guest" && env.APPANA_KV) {
      // Keep last 10 exchanges to save KV space
      const updated = (memory + `\nUser: ${message}\nAI: ${reply}`).split("\n").slice(-20).join("\n");
      await env.APPANA_KV.put(`mem:${uid}`, updated, { expirationTtl: 86400 * 7 }); // 7 days
    }

    return new Response(JSON.stringify({ reply }), {
      headers: { "Content-Type": "application/json", ...cors },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...cors },
    });
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
  
