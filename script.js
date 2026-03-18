let selectedFile = null;
let selectedFileName = "";
let bookData = null;
const API_KEY_STORAGE_KEY = "apiKey";
const PROVIDER_STORAGE_KEY = "providerPreference";
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const apiKeyInput = document.getElementById("api-key");
const providerSelect = document.getElementById("provider-select");
const keyToggle = document.getElementById("key-toggle");
const providerDetected = document.getElementById("provider-detected");

const STAGE_TITLES = {
  reading: "Reading your file...",
  extracting_text: "Extracting text from document...",
  structuring_content: "Structuring content with AI...",
  generating_textbook: "Generating textbook output...",
  complete: "Textbook generation complete",
  failed: "Textbook generation failed",
};

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

initializeByokControls();

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("dragover", event => {
  event.preventDefault();
  dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", event => {
  event.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = event.dataTransfer.files[0];
  if (file) handleFile(file);
});
fileInput.addEventListener("change", event => {
  const file = event.target.files[0];
  if (file) handleFile(file);
});
document.getElementById("file-remove").addEventListener("click", () => {
  selectedFile = null;
  selectedFileName = "";
  document.getElementById("file-selected").style.display = "none";
  dropZone.style.display = "block";
  updateGenerateButtonState();
  fileInput.value = "";
});

function initializeByokControls() {
  const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY) || "";
  const storedProvider = localStorage.getItem(PROVIDER_STORAGE_KEY) || "auto";

  apiKeyInput.value = storedKey;
  providerSelect.value = ["auto", "openai", "anthropic"].includes(storedProvider) ? storedProvider : "auto";

  apiKeyInput.addEventListener("input", () => {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKeyInput.value);
    updateProviderLabel();
    updateGenerateButtonState();
  });

  providerSelect.addEventListener("change", () => {
    localStorage.setItem(PROVIDER_STORAGE_KEY, providerSelect.value);
    updateProviderLabel();
    updateGenerateButtonState();
  });

  keyToggle.addEventListener("click", () => {
    const showing = apiKeyInput.type === "text";
    apiKeyInput.type = showing ? "password" : "text";
    keyToggle.textContent = showing ? "Show" : "Hide";
  });

  updateProviderLabel();
  updateGenerateButtonState();
}

function updateProviderLabel() {
  const key = apiKeyInput.value.trim();
  const detected = detectProviderFromKey(key);
  const selected = providerSelect.value;

  if (!key) {
    providerDetected.textContent = "Provider: Not detected";
    return;
  }

  if (selected === "auto") {
    providerDetected.textContent = detected
      ? `Provider: ${providerName(detected)} (auto)`
      : "Provider: Unknown key format";
    return;
  }

  providerDetected.textContent = `Provider: ${providerName(selected)} (manual)`;
}

function providerName(provider) {
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  return "Unknown";
}

function detectProviderFromKey(key) {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-")) return "openai";
  return "";
}

function getResolvedProvider() {
  const selected = providerSelect.value;
  if (selected !== "auto") return selected;
  return detectProviderFromKey(apiKeyInput.value.trim());
}

