let selectedFile = null;
let selectedFileName = "";
let bookData = null;
let isProcessing = false;
let stopRequested = false;
let currentAbortController = null;
let localConnection = {
  connected: false,
  provider: "",
  baseUrl: "",
  model: "",
};

const AI_SOURCE_STORAGE_KEY = "aiSource";
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

const appRoot = document.querySelector(".app");
const fileInput = document.getElementById("file-input");
const apiKeyInput = document.getElementById("api-key");
const providerSelect = document.getElementById("ai-provider");
const aiSourceRadios = Array.from(document.querySelectorAll("input[name='ai-source']"));
const fileMeta = document.getElementById("file-meta");
const generateButton = document.getElementById("btn-generate");
const stopButton = document.getElementById("btn-stop");
const errorBox = document.getElementById("error-msg");
const progressSection = document.getElementById("progress-section");
const progressBar = document.getElementById("progress-bar");
const progressPercent = document.getElementById("progress-percent");
const progressLabel = document.getElementById("progress-label");
const progressSteps = document.getElementById("progress-steps");
const doneSection = document.getElementById("done-section");
const resultMeta = document.getElementById("result-meta");
const chapterList = document.getElementById("chapter-list");
const pdfButton = document.getElementById("btn-pdf");
const docxButton = document.getElementById("btn-docx");
const apiModePanel = document.getElementById("api-mode-panel");
const localModePanel = document.getElementById("local-mode-panel");
const checkConnectionButton = document.getElementById("check-connection");
const localStatus = document.getElementById("local-status");
const localStatusDetail = document.getElementById("local-status-detail");
const outputStyleRadios = Array.from(document.querySelectorAll("input[name='output-style']"));
const structureControlRadios = Array.from(document.querySelectorAll("input[name='structure-control']"));
const privacyModeCheckbox = document.getElementById("privacy-mode");

const LOCAL_TARGETS = {
  ollama: "http://localhost:11434",
  lmstudio: "http://localhost:1234",
};

const PROVIDER_CONFIG = {
  anthropic: {
    label: "Anthropic (Claude)",
    placeholder: "sk-ant-...",
    hint: "Get your key at console.anthropic.com",
  },
  openai: {
    label: "OpenAI (GPT)",
    placeholder: "sk-...",
    hint: "Get your key at platform.openai.com",
  },
  gemini: {
    label: "Google (Gemini)",
    placeholder: "AIza...",
    hint: "Get your key at aistudio.google.com",
  },
  grok: {
    label: "xAI (Grok)",
    placeholder: "xai-...",
    hint: "Get your key at console.x.ai",
  },
};

function updateProviderUI() {
  const provider = providerSelect ? providerSelect.value : "openai";
  const config = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.openai;
  if (apiKeyInput) apiKeyInput.placeholder = config.placeholder;
  const hint = document.getElementById("api-key-hint");
  if (hint) hint.textContent = config.hint;
  localStorage.setItem("aiProvider", provider);
}

const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const PROGRESS_STEPS = [
  { id: "extracting", label: "Extracting text" },
  { id: "structuring", label: "Structuring content" },
  { id: "generating", label: "Generating textbook" },
  { id: "finalizing", label: "Finalizing" },
];

const STRICT_SCHEMA = {
  title: "string",
  subtitle: "string",
  preface: "string",
  chapters: [
    {
      number: "number",
      title: "string",
      introduction: "string",
      sections: [
        {
          title: "string",
          content: "string",
          keyPoints: ["string"],
          definitions: [{ term: "string", definition: "string" }],
        },
      ],
      summary: "string",
    },
  ],
};

initializeApp();

function initializeApp() {
  const storedSource = localStorage.getItem(AI_SOURCE_STORAGE_KEY) || "api";

  const defaultSource = ["api", "local"].includes(storedSource) ? storedSource : "api";
  const selectedRadio = aiSourceRadios.find(radio => radio.value === defaultSource);
  if (selectedRadio) selectedRadio.checked = true;

  if (apiKeyInput) {
    apiKeyInput.addEventListener("input", () => {
      updateGenerateButtonState();
    });
  }

  aiSourceRadios.forEach(radio => {
    radio.addEventListener("change", () => {
      localStorage.setItem(AI_SOURCE_STORAGE_KEY, getSelectedAiSource());
      updateSourcePanelVisibility();
      updateChoicePills();
      updateGenerateButtonState();
    });
  });

  outputStyleRadios.forEach(radio => {
    radio.addEventListener("change", updateChoicePills);
  });

  structureControlRadios.forEach(radio => {
    radio.addEventListener("change", updateChoicePills);
  });

  fileInput.addEventListener("change", event => {
    const file = event.target.files[0];
    if (file) {
      handleFile(file);
      return;
    }
    clearFile();
  });

  generateButton.addEventListener("click", processFile);
  stopButton.addEventListener("click", stopProcessing);
  pdfButton.addEventListener("click", downloadPDF);
  docxButton.addEventListener("click", downloadDOCX);
  checkConnectionButton.addEventListener("click", async () => {
    hideError();
    await checkLocalConnection(true);
    updateGenerateButtonState();
  });

  // Restore saved provider
  const savedProvider = localStorage.getItem("aiProvider") || "openai";
  if (providerSelect) providerSelect.value = savedProvider;
  updateProviderUI();

  // Update UI on provider change
  if (providerSelect) {
    providerSelect.addEventListener("change", () => {
      updateProviderUI();
      updateGenerateButtonState();
    });
  }

  updateSourcePanelVisibility();
  updateChoicePills();
  renderLocalStatus();
  setProgress(0, "extracting", "Preparing");
  setAppState("idle");
  updateGenerateButtonState();
}

