"""Profile-scoping tests for post_imputation_import.py (audit finding #18).

Imported imputed rows must carry profile_id (when the snps table has the
column) and deduplication must be per-(profile_id, rsid), not global — so an
rsID already present under one profile does not block import under another.

Scope boundary: a sibling branch owns R²/GT/parse correctness in this file;
these tests only exercise the profile_id + dedup behaviour.
"""

import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import post_imputation_import as pii


def _profile_db(path):
    conn = sqlite3.connect(str(path))
    conn.execute(
        "CREATE TABLE snps (rsid TEXT, profile_id TEXT DEFAULT 'default', "
        "chromosome TEXT, position INTEGER, genotype TEXT, is_rsid INTEGER, "
        "source TEXT, import_date TEXT, r2_quality REAL, "
        "PRIMARY KEY (rsid, profile_id))"
    )
    conn.execute(
        "CREATE TABLE pipeline_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "script TEXT, started_at TEXT, finished_at TEXT, status TEXT, stats TEXT)"
    )
    # rs1 already directly genotyped under the 'default' profile.
    conn.execute(
        "INSERT INTO snps (rsid, profile_id, chromosome, position, genotype, is_rsid, source) "
        "VALUES ('rs1', 'default', '1', 100, 'AG', 1, 'genotyped')"
    )
    conn.commit()
    conn.close()


def _columnless_db(path):
    conn = sqlite3.connect(str(path))
    conn.execute(
        "CREATE TABLE snps (rsid TEXT PRIMARY KEY, chromosome TEXT, position INTEGER, "
        "genotype TEXT, is_rsid INTEGER, source TEXT)"
    )
    conn.execute(
        "CREATE TABLE pipeline_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "script TEXT, started_at TEXT, finished_at TEXT, status TEXT, stats TEXT)"
    )
    conn.commit()
    conn.close()


def test_import_writes_profile_id(tmp_path):
    db = tmp_path / "g.db"
    _profile_db(db)
    variants = [("rs9", "2", 222, "CT", 0.9)]
    pii.import_to_db(variants, str(db), dry_run=False, profile_id="alice")

    conn = sqlite3.connect(str(db))
    row = conn.execute(
        "SELECT profile_id, source FROM snps WHERE rsid = 'rs9'"
    ).fetchone()
    conn.close()
    assert row == ("alice", "imputed")


def test_dedup_is_per_profile_not_global(tmp_path):
    db = tmp_path / "g.db"
    _profile_db(db)
    # rs1 exists under 'default'; importing it under 'alice' must succeed.
    variants = [("rs1", "1", 100, "GG", 0.8)]
    imported = pii.import_to_db(variants, str(db), dry_run=False, profile_id="alice")
    assert imported == 1

    conn = sqlite3.connect(str(db))
    genos = dict(
        conn.execute("SELECT profile_id, genotype FROM snps WHERE rsid = 'rs1'").fetchall()
    )
    conn.close()
    assert genos == {"default": "AG", "alice": "GG"}


def test_existing_rsids_scoped_by_profile(tmp_path):
    db = tmp_path / "g.db"
    _profile_db(db)
    # rs1 belongs to 'default'; from alice's view it is not yet present.
    assert pii.get_existing_rsids(str(db), profile_id="default") == {"rs1"}
    assert pii.get_existing_rsids(str(db), profile_id="alice") == set()


def test_columnless_db_imports_with_default(tmp_path):
    db = tmp_path / "single.db"
    _columnless_db(db)
    variants = [("rs5", "3", 333, "AA", 0.95)]
    imported = pii.import_to_db(variants, str(db), dry_run=False, profile_id="default")
    assert imported == 1

    conn = sqlite3.connect(str(db))
    row = conn.execute("SELECT rsid, source FROM snps WHERE rsid = 'rs5'").fetchone()
    conn.close()
    assert row == ("rs5", "imputed")
