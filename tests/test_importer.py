"""Tests for lib.importer — shared import logic used by both the CLI and the web API.

The importer extracts the detect + parse + write-to-DB pipeline from genome_init.py
so a single code path is reused by scripts/genome_init.py and the FastAPI route.
"""
import sqlite3

import pytest

from lib.importer import detect_file, import_genome_file, ProfileExistsError
from lib.db import get_connection, init_db


# ── detect_file ──────────────────────────────────────────────────────────────

def test_detect_file_recognizes_23andme(sample_23andme):
    info = detect_file(sample_23andme)
    assert info["provider"] == "23andme"
    assert info["assembly"] == "GRCh37"
    assert 0.0 < info["confidence"] <= 1.0
    assert isinstance(info["estimated_variants"], int)
    assert info["estimated_variants"] > 0


def test_detect_file_recognizes_vcf(sample_vcf):
    info = detect_file(sample_vcf)
    assert info["provider"] in {"vcf", "nebula"}


def test_detect_file_unsupported_raises(tmp_path):
    junk = tmp_path / "notes.pdf"
    junk.write_text("this is not genome data\njust some prose\n")
    with pytest.raises(ValueError):
        detect_file(junk)


# ── import_genome_file ───────────────────────────────────────────────────────

def test_import_writes_variants_to_db(sample_23andme, tmp_db, migrations_dir):
    stats = import_genome_file(sample_23andme, tmp_db, profile="alice", migrations_dir=migrations_dir)
    assert stats["imported"] > 0
    assert stats["profile_id"] == "alice"
    assert stats["dry_run"] is False

    conn = get_connection(tmp_db)
    count = conn.execute("SELECT COUNT(*) FROM snps WHERE profile_id='alice'").fetchone()[0]
    conn.close()
    assert count == stats["imported"]


def test_import_dry_run_imports_nothing(sample_23andme, tmp_db, migrations_dir):
    stats = import_genome_file(sample_23andme, tmp_db, profile="alice", dry_run=True, migrations_dir=migrations_dir)
    assert stats["dry_run"] is True
    assert stats["imported"] == 0
    # DB has no rows for this profile (table may not even exist on a fresh dry run)
    conn = get_connection(tmp_db)
    init_db(tmp_db, migrations_dir)
    count = conn.execute("SELECT COUNT(*) FROM snps WHERE profile_id='alice'").fetchone()[0]
    conn.close()
    assert count == 0


def test_import_duplicate_profile_raises(sample_23andme, tmp_db, migrations_dir):
    import_genome_file(sample_23andme, tmp_db, profile="alice", migrations_dir=migrations_dir)
    with pytest.raises(ProfileExistsError):
        import_genome_file(sample_23andme, tmp_db, profile="alice", migrations_dir=migrations_dir)


def test_import_records_import_row_complete(sample_23andme, tmp_db, migrations_dir):
    stats = import_genome_file(sample_23andme, tmp_db, profile="alice", migrations_dir=migrations_dir)
    conn = get_connection(tmp_db)
    row = conn.execute(
        "SELECT status FROM imports WHERE profile_id='alice'"
    ).fetchone()
    conn.close()
    assert row is not None
    assert row[0] == "complete"


def test_import_min_r2_filters_low_quality_vcf(sample_vcf, tmp_db, migrations_dir):
    """Imputed VCF records below min_r2 are skipped; raising the threshold skips more."""
    low = import_genome_file(sample_vcf, tmp_db, profile="lowbar", min_r2=0.1, migrations_dir=migrations_dir)
    high = import_genome_file(sample_vcf, tmp_db, profile="highbar", min_r2=0.9, migrations_dir=migrations_dir)
    assert high["skipped_r2"] > low["skipped_r2"]
    assert high["imported"] < low["imported"]


def test_import_auto_profile_name_from_provider(sample_23andme, tmp_db, migrations_dir):
    stats = import_genome_file(sample_23andme, tmp_db, profile=None, migrations_dir=migrations_dir)
    assert stats["profile_id"].startswith("23andme_")
