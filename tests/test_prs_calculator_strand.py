"""PRS calculator strand/palindrome-safety tests (finding #16).

The PRS weights file (``scripts/data/prs_snp_weights.json``) carries only
``effect_allele`` (no ``other_allele``). The calculator must therefore:

* count non-ambiguous SNPs by effect allele, and
* EXCLUDE palindromic / unorientable SNPs from the score when an
  ``other_allele`` is present and the pair is palindromic.

These tests build a tiny in-memory SQLite db and a minimal trait dict.
"""
import sqlite3

import pytest

from analytics.prs_calculator import compute_prs_for_trait


def _make_db(genotypes: dict[str, str]) -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE snps (rsid TEXT, genotype TEXT)")
    conn.executemany(
        "INSERT INTO snps (rsid, genotype) VALUES (?, ?)",
        list(genotypes.items()),
    )
    conn.commit()
    return conn


def test_non_ambiguous_snp_counted():
    conn = _make_db({"rs1": "AG"})
    trait = {
        "full_name": "Test",
        "trait_type": "continuous",
        "snps": [{"rsid": "rs1", "effect_allele": "A", "beta": 1.0}],
    }
    result = compute_prs_for_trait(conn, "test", trait)
    assert result["snps_matched"] == 1
    # one copy of effect allele A * beta 1.0
    assert result["raw_score"] == pytest.approx(1.0)


def test_palindromic_snp_excluded_from_score():
    # other_allele present and pair is palindromic (A/T) -> must be excluded.
    conn = _make_db({"rs_palin": "AT"})
    trait = {
        "full_name": "Test",
        "trait_type": "continuous",
        "snps": [
            {
                "rsid": "rs_palin",
                "effect_allele": "A",
                "other_allele": "T",
                "beta": 5.0,
            }
        ],
    }
    result = compute_prs_for_trait(conn, "test", trait)
    # Excluded: not counted toward the score, reported as skipped/missing.
    assert result["raw_score"] == pytest.approx(0.0)
    assert result["snps_matched"] == 0


def test_unorientable_snp_excluded_from_score():
    # other_allele present, genotype matches neither orientation -> excluded.
    conn = _make_db({"rs_bad": "AC"})
    trait = {
        "full_name": "Test",
        "trait_type": "continuous",
        "snps": [
            {
                "rsid": "rs_bad",
                "effect_allele": "A",
                "other_allele": "G",
                "beta": 3.0,
            }
        ],
    }
    result = compute_prs_for_trait(conn, "test", trait)
    assert result["raw_score"] == pytest.approx(0.0)
    assert result["snps_matched"] == 0


def test_excluded_rsids_reported():
    conn = _make_db({"rs_palin": "AT"})
    trait = {
        "full_name": "Test",
        "trait_type": "continuous",
        "snps": [
            {"rsid": "rs_palin", "effect_allele": "A", "other_allele": "T", "beta": 5.0}
        ],
    }
    result = compute_prs_for_trait(conn, "test", trait)
    assert result["snps_excluded"] == 1
    assert result["excluded_rsids"] == ["rs_palin"]


def test_risk_category_labels_are_gated_uncalibrated():
    from analytics.prs_calculator import risk_category

    # No bare HIGH/LOW: every label carries the uncalibrated caveat.
    assert risk_category(95.0) == "HIGH (uncalibrated)"
    assert risk_category(5.0) == "LOW (uncalibrated)"
    assert "uncalibrated" in risk_category(50.0)


def test_complement_strand_oriented_when_other_allele_present():
    # Genotype on opposite strand (TT) for effect=A/other=G -> 2 copies.
    conn = _make_db({"rs2": "TT"})
    trait = {
        "full_name": "Test",
        "trait_type": "continuous",
        "snps": [
            {"rsid": "rs2", "effect_allele": "A", "other_allele": "G", "beta": 1.0}
        ],
    }
    result = compute_prs_for_trait(conn, "test", trait)
    assert result["snps_matched"] == 1
    assert result["raw_score"] == pytest.approx(2.0)