function updateChoicePills() {
  const allPills = Array.from(document.querySelectorAll(".choice-pill"));
  allPills.forEach(pill => {
    const radio = pill.querySelector("input[type='radio']");
    if (!radio) {
      pill.classList.remove("active");
      return;
    }
    pill.classList.toggle("active", radio.checked);
  });
}

function getSelectedAiSource() {
  const selected = aiSourceRadios.find(radio => radio.checked);
  return selected ? selected.value : "api";
}

function updateSourcePanelVisibility() {
  const source = getSelectedAiSource();
  apiModePanel.classList.toggle("visible", source === "api");
  localModePanel.classList.toggle("visible", source === "local");
}

function providerName(provider) {
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  if (provider === "ollama") return "Ollama";
  if (provider === "lmstudio") return "LM Studio";
  return "Unknown";
}

function getActiveApiConfig() {
  const apiKey = apiKeyInput ? apiKeyInput.value.trim() : "";
  if (!apiKey) return null;
  return { apiKey, provider: getSelectedProvider() };
}

function getSelectedProvider() {
  return (providerSelect && providerSelect.value) || "openai";
}

function updateGenerateButtonState() {
  if (isProcessing) {
    generateButton.disabled = true;
    return;
  }

  const hasFile = Boolean(selectedFile);
  const source = getSelectedAiSource();
  const canUseApi = source === "api" && Boolean(getActiveApiConfig());
  const canUseLocal = source === "local" && localConnection.connected;
  const canGenerate = hasFile && (canUseApi || canUseLocal);

  generateButton.disabled = !canGenerate;

  if (!isProcessing) {
    const nextState = canGenerate ? "ready" : "idle";
    if (appRoot) appRoot.setAttribute("data-state", nextState);
  }
}

function setAppState(state) {
  if (appRoot) {
    appRoot.setAttribute("data-state", state);
  }

  const disabled = state === "processing";
  isProcessing = disabled;

  if (stopButton) {
    stopButton.style.display = disabled ? "block" : "none";
    stopButton.disabled = !disabled;
  }

  if (apiKeyInput) apiKeyInput.disabled = disabled;
  if (providerSelect) providerSelect.disabled = disabled;
  fileInput.disabled = disabled;
  checkConnectionButton.disabled = disabled;
  aiSourceRadios.forEach(radio => {
    radio.disabled = disabled;
  });
  outputStyleRadios.forEach(radio => {
    radio.disabled = disabled;
  });
  structureControlRadios.forEach(radio => {
    radio.disabled = disabled;
  });
  privacyModeCheckbox.disabled = disabled;

  updateGenerateButtonState();
}

function renderLocalStatus() {
  if (!localConnection.connected) {
    localStatus.textContent = "Not connected";
    localStatus.classList.remove("connected");
    localStatusDetail.textContent = "Check Ollama on localhost:11434 or LM Studio on localhost:1234";
    return;
  }

  localStatus.textContent = "Connected";
  localStatus.classList.add("connected");
  localStatusDetail.textContent = `Using ${providerName(localConnection.provider)} model: ${localConnection.model}`;
}

async function checkLocalConnection(showInlineError = false) {
  checkConnectionButton.disabled = true;
  localStatus.textContent = "Checking...";
  localStatus.classList.remove("connected");
  localStatusDetail.textContent = "Attempting connection to local endpoints";

  try {
    try {
      const ollamaResponse = await fetch(`${LOCAL_TARGETS.ollama}/api/tags`);
      if (ollamaResponse.ok) {
        const ollamaPayload = await ollamaResponse.json();
        const model = Array.isArray(ollamaPayload.models) && ollamaPayload.models.length
          ? String(ollamaPayload.models[0].name || "")
          : "";

        if (model) {
          localConnection = {
            connected: true,
            provider: "ollama",
            baseUrl: LOCAL_TARGETS.ollama,
            model,
          };
          renderLocalStatus();
          return true;
        }
      }
    } catch (_) {
      // Continue to LM Studio check.
    }

    try {
      const lmResponse = await fetch(`${LOCAL_TARGETS.lmstudio}/v1/models`);
      if (lmResponse.ok) {
        const lmPayload = await lmResponse.json();
        const model = Array.isArray(lmPayload.data) && lmPayload.data.length
          ? String((lmPayload.data[0] && lmPayload.data[0].id) || "")
          : "";

        if (model) {
          localConnection = {
            connected: true,
            provider: "lmstudio",
            baseUrl: LOCAL_TARGETS.lmstudio,
            model,
          };
          renderLocalStatus();
          return true;
        }
      }
    } catch (_) {
      // Fall through to not connected state.
    }

    localConnection = {
      connected: false,
      provider: "",
      baseUrl: "",
      model: "",
    };
    renderLocalStatus();
    if (showInlineError) {
      showError("Could not connect to Ollama or LM Studio. Make sure one local model server is running.");
    }
    return false;
  } finally {
    checkConnectionButton.disabled = isProcessing;
  }
}

function handleFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (!["pdf", "pptx"].includes(ext)) {
    showError("Only PDF and PPTX files are supported.");
    return;
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    showError("File too large. Maximum allowed size is 20MB.");
    return;
  }

  hideError();
  selectedFile = file;
  selectedFileName = file.name;
  fileMeta.textContent = `${file.name} (${formatSize(file.size)})`;
  fileMeta.style.display = "block";

  if (bookData) {
    doneSection.style.display = "none";
  }

  setAppState("file-selected");
  updateGenerateButtonState();
}

