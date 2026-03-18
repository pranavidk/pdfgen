# 🏗️ Technical Architecture - Two-Pass Pipeline

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    NOTES-TO-TEXTBOOK APP                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           FRONTEND (JavaScript/DOM)                  │  │
│  │  - File upload handler                              │  │
│  │  - Progress tracking UI                             │  │
│  │  - PDF/DOCX download generation                     │  │
│  │  - Local model connection management                │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↕                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │    LLM PROVIDERS (Parallel Support)                  │  │
│  │  ┌────────────┬──────────────┬──────────────────┐   │  │
│  │  │  Ollama    │  LM Studio   │  OpenAI/Claude   │   │  │
│  │  │ :11434     │  :1234       │  Cloud APIs      │   │  │
│  │  └────────────┴──────────────┴──────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow - Three Passes

```
        INPUT: Raw Text (extracted from PDF/PPTX)
              (1000-100,000+ words, unstructured)
                         │
                         ↓
        ┌─────────────────────────────────┐
        │   INTELLIGENCE: Auto-chunking    │
        │   - Detect: API vs Local Model   │
        │   - Size: 1500 vs 600 words      │
        │   - Preserve: Paragraph breaks   │
        └─────────────────────────────────┘
                         │
                    [N chunks]
                         │
        ╔════════════════════════════════════════════════╗
        ║          PASS 1: PROSE GENERATION              ║
        ║                  (12-57%)                      ║
        ║                                                ║
        ║  For each chunk:                               ║
        ║  ┌──────────────────────────────────┐          ║
        ║  │ INPUT: Raw chunk text            │          ║
        ║  │        (600 words)               │          ║
        ║  │                                  │          ║
        ║  │ PROMPT: "Expand to academic     │          ║
        ║  │         prose in paragraphs"     │          ║
        ║  │                                  │          ║
        ║  │ LLM CALL: ~15-30 seconds        │          ║
        ║  │          (per chunk)             │          ║
        ║  │                                  │          ║
        ║  │ OUTPUT: Structured prose        │          ║
        ║  │         (1000-1500 words)       │          ║
        ║  │         with transitions        │          ║
        ║  └──────────────────────────────────┘          ║
        ║                                                ║
        ║  Progress: "Structuring (2/8)"                  ║
        ╚════════════════════════════════════════════════╝
                         │
                    [N prose chunks]
                         │
                         ↓
        ╔════════════════════════════════════╗
        ║    PASS 2: COMBINE                 ║
        ║             (57-65%)               ║
        ║                                    ║
        ║  Join([prose_1, prose_2, ...])    ║
        ║  With "\n\n" separators            ║
        ║                                    ║
        ║  OUTPUT: 5000-50,000 words        ║
        ║          complete prose document  ║
        ╚════════════════════════════════════╝
                         │
                [Combined Prose Document]
                         │
                         ↓
        ╔════════════════════════════════════════════════╗
        ║      PASS 3: FINAL REFINEMENT                  ║
        ║             (65-100%)                         ║
        ║                                                ║
        ║  ┌──────────────────────────────────┐          ║
        ║  │ INPUT: Complete prose (50KB)     │          ║
        ║  │                                  │          ║
        ║  │ PROMPT: "Structure into textbook│          ║
        ║  │         JSON with chapters,      │          ║
        ║  │         sections, definitions"   │          ║
        ║  │                                  │          ║
        ║  │ LLM CALL: ~30-60 seconds        │          ║
        ║  │         (single, final call)     │          ║
        ║  │                                  │          ║
        ║  │ VALIDATION: Check JSON schema   │          ║
        ║  │ RETRY: If invalid, ask again    │          ║
        ║  │                                  │          ║
        ║  │ OUTPUT: Valid Textbook JSON      │          ║
        ║  └──────────────────────────────────┘          ║
        ║                                                ║
        ║  Progress: "Refining into textbook"            ║
        ╚════════════════════════════════════════════════╝
                         │
              [Structured Textbook JSON]
                         │
                         ↓
        ┌─────────────────────────────────┐
        │  OUTPUT: Full Textbook Structure │
        │  - Title & Subtitle              │
        │  - Preface                       │
        │  - 3-6 Chapters                  │
        │  - 2-4 Sections per chapter      │
        │  - Content, Key Points, Defs     │
        └─────────────────────────────────┘
                         │
          [PDF/DOCX Download Generation]
```

