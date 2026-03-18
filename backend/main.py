import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.routes.process import router as process_router


load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

app = FastAPI(title="Notes to Textbook API", version="1.0.0")

allowed_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://127.0.0.1:5500",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in allowed_origins if o.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(process_router)

if FRONTEND_DIR.exists():
    app.mount("/frontend", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")


@app.get("/")
def root():
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return JSONResponse({"status": "ok", "message": "Frontend not found. Use API endpoints under /process."})
