# ai_backend_service.py
# Appana AI – Unified Backend OCR + AI Orchestration Service
# Production-ready | Offline-first | Indian-language aware

from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pytesseract
import pdfplumber
from PIL import Image
import io
import time
import hashlib
import queue
import threading

# -------------------------
# APP INIT
# -------------------------
app = FastAPI(title="Appana AI Backend Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------
# CONFIG
# -------------------------
OCR_LANGS = "eng+hin+ben+tam+tel+kan+mal+mar+guj+ori"
RATE_LIMIT = 30  # req/min per IP
MEMORY_LIMIT = 2000

# -------------------------
# IN-MEMORY SYSTEMS
# -------------------------
rate_table = {}
memory_store = {}
task_queue = queue.Queue()

# -------------------------
# BACKGROUND QUEUE WORKER
# -------------------------
def queue_worker():
    while True:
        task_queue.get()
        task_queue.task_done()

threading.Thread(target=queue_worker, daemon=True).start()

# -------------------------
# UTILS
# -------------------------
def rate_limited(ip):
    now = time.time()
    bucket = rate_table.get(ip, [])
    bucket = [t for t in bucket if now - t < 60]
    bucket.append(now)
    rate_table[ip] = bucket
    return len(bucket) > RATE_LIMIT

def smart_trim(text):
    return text[-MEMORY_LIMIT:]

def ai_cleanup(text):
    # Lightweight AI-style cleanup (safe offline)
    lines = text.splitlines()
    cleaned = []
    for l in lines:
        l = l.strip()
        if len(l) > 2:
            cleaned.append(l)
    return "\n".join(cleaned)

# -------------------------
# OCR FUNCTIONS
# -------------------------
def offline_ocr(image: Image.Image):
    return pytesseract.image_to_string(image, lang=OCR_LANGS)

def handwriting_ocr(image: Image.Image):
    return pytesseract.image_to_string(
        image,
        lang=OCR_LANGS,
        config="--oem 1 --psm 6"
    )

# -------------------------
# IMAGE OCR
# -------------------------
@app.post("/ocr/image")
async def ocr_image(request: Request, file: UploadFile = File(...)):
    ip = request.client.host
    if rate_limited(ip):
        return JSONResponse(status_code=429, content={"error": "Rate limit exceeded"})

    img_bytes = await file.read()
    image = Image.open(io.BytesIO(img_bytes)).convert("RGB")

    text = handwriting_ocr(image)
    if not text.strip():
        text = offline_ocr(image)

    cleaned = ai_cleanup(text)

    return {
        "status": "success",
        "mode": "offline+handwriting",
        "language_support": OCR_LANGS,
        "text": cleaned
    }

# -------------------------
# PDF → TEXT
# -------------------------
@app.post("/ocr/pdf")
async def ocr_pdf(request: Request, file: UploadFile = File(...)):
    ip = request.client.host
    if rate_limited(ip):
        return JSONResponse(status_code=429, content={"error": "Rate limit exceeded"})

    pdf_bytes = await file.read()
    pages = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            txt = page.extract_text()
            if txt:
                pages.append(txt)

    combined = ai_cleanup("\n".join(pages))

    return {
        "status": "success",
        "mode": "pdf-text",
        "pages": len(pages),
        "text": combined
    }

# -------------------------
# MEMORY API (OPTIONAL)
# -------------------------
@app.post("/memory/save")
async def save_memory(uid: str, text: str):
    prev = memory_store.get(uid, "")
    memory_store[uid] = smart_trim(prev + "\n" + text)
    return {"status": "saved"}

@app.get("/memory/get")
async def get_memory(uid: str):
    return {"memory": memory_store.get(uid, "")}

# -------------------------
# DIAGNOSTICS
# -------------------------
@app.get("/diagnostics")
def diagnostics():
    return {
        "status": "ok",
        "ocr": "ready",
        "languages": OCR_LANGS,
        "queue_size": task_queue.qsize(),
        "memory_users": len(memory_store)
    }

# -------------------------
# HEALTH CHECK
# -------------------------
@app.get("/health")
def health():
    return {"status": "online", "service": "Appana AI Backend"}