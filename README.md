# Notes to Textbook - Full Stack with Two-Pass Pipeline

A production-ready full-stack app that converts PDF/PPTX notes into polished academic textbooks using a **two-pass AI pipeline optimized for local models**.

## 🚀 Key Features

- ✅ **Two-Pass Pipeline**: Prose generation → Final refinement (prevents local model freezing)
- ✅ **Supports Local Models**: Ollama, LM Studio fully optimized  
- ✅ **Cloud APIs**: OpenAI, Anthropic (GPT-4, Claude) support
- ✅ **Full Textbook Output**: Not just bullet points—structured academic prose
- ✅ **Smart Chunking**: Auto-detects model type and adjusts chunk size (600–1500 words)
- ✅ **PDF/DOCX Export**: Beautiful, formatted downloadable textbooks
- ✅ **Progress Tracking**: Real-time updates with chunk counters
- ✅ **Error Recovery**: Graceful fallbacks, retry logic

## 📋 Architecture

### Frontend
- **Technology**: Vanilla JavaScript + HTML/CSS
- **Location**: `frontend/index.html` and `frontend/script.js`
- **Features**: File upload, progress UI, PDF/DOCX generation, LLM provider selection

### Backend  
- **Technology**: FastAPI (Python)
- **Location**: `backend/main.py`
- **Features**: File validation, async processing, job management, caching