function clearFile() {
  selectedFile = null;
  selectedFileName = "";
  fileMeta.textContent = "";
  fileMeta.style.display = "none";
  fileInput.value = "";
  setAppState("idle");
  updateGenerateButtonState();
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.style.display = "block";
}

function hideError() {
  errorBox.style.display = "none";
  errorBox.textContent = "";
}

function setProgress(percent, activeStepId, label) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  progressBar.style.width = `${safePercent}%`;
  progressPercent.textContent = `${Math.round(safePercent)}%`;
  progressLabel.textContent = label;

  const activeIndex = PROGRESS_STEPS.findIndex(step => step.id === activeStepId);
  progressSteps.innerHTML = PROGRESS_STEPS.map((step, index) => {
    let marker = "□";
    let className = "";
    if (index < activeIndex || safePercent >= 100) {
      marker = "✓";
      className = "done";
    } else if (index === activeIndex && safePercent < 100) {
      marker = "→";
      className = "active";
    }
    return `<li class="${className}">${marker} ${step.label}</li>`;
  }).join("");
}

function chunkText(text, maxWords = 2500, overlapWords = 250) {
  const words = String(text)
    .split(/\s+/)
    .map(word => word.trim())
    .filter(Boolean);

  if (words.length <= maxWords) {
    return [words.join(" ")];
  }

  const chunks = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(words.length, start + maxWords);
    chunks.push(words.slice(start, end).join(" "));
    if (end === words.length) break;
    start = Math.max(0, end - overlapWords);
  }

  return chunks;
}

function chunkTextForLocalModels(text, wordLimit = 600) {
  // Split by paragraphs first to preserve structure
  const paragraphs = String(text)
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  const chunks = [];
  let currentChunk = [];
  let currentWordCount = 0;

  for (const paragraph of paragraphs) {
    const wordCount = paragraph.split(/\s+/).length;

    // If adding this paragraph exceeds limit and we have content, start new chunk
    if (currentWordCount + wordCount > wordLimit && currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n\n"));
      currentChunk = [];
      currentWordCount = 0;
    }

    currentChunk.push(paragraph);
    currentWordCount += wordCount;
  }

  // Add remaining content
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join("\n\n"));
  }

  return chunks.length > 0 ? chunks : [text];
}

function getPromptOptions() {
  const outputStyle = outputStyleRadios.find(radio => radio.checked)?.value || "Standard Textbook";
  const structure = structureControlRadios.find(radio => radio.checked)?.value || "Automatic";
  const privacyEnabled = Boolean(privacyModeCheckbox && privacyModeCheckbox.checked);

  return {
    outputStyle,
    structure,
    privacyEnabled,
  };
}

function buildPrompt(rawText, options) {
  return [
    "Convert this into a textbook.",
    "",
    `Output style: ${options.outputStyle}`,
    `Structure: ${options.structure}`,
    `Privacy: ${options.privacyEnabled ? "Enabled" : "Disabled"}`,
    "",
    "Now convert the source material into a polished academic textbook JSON.",
    "Output must be valid JSON only. No markdown, no commentary.",
    "",
    "Requirements:",
    "- Keep language clear, scholarly, and structured.",
    "- Ensure chapter and section ordering is logical.",
    "- Fill missing context conservatively; do not fabricate niche facts.",
    `- Match this strict schema exactly: ${JSON.stringify(STRICT_SCHEMA)}`,
    "",
    "Source material:",
    rawText,
  ].join("\n");
}

function buildAcademicProsePrompt(chunkText) {
  return [
    "You are an expert academic writer specializing in clear, well-structured educational content.",
    "",
    "Your task is to expand and refine the following source material into a detailed, formal academic prose section.",
    "",
    "Requirements:",
    "- Write in formal academic tone suitable for a university-level textbook",
    "- Expand concepts with clear explanations and logical flow",
    "- Organize content into paragraph form (NOT bullet points or lists)",
    "- Add transitions between ideas to improve readability",
    "- Include relevant context and background information where needed",
    "- Maintain factual accuracy; do not fabricate information",
    "- Aim for 300-800 words depending on source material",
    "",
    "Source material to expand:",
    chunkText,
  ].join("\n");
}

function buildTextbookRefinementPrompt(combinedText) {
  return [
    "You are an expert textbook editor and academic writer.",
    "",
    "Your task is to refine and structure the following academic content into a complete, well-organized textbook in strict JSON format.",
    "",
    "Requirements:",
    "- Organize content into logical chapters (typically 3-6 chapters for a coherent textbook)",
    "- Within each chapter, create 2-4 sections with clear titles",
    "- Maintain formal academic tone throughout",
    "- Ensure smooth transitions and logical flow between sections",
    "- Keep all details and explanations from the source material",
    "- Add a brief, engaging preface that introduces the subject",
    "- For each section, provide:",
    "  * A clear, informative title",
    "  * Detailed content (2-4 paragraphs minimum)",
    "  * 2-3 key points summarizing main ideas",
    "  * 1-2 important definitions or terms",
    "- Output ONLY valid JSON matching this exact structure (no markdown, no commentary):",
    "",
    JSON.stringify(STRICT_SCHEMA, null, 2),
    "",
    "Academic content to structure:",
    combinedText,
  ].join("\n");
}

function extractJsonPayload(rawText) {
  if (!rawText || !String(rawText).trim()) {
    throw new Error("Empty model response");
  }

  const raw = String(rawText).trim();
  try {
    return JSON.parse(raw);
  } catch (_) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Model response did not contain JSON");
    }
    return JSON.parse(match[0]);
  }
}

