from __future__ import annotations

import hashlib
import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile

from backend.services.ai_service import content_hash, generate_textbook_json, get_cached_result, set_cached_result
from backend.services.extractor import extract_text
from backend.services.formatter import chunk_text, merge_textbooks
from backend.services.job_store import job_store


router = APIRouter()

MAX_FILE_SIZE = 20 * 1024 * 1024
ALLOWED_EXTENSIONS = {"pdf", "pptx"}
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _safe_filename(file_name: str) -> str:
    base = os.path.basename(file_name)
    return "".join(c for c in base if c.isalnum() or c in {".", "_", "-"}) or "upload.bin"


def _detect_extension(file_name: str) -> str:
    if "." not in file_name:
        return ""
    return file_name.rsplit(".", 1)[1].lower()


async def _save_upload(file: UploadFile) -> tuple[Path, str, str, int]:
    safe_name = _safe_filename(file.filename or "upload.bin")
    extension = _detect_extension(safe_name)

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF and PPTX are allowed.")

    suffix = f".{extension}"
    fd, tmp_path = tempfile.mkstemp(suffix=suffix, dir=UPLOAD_DIR)
    os.close(fd)

    total = 0
    sha = hashlib.sha256()
    with open(tmp_path, "wb") as out_file:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_FILE_SIZE:
                out_file.close()
                os.remove(tmp_path)
                raise HTTPException(status_code=413, detail="File too large. Max allowed size is 20MB.")
            sha.update(chunk)
            out_file.write(chunk)

    await file.close()
    return Path(tmp_path), extension, sha.hexdigest(), total


def _run_job(job_id: str, file_path: Path, extension: str) -> None:
    try:
        job_store.update(job_id, status="running", stage="extracting_text", message="Extracting text", progress=20)
        extraction = extract_text(str(file_path), extension)

        extracted_text = extraction.text.strip()
        if not extracted_text:
            raise ValueError("No usable text extracted from the file")

        if extraction.used_ocr:
            job_store.update(
                job_id,
                stage="extracting_text",
                message="OCR fallback applied for scanned PDF",
                progress=35,
            )
        else:
            job_store.update(job_id, stage="extracting_text", message="Text extracted", progress=35)

        hash_key = content_hash(extracted_text)
        cached = get_cached_result(hash_key)
        if cached:
            job_store.update(
                job_id,
                status="completed",
                stage="complete",
                message="Completed from cache",
                progress=100,
                result=cached,
            )
            return

        text_chunks = chunk_text(extracted_text)
        partial_outputs: list[dict] = []

        for idx, chunk in enumerate(text_chunks, start=1):
            progress = 40 + int((idx - 1) / max(len(text_chunks), 1) * 40)
            job_store.update(
                job_id,
                stage="structuring_content",
                message=f"Structuring content chunk {idx}/{len(text_chunks)}",
                progress=progress,
            )
            partial_outputs.append(generate_textbook_json(chunk))

        job_store.update(job_id, stage="generating_textbook", message="Merging textbook content", progress=88)
        final_result = merge_textbooks(partial_outputs)
        set_cached_result(hash_key, final_result)

        job_store.update(
            job_id,
            status="completed",
            stage="complete",
            message="Textbook generated successfully",
            progress=100,
            result=final_result,
        )
    except Exception as exc:
        job_store.update(
            job_id,
            status="failed",
            stage="failed",
            message="Processing failed",
            progress=100,
            error=str(exc),
        )
    finally:
        try:
            if file_path.exists():
                file_path.unlink()
        except OSError:
            pass


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)) -> dict:
    file_path, extension, file_hash, size_bytes = await _save_upload(file)
    if file_path.exists():
        file_path.unlink()
    return {
        "fileName": file.filename,
        "extension": extension,
        "sizeBytes": size_bytes,
        "sha256": file_hash,
        "message": "File validated successfully",
    }


@router.post("/process")
async def process_file(background_tasks: BackgroundTasks, file: UploadFile = File(...)) -> dict:
    file_path, extension, _, _ = await _save_upload(file)
    job = job_store.create(file_name=file.filename)
    job_store.update(job.id, status="queued", stage="uploading", message="File uploaded", progress=10)

    background_tasks.add_task(_run_job, job.id, file_path, extension)
    return {"jobId": job.id}


@router.get("/jobs/{job_id}")
def get_job_status(job_id: str) -> dict:
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    payload = {
        "jobId": job.id,
        "status": job.status,
        "stage": job.stage,
        "message": job.message,
        "progress": job.progress,
        "fileName": job.file_name,
    }
    if job.status == "completed":
        payload["result"] = job.result
    if job.status == "failed":
        payload["error"] = job.error or "Unknown processing error"
    return payload
