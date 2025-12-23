# ai_backend_service.py
# Appana AI – Final Unified Server (vFixed & Merged)
# Run with: python ai_backend_service.py
# IMPORTANT: Ensure 'python-multipart' is installed for File Uploads.

from fastapi import FastAPI, UploadFile, File, Request, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import pytesseract
import pdfplumber
from PIL import Image
import io
import uvicorn
import os
import httpx
import time
from collections import defaultdict

app = FastAPI()

# ---------------------------------------------------------
# 1. CONFIGURATION & STATE
# ---------------------------------------------------------

# API Keys (Set these in your OS Environment or .env file)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "") 
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
COHERE_API_KEY = os.getenv("COHERE_API_KEY", "")
HF_API_KEY = os.getenv("HF_API_KEY", "")

# In-Memory Storage
CHAT_MEMORY = {}        # Stores chat context per User ID
RATE_LIMITS = defaultdict(list) # Stores timestamp of requests per User ID

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OCR_LANGS = "eng+hin"

# ---------------------------------------------------------
# 2. HELPER FUNCTIONS
# ---------------------------------------------------------

def check_rate_limit(uid: str):
    if uid == "guest": return # Guests might share IP, so lenient
    now = time.time()
    # Remove requests older than 60 seconds
    RATE_LIMITS[uid] = [t for t in RATE_LIMITS[uid] if now - t < 60]
    
    if len(RATE_LIMITS[uid]) >= 20: # Limit: 20 requests per minute
        raise HTTPException(status_code=429, detail="⚠️ You are chatting too fast. Please wait.")
    
    RATE_LIMITS[uid].append(now)

def process_image_for_ocr(image):
    # Grayscale & Upscale for better accuracy
    img = image.convert("L")
    img = img.resize((int(img.width * 2), int(img.height * 2)), Image.Resampling.LANCZOS)
    return img

# ---------------------------------------------------------
# 3. OCR ENDPOINTS
# ---------------------------------------------------------

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
                page_text = page.extract_text() or ""
                if len(page_text.strip()) > 5:
                    full_text += page_text + "\n"
                else:
                    # Fallback to OCR if text extraction fails
                    try:
                        im = page.to_image(resolution=300).original
                        processed = process_image_for_ocr(im)
                        ocr_text = pytesseract.image_to_string(processed, lang=OCR_LANGS)
                        full_text += ocr_text + "\n"
                    except Exception:
                        full_text += f"[Page {i+1}: Image Scan Failed]\n"

        return {"status": "success", "text": full_text if full_text.strip() else "(No text found)"}

    except Exception as e:
        print(f"PDF Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

# ---------------------------------------------------------
# 4. AI CHAT ENDPOINT (Merged Logic)
# ---------------------------------------------------------

@app.post("/api/ai-chat")
async def ai_chat_endpoint(request: Request):
    try:
        body = await request.json()
        
        # 1. Health Ping
        if body.get("type") == "ping":
            return {
                "status": "ok", 
                "backend": "python-unified", 
                "keys": {
                    "gemini": bool(GEMINI_API_KEY),
                    "groq": bool(GROQ_API_KEY),
                    "cohere": bool(COHERE_API_KEY)
                }
            }

        # 2. Extract Data
        message = body.get("message", "")
        uid = body.get("uid", "guest")
        subject = body.get("subject", "General")
        language = body.get("language", "English")
        examMode = body.get("examMode", "normal")
        goal = body.get("goal", "")

        if not message:
            return {"reply": "Please say something!"}

        # 3. Rate Limit Check
        check_rate_limit(uid)

        # 4. Retrieve Memory
        previous_context = CHAT_MEMORY.get(uid, "")

        # 5. Build Professional System Prompt (Merged from ai-chat.js)
        tone = "friendly, encouraging, exam-focused mentor"
        format_req = "clear and concise bullet points"

        if examMode == "teacher": 
            tone = "strict, formal, precise Indian syllabus teacher"
        elif examMode == "2marks": 
            format_req = "2–3 sentences, exam-oriented, precise"
        elif examMode == "5marks": 
            format_req = "structured paragraph with 5 key points"
        elif examMode == "8marks": 
            format_req = "detailed essay with introduction, body, and conclusion"

        system_prompt = f"""
You are Appana AI.
Role: {tone}
Subject: {subject}
Language: {language}
Exam Mode: {examMode}
Goal: {goal}
Format Requirement: {format_req}

Context History:
{previous_context}

Instructions:
1. Use provided Context/Large Subjects automatically.
2. Be Indian syllabus aware (CBSE / ICSE / State Boards).
3. Keep explanations clear, accurate, and exam-relevant.
4. Use emojis sparingly and professionally (max one per response).
5. Analyze any provided file text first.
6. If the user asks for "Notes", "Quiz", or "Important Questions", format appropriately.
"""
        full_prompt = f"{system_prompt}\n\nStudent: {message}"

        # 6. Inject Large Subjects
        if "largeSubjects" in body and isinstance(body["largeSubjects"], list):
            extra = "\n\n".join([f"[{s['name']}]\n{s['content'][:15000]}" for s in body["largeSubjects"]]) # Truncate massive files
            full_prompt += f"\n\n[LARGE SUBJECT CONTEXT]:\n{extra}"

        reply = None

        # 7. Call AI Providers (Cascade Strategy)
        async with httpx.AsyncClient(timeout=60.0) as client:
            
            # --- GEMINI (Primary) ---
            if not reply and GEMINI_API_KEY:
                try:
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
                    payload = {"contents": [{"parts": [{"text": full_prompt}]}]}
                    r = await client.post(url, json=payload)
                    if r.status_code == 200:
                        data = r.json()
                        reply = data['candidates'][0]['content']['parts'][0]['text']
                except Exception as e:
                    print(f"Gemini Error: {e}")

            # --- GROQ (Secondary) ---
            if not reply and GROQ_API_KEY:
                try:
                    url = "https://api.groq.com/openai/v1/chat/completions"
                    headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
                    payload = {
                        "model": "llama-3.3-70b-versatile",
                        "messages": [{"role": "user", "content": full_prompt}]
                    }
                    r = await client.post(url, json=payload, headers=headers)
                    if r.status_code == 200:
                        data = r.json()
                        reply = data['choices'][0]['message']['content']
                except Exception as e:
                    print(f"Groq Error: {e}")

            # --- COHERE (Fallback) ---
            if not reply and COHERE_API_KEY:
                try:
                    url = "https://api.cohere.ai/v1/chat"
                    headers = {
                        "Authorization": f"Bearer {COHERE_API_KEY}",
                        "Content-Type": "application/json"
                    }
                    payload = {"model": "command-r-plus", "message": full_prompt}
                    r = await client.post(url, json=payload, headers=headers)
                    if r.status_code == 200:
                        data = r.json()
                        reply = data['text']
                except Exception as e:
                    print(f"Cohere Error: {e}")

        if not reply:
            return {"reply": "⚠️ All AI providers failed. Please check your API Keys or internet connection."}

        # 8. Post-Processing & Memory Update
        if examMode not in ["teacher", "2marks", "5marks", "8marks"]:
            lower = reply.lower()
            emoji = ""
            if "important" in lower: emoji = "📌"
            elif "remember" in lower: emoji = "💡"
            elif "excellent" in lower: emoji = "✅"
            if emoji and emoji not in reply: reply = f"{emoji} {reply}"

        # Save to Memory (Sliding Window ~2000 chars)
        new_mem = f"{previous_context}\nQ: {message}\nA: {reply}"
        if len(new_mem) > 2500: new_mem = new_mem[-2500:]
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
