from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel, ValidationError, field_validator

try:
    from sentence_transformers import SentenceTransformer
    from sklearn.metrics.pairwise import cosine_similarity
except Exception:
    SentenceTransformer = None
    cosine_similarity = None


class Definition(BaseModel):
    term: str
    definition: str


class Section(BaseModel):
    title: str
    content: str
    keyPoints: list[str]
    definitions: list[Definition]


class Chapter(BaseModel):
    number: int
    title: str
    introduction: str
    sections: list[Section]
    summary: str


class Textbook(BaseModel):
    title: str
    subtitle: str
    preface: str
    chapters: list[Chapter]

    @field_validator("chapters")
    @classmethod
    def chapters_must_exist(cls, value: list[Chapter]) -> list[Chapter]:
        if not value:
            raise ValueError("At least one chapter is required")
        return value


def extract_json_payload(raw_text: str) -> dict[str, Any]:
    if not raw_text:
        raise ValueError("Empty model response")

    raw_text = raw_text.strip()
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]*\}", raw_text)
    if not match:
        raise ValueError("Model response did not contain JSON")

    return json.loads(match.group(0))


def validate_textbook_schema(candidate: dict[str, Any]) -> dict[str, Any]:
    try:
        parsed = Textbook.model_validate(candidate)
    except ValidationError as exc:
        raise ValueError(f"Schema validation failed: {exc}") from exc
    return parsed.model_dump()


def chunk_text(text: str, max_chars: int = 12000, overlap: int = 400) -> list[str]:
    normalized = "\n".join(line.strip() for line in text.splitlines() if line.strip())
    if len(normalized) <= max_chars:
        return [normalized]

    semantic_chunks = semantic_chunk_text(normalized, max_chars=max_chars)
    if semantic_chunks:
        return semantic_chunks

    chunks: list[str] = []
    start = 0
    while start < len(normalized):
        end = min(len(normalized), start + max_chars)
        chunks.append(normalized[start:end])
        if end == len(normalized):
            break
        start = max(0, end - overlap)
    return chunks


def semantic_chunk_text(text: str, max_chars: int = 12000) -> list[str]:
    if not SentenceTransformer or not cosine_similarity:
        return []

    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    if len(paragraphs) < 8:
        return []

    model = SentenceTransformer("all-MiniLM-L6-v2")
    embeddings = model.encode(paragraphs)

    chunks: list[str] = []
    current: list[str] = [paragraphs[0]]
    current_len = len(paragraphs[0])

    for idx in range(1, len(paragraphs)):
        sim = cosine_similarity([embeddings[idx - 1]], [embeddings[idx]])[0][0]
        paragraph = paragraphs[idx]
        if current_len + len(paragraph) > max_chars or sim < 0.35:
            chunks.append("\n\n".join(current))
            current = [paragraph]
            current_len = len(paragraph)
        else:
            current.append(paragraph)
            current_len += len(paragraph)

    if current:
        chunks.append("\n\n".join(current))
    return chunks


def merge_textbooks(parts: list[dict[str, Any]]) -> dict[str, Any]:
    if not parts:
        raise ValueError("No partial textbook outputs to merge")

    base = {
        "title": parts[0].get("title", "Compiled Textbook"),
        "subtitle": parts[0].get("subtitle", "A Comprehensive Academic Textbook"),
        "preface": parts[0].get("preface", ""),
        "chapters": [],
    }

    chapter_counter = 1
    for part in parts:
        chapters = part.get("chapters") or []
        for chapter in chapters:
            normalized = dict(chapter)
            normalized["number"] = chapter_counter
            chapter_counter += 1
            base["chapters"].append(normalized)

    if len(parts) > 1:
        prefaces = [p.get("preface", "").strip() for p in parts if p.get("preface")]
        if prefaces:
            base["preface"] = "\n\n".join(prefaces[:2])

    return validate_textbook_schema(base)