function validateTextbookSchema(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Invalid textbook payload");
  }

  const chapters = Array.isArray(candidate.chapters) ? candidate.chapters : [];
  if (!chapters.length) {
    throw new Error("Textbook must contain at least one chapter");
  }

  return {
    title: String(candidate.title || "Generated Textbook"),
    subtitle: String(candidate.subtitle || ""),
    preface: String(candidate.preface || ""),
    chapters: chapters.map((chapter, index) => ({
      number: Number(chapter.number) || index + 1,
      title: String(chapter.title || `Chapter ${index + 1}`),
      introduction: String(chapter.introduction || ""),
      sections: Array.isArray(chapter.sections)
        ? chapter.sections.map(section => ({
            title: String(section.title || "Untitled Section"),
            content: String(section.content || ""),
            keyPoints: Array.isArray(section.keyPoints)
              ? section.keyPoints.map(item => String(item))
              : [],
            definitions: Array.isArray(section.definitions)
              ? section.definitions.map(item => ({
                  term: String((item && item.term) || ""),
                  definition: String((item && item.definition) || ""),
                }))
              : [],
          }))
        : [],
      summary: String(chapter.summary || ""),
    })),
  };
}

function mergeTextbooks(parts) {
  if (!parts.length) {
    throw new Error("No generated textbook parts to merge");
  }

  const merged = {
    title: parts[0].title || "Compiled Textbook",
    subtitle: parts[0].subtitle || "A Comprehensive Academic Textbook",
    preface: parts.map(part => part.preface).filter(Boolean).slice(0, 2).join("\n\n"),
    chapters: [],
  };

  let chapterNumber = 1;
  for (const part of parts) {
    for (const chapter of part.chapters || []) {
      merged.chapters.push({ ...chapter, number: chapterNumber++ });
    }
  }

  return validateTextbookSchema(merged);
}

async function extractPdfText(file, signal) {
  ensurePdfJsLoaded();
  throwIfStopped(signal);
  const arrayBuffer = await file.arrayBuffer();
  throwIfStopped(signal);
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let text = "";
  for (let i = 1; i <= pdf.numPages; i += 1) {
    throwIfStopped(signal);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(item => (item && item.str ? item.str : ""));
    text += strings.join(" ") + "\n\n";
  }

  if (!text.trim()) {
    throw new Error("No readable text found in PDF. This file may be scanned and require OCR.");
  }

  return text;
}

function ensurePdfJsLoaded() {
  if (typeof pdfjsLib === "undefined") {
    throw new Error("PDF.js failed to load");
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
}

function slideNumber(path) {
  const match = path.match(/slide(\d+)\.xml$/);
  return match ? Number(match[1]) : 0;
}

async function extractPptxText(file, signal) {
  if (!window.JSZip) {
    throw new Error("PPTX parser is not loaded");
  }

  throwIfStopped(signal);
  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const slidePaths = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  if (!slidePaths.length) {
    throw new Error("No slides found in PPTX file");
  }

  const blocks = [];
  for (const path of slidePaths) {
    throwIfStopped(signal);
    const xml = await zip.files[path].async("string");
    const document = new DOMParser().parseFromString(xml, "application/xml");
    const textNodes = Array.from(document.getElementsByTagName("a:t"));
    const lines = textNodes.map(node => (node.textContent || "").trim()).filter(Boolean);
    if (!lines.length) continue;

    blocks.push(`[Slide ${slideNumber(path)}]\n${lines.join("\n")}`);
  }

  if (!blocks.length) {
    throw new Error("No text content found in PPTX file");
  }
  return blocks.join("\n\n");
}

function cleanExtractedText(rawText) {
  const text = String(rawText || "").replace(/\r/g, "\n");
  const normalizedLines = text
    .split("\n")
    .map(line => line.replace(/\s+/g, " ").trim());

  const lineFrequency = new Map();
  normalizedLines.forEach(line => {
    if (!line || line.length > 80) return;
    lineFrequency.set(line, (lineFrequency.get(line) || 0) + 1);
  });

  const repeatedLines = new Set(
    Array.from(lineFrequency.entries())
      .filter(([, count]) => count >= 3)
      .map(([line]) => line),
  );

  const filteredLines = normalizedLines.filter(line => {
    if (!line) return true;
    if (/^\[Page\s+\d+\]$/.test(line) || /^\[Slide\s+\d+\]$/.test(line)) return true;
    return !repeatedLines.has(line);
  });

  const mergedLines = [];
  for (const line of filteredLines) {
    if (!line) {
      mergedLines.push("");
      continue;
    }

    const previous = mergedLines.length ? mergedLines[mergedLines.length - 1] : "";
    if (
      previous &&
      previous !== "" &&
      !/[.!?:;)]$/.test(previous) &&
      /^[a-z]/.test(line)
    ) {
      mergedLines[mergedLines.length - 1] = `${previous} ${line}`;
      continue;
    }

    mergedLines.push(line);
  }

  return mergedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractText(file, signal) {
  const extension = file.name.split(".").pop().toLowerCase();
  let rawText = "";

  if (extension === "pdf") {
    rawText = await extractPdfText(file, signal);
  } else if (extension === "pptx") {
    rawText = await extractPptxText(file, signal);
  } else {
    throw new Error("Unsupported file type. Only PDF and PPTX are allowed.");
  }

  const cleaned = cleanExtractedText(rawText);
  if (!cleaned) {
    throw new Error("No readable text could be extracted from this document.");
  }

  return cleaned;
}

async function parseErrorMessage(response) {
  let message = "Provider request failed";
  try {
    const payload = await response.json();
    message =
      payload?.error?.message ||
      payload?.error?.type ||
      payload?.message ||
      payload?.detail ||
      message;
  } catch (_) {
    message = response.statusText || message;
  }

  if (response.status === 401 || response.status === 403) {
    return "Invalid API key";
  }
  if (response.status === 429) {
    return "Rate limit reached. Please retry in a moment.";
  }
  return `${message} (${response.status})`;
}

async function callOpenAI(prompt, apiKey, signal) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You output only strict JSON that follows the requested schema." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = await response.json();
  return payload?.choices?.[0]?.message?.content || "";
}

