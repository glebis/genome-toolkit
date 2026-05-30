"""Shared genome-import pipeline: detect, parse, and write to SQLite.

Extracted from ``genome_init.py`` so the CLI and the FastAPI import route share a
single, tested code path. The import is atomic — profile, import record, and all
SNP rows are written in one transaction that fully rolls back on any error, so a
failed import never leaves partial state behind.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path

from .config import DB_PATH, MIGRATIONS_DIR
from .db import get_connection, apply_migrations, log_run, finish_run
from .providers.base import detect_provider, read_header_lines

# Rough bytes-per-variant for a read-light size estimate of genotype text files.
_BYTES_PER_VARIANT = 40


class ProfileExistsError(Exception):
    """Raised when importing into a profile_id that already exists."""


def _estimate_variants(path: Path) -> int:
    try:
        size = path.stat().st_size
    except OSError:
        return 0
    return max(1, size // _BYTES_PER_VARIANT)


def detect_file(path: Path) -> dict:
    """Detect a genome file's provider/format without importing.

    Reads only header lines (lightweight). Raises ``ValueError`` if no supported
    provider matches.
    """
    path = Path(path)
    provider_cls, confidence = detect_provider(path)  # raises ValueError if no match
    provider = provider_cls()
    header_lines = read_header_lines(path)
    meta = provider.metadata(path, header_lines)
    estimated = meta.estimated_snp_count or _estimate_variants(path)
    return {
        "provider": meta.provider,
        "provider_version": meta.provider_version,
        "assembly": meta.assembly,
        "confidence": round(confidence, 4),
        "estimated_variants": int(estimated),
    }


def compute_file_hash(path: Path) -> str:
    """Return the SHA-256 hex digest of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def import_genome_file(
    path: Path,
    db_path: Path = DB_PATH,
    profile: str | None = None,
    min_r2: float = 0.3,
    dry_run: bool = False,
    original_name: str | None = None,
    migrations_dir: Path = MIGRATIONS_DIR,
) -> dict:
    """Detect, parse, and import a genome file into the SQLite genome DB.

    Args:
        path: Path to the (already-saved) genome file on disk.
        db_path: Target SQLite database.
        profile: Profile id; defaults to ``{provider}_{YYYYMMDD}``.
        min_r2: Minimum imputation r² — records with a quality below this are skipped.
        dry_run: Parse and report only; write nothing.
        original_name: Human-facing source filename to record (the temp path is never stored).
        migrations_dir: Schema migrations to apply before import.

    Returns:
        A stats dict (provider, version, assembly, imported, skipped_dup, skipped_r2, ...).

    Raises:
        ValueError: format undetectable.
        ProfileExistsError: ``profile`` already exists (non-dry-run).
    """
    path = Path(path)

    # Detect + parse — the single full parse of the file.
    provider_cls, confidence = detect_provider(path)
    provider = provider_cls()
    header_lines = read_header_lines(path)
    meta = provider.metadata(path, header_lines)
    records_iter, qc = provider.parse(path)
    records = list(records_iter)

    profile_id = profile or f"{meta.provider}_{datetime.now().strftime('%Y%m%d')}"
    display_name = original_name or path.name

    base_stats = {
        "provider": meta.provider,
        "version": meta.provider_version,
        "assembly": meta.assembly,
        "confidence": round(confidence, 4),
        "total_input": qc.total_input,
        "passed_qc": qc.passed_qc,
        "profile_id": profile_id,
        "dry_run": dry_run,
    }

    if dry_run:
        skipped_r2 = sum(1 for r in records if r.quality is not None and r.quality < min_r2)
        return {
            **base_stats,
            "imported": 0,
            "skipped_dup": 0,
            "skipped_r2": skipped_r2,
            "import_id": None,
        }

    conn = get_connection(db_path)
    apply_migrations(conn, migrations_dir)

    # Profile conflict — never silently merge into an existing profile.
    if conn.execute("SELECT 1 FROM profiles WHERE profile_id=?", (profile_id,)).fetchone():
        conn.close()
        raise ProfileExistsError(profile_id)

    file_hash = compute_file_hash(path)
    import_id = str(uuid.uuid4())[:8]
    run_id = log_run(conn, "import_api", "running")

    imported = skipped_dup = skipped_r2 = 0
    try:
        conn.execute("BEGIN")
        conn.execute(
            """INSERT INTO profiles
               (profile_id, display_name, provider, provider_version, file_hash, assembly, snp_count)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (profile_id, profile_id, meta.provider, meta.provider_version,
             file_hash[:16], meta.assembly, len(records)),
        )
        for rec in records:
            if rec.quality is not None and rec.quality < min_r2:
                skipped_r2 += 1
                continue
            source = "imputed" if rec.quality is not None else "genotyped"
            try:
                conn.execute(
                    """INSERT INTO snps
                       (rsid, profile_id, chromosome, position, genotype, is_rsid,
                        source, import_date, r2_quality, import_id)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (rec.source_id, profile_id, rec.chromosome, rec.position,
                     rec.genotype, rec.is_rsid, source,
                     datetime.now().strftime("%Y-%m-%d"), rec.quality, import_id),
                )
                imported += 1
            except sqlite3.IntegrityError:
                skipped_dup += 1

        stats = {
            **base_stats,
            "imported": imported,
            "skipped_dup": skipped_dup,
            "skipped_r2": skipped_r2,
            "import_id": import_id,
        }
        conn.execute(
            """INSERT INTO imports
               (import_id, profile_id, source_file, file_hash, detected_format,
                assembly, finished_at, status, stats)
               VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'complete', ?)""",
            (import_id, profile_id, display_name, file_hash[:16],
             f"{meta.provider}_{meta.provider_version}", meta.assembly, json.dumps(stats)),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        finish_run(conn, run_id, "error")
        conn.close()
        raise

    finish_run(conn, run_id, "success", stats)
    conn.close()
    return stats
