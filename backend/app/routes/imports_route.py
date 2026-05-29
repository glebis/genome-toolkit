"""Import workflow API — upload genome data files from the browser (issue #15).

Wraps the shared ``scripts.lib.importer`` pipeline (also used by the CLI) behind three
endpoints. The blocking parse + sqlite work runs in a threadpool so the event loop is
never blocked; uploads are streamed to a temp file with a size cap and deleted after use.
"""
import os
import sqlite3
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

import backend.app.main as _main
from scripts.lib.importer import detect_file, import_genome_file, ProfileExistsError

router = APIRouter(prefix="/api/import")

DEFAULT_MAX_BYTES = 200 * 1024 * 1024  # 200 MB

_DETECT_ERROR = (
    "Could not detect a supported genome format. Supported: 23andMe / AncestryDNA (.txt), "
    "MyHeritage / Genotek (.csv), and VCF (.vcf / .vcf.gz)."
)


def _max_bytes() -> int:
    try:
        return int(os.environ.get("IMPORT_MAX_BYTES", DEFAULT_MAX_BYTES))
    except ValueError:
        return DEFAULT_MAX_BYTES


def _temp_suffix(filename: str) -> str:
    """Preserve a meaningful suffix so provider detection (esp. .vcf.gz) works."""
    name = (filename or "").lower()
    if name.endswith(".vcf.gz"):
        return ".vcf.gz"
    return Path(name).suffix


async def _save_upload(file: UploadFile) -> Path:
    """Stream an upload to a temp file with a byte cap. Reject archives.

    Raises HTTPException 415 (zip) or 413 (too large). Caller must delete the path.
    """
    if (file.filename or "").lower().endswith(".zip"):
        raise HTTPException(
            415, "ZIP archives aren't supported — unzip and upload the raw .txt/.csv/.vcf file."
        )
    cap = _max_bytes()
    total = 0
    fd, tmp = tempfile.mkstemp(suffix=_temp_suffix(file.filename))
    try:
        with os.fdopen(fd, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > cap:
                    raise HTTPException(
                        413, f"File exceeds the {cap // (1024 * 1024)} MB import limit."
                    )
                out.write(chunk)
        return Path(tmp)
    except Exception:
        Path(tmp).unlink(missing_ok=True)
        raise


@router.post("/detect")
async def detect(file: UploadFile = File(...)):
    """Detect the provider/format of an uploaded file without importing it."""
    tmp = await _save_upload(file)
    try:
        return await run_in_threadpool(detect_file, tmp)
    except ValueError:
        raise HTTPException(400, _DETECT_ERROR)
    finally:
        tmp.unlink(missing_ok=True)


@router.post("/upload")
async def upload(
    file: UploadFile = File(...),
    profile: str | None = Form(None),
    min_r2: float = Form(0.3),
    dry_run: bool = Form(False),
):
    """Detect, parse, and import a genome file into genome.db."""
    tmp = await _save_upload(file)
    try:
        return await run_in_threadpool(
            import_genome_file,
            tmp,
            _main.genome_db.db_path,
            profile or None,
            min_r2,
            dry_run,
            file.filename,
        )
    except ValueError:
        raise HTTPException(400, _DETECT_ERROR)
    except ProfileExistsError as e:
        raise HTTPException(409, f"A profile named '{e}' already exists. Choose a different name.")
    finally:
        tmp.unlink(missing_ok=True)


@router.get("/history")
async def history():
    """List previously imported profiles, most recent first."""
    conn = sqlite3.connect(str(_main.genome_db.db_path))
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """SELECT profile_id, display_name, provider, provider_version,
                      assembly, snp_count, created_at
               FROM profiles ORDER BY created_at DESC"""
        ).fetchall()
    finally:
        conn.close()
    return {
        "imports": [
            {
                "profile_id": r["profile_id"],
                "display_name": r["display_name"],
                "provider": r["provider"],
                "provider_version": r["provider_version"],
                "assembly": r["assembly"],
                "variants": r["snp_count"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    }
