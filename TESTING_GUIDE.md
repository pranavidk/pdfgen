# 🧪 Integration Testing Guide

## Quick Start Testing

### Test 1: Backend Setup
```bash
cd /Users/pranavshankar/pdfgen

# Create Python environment
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt

# Set API key (optional, for API mode testing)
cp backend/.env.example backend/.env
# Edit .env and add your OPENAI_API_KEY if testing with API
```

### Test 2: Local Model Setup (Recommended)
```bash
# Install Ollama
brew install ollama

# In one terminal, start Ollama
ollama serve

# In another terminal, pull a test model
ollama pull mistral  # ~4.1 GB, good balance
# OR (smaller, faster)
ollama pull llama3.2:3b  # ~2.1 GB
```

### Test 3: Start Backend
```bash
# From /Users/pranavshankar/pdfgen
cd backend
source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Opens: http://localhost:8000/frontend/index.html

### Test 4: Test Local Model Connection
1. Open http://localhost:8000/frontend/index.html
2. Click "Using local model? Learn how to set it up ->"
3. Verify Ollama is running via instructions
4. In main app: Select **Local Model** radio
5. Click **Check Connection** button
6. Should show: "Connected - Ollama - mistral (or model name)"

### Test 5: Generate Sample Textbook
1. Upload a test PDF (10-20 pages recommended)
2. Verify "Generate" button enables
3. Click Generate
4. Monitor progress messages:
   - "Extracting text from document" (5%)
   - "Text extracted, preparing chunks" (12%)
   - "Structuring content (1/X)" (shows progression)
   - "Combining sections" (65%)
   - "Refining into textbook structure" (75%)
   - "Complete" (100%)
5. Verify output shows chapters in preview
6. Download PDF/DOCX and verify formatting

---

## What to Expect

### Processing Time (Estimates)

**With Ollama (mistral):**
- 5-page PDF: 1-2 minutes
- 10-page PDF: 2-3 minutes
- 20-page PDF: 5-8 minutes

**With OpenAI API:**
- 5-page PDF: 20-30 seconds
- 10-page PDF: 30-60 seconds
- 20-page PDF: 1-2 minutes

### Output Quality Indicators

✅ **Good Signs:**
- Multiple chapters (3-6 typical)
- Each chapter has 2-4 sections
- Content is paragraph-based (not bullet lists)
- Proper academic tone and transitions
- Key points and definitions included
- PDF downloads and formats correctly

❌ **Issues to Watch:**
- All content in one mega-chapter (refinement issue)
- Bullet points instead of prose (prose generation issue)
- Sections with no content (chunking issue)
- Repeated content (combine step issue)

---

## Debugging

### Check Progress Messages in Console
```javascript
// Open browser DevTools (F12)
// Watch Network tab for POST requests
// Each chunk should have requests to /api/generate or OpenAI endpoint
```

### Monitor LLM Calls
```bash
# For Ollama - watch in server terminal for model execution
# Should show: Pulling layers, generating, until complete

# For LM Studio - watch CPU/RAM in app
# Should show consistent usage during processing
```

### Test Error Recovery
1. Start processing
2. Stop Ollama mid-generation
3. Should show error: "Local model is not connected"
4. Click "Check Connection" to reconnect
5. Try again - should work

---

## Success Criteria

- [ ] Frontend loads without console errors
- [ ] Local model connection works
- [ ] File upload accepts PDF/PPTX
- [ ] Progress shows chunk progression
- [ ] Final output has proper chapters/sections
- [ ] PDF downloads with correct formatting
- [ ] Processing can be stopped with Stop button
- [ ] Error messages are clear and helpful

---

## Performance Tuning

### If Processing is Too Slow
```javascript
// In script.js, reduce chunk size
const wordLimit = isLocalModel ? 400 : 1000;  // Smaller chunks = faster processing
```

### If Model Freezes
```javascript
// Reduce further
const wordLimit = isLocalModel ? 300 : 800;
```

### If Output Quality Drops
```javascript
// Increase chunk size for better context
const wordLimit = isLocalModel ? 800 : 2000;
```

---

## Backup Testing (API Mode)

If local model setup fails, test with OpenAI:

```bash
# Set OPENAI_API_KEY in backend/.env
export OPENAI_API_KEY="sk-..."

# Restart backend
cd backend && uvicorn main:app --reload
```

Then select "API" mode in app and enter key.

---

## Production Deployment Checklist

- [ ] Error logging configured
- [ ] CORS origins configured correctly
- [ ] File upload size limits set
- [ ] Temporary files cleanup working
- [ ] Rate limiting configured (if needed)
- [ ] Local model or API key secured
- [ ] Health check endpoint working
- [ ] PDF/DOCX generation tested
- [ ] Progress tracking verified
- [ ] Stop button working reliably

---

**Ready to test! Follow the steps above for full integration verification.**
