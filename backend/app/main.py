"""FastAPI application — serves REST API, SSE chat, and built frontend."""
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.app.db.genome import GenomeDB
from backend.app.db.users import UsersDB
from backend.app.agent.tools import set_genome_db

DATA_DIR = Path(os.environ.get("GENOME_DATA_DIR", "./data"))
GENOME_DB_PATH = Path(os.environ.get("GENOME_DB_PATH", str(DATA_DIR / "genome.db")))
USERS_DB_PATH = DATA_DIR / "users.db"

genome_db = GenomeDB(GENOME_DB_PATH)
users_db = UsersDB(USERS_DB_PATH)

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    await genome_db.connect()
    await users_db.connect()
    await users_db.init_schema()
    set_genome_db(genome_db)
    yield
    await genome_db.close()
    await users_db.close()


app = FastAPI(title="Genome Toolkit", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API Routes (registered BEFORE static files) ---
from backend.app.routes.snps import router as snps_router
from backend.app.routes.sessions import router as sessions_router
from backend.app.routes.chat import router as chat_router

app.include_router(snps_router)
app.include_router(sessions_router)
app.include_router(chat_router)


@app.get("/api/health")
async def health():
    stats = await genome_db.get_stats()
    return {"status": "ok", "variants": stats["total"]}


# Serve built frontend assets at /assets (does NOT catch /api)
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    # SPA catch-all: serve index.html for any non-API, non-asset route
    @app.get("/{path:path}")
    async def spa_catchall(path: str):
        # Serve static files if they exist (favicon, etc.)
        file_path = FRONTEND_DIST / path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIST / "index.html")
