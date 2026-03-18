from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any


@dataclass
class JobState:
    id: str
    status: str = "queued"
    stage: str = "queued"
    message: str = "Waiting to start"
    progress: int = 0
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    result: dict[str, Any] | None = None
    error: str | None = None
    file_name: str | None = None


class JobStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._jobs: dict[str, JobState] = {}

    def create(self, file_name: str | None = None) -> JobState:
        job_id = str(uuid.uuid4())
        job = JobState(id=job_id, file_name=file_name)
        with self._lock:
            self._jobs[job_id] = job
        return job

    def get(self, job_id: str) -> JobState | None:
        with self._lock:
            return self._jobs.get(job_id)

    def update(
        self,
        job_id: str,
        *,
        status: str | None = None,
        stage: str | None = None,
        message: str | None = None,
        progress: int | None = None,
        result: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            if status is not None:
                job.status = status
            if stage is not None:
                job.stage = stage
            if message is not None:
                job.message = message
            if progress is not None:
                job.progress = max(0, min(progress, 100))
            if result is not None:
                job.result = result
            if error is not None:
                job.error = error
            job.updated_at = time.time()


job_store = JobStore()