async function callAnthropic(prompt, apiKey, signal) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      temperature: 0.2,
      system: "You output only strict JSON that follows the requested schema.",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = await response.json();
  const contentBlocks = Array.isArray(payload?.content) ? payload.content : [];
  return contentBlocks
    .filter(block => block && block.type === "text")
    .map(block => block.text || "")
    .join("\n")
    .trim();
}

async function callGemini(prompt, apiKey, signal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response));
  const payload = await response.json();
  return payload?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callGrok(prompt, apiKey, signal) {
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-3-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "You output only strict JSON that follows the requested schema." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response));
  const payload = await response.json();
  return payload?.choices?.[0]?.message?.content || "";
}

async function callLocalModel(prompt, connection, signal) {
  if (!connection || !connection.connected) {
    throw new Error("Local model is not connected");
  }

  if (connection.provider === "ollama") {
    const response = await fetch(`${connection.baseUrl}/api/generate`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: connection.model,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response));
    }

    const payload = await response.json();
    return String(payload?.response || "").trim();
  }

  if (connection.provider === "lmstudio") {
    const response = await fetch(`${connection.baseUrl}/v1/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: connection.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: "You output only strict JSON that follows the requested schema." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response));
    }

    const payload = await response.json();
    return payload?.choices?.[0]?.message?.content || "";
  }

  throw new Error("Unsupported local model provider");
}

async function generateTextbookJson(rawText, runtimeConfig) {
  const prompt = buildPrompt(rawText, runtimeConfig.options);

  const callProvider = async customPrompt => {
    throwIfStopped(runtimeConfig.signal);
    if (runtimeConfig.source === "local") {
      return callLocalModel(customPrompt, runtimeConfig.localConnection, runtimeConfig.signal);
    }
    switch (runtimeConfig.provider) {
      case "anthropic": return callAnthropic(customPrompt, runtimeConfig.apiKey, runtimeConfig.signal);
      case "openai":    return callOpenAI(customPrompt, runtimeConfig.apiKey, runtimeConfig.signal);
      case "gemini":    return callGemini(customPrompt, runtimeConfig.apiKey, runtimeConfig.signal);
      case "grok":      return callGrok(customPrompt, runtimeConfig.apiKey, runtimeConfig.signal);
      default: throw new Error(`Unsupported provider: ${runtimeConfig.provider}`);
    }
  };

  try {
    const firstRaw = await callProvider(prompt);
    const firstJson = extractJsonPayload(firstRaw);
    return validateTextbookSchema(firstJson);
  } catch (firstError) {
    if (String(firstError.message || "").toLowerCase().includes("invalid api key")) {
      throw firstError;
    }

    const retryPrompt = `${prompt}\n\nYour previous response was invalid. Return only valid JSON matching the schema with all required fields.`;
    const secondRaw = await callProvider(retryPrompt);
    const secondJson = extractJsonPayload(secondRaw);
    return validateTextbookSchema(secondJson);
  }
}

async function generateAcademicProse(chunkText, runtimeConfig) {
  const prompt = buildAcademicProsePrompt(chunkText);

  const callProvider = async customPrompt => {
    throwIfStopped(runtimeConfig.signal);
    if (runtimeConfig.source === "local") {
      return callLocalModel(customPrompt, runtimeConfig.localConnection, runtimeConfig.signal);
    }
    switch (runtimeConfig.provider) {
      case "anthropic": return callAnthropic(customPrompt, runtimeConfig.apiKey, runtimeConfig.signal);
      case "openai":    return callOpenAI(customPrompt, runtimeConfig.apiKey, runtimeConfig.signal);
      case "gemini":    return callGemini(customPrompt, runtimeConfig.apiKey, runtimeConfig.signal);
      case "grok":      return callGrok(customPrompt, runtimeConfig.apiKey, runtimeConfig.signal);
      default: throw new Error(`Unsupported provider: ${runtimeConfig.provider}`);
    }
  };

  try {
    const response = await callProvider(prompt);
    return response.trim();
  } catch (error) {
    console.error("Error generating prose for chunk:", error);
    // Fallback: return the original text if prose generation fails
    return chunkText;
  }
}

async function refineTextbookContent(combinedText, runtimeConfig) {
  const prompt = buildTextbookRefinementPrompt(combinedText);

  const callProvider = async customPrompt => {
    throwIfStopped(runtimeConfig.signal);
    if (runtimeConfig.source === "local") {
      return callLocalModel(customPrompt, runtimeConfig.localConnection, runtimeConfig.signal);
    }
    switch (runtimeConfig.provider) {
      case "anthropic": return callAnthropic(customPrompt, runtimeConfig.apiKey, runtimeConfig.signal);
      case "openai":    return callOpenAI(customPrompt, runtimeConfig.apiKey, runtimeConfig.signal);
      case "gemini":    return callGemini(customPrompt, runtimeConfig.apiKey, runtimeConfig.signal);
      case "grok":      return callGrok(customPrompt, runtimeConfig.apiKey, runtimeConfig.signal);
      default: throw new Error(`Unsupported provider: ${runtimeConfig.provider}`);
    }
  };

  try {
    const firstRaw = await callProvider(prompt);
    const firstJson = extractJsonPayload(firstRaw);
    return validateTextbookSchema(firstJson);
  } catch (firstError) {
    if (String(firstError.message || "").toLowerCase().includes("invalid api key")) {
      throw firstError;
    }

    const retryPrompt = `${prompt}\n\nYour previous response was invalid or incomplete. Return ONLY valid, complete JSON matching the schema with all required fields. Do not include any text outside the JSON.`;
    const secondRaw = await callProvider(retryPrompt);
    const secondJson = extractJsonPayload(secondRaw);
    return validateTextbookSchema(secondJson);
  }
}

async function processFile() {
  if (!selectedFile) return;
  const source = getSelectedAiSource();
  const apiConfig = getActiveApiConfig();
  const options = getPromptOptions();

  if (source === "api" && !apiConfig) {
    showError("Please enter an API key for the selected provider.");
    return;
  }

  if (source === "local" && !localConnection.connected) {
    showError("Local model is not connected. Click Check Connection first.");
    return;
  }

  if (source === "local" && localConnection.model && localConnection.model.includes("llama3.2")) {
    showError("⚠ llama3.2 is too slow for textbook generation. Run 'ollama pull mistral' in your terminal, restart Ollama, and click Check Connection again.");
    return;
  }

  const apiKey = apiConfig ? apiConfig.apiKey : "";

  const runtimeConfig = {
    source,
    apiKey,
    provider: source === "api" ? getSelectedProvider() : localConnection.provider,
    localConnection,
    options,
    signal: null,
  };

  stopRequested = false;
  currentAbortController = new AbortController();
  runtimeConfig.signal = currentAbortController.signal;

  hideError();
  doneSection.style.display = "none";
  progressSection.style.display = "grid";
  setAppState("processing");

  try {
    throwIfStopped(runtimeConfig.signal);
    setProgress(5, "extracting", "Extracting text from document");
    const extractedText = await extractText(selectedFile, runtimeConfig.signal);

    throwIfStopped(runtimeConfig.signal);
    setProgress(12, "extracting", "Text extracted, preparing chunks");

    // Use smaller chunks for local models to avoid overwhelming them
    const isLocalModel = source === "local";
    const wordLimit = isLocalModel ? 300 : 1500;
    const chunks = isLocalModel 
      ? chunkTextForLocalModels(extractedText, wordLimit)
      : chunkText(extractedText, 2500, 250);

    // ===== PASS 1: Generate academic prose for each chunk =====
    const proseChunks = [];
    for (let idx = 0; idx < chunks.length; idx += 1) {
      throwIfStopped(runtimeConfig.signal);
      const progressPercent = 12 + Math.floor(((idx + 1) / chunks.length) * 45);
      setProgress(
        progressPercent, 
        "structuring", 
        `Structuring content (${idx + 1}/${chunks.length})`
      );
      const prose = await generateAcademicProse(chunks[idx], runtimeConfig);
      proseChunks.push(prose);
    }

    // ===== PASS 2: Combine all prose sections =====
    throwIfStopped(runtimeConfig.signal);
    setProgress(65, "structuring", "Combining sections");
    const combinedText = proseChunks.join("\n\n");

    // ===== PASS 3: Final textbook refinement =====
    throwIfStopped(runtimeConfig.signal);
    setProgress(75, "generating", "Refining into textbook structure");
    bookData = await refineTextbookContent(combinedText, runtimeConfig);
    selectedFileName = selectedFile.name;

    setProgress(100, "finalizing", "Complete");
    showDone();
    setAppState("success");
  } catch (err) {
    progressSection.style.display = "none";
    if (isAbortError(err) || String(err.message || "").toLowerCase().includes("stopped by user")) {
      showError("Process stopped.");
    } else {
      showError(err.message || "Something went wrong. Please try again.");
    }
    setAppState("error");
  } finally {
    currentAbortController = null;
    stopRequested = false;
    if (!bookData) {
      setAppState(selectedFile ? "file-selected" : "idle");
    }
    updateGenerateButtonState();
  }
}

function showDone() {
  progressSection.style.display = "none";
  doneSection.style.display = "block";

  const sectionCount = bookData.chapters.reduce((total, chapter) => {
    return total + (Array.isArray(chapter.sections) ? chapter.sections.length : 0);
  }, 0);

  resultMeta.textContent = `${bookData.title} - ${bookData.chapters.length} chapters - ${sectionCount} sections`;
  chapterList.innerHTML = bookData.chapters
    .map(chapter => `<li>Chapter ${chapter.number}: ${esc(chapter.title)}</li>`)
    .join("");
}

function resetApp() {
  bookData = null;
  doneSection.style.display = "none";
  progressSection.style.display = "none";
  clearFile();
  hideError();
}

function downloadPDF() {
  if (!bookData) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 72;
  const mr = 72;
  const cw = pw - ml - mr;
  let y = ml;

  const newPage = bg => {
    doc.addPage();
    if (bg) {
      doc.setFillColor(...bg);
      doc.rect(0, 0, pw, ph, "F");
    } else {
      doc.setFillColor(250, 248, 244);
      doc.rect(0, 0, pw, ph, "F");
    }
    y = ml;
  };

  const checkY = (need = 40) => {
    if (y + need > ph - ml) newPage();
  };

  doc.setFillColor(14, 28, 54);
  doc.rect(0, 0, pw, ph, "F");
  doc.setFillColor(26, 46, 82);
  doc.rect(0, ph * 0.6, pw, ph * 0.4, "F");

  doc.setDrawColor(201, 168, 76);
  doc.setLineWidth(2);
  doc.line(ml, 90, ml + 80, 90);

  doc.setTextColor(245, 240, 232);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(201, 168, 76);
  doc.text("ACADEMIC TEXTBOOK", ml, 80);

  const titleLines = doc.splitTextToSize(bookData.title.toUpperCase(), cw);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(34);
  doc.setTextColor(245, 240, 232);
  titleLines.forEach((line, i) => {
    doc.text(line, ml, 130 + i * 44);
  });

  const afterTitle = 130 + titleLines.length * 44 + 20;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(14);
  doc.setTextColor(180, 200, 240);
  const subLines = doc.splitTextToSize(bookData.subtitle, cw);
  subLines.forEach((line, i) => doc.text(line, ml, afterTitle + i * 20));

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 120, 160);
  doc.text("Source: " + selectedFileName, ml, ph - 50);
  doc.text(new Date().getFullYear().toString(), pw - mr, ph - 50, { align: "right" });

  newPage([250, 248, 244]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(150, 120, 60);
  doc.text("PREFACE", ml, y);
  y += 14;
  doc.setDrawColor(201, 168, 76);
  doc.setLineWidth(1.5);
  doc.line(ml, y, ml + 50, y);
  y += 24;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(14, 28, 54);
  doc.text("Foreword", ml, y);
  y += 30;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(12);
  doc.setTextColor(50, 60, 80);
  doc.setLineHeightFactor(1.6);
  const prefLines = doc.splitTextToSize(bookData.preface, cw);
  doc.text(prefLines, ml, y);
  y += prefLines.length * 19 + 30;

  checkY(60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(150, 120, 60);
  doc.text("CONTENTS", ml, y);
  y += 14;
  doc.setDrawColor(201, 168, 76);
  doc.setLineWidth(1.5);
  doc.line(ml, y, ml + 50, y);
  y += 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(14, 28, 54);
  doc.text("Table of Contents", ml, y);
  y += 32;

  bookData.chapters.forEach(ch => {
    checkY(28);
    doc.setFillColor(240, 236, 226);
    doc.rect(ml, y - 14, cw, 24, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(14, 28, 54);
    doc.text(`Chapter ${ch.number}`, ml + 8, y);
    doc.setFont("helvetica", "normal");
    doc.text(ch.title, ml + 80, y);
    y += 22;
    (ch.sections || []).forEach(sec => {
      checkY(18);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(80, 90, 110);
      doc.text("->  " + sec.title, ml + 20, y);
      y += 16;
    });
    y += 6;
  });

  bookData.chapters.forEach(ch => {
    newPage([14, 28, 54]);
    doc.setFillColor(26, 46, 82);
    doc.rect(0, 0, pw, 180, "F");
    doc.setDrawColor(201, 168, 76);
    doc.setLineWidth(1);
    doc.line(ml, 185, pw - mr, 185);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(201, 168, 76);
    doc.text(`CHAPTER ${ch.number}`, ml, 60);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.setTextColor(245, 240, 232);
    const chLines = doc.splitTextToSize(ch.title, cw);
    chLines.forEach((line, i) => doc.text(line, ml, 90 + i * 34));

    y = 210;
    doc.setFillColor(250, 248, 244);
    doc.rect(0, 180, pw, ph - 180, "F");

    if (ch.introduction) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(11.5);
      doc.setTextColor(50, 60, 80);
      const iLines = doc.splitTextToSize(ch.introduction, cw);
      checkY(iLines.length * 17 + 20);
      doc.text(iLines, ml, y);
      y += iLines.length * 17 + 24;
    }

    (ch.sections || []).forEach(sec => {
      checkY(50);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(14, 28, 54);
      const shLines = doc.splitTextToSize(sec.title, cw);
      doc.text(shLines, ml, y);
      y += shLines.length * 18 + 4;
      doc.setDrawColor(201, 168, 76);
      doc.setLineWidth(0.75);
      doc.line(ml, y, ml + cw, y);
      y += 14;

      if (sec.content) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(30, 40, 55);
        const cLines = doc.splitTextToSize(sec.content, cw);
        checkY(cLines.length * 15 + 12);
        doc.text(cLines, ml, y);
        y += cLines.length * 15 + 16;
      }

      if (sec.keyPoints?.length) {
        const kpH = sec.keyPoints.length * 17 + 28;
        checkY(kpH + 8);
        doc.setFillColor(235, 240, 255);
        doc.roundedRect(ml, y, cw, kpH, 4, 4, "F");
        doc.setFillColor(14, 28, 54);
        doc.rect(ml, y, 4, kpH, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(14, 28, 54);
        doc.text("KEY POINTS", ml + 12, y + 15);
        let ky = y + 26;
        sec.keyPoints.forEach(kp => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(30, 45, 70);
          const kl = doc.splitTextToSize("*  " + kp, cw - 24);
          doc.text(kl, ml + 12, ky);
          ky += kl.length * 14 + 3;
        });
        y += kpH + 14;
      }

      if (sec.definitions?.length) {
        checkY(40);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(150, 120, 60);
        doc.text("DEFINITIONS", ml, y);
        y += 14;
        sec.definitions.forEach(definition => {
          checkY(28);
          doc.setFillColor(255, 250, 238);
          const dl = doc.splitTextToSize(definition.definition, cw - 110);
          const dh = Math.max(dl.length * 14, 22) + 16;
          doc.roundedRect(ml, y - 10, cw, dh, 3, 3, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(130, 95, 30);
          doc.text(definition.term + ":", ml + 8, y + 2);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(40, 45, 55);
          doc.text(dl, ml + 8, y + 16);
          y += dh + 8;
        });
      }
      y += 12;
    });

    if (ch.summary) {
      const sl = doc.splitTextToSize(ch.summary, cw - 20);
      const sh = sl.length * 14 + 32;
      checkY(sh + 10);
      doc.setFillColor(220, 228, 248);
      doc.roundedRect(ml, y, cw, sh, 6, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(14, 28, 54);
      doc.text("CHAPTER SUMMARY", ml + 12, y + 16);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(30, 45, 75);
      doc.text(sl, ml + 12, y + 28);
      y += sh + 16;
    }
  });

  const total = doc.internal.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(220, 215, 200);
    doc.setLineWidth(0.5);
    doc.line(ml, ph - 48, pw - mr, ph - 48);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(140, 130, 110);
    doc.text(bookData.title, ml, ph - 36);
    doc.text(String(i - 1), pw - mr, ph - 36, { align: "right" });
  }

  doc.save(bookData.title.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_") + "_textbook.pdf");
}

function downloadDOCX() {
  if (!bookData) return;
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${esc(bookData.title)}</title>
<style>
  body{font-family:"Times New Roman",serif;font-size:12pt;color:#1a1208;margin:1in;line-height:1.7}
  h1{font-family:Georgia,serif;font-size:28pt;color:#0e1c36;page-break-before:always;margin-bottom:6pt}
  h2{font-family:Georgia,serif;font-size:20pt;color:#0e1c36;margin-top:24pt;margin-bottom:8pt;border-bottom:2pt solid #c9a84c;padding-bottom:4pt;page-break-after:avoid}
  h3{font-family:Georgia,serif;font-size:14pt;color:#1a2e52;margin-top:16pt;margin-bottom:6pt;border-bottom:.5pt solid #ccc;padding-bottom:3pt}
  p{text-align:justify;margin-bottom:8pt}
  .cover{text-align:center;margin:2in 0;page-break-after:always}
  .cover h1{font-size:36pt;border:none;page-break-before:auto;color:#0e1c36}
  .cover .sub{font-size:16pt;color:#2a4478;font-style:italic;margin-top:12pt}
  .cover .src{font-size:10pt;color:#888;margin-top:2in}
  .preface{font-style:italic;margin:12pt 36pt;color:#334;border-left:3pt solid #c9a84c;padding-left:16pt}
  .kp{background:#eef1fb;border-left:4pt solid #0e1c36;padding:10pt 14pt;margin:10pt 0}
  .kp-head{font-weight:bold;font-size:10pt;color:#0e1c36;text-transform:uppercase;letter-spacing:1pt;margin-bottom:6pt}
  .kp p{margin:3pt 0}
  .def-box{background:#fffce8;border-left:4pt solid #c9a84c;padding:8pt 14pt;margin:8pt 0}
  .def-term{font-weight:bold;color:#7a5c1e}
  .summary{background:#dce6f5;padding:12pt 16pt;margin-top:16pt;border-radius:4pt}
  .sum-head{font-weight:bold;color:#0e1c36;text-transform:uppercase;font-size:9pt;letter-spacing:1pt;margin-bottom:6pt}
  .ch-label{font-size:9pt;color:#c9a84c;text-transform:uppercase;letter-spacing:3pt;margin-bottom:4pt}
  .toc-ch{font-weight:bold;margin-top:8pt}
  .toc-sec{margin-left:24pt;color:#556}
  .def-head{font-weight:bold;font-size:10pt;color:#7a5c1e;text-transform:uppercase;letter-spacing:1pt;margin-bottom:6pt;margin-top:10pt}
</style></head><body>
<div class="cover">
  <h1>${esc(bookData.title)}</h1>
  <div class="sub">${esc(bookData.subtitle)}</div>
  <div class="src">Source: ${esc(selectedFileName)}</div>
</div>

<h2>Preface</h2>
<p class="preface">${esc(bookData.preface)}</p>

<h2>Table of Contents</h2>
${bookData.chapters
  .map(
    ch => `
<p class="toc-ch">Chapter ${ch.number}: ${esc(ch.title)}</p>
${(ch.sections || []).map(s => `<p class="toc-sec">&nbsp;&nbsp;&nbsp;&nbsp;&#8594; ${esc(s.title)}</p>`).join("")}
`,
  )
  .join("")}

${bookData.chapters
  .map(
    ch => `
<div>
<p class="ch-label">Chapter ${ch.number}</p>
<h1>${esc(ch.title)}</h1>
${ch.introduction ? `<p style="font-style:italic;color:#445">${esc(ch.introduction)}</p>` : ""}
${(ch.sections || [])
  .map(
    sec => `
<h3>${esc(sec.title)}</h3>
${sec.content ? `<p>${esc(sec.content)}</p>` : ""}
${
  sec.keyPoints?.length
    ? `
<div class="kp">
<div class="kp-head">Key Points</div>
${sec.keyPoints.map(k => `<p>&#8226;&nbsp; ${esc(k)}</p>`).join("")}
</div>`
    : ""
}
${
  sec.definitions?.length
    ? `
<div class="def-head">Definitions</div>
${sec.definitions.map(d => `<div class="def-box"><span class="def-term">${esc(d.term)}:</span> ${esc(d.definition)}</div>`).join("")}`
    : ""
}
`,
  )
  .join("")}
${ch.summary ? `<div class="summary"><div class="sum-head">Chapter Summary</div><p>${esc(ch.summary)}</p></div>` : ""}
</div>
`,
  )
  .join("")}
</body></html>`;

  const blob = new Blob([html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = bookData.title.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_") + "_textbook.doc";
  anchor.click();
  URL.revokeObjectURL(url);
}

function esc(value) {
  if (!value) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
