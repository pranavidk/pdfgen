from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI

from backend.services.formatter import extract_json_payload, validate_textbook_schema


load_dotenv()

MODEL_NAME = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
CACHE_DIR = Path(__file__).resolve().parent.parent / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def build_prompt(raw_text: str) -> str:
    schema = {
        "title": "string",
        "subtitle": "string",
        "preface": "string",
        "chapters": [
            {
                "number": "number",
                "title": "string",
                "introduction": "string",
                "sections": [
                    {
                        "title": "string",
                        "content": "string",
                        "keyPoints": ["string"],
                        "definitions": [{"term": "string", "definition": "string"}],
                    }
                ],
                "summary": "string",
            }
        ],
    }

    return (
        "Convert the following source material into a polished academic textbook JSON. "
        "Output must be valid JSON only. No markdown, no commentary.\n\n"
        "Requirements:\n"
        "- Keep language clear, scholarly, and structured.\n"
        "- Ensure chapter and section ordering is logical.\n"
        "- Fill missing context conservatively; do not fabricate niche facts.\n"
        f"- Match this strict schema exactly: {json.dumps(schema)}\n\n"
        f"Source material:\n{raw_text}"
    )


def _cache_path(content_hash: str) -> Path:
    return CACHE_DIR / f"{content_hash}.json"


def get_cached_result(content_hash: str) -> dict[str, Any] | None:
    path = _cache_path(content_hash)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def set_cached_result(content_hash: str, result: dict[str, Any]) -> None:
    _cache_path(content_hash).write_text(json.dumps(result, ensure_ascii=True), encoding="utf-8")


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()


def _call_model(prompt: str) -> str:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is missing. Set it in backend/.env")

    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model=MODEL_NAME,
        temperature=0.2,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "You output only strict JSON that follows the requested schema."},
            {"role": "user", "content": prompt},
        ],
    )
    return response.choices[0].message.content or ""


def generate_textbook_json(text: str) -> dict[str, Any]:
    prompt = build_prompt(text)

    try:
        first_raw = _call_model(prompt)
        first_json = extract_json_payload(first_raw)
        return validate_textbook_schema(first_json)
    except Exception:
        retry_prompt = (
            prompt
            + "\n\nYour previous response was invalid. Return only valid JSON matching the schema with all required fields."
        )
        second_raw = _call_model(retry_prompt)
        second_json = extract_json_payload(second_raw)
        return validate_textbook_schema(second_json)
