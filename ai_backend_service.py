# ai_backend_service.py
# Appana AI – Final Unified Server (vSKT-Ultimate)
# Integrates: OCR (Tesseract/PDF), Multi-AI Fallback (Gemini/Groq/Cohere/HF), Memory, SKT Motivation Engine
# Run with: python ai_backend_service.py

from fastapi import FastAPI, UploadFile, File, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import pytesseract
import pdfplumber
from PIL import Image, ImageOps
import io
import uvicorn
import os
import httpx
import json
import re
import random
from datetime import datetime, timedelta

app = FastAPI()

# ---------------------------------------------------------
# 1. CONFIGURATION
# ---------------------------------------------------------

# Set your keys here or in system environment variables
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "") 
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
COHERE_API_KEY = os.getenv("COHERE_API_KEY", "")
HF_API_KEY = os.getenv("HF_API_KEY", "")

# Storage
CHAT_MEMORY = {} 
STREAK_DB = {} # Stores {uid: {"last_seen": "YYYY-MM-DD", "streak": 0}}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OCR_LANGS = "eng+hin"

# ---------------------------------------------------------
# 2. SKT & MOTIVATION HELPERS
# ---------------------------------------------------------

def get_skt_music_hint(mood="focus"):
    tracks = [
        "🎵 [Background Music: 'Unstoppable' - High Energy Instrumental]",
        "🎵 [Background Music: 'Lakshya' Title Track - Motivational Lo-Fi]",
        "🎵 [Background Music: Epic Orchestral - Battle Mode]",
        "🎵 [Background Music: 'Aarambh Hai Prachand' - Intense Focus]"
    ]
    if mood == "exam":
        return "🎵 [Background Music: 40Hz Binaural Beats for Deep Focus]"
    return random.choice(tracks)

def check_and_update_streak(uid):
    if uid == "guest": return None
    
    today = datetime.now().strftime("%Y-%m-%d")
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    
    user_data = STREAK_DB.get(uid, {"last_seen": "", "streak": 0})
    
    msg = None
    if user_data["last_seen"] == today:
        pass # Already studied today
    elif user_data["last_seen"] == yesterday:
        user_data["streak"] += 1
        msg = f"🔥 **{user_data['streak']} Day Streak!** You are UNSTOPPABLE! Keep grinding!"
    else:
        user_data["streak"] = 1
        msg = "🚀 **Day 1.** A new beginning. Let's build a legacy starting NOW!"
        
    user_data["last_seen"] = today
    STREAK_DB[uid] = user_data
    return msg

def apply_smart_emojis(text, exam_mode):
    """
    Injects emojis based on visual observation keywords but respects exam limits.
    """
    # 1. Define Limits
    max_emojis = 4
    if exam_mode == "2marks": max_emojis = 1
    elif exam_mode == "5marks": max_emojis = 3
    elif exam_mode == "8marks": max_emojis = 5
    elif exam_mode == "teacher": return text # Strict teacher = No emojis

    # 2. Keyword Map (Visual Observation)
    keyword_map = {
        r"\b(secure|security|safe)\b": "🛡️",
        r"\b(fast|quick|speed)\b": "⚡",
        r"\b(money|free|cost|price)\b": "💸",
        r"\b(growth|scale|increase)\b": "📈",
        r"\b(smart|brain|intelligent)\b": "🧠",
        r"\b(important|note|key)\b": "📌",
        r"\b(success|win|goal)\b": "🏆",
        r"\b(focus|concentrate)\b": "🎯",
        r"\b(idea|concept)\b": "💡"
    }

    # 3. Injection Logic
    lines = text.split('\n')
    new_lines = []
    emojis_used = 0

    for line in lines:
        if emojis_used < max_emojis:
            for pattern, icon in keyword_map.items():
                if re.search(pattern, line, re.IGNORECASE) and emojis_used < max_emojis:
                    # Don't add if line already has an emoji
                    if not any(char in line for char in ["🛡️","⚡","💸","📈","🧠","📌","🏆","🎯","💡"]):
                        line = f"{icon} {line}"
                        emojis_used += 1
                        break 
        new_lines.append(line)

    return "\n".join(new_lines)

