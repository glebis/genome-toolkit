"""FastAPI application — serves REST API, SSE chat, and built frontend."""
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.app.db.genome import GenomeDB
from backend.app.db.users import UsersDB
from backend.app.agent.tools import set_genome_db

DATA_DIR = Path(os.environ.get("GENOME_DATA_DIR", "./data"))
GENOME_DB_PATH = Path(os.environ.get("GENOME_DB_PATH", str(DATA_DIR / "genome.db")))
USERS_DB_PATH = DATA_DIR / "users.db"

genome_db = GenomeDB(GENOME_DB_PATH)
users_db = UsersDB(USERS_DB_PATH)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    await genome_db.connect()
    await users_db.connect()
    await users_db.init_schema()
    set_genome_db(genome_db)
    yield
    # Shutdown
    await genome_db.close()
    await users_db.close()


app = FastAPI(title="Genome Toolkit", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Routes ---
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


# Serve built frontend — must be last (catches all non-API routes)
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
