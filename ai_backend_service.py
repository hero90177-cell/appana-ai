# ai_backend_service.py
# Appana AI – OCR & PDF Service (vFinal - Robust Hybrid Mode)
# Run with: python ai_backend_service.py

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pytesseract
import pdfplumber
from PIL import Image, ImageOps
import io
import uvicorn
import sys

app = FastAPI()

# ---------------------------------------------------------
# 1. CONFIGURATION & DIAGNOSTICS
# ---------------------------------------------------------

# ⚠️ ALLOW ALL ORIGINS for local testing (Mobile <-> PC)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OCR_LANGS = "eng+hin"  # Multi-language support

# 🔍 Startup Check: Verify Tesseract Languages
try:
    available_langs = pytesseract.get_languages(config='')
    print(f"✅ Tesseract Detected. Available Languages: {available_langs}")
    if 'hin' not in available_langs:
        print("⚠️ WARNING: 'hin' (Hindi) language pack missing! Hindi OCR will fail.")
except Exception as e:
    print(f"❌ CRITICAL: Tesseract not found or error: {e}")

# ---------------------------------------------------------
# 2. HELPER FUNCTIONS
# ---------------------------------------------------------

def process_image_for_ocr(image):
    """
    Pre-process image to improve Tesseract accuracy:
    1. Convert to Grayscale (removes color noise)
    2. Resize/Upscale (helps with small text/low DPI mobile photos)
    """
    # Convert to grayscale
    img = image.convert("L")
    
    # Upscale by 2x (High Quality Resampling) to fix Low DPI issues
    new_size = tuple(2 * x for x in img.size)
    img = img.resize(new_size, Image.Resampling.LANCZOS)
    
    # Optional: Auto-contrast could be added here, but upscale is usually enough
    return img

# ---------------------------------------------------------
# 3. API ENDPOINTS
# ---------------------------------------------------------

@app.get("/")
def home():
    return {"status": "Appana OCR Backend Running", "mode": "Hybrid (Text+Image)"}

@app.post("/ocr/image")
async def ocr_image(file: UploadFile = File(...)):
    try:
        img_bytes = await file.read()
        image = Image.open(io.BytesIO(img_bytes))
        
        # ⚡ Optimization: Pre-process image
        processed_image = process_image_for_ocr(image)
        
        # Run OCR
        text = pytesseract.image_to_string(processed_image, lang=OCR_LANGS)
        
        if not text.strip():
            return {"status": "warning", "text": "(No text detected. Try a clearer image.)"}
            
        return {"status": "success", "text": text}
    except Exception as e:
        print(f"Error processing image: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/ocr/pdf")
async def ocr_pdf(file: UploadFile = File(...)):
    """
    Hybrid PDF Handler:
    1. Try extracting embedded text (fast, accurate).
    2. If text extraction returns empty (Scanned PDF), render page as image and run OCR.
    """
    try:
        pdf_bytes = await file.read()
        full_text = ""
        
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for i, page in enumerate(pdf.pages):
                # Attempt 1: Direct Text Extraction
                page_text = page.extract_text()
                
                if page_text and len(page_text.strip()) > 5:
                    full_text += page_text + "\n"
                else:
                    # Attempt 2: Fallback to OCR (Scanned Page)
                    print(f"ℹ️ Page {i+1} seems scanned. Running OCR...")
                    try:
                        # Render page to image at 300 DPI for clarity
                        # Note: Requires poppler-utils installed on system/docker
                        im = page.to_image(resolution=300).original
                        
                        # Pre-process just like a normal image
                        processed_im = process_image_for_ocr(im)
                        
                        ocr_text = pytesseract.image_to_string(processed_im, lang=OCR_LANGS)
                        full_text += ocr_text + "\n"
                    except Exception as ocr_err:
                        print(f"⚠️ OCR Fallback failed for page {i+1}: {ocr_err}")
                        full_text += f"[Page {i+1}: Image Scan Failed]\n"

        if not full_text.strip():
            return {"status": "warning", "text": "(PDF processed but no text found)"}

        return {"status": "success", "text": full_text}

    except Exception as e:
        print(f"Error processing PDF: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    # HOST 0.0.0.0 allows mobile devices on same WiFi to connect
    uvicorn.run(app, host="0.0.0.0", port=8000)