function updateGenerateButtonState() {
  const hasFile = Boolean(selectedFile);
  const hasKey = Boolean(apiKeyInput.value.trim());
  document.getElementById("btn-generate").disabled = !(hasFile && hasKey);
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

  document.getElementById("file-icon").textContent = ext === "pdf" ? "📕" : "📊";
  document.getElementById("file-name-text").textContent = file.name;
  document.getElementById("file-size-text").textContent = formatSize(file.size);
  document.getElementById("file-selected").style.display = "flex";
  dropZone.style.display = "none";
  updateGenerateButtonState();
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function showError(msg) {
  document.getElementById("error-text").textContent = msg;
  document.getElementById("error-msg").style.display = "flex";
}

function hideError() {
  document.getElementById("error-msg").style.display = "none";
}

function setProgress(title, subtitle) {
  document.getElementById("progress-title").textContent = title;
  document.getElementById("progress-subtitle").textContent = subtitle;
}

function stageTitle(stage) {
  return STAGE_TITLES[stage] || "Processing your document...";
}

function chunkText(text, maxChars = 14000, overlap = 500) {
  const normalized = text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .join("\n");

  if (normalized.length <= maxChars) return [normalized];

  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + maxChars);
    chunks.push(normalized.slice(start, end));
    if (end === normalized.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

function buildPrompt(rawText) {
  return [
    "Convert the following source material into a polished academic textbook JSON.",
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

async function extractPdfText(file) {
  if (!window.pdfjsLib) {
    throw new Error("PDF parser is not loaded");
  }

  if (window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.js";
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = window.pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  const pages = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const textContent = await page.getTextContent();
    const content = textContent.items
      .map(item => (item && item.str ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (content) {
      pages.push(`[Page ${pageNo}]\n${content}`);
    }
  }

  if (!pages.length) {
    throw new Error("No readable text found in PDF. This file may be scanned and require server-side OCR.");
  }

  return pages.join("\n\n");
}

function slideNumber(path) {
  const match = path.match(/slide(\d+)\.xml$/);
  return match ? Number(match[1]) : 0;
}

async function extractPptxText(file) {
  if (!window.JSZip) {
    throw new Error("PPTX parser is not loaded");
  }

  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const slidePaths = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  if (!slidePaths.length) {
    throw new Error("No slides found in PPTX file");
  }

  const blocks = [];
  for (const path of slidePaths) {
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

async function extractClientText(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "pdf") {
    return extractPdfText(file);
  }
  if (extension === "pptx") {
    return extractPptxText(file);
  }
  throw new Error("Unsupported file type. Only PDF and PPTX are allowed.");
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

async function callOpenAI(prompt, apiKey) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
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

async function callAnthropic(prompt, apiKey) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
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

async function generateTextbookJson(rawText, provider, apiKey) {
  const prompt = buildPrompt(rawText);

  const callProvider = async customPrompt => {
    if (provider === "openai") {
      return callOpenAI(customPrompt, apiKey);
    }
    if (provider === "anthropic") {
      return callAnthropic(customPrompt, apiKey);
    }
    throw new Error("Unable to determine provider from API key");
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

async function processFile() {
  if (!selectedFile) return;
  const apiKey = apiKeyInput.value.trim();
  const provider = getResolvedProvider();

  if (!apiKey) {
    showError("Please enter your API key before generating.");
    return;
  }
  if (!provider) {
    showError("Invalid API key format. Use an OpenAI key (sk-) or Anthropic key (sk-ant-).");
    return;
  }

  hideError();

  document.getElementById("upload-section").style.display = "none";
  document.getElementById("progress-section").style.display = "block";
  document.getElementById("done-section").style.display = "none";

  try {
    setProgress(stageTitle("reading"), "Loading file contents (10%)");
    const extractedText = await extractClientText(selectedFile);

    setProgress(stageTitle("extracting_text"), "Preparing extracted text (25%)");
    const chunks = chunkText(extractedText);
    const partialTextbooks = [];

    for (let idx = 0; idx < chunks.length; idx += 1) {
      const progress = 30 + Math.floor(((idx + 1) / chunks.length) * 55);
      setProgress(
        stageTitle("structuring_content"),
        `Calling ${providerName(provider)} for chunk ${idx + 1}/${chunks.length} (${progress}%)`,
      );
      const textbookPart = await generateTextbookJson(chunks[idx], provider, apiKey);
      partialTextbooks.push(textbookPart);
    }

    setProgress(stageTitle("generating_textbook"), "Merging generated textbook chapters (95%)");
    bookData = mergeTextbooks(partialTextbooks);
    selectedFileName = selectedFile.name;
    showDone();
  } catch (err) {
    document.getElementById("upload-section").style.display = "block";
    document.getElementById("progress-section").style.display = "none";
    showError(err.message || "Something went wrong. Please try again.");
  }
}

function showDone() {
  document.getElementById("progress-section").style.display = "none";
  document.getElementById("done-section").style.display = "block";

  document.getElementById("result-title").textContent = `"${bookData.title}"`;
  document.getElementById("result-meta").textContent =
    `${bookData.chapters.length} chapters · ${bookData.chapters.reduce((a, c) => a + (c.sections || []).length, 0)} sections`;

  const body = document.getElementById("preview-body");
  body.innerHTML = bookData.chapters
    .map(
      ch => `
    <div class="chapter-item">
      <div class="chapter-num">Chapter ${ch.number}</div>
      <div class="chapter-title">${ch.title}</div>
      <div class="section-count">${(ch.sections || []).length} section${(ch.sections || []).length !== 1 ? "s" : ""}</div>
    </div>
  `,
    )
    .join("");
}

function resetApp() {
  selectedFile = null;
  selectedFileName = "";
  bookData = null;
  document.getElementById("upload-section").style.display = "block";
  document.getElementById("done-section").style.display = "none";
  document.getElementById("progress-section").style.display = "none";
  document.getElementById("file-selected").style.display = "none";
  dropZone.style.display = "block";
  updateGenerateButtonState();
  fileInput.value = "";
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