# ---------------------------------------------------------
# 3. OCR ENDPOINTS
# ---------------------------------------------------------

def process_image_for_ocr(image):
    # Grayscale & Upscale for better accuracy
    img = image.convert("L")
    img = img.resize((int(img.width * 2), int(img.height * 2)), Image.Resampling.LANCZOS)
    return img

@app.post("/ocr/image")
async def ocr_image(file: UploadFile = File(...)):
    try:
        img_bytes = await file.read()
        image = Image.open(io.BytesIO(img_bytes))
        processed = process_image_for_ocr(image)
        text = pytesseract.image_to_string(processed, lang=OCR_LANGS)
        
        if not text.strip():
            return {"status": "warning", "text": "(No text detected. Try a clearer image.)"}
            
        return {"status": "success", "text": text}
    except Exception as e:
        print(f"OCR Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/ocr/pdf")
async def ocr_pdf(file: UploadFile = File(...)):
    try:
        pdf_bytes = await file.read()
        full_text = ""
        
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for i, page in enumerate(pdf.pages):
                # Try text extraction first
                page_text = page.extract_text()
                if page_text and len(page_text.strip()) > 5:
                    full_text += page_text + "\n"
                else:
                    # Fallback to OCR
                    try:
                        im = page.to_image(resolution=300).original
                        processed = process_image_for_ocr(im)
                        ocr_text = pytesseract.image_to_string(processed, lang=OCR_LANGS)
                        full_text += ocr_text + "\n"
                    except Exception as ocr_err:
                        full_text += f"[Page {i+1}: Image Scan Failed]\n"

        return {"status": "success", "text": full_text if full_text.strip() else "(No text found)"}

    except Exception as e:
        print(f"PDF Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

# ---------------------------------------------------------
# 4. AI CHAT ENDPOINT
# ---------------------------------------------------------

@app.post("/api/ai-chat")
async def ai_chat_endpoint(request: Request):
    try:
        body = await request.json()
        
        # 1. Ping Check
        if body.get("type") == "ping":
            return {"status": "ok", "backend": "python-unified-skt"}

        # 2. Extract Data
        message = body.get("message", "")
        uid = body.get("uid", "guest")
        subject = body.get("subject", "General")
        language = body.get("language", "English")
        examMode = body.get("examMode", "normal")
        goal = body.get("goal", "")

        if not message:
            raise HTTPException(status_code=400, detail="No message provided")

        # --- NEW: Psychology Check (Stress Detection) ---
        is_stressed = bool(re.search(r"(scared|fear|can't do it|fail|tired|giving up)", message, re.IGNORECASE))
        mood = "calm" if is_stressed else "push"

        # --- NEW: Streak Check ---
        streak_msg = check_and_update_streak(uid)

        # 3. Retrieve Memory
        previous_context = CHAT_MEMORY.get(uid, "")

        # 4. Build Professional + SKT Persona System Prompt
        base_persona = "You are Shashish Kumar Tiwari (SKT), the World's #1 Youth Motivator and Educator."
        format_req = "Use bullet points for visual clarity."
        style_instruction = "Be HIGH ENERGY. Use punchy sentences. Blend English and Hinglish."

        if examMode == "teacher": 
            base_persona = "You are a strict, formal Indian syllabus teacher."
            style_instruction = "No motivation, just facts. Precise definitions."
        elif mood == "calm":
            style_instruction = "The student is stressed. Be a calming big brother. Say 'Relax, I am with you'."
        elif examMode == "2marks": 
            format_req = "2–3 sentences, exam-oriented, precise"
        elif examMode == "5marks": 
            format_req = "structured paragraph with 5 key points"
        elif examMode == "8marks": 
            format_req = "detailed essay with introduction, body, and conclusion"

        system_prompt = f"""
{base_persona}
Role Mode: {style_instruction}
Subject: {subject}
Language: {language}
Exam Mode: {examMode}
Goal: {goal}
Format Requirement: {format_req}

Context History:
{previous_context}

Directives:
1. Use provided Context/Large Subjects automatically.
2. Be Indian syllabus aware (CBSE/ICSE/State Boards).
3. If the user is lazy, ROAST them politely but firmly (SKT Style).
4. DO NOT overuse emojis in the core explanation, keep them for headings.
5. Analyze any provided file text first.
"""
        full_prompt = f"{system_prompt}\n\nStudent: {message}"

        # 5. Inject Large Subjects
        if "largeSubjects" in body and isinstance(body["largeSubjects"], list):
            extra = "\n\n".join([f"[{s['name']}]\n{s['content']}" for s in body["largeSubjects"]])
            full_prompt += f"\n\n[LARGE SUBJECT CONTEXT]:\n{extra}"

        reply = None

        # 6. Call AI Providers (Gemini -> Groq -> Cohere -> HF)
        async with httpx.AsyncClient(timeout=40.0) as client:
            
            # --- GEMINI ---
            if not reply and GEMINI_API_KEY:
                try:
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
                    payload = {"contents": [{"parts": [{"text": full_prompt}]}]}
                    r = await client.post(url, json=payload)
                    data = r.json()
                    reply = data['candidates'][0]['content']['parts'][0]['text']
                except Exception as e:
                    print(f"Gemini Error: {e}")

            # --- GROQ ---
            if not reply and GROQ_API_KEY:
                try:
                    url = "https://api.groq.com/openai/v1/chat/completions"
                    headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
                    payload = {
                        "model": "llama-3.3-70b-versatile",
                        "messages": [{"role": "user", "content": full_prompt}]
                    }
                    r = await client.post(url, json=payload, headers=headers)
                    data = r.json()
                    reply = data['choices'][0]['message']['content']
                except Exception as e:
                    print(f"Groq Error: {e}")

            # --- COHERE ---
            if not reply and COHERE_API_KEY:
                try:
                    url = "https://api.cohere.ai/v1/chat"
                    headers = {
                        "Authorization": f"Bearer {COHERE_API_KEY}",
                        "Content-Type": "application/json"
                    }
                    payload = {"model": "command-r-plus", "message": full_prompt}
                    r = await client.post(url, json=payload, headers=headers)
                    data = r.json()
                    reply = data['text']
                except Exception as e:
                    print(f"Cohere Error: {e}")

            # --- HUGGING FACE ---
            if not reply and HF_API_KEY:
                try:
                    url = "https://router.huggingface.co/hf-inference/models/mistralai/Mistral-7B-Instruct-v0.3"
                    headers = {
                        "Authorization": f"Bearer {HF_API_KEY}",
                        "Content-Type": "application/json"
                    }
                    payload = {"inputs": f"<s>[INST] {full_prompt} [/INST]"}
                    r = await client.post(url, json=payload, headers=headers)
                    data = r.json()
                    # HF can return list or dict
                    if isinstance(data, list) and len(data) > 0 and "generated_text" in data[0]:
                        reply = data[0]["generated_text"]
                    elif isinstance(data, dict) and "generated_text" in data:
                        reply = data["generated_text"]
                except Exception as e:
                    print(f"Hugging Face Error: {e}")

        if not reply:
            return {"reply": "⚠️ All AI providers failed. Check your API Keys."}

        # 7. Post-Processing & Memory Update
        
        # A. Apply Smart Emojis
        reply = apply_smart_emojis(reply, examMode)

        # B. Append Streak Message
        if streak_msg:
            reply = f"{streak_msg}\n\n{reply}"

        # C. Append Music Hint (Text Only)
        if examMode != "teacher":
            music = get_skt_music_hint("exam" if "exam" in message.lower() else "focus")
            reply += f"\n\n_{music}_"

        # D. 6 AM Discipline Check
        current_hour = datetime.now().hour
        if 4 <= current_hour <= 7:
            reply = "🌅 **Early Bird Special!** Those who wake up early, rule the world.\n\n" + reply

        # Save to Memory (Keep last 2000 chars)
        new_mem = f"{previous_context}\nQ: {message}\nA: {reply}"
        if len(new_mem) > 2000: new_mem = new_mem[-2000:]
        CHAT_MEMORY[uid] = new_mem

        return {"reply": reply}

    except Exception as e:
        print(f"Chat Error: {e}")
        return JSONResponse(status_code=500, content={"reply": f"🔥 Server Error: {str(e)}"})

# ---------------------------------------------------------
# 5. STATIC FILES (MUST BE LAST)
# ---------------------------------------------------------
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
