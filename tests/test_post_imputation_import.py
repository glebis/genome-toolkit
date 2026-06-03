"""Tests for post_imputation_import.py — imputed-VCF import safety.

Addresses GPT-5.5 Pro validation finding #1 (Critical): the importer must not
silently admit unqualified or misparsed genotypes.

  (a) A record with no R² in INFO is SKIPPED by default and imported only when
      --allow-missing-r2 is set (and counted separately).
  (b) A record lacking a real GT field (DS/GP only) is NOT imported as a hard
      genotype — it is skipped, never parsed off the first FORMAT field.
  (c) A positional / non-rs ID is written with is_rsid=0, not unconditionally 1.

Profile-id plumbing is intentionally out of scope here (handled on a sibling
branch); these tests only cover the R²/GT/is_rsid safety gates.
"""

import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import post_imputation_import as pii


VCF_HEADER = (
    "##fileformat=VCFv4.2\n"
    "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE\n"
)


def _write_vcf(tmp_path, body):
    p = tmp_path / "imputed.vcf"
    p.write_text(VCF_HEADER + body)
    return str(p)


# ── (a) missing R² is fail-closed by default ─────────────────────────────────

def test_missing_r2_skipped_by_default(tmp_path):
    # INFO has no R2/DR2/AR2 — quality is unknown.
    body = "1\t100\trs100\tA\tG\t.\t.\tAF=0.2\tGT\t0/1\n"
    vcf = _write_vcf(tmp_path, body)

    to_import, stats = pii.process_vcf(vcf, min_r2=0.3, existing_rsids=set())

    assert to_import == [], "missing-R² variant must not be imported by default"
    assert stats["skipped_missing_r2"] == 1
    assert stats["to_import"] == 0


def test_missing_r2_imported_with_allow_flag(tmp_path):
    body = "1\t100\trs100\tA\tG\t.\t.\tAF=0.2\tGT\t0/1\n"
    vcf = _write_vcf(tmp_path, body)

    to_import, stats = pii.process_vcf(
        vcf, min_r2=0.3, existing_rsids=set(), allow_missing_r2=True
    )

    assert len(to_import) == 1, "missing-R² variant should import only with the flag"
    assert to_import[0][0] == "rs100"
    assert to_import[0][4] is None  # r2 value recorded as None
    assert stats["r2_not_available"] == 1


def test_present_r2_unaffected_by_flag(tmp_path):
    body = "1\t100\trs100\tA\tG\t.\t.\tR2=0.95\tGT\t0/1\n"
    vcf = _write_vcf(tmp_path, body)

    to_import, _ = pii.process_vcf(vcf, min_r2=0.3, existing_rsids=set())
    assert len(to_import) == 1


# ── (b) records without a real GT are not parsed as hard genotypes ───────────

def test_dosage_only_record_not_imported_as_hard_call(tmp_path):
    # FORMAT has DS/GP but no GT. The first FORMAT field (DS) must NOT be read
    # as a genotype index.
    body = "1\t200\trs200\tA\tG\t.\t.\tR2=0.99\tDS:GP\t1.0:0,0,1\n"
    vcf = _write_vcf(tmp_path, body)

    to_import, stats = pii.process_vcf(vcf, min_r2=0.3, existing_rsids=set())

    assert to_import == [], "DS/GP-only record must not become a hard genotype"
    assert stats["skipped_no_gt"] == 1


def test_real_gt_field_still_imported(tmp_path):
    # GT present but not first — must be located by key, not position.
    body = "1\t200\trs200\tA\tG\t.\t.\tR2=0.99\tDS:GT\t1.0:0/1\n"
    vcf = _write_vcf(tmp_path, body)

    to_import, _ = pii.process_vcf(vcf, min_r2=0.3, existing_rsids=set())
    assert len(to_import) == 1
    assert to_import[0][3] == "AG"


# ── (c) is_rsid reflects the actual ID ───────────────────────────────────────

def _make_db(tmp_path):
    db = tmp_path / "genome.db"
    conn = sqlite3.connect(db)
    conn.executescript(
        """
        CREATE TABLE snps (
            rsid TEXT NOT NULL,
            profile_id TEXT NOT NULL DEFAULT 'default',
            chromosome TEXT NOT NULL,
            position INTEGER NOT NULL,
            genotype TEXT NOT NULL,
            is_rsid BOOLEAN NOT NULL DEFAULT 1,
            source TEXT NOT NULL DEFAULT 'genotyped',
            import_date TEXT,
            r2_quality REAL,
            imported_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (rsid, profile_id)
        );
        CREATE TABLE pipeline_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            script TEXT, started_at TEXT, finished_at TEXT,
            status TEXT, stats TEXT
        );
        """
    )
    conn.commit()
    conn.close()
    return str(db)


def test_positional_id_gets_is_rsid_zero(tmp_path):
    db = _make_db(tmp_path)
    variants = [
        ("rs500", "1", 500, "AG", 0.9),
        ("22:16050435", "22", 16050435, "CT", 0.9),
    ]
    pii.import_to_db(variants, db)

    conn = sqlite3.connect(db)
    rows = dict(
        (rsid, is_rsid)
        for rsid, is_rsid in conn.execute("SELECT rsid, is_rsid FROM snps")
    )
    conn.close()

    assert rows["rs500"] == 1, "rs-prefixed ID is a real rsID"
    assert rows["22:16050435"] == 0, "positional ID must not be marked is_rsid=1"