### LLM Integration
- **Local Models**: Ollama (http://localhost:11434) or LM Studio (http://localhost:1234)
- **Cloud APIs**: OpenAI GPT-4o-mini or Anthropic Claude Sonnet

## 🔄 Three-Pass Processing Pipeline

```
[Raw PDF/PPTX Input]
        ↓
[PASS 1: Prose Generation] (12-57%)
Process each chunk with prompt:
  "Expand into formal academic prose (NOT bullets)"
        ↓
[PASS 2: Combine Sections] (57-65%)
Join all prose fragments together
        ↓
[PASS 3: Textbook Refinement] (65-100%)
Final pass with prompt:
  "Structure into textbook JSON with chapters/sections"
        ↓
[Full Textbook JSON Output]
```

**Benefits:**
- 🎯 **Prevents Freezing**: Smaller chunks (600 words for local models) won't overwhelm
- 📖 **Better Quality**: Prose generation → Refinement produces academic textbook-style output
- ⚡ **Efficient**: Clear task separation optimizes each step
- 🔄 **Robust**: Fallback mechanisms if any step fails

## 💻 Quick Start

### Option 1: Local Model (Recommended for Testing)

```bash
# 1. Install Ollama
brew install ollama

# 2. Start Ollama server (runs in background)
ollama serve

# 3. Pull a model (in new terminal)
ollama pull mistral  # ~4.1 GB, good balance
# OR use smaller model:
ollama pull llama3.2:3b  # ~2.1 GB, faster

# 4. Setup and start backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 5. Open in browser
# http://localhost:8000/frontend/index.html
# Select "Local Model" → Check Connection → Generate
```

### Option 2: Cloud API (OpenAI/Anthropic)

```bash
# 1. Setup backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. Set API key
cp .env.example .env
# Edit .env and add OPENAI_API_KEY=sk-...

# 3. Run backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 4. Open in browser
# http://localhost:8000/frontend/index.html
# Select "API" mode → Enter API key → Generate
```

## 📁 Project Structure

```
pdfgen/
├── backend/
│   ├── main.py                 # FastAPI server
│   ├── routes/
│   │   └── process.py          # Processing endpoints
│   ├── services/
│   │   ├── ai_service.py       # LLM integration
│   │   ├── extractor.py        # PDF/PPTX extraction
│   │   ├── formatter.py        # Schema validation
│   │   └── job_store.py        # Job state management
│   ├── utils/
│   │   └── ocr.py              # OCR fallback
│   └── requirements.txt        # Python dependencies
├── frontend/
│   ├── index.html              # Main UI
│   ├── script.js               # Two-pass pipeline logic ✨NEW
│   └── use-local-ai.html       # Setup guide
├── TEXTBOOK_OPTIMIZATION_GUIDE.md  # User guide ✨NEW
├── TESTING_GUIDE.md                # Testing instructions ✨NEW
├── ARCHITECTURE.md                 # Technical documentation ✨NEW
└── IMPLEMENTATION_SUMMARY.md       # Change summary ✨NEW
```

## ⚙️ API Endpoints

- `POST /upload` - File validation (PDF/PPTX, max 20MB)
- `POST /process` - Start async textbook generation, returns job ID
- `GET /jobs/{job_id}` - Poll job status and retrieve results

## 📊 Performance

### With Ollama (Mistral 7B)
| Document | Time | Notes |
|----------|------|-------|
| 5 pages | 1-2 min | Fast |
| 10 pages | 2-3 min | Good |
| 20 pages | 5-8 min | Acceptable |
| 50+ pages | 30+ min | Very slow |

### With OpenAI (GPT-4o-mini)
| Document | Time | Cost |
|----------|------|------|
| 10 pages | 20-30s | ~$0.05 |
| 50 pages | 1-2 min | ~$0.20 |

## 📚 Documentation

Start here based on your needs:

- **🎯 [TEXTBOOK_OPTIMIZATION_GUIDE.md](TEXTBOOK_OPTIMIZATION_GUIDE.md)** — How to use the new two-pass pipeline, setup guides, troubleshooting
- **🧪 [TESTING_GUIDE.md](TESTING_GUIDE.md)** — Step-by-step testing instructions and verification checklist
- **🏗️ [ARCHITECTURE.md](ARCHITECTURE.md)** — Technical deep-dive into how the pipeline works
- **📋 [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** — Detailed change log of what was modified

## 🔑 Key Improvements Over Previous Version

### Before
- Single-pass pipeline (chunk → JSON)
- Large chunks (2500 words) would freeze Ollama
- Limited prose quality (more like structured notes)
- Generic chunking without model awareness

### After ✨
- Three-pass pipeline (prose → refinement → JSON)
- Smart chunk sizing (600 words for local, 1500 for API)
- Full academic prose with proper transitions
- Model-aware optimization (auto-detects API vs local)
- Robust error handling with fallbacks
- Clear progress tracking with chunk counters

## 🛠️ Setup Details

### If OCR is Needed (Scanned PDFs)

```bash
# macOS
brew install tesseract

# Then use normally - OCR fallback is automatic
```

### Optional: GPU Acceleration for Ollama

```bash
# With CUDA (NVIDIA GPU)
# Download CUDA-enabled Ollama binary from ollama.ai

# Or use Metal (Apple Silicon/GPU)
# Ollama automatically uses Metal on Apple devices
```

## 🔒 Privacy & Security

- ✅ Local models: All processing on your machine (zero cloud exposure)
- ✅ API mode: Text sent only to OpenAI/Anthropic (standard API terms)
- ✅ No file persistence (temp files auto-deleted)
- ✅ No telemetry or tracking
- ✅ Open source (review code as needed)

## 🆘 Common Issues

**"Local model freezes during processing"**
- Solution: Reduce chunk size in `frontend/script.js` (600 → 400 words)
- Alternative: Use smaller model (llama3.2:3b instead of mistral)

**"Connection refused to local model"**
- Check: Ollama is running (`ollama serve`)
- Check: Port is correct (11434 for Ollama, 1234 for LM Studio)

**"Invalid JSON errors"**
- Usually fixed automatically with retry logic
- If persists: Try a larger/better model

See [TEXTBOOK_OPTIMIZATION_GUIDE.md](TEXTBOOK_OPTIMIZATION_GUIDE.md) for more troubleshooting.

## 📝 License

MIT License - See LICENSE file

## 🚀 Future Enhancements

- [ ] Streaming prose generation (real-time output)
- [ ] Concurrent chunk processing (parallel execution)
- [ ] Custom prompt templates (user-defined tone/style)
- [ ] Batch processing CLI (process multiple files)
- [ ] Model selection dropdown (choose from available models)
- [ ] Advanced caching (reuse prose for similar documents)

---

**Ready to generate beautiful academic textbooks! Start with the [Quick Start](#-quick-start) above.**
