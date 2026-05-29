"""API tests for the import workflow endpoints (issue #15).

POST /api/import/detect   — detect format without importing
POST /api/import/upload   — import a file into genome.db
GET  /api/import/history  — list past imports
"""
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

FIXTURES = Path(__file__).resolve().parent / "fixtures"
MIGRATIONS = Path(__file__).resolve().parent.parent / "scripts" / "data" / "migrations"


@pytest_asyncio.fixture
async def client(tmp_path):
    """AsyncClient wired to a fresh, fully-migrated genome.db."""
    from scripts.lib.db import init_db
    db_path = tmp_path / "genome.db"
    init_db(db_path, MIGRATIONS)

    from backend.app.db.genome import GenomeDB
    import backend.app.main as main_mod

    test_genome_db = GenomeDB(db_path)
    await test_genome_db.connect()

    from fastapi import FastAPI

    @asynccontextmanager
    async def noop_lifespan(app):
        yield

    test_app = FastAPI(lifespan=noop_lifespan)
    original = main_mod.genome_db
    main_mod.genome_db = test_genome_db

    from backend.app.routes.imports_route import router as imports_router
    test_app.include_router(imports_router)

    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    main_mod.genome_db = original
    await test_genome_db.close()


def _file(name: str):
    return (FIXTURES / name).read_bytes()


# ── detect ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_detect_returns_provider(client):
    resp = await client.post(
        "/api/import/detect",
        files={"file": ("23andme_v4_sample.txt", _file("23andme_v4_sample.txt"), "text/plain")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["provider"] == "23andme"
    assert data["assembly"] == "GRCh37"
    assert data["estimated_variants"] > 0


@pytest.mark.asyncio
async def test_detect_unsupported_returns_400(client):
    resp = await client.post(
        "/api/import/detect",
        files={"file": ("notes.pdf", b"not genome data at all\njust prose\n", "application/pdf")},
    )
    assert resp.status_code == 400


# ── upload ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_upload_imports_variants(client):
    resp = await client.post(
        "/api/import/upload",
        files={"file": ("23andme_v4_sample.txt", _file("23andme_v4_sample.txt"), "text/plain")},
        data={"profile": "alice"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["profile_id"] == "alice"
    assert data["imported"] > 0
    assert data["dry_run"] is False


@pytest.mark.asyncio
async def test_upload_dry_run_imports_nothing(client):
    resp = await client.post(
        "/api/import/upload",
        files={"file": ("23andme_v4_sample.txt", _file("23andme_v4_sample.txt"), "text/plain")},
        data={"profile": "alice", "dry_run": "true"},
    )
    assert resp.status_code == 200
    assert resp.json()["imported"] == 0
    # No profile persisted
    hist = await client.get("/api/import/history")
    assert all(p["profile_id"] != "alice" for p in hist.json()["imports"])


@pytest.mark.asyncio
async def test_upload_duplicate_profile_returns_409(client):
    payload = {
        "files": {"file": ("23andme_v4_sample.txt", _file("23andme_v4_sample.txt"), "text/plain")},
        "data": {"profile": "alice"},
    }
    first = await client.post("/api/import/upload", **payload)
    assert first.status_code == 200
    second = await client.post("/api/import/upload", **payload)
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_upload_rejects_zip_415(client):
    resp = await client.post(
        "/api/import/upload",
        files={"file": ("export.zip", b"PK\x03\x04fakezip", "application/zip")},
    )
    assert resp.status_code == 415


@pytest.mark.asyncio
async def test_upload_too_large_returns_413(client, monkeypatch):
    monkeypatch.setenv("IMPORT_MAX_BYTES", "50")
    resp = await client.post(
        "/api/import/upload",
        files={"file": ("23andme_v4_sample.txt", _file("23andme_v4_sample.txt"), "text/plain")},
        data={"profile": "alice"},
    )
    assert resp.status_code == 413


# ── history ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_history_lists_imports(client):
    await client.post(
        "/api/import/upload",
        files={"file": ("23andme_v4_sample.txt", _file("23andme_v4_sample.txt"), "text/plain")},
        data={"profile": "alice"},
    )
    resp = await client.get("/api/import/history")
    assert resp.status_code == 200
    imports = resp.json()["imports"]
    assert any(p["profile_id"] == "alice" for p in imports)
    entry = next(p for p in imports if p["profile_id"] == "alice")
    assert entry["provider"] == "23andme"
    assert entry["variants"] > 0
