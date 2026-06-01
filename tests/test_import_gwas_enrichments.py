"""Tests for the GWAS effect-size enrichment importer.

The SNP browser's EFFECT column reads per-rsid GWAS associations from the
`enrichments` table (source='gwas_catalog'). This importer is the data source:
it loads config/gwas/*-hits.json into that table so the column has real data.
"""
import json
import sqlite3

import pytest

from import_gwas_enrichments import aggregate_associations, import_gwas_enrichments


def _write_hits(directory, slug, display_name, effect_scale, hits):
    """Write a minimal *-hits.json file mirroring config/gwas/ structure."""
    data = {
        "trait": slug,
        "display_name": display_name,
        "effect_scale": effect_scale,
        "n_hits": len(hits),
        "hits": hits,
    }
    path = directory / f"{slug}-hits.json"
    path.write_text(json.dumps(data))
    return path


def test_aggregate_orders_associations_by_significance(tmp_path):
    # rs1 is associated with two traits; the more significant (smaller p) wins index 0.
    _write_hits(tmp_path, "ptsd", "Post-traumatic stress disorder", "log_or", [
        {"rsid": "rs1", "effect": 0.20, "p_value": 1e-12, "effect_allele": "A"},
    ])
    _write_hits(tmp_path, "depression", "Depression", "beta", [
        {"rsid": "rs1", "effect": 0.05, "p_value": 1e-8, "effect_allele": "G"},
        {"rsid": "rs2", "effect": -0.10, "p_value": 3e-9, "effect_allele": "C"},
    ])

    assoc = aggregate_associations(tmp_path)

    assert set(assoc.keys()) == {"rs1", "rs2"}

    rs1 = assoc["rs1"]
    assert len(rs1) == 2
    # Most significant association is first so json_extract('$.associations[0]') is meaningful.
    assert rs1[0]["trait"] == "Post-traumatic stress disorder"
    assert rs1[0]["beta"] == 0.20
    assert rs1[0]["effect_scale"] == "log_or"
    assert rs1[0]["effect_allele"] == "A"
    assert rs1[0]["p_value"] == 1e-12
    assert rs1[1]["trait"] == "Depression"


def test_aggregate_skips_hits_without_rsid(tmp_path):
    _write_hits(tmp_path, "adhd", "ADHD", "log_or", [
        {"rsid": None, "effect": 0.1, "p_value": 1e-9, "effect_allele": "A"},
        {"effect": 0.2, "p_value": 1e-9, "effect_allele": "T"},
        {"rsid": "rs9", "effect": 0.3, "p_value": 1e-9, "effect_allele": "G"},
    ])

    assoc = aggregate_associations(tmp_path)

    assert set(assoc.keys()) == {"rs9"}


def test_aggregate_ignores_clumped_files(tmp_path):
    # The pipeline also produces *-hits-clumped.json; we must not double-count them.
    _write_hits(tmp_path, "ptsd", "PTSD", "log_or", [
        {"rsid": "rs1", "effect": 0.2, "p_value": 1e-12, "effect_allele": "A"},
    ])
    clumped = tmp_path / "ptsd-hits-clumped.json"
    clumped.write_text(json.dumps({
        "display_name": "PTSD", "effect_scale": "log_or",
        "hits": [{"rsid": "rs1", "effect": 0.9, "p_value": 1e-30, "effect_allele": "A"}],
    }))

    assoc = aggregate_associations(tmp_path)

    assert len(assoc["rs1"]) == 1
    assert assoc["rs1"][0]["beta"] == 0.2


def test_import_writes_extractable_gwas_catalog_rows(tmp_path):
    _write_hits(tmp_path, "ptsd", "Post-traumatic stress disorder", "log_or", [
        {"rsid": "rs34517852", "effect": 0.1094, "p_value": 3.164e-09, "effect_allele": "A"},
    ])
    db_path = tmp_path / "g.db"
    conn = sqlite3.connect(db_path)
    conn.execute(
        "CREATE TABLE enrichments (rsid TEXT NOT NULL, source TEXT NOT NULL, "
        "data TEXT NOT NULL, fetched_at TEXT DEFAULT (datetime('now')), "
        "expires_at TEXT, PRIMARY KEY (rsid, source))"
    )
    conn.commit()

    count = import_gwas_enrichments(tmp_path, conn)

    assert count == 1
    # The exact json_extract paths genome.py uses must resolve.
    beta = conn.execute(
        "SELECT json_extract(data, '$.associations[0].beta') FROM enrichments "
        "WHERE rsid='rs34517852' AND source='gwas_catalog'"
    ).fetchone()[0]
    trait = conn.execute(
        "SELECT json_extract(data, '$.associations[0].trait') FROM enrichments "
        "WHERE rsid='rs34517852' AND source='gwas_catalog'"
    ).fetchone()[0]
    scale = conn.execute(
        "SELECT json_extract(data, '$.associations[0].effect_scale') FROM enrichments "
        "WHERE rsid='rs34517852' AND source='gwas_catalog'"
    ).fetchone()[0]
    assert beta == 0.1094
    assert trait == "Post-traumatic stress disorder"
    assert scale == "log_or"


def test_import_is_idempotent(tmp_path):
    _write_hits(tmp_path, "ptsd", "PTSD", "log_or", [
        {"rsid": "rs1", "effect": 0.2, "p_value": 1e-12, "effect_allele": "A"},
    ])
    db_path = tmp_path / "g.db"
    conn = sqlite3.connect(db_path)
    conn.execute(
        "CREATE TABLE enrichments (rsid TEXT NOT NULL, source TEXT NOT NULL, "
        "data TEXT NOT NULL, fetched_at TEXT DEFAULT (datetime('now')), "
        "expires_at TEXT, PRIMARY KEY (rsid, source))"
    )
    conn.commit()

    import_gwas_enrichments(tmp_path, conn)
    import_gwas_enrichments(tmp_path, conn)

    rows = conn.execute(
        "SELECT COUNT(*) FROM enrichments WHERE source='gwas_catalog'"
    ).fetchone()[0]
    assert rows == 1
