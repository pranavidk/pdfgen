from __future__ import annotations

import io
import logging

import fitz
import pytesseract
from PIL import Image

logger = logging.getLogger(__name__)


def ocr_pdf(file_path: str) -> str:
    text_parts: list[str] = []
    with fitz.open(file_path) as doc:
        for idx, page in enumerate(doc, start=1):
            pix = page.get_pixmap(dpi=200)
            image = Image.open(io.BytesIO(pix.tobytes("png")))
            page_text = pytesseract.image_to_string(image)
            if page_text and page_text.strip():
                text_parts.append(f"[Page {idx}]\n{page_text.strip()}")

    if not text_parts:
        logger.warning("OCR completed but no text was extracted")
    return "\n\n".join(text_parts)