## Process Functions

### 1. `chunkTextForLocalModels(text, wordLimit = 600)`
**Purpose:** Smart chunking for local models

```javascript
Algorithm:
1. Split by paragraph boundaries (\n{2,})
2. Accumulate paragraphs into chunks
3. When chunk + next paragraph > wordLimit:
   - Save current chunk
   - Start new chunk with next paragraph
4. Return all chunks (min 300 words, max 600 words per chunk)
```

**Why Paragraph Boundaries?**
- Preserves semantic meaning
- Prevents cutting mid-sentence
- Maintains natural flow in prose generation

**Local Model Chunk Sizes:**
```
llama3.2:3b    →  400-500 words  (smaller model, limited context)
mistral-7b     →  600-800 words  (good balance speed/quality)
llama2-70b     →  800-1000 words (large model, more context)
```

### 2. `buildAcademicProsePrompt(chunkText)`
**Purpose:** Convert raw content to academic prose

```
Key Elements:
✓ Role definition: "expert academic writer"
✓ Task clarity: "expand into formal prose section"
✓ Format requirement: "paragraph form, NOT bullets"
✓ Tone guidance: "university-level, scholarly"
✓ Length guidance: "300-800 words"
```

**Why NOT JSON at this stage?**
- Prose generation is task-focused
- Models excel at natural language expansion
- Easier error recovery (can use fallback text)
- Smaller tokens/seconds per call

### 3. `generateAcademicProse(chunkText, runtimeConfig)`
**Purpose:** Execute LLM call for prose generation

```javascript
Flow:
1. Build prompt using buildAcademicProsePrompt()
2. Route to correct provider:
   - Local: callLocalModel(prompt, Ollama/LM Studio)
   - API: callOpenAI(prompt) or callAnthropic(prompt)
3. Return prose (string, trimmed)
4. IF error:
   - Log error
   - Return original chunk as fallback
```

**Error Handling Strategy:**
```
Try prose generation → 
  If succeeds: Use prose ✓
  If fails: Use original chunk text (graceful fallback)
→ Continue pipeline (robustness)
```

### 4. `buildTextbookRefinementPrompt(combinedText)`
**Purpose:** Structure prose into textbook JSON

```
Key Elements:
✓ Role: "expert textbook editor"
✓ Task: "structure into complete textbook JSON"
✓ Organization: "logical chapters (3-6) + sections (2-4)"
✓ Quality: "smooth transitions, consistency, maintain details"
✓ Format: "strict JSON matching schema"
✓ Schema: Include full STRICT_SCHEMA definition
```

**Why Single Final Call?**
- Combined text is shorter (50-60KB vs 100KB+)
- Model has complete document context
- One major API/compute phase
- Easier JSON schema validation

### 5. `refineTextbookContent(combinedText, runtimeConfig)`
**Purpose:** Generate and validate final textbook JSON

```javascript
Flow:
1. Build refinement prompt
2. Call LLM
3. Parse JSON response
4. Validate against STRICT_SCHEMA
5. IF validation fails:
   - Retry with clearer instructions
   - Parse and validate again
6. Return validated textbook object
```

**Retry Logic:**
```
First Attempt → 
  If valid JSON + passes schema: Success ✓
  If invalid JSON: Retry with instruction fix
  If invalid schema: Retry with field hints
Second Attempt →
  If still fails: Throw error (user sees message)
```

### 6. Updated `processFile()` Main Loop
**Purpose:** Orchestrate three-pass pipeline

```javascript
Flow:
1. Validation (API key or local connection)
2. Extract text from file
3. Auto-detect chunking strategy
4. PASS 1: Prose generation (loop over chunks)
5. PASS 2: Combine prose sections
6. PASS 3: Final refinement to JSON
7. On success: Show done, enable downloads
8. On error: Show error message, allow retry
```

**Progress Tracking Strategy:**
```
5%    - Text extraction starts
12%   - Text extracted, chunking
12-57% - Prose generation (shows 1/X, 2/X, etc.)
       - Linear: 12 + (chunk_index/total_chunks) * 45
65%   - Combining sections
75%   - Refining into structure
100%  - Complete
```

## Performance Characteristics

### Time Complexity

```
Total Time = Extraction + Chunking + (Prose × N) + Combine + Refinement

Where:
- N = number of chunks
- Prose = 15-30 sec per chunk (LLM time)
- Refinement = 30-60 sec (final LLM call)

Examples:
10-page doc → 5 chunks → 5 prose × 20s + 60s = 160s = 2.7 min
20-page doc → 10 chunks → 10 prose × 20s + 60s = 260s = 4.3 min
```

### Memory Usage

```
Extraction:  1-10 MB (PDF/PPTX in memory)
Chunks:      50-100 KB each (in array)
Prose:       100-200 KB per result
Combined:    500 KB - 2 MB (all prose joined)
Final JSON:  200-500 KB (textbook structure)

Peak RAM: ~20-50 MB during processing
```

### API Costs (OpenAI)

```
10-page doc (~3000 words):
  Input: 3000 × 1.5 (processing overhead) = 4500 tokens
  Output: 4500 tokens × 1.5 (prose expansion) = 6750 × 3 chunks = 20K tokens
  
  Estimate: 25K tokens total
  Cost: 25K × $0.000003 (gpt-4o-mini) = ~$0.075

20-page doc (~6000 words):
  Estimate: 50K tokens
  Cost: ~$0.15
```

## Error Recovery

### Errors Handled

```
1. File Upload Errors
   → Show: "Invalid file type" or "Too large"
   → Action: User selects different file

2. Extraction Errors
   → Show: "No readable text" or "OCR failed"
   → Action: User tries different PDF

3. Prose Generation Errors
   → Action: Skip chunk, use original text (fallback)
   → Continue pipeline

4. JSON Validation Errors
   → Action: Retry with clearer prompt
   → If still fails: Show error to user

5. Network Errors (API mode)
   → Show: "Connection failed" or "Rate limited"
   → Action: User retries with API key/connection

6. User Stops Processing
   → Action: AbortController cancels all pending calls
   → Clean up resources
   → Reset UI state
```

## Scalability

### Local Model (Ollama)
```
Sequential processing (one chunk at a time)
Cannot parallelize (single model instance)
Benefits: Simple, reliable, predictable resource usage
Limitation: Linear time scaling with chunk count
```

### Future Optimization
```
Could implement:
- Batch chunk processing with concurrent limits
- Streaming responses for faster feedback
- Caching of repeated sections
- Parallel prose generation with model replicas
```

## Code Integration Points

### Key Variables/Objects

```javascript
localConnection {
  connected: boolean
  provider: "ollama" | "lmstudio"
  baseUrl: "http://localhost:11434"
  model: "mistral" | "llama3.2:3b"
}

runtimeConfig {
  source: "api" | "local"
  apiKey: string
  provider: "openai" | "anthropic" | "ollama" | "lmstudio"
  localConnection: { ... }
  options: { outputStyle, structure, privacyEnabled }
  signal: AbortSignal (for cancellation)
}

bookData {
  title: string
  subtitle: string
  preface: string
  chapters: [
    {
      number: int
      title: string
      introduction: string
      sections: [ { title, content, keyPoints, definitions } ]
      summary: string
    }
  ]
}
```

### Function Call Graph

```
processFile()
├── extractText()
├── chunkTextForLocalModels() or chunkText()
├─→ generateAcademicProse() [multiple times]
│   ├── buildAcademicProsePrompt()
│   └── callProvider(callLocalModel or callOpenAI/callAnthropic)
├── Combine prose chunks
├── refineTextbookContent()
│   ├── buildTextbookRefinementPrompt()
│   ├── callProvider()
│   ├── extractJsonPayload()
│   └── validateTextbookSchema()
└── showDone()
    └── displayResults() and enable downloads
```

## Future Enhancements

1. **Streaming Responses**
   - Show prose generation in real-time
   - Better progress feedback

2. **Concurrent Processing**
   - Process multiple chunks in parallel (with rate limiting)
   - Reduce total time for large documents

3. **Caching**
   - Cache prose by content hash
   - Reuse for similar documents

4. **Model Selection**
   - Let users choose specific local model
   - Fallback to secondary provider

5. **Custom Prompts**
   - User-defined tone/style preferences
   - Domain-specific customization

---

**Architecture complete—ready for production deployment!**
