"""Tests for the cross-section gene index (#35).

`build_gene_section_index` maps each gene symbol to the sorted list of app
sections it appears in, combining three config sources:
  - pathway-systems (tag match) -> mental-health / addiction
  - risk-landscape relevant_genes -> risk
  - pgx-drugs enzyme symbols     -> pgx
"""
from backend.app.routes.vault import build_gene_section_index


# Shared fixtures -----------------------------------------------------------

SYSTEMS_CONFIG = {
    "dopamine": {
        "tags": ["Dopamine System"],
        "domains": ["mental-health", "addiction"],
    },
    "methylation": {
        "tags": ["Methylation"],
        "domains": ["mental-health"],
    },
    # A system that declares the risk domain — must NOT mark genes as risk,
    # because the Risk view renders from risk-landscape relevant_genes, not tags.
    "immune": {
        "tags": ["Immune and Inflammatory"],
        "domains": ["mental-health", "risk"],
    },
}

SYSTEM_GENES = {
    "Dopamine System": ["COMT", "DRD2"],
    "Methylation": ["MTHFR"],
    "Immune and Inflammatory": ["IL6"],
}


def test_multi_section_gene_combines_all_sources():
    index = build_gene_section_index(
        systems_config=SYSTEMS_CONFIG,
        system_genes=SYSTEM_GENES,
        risk_genes=["COMT", "APOE"],
        pgx_symbols=["CYP2D6"],
    )
    # COMT: dopamine (mh + addiction) + risk-landscape
    assert index["COMT"] == ["addiction", "mental-health", "risk"]


def test_pgx_only_gene():
    index = build_gene_section_index(
        systems_config=SYSTEMS_CONFIG,
        system_genes=SYSTEM_GENES,
        risk_genes=[],
        pgx_symbols=["CYP2C9"],
    )
    assert index["CYP2C9"] == ["pgx"]


def test_systems_risk_domain_does_not_create_risk_membership():
    # IL6 is tag-matched to the 'immune' system which declares domain 'risk',
    # but IL6 is not in risk-landscape relevant_genes -> no 'risk' badge.
    index = build_gene_section_index(
        systems_config=SYSTEMS_CONFIG,
        system_genes=SYSTEM_GENES,
        risk_genes=[],
        pgx_symbols=[],
    )
    assert index["IL6"] == ["mental-health"]


def test_symbols_upper_cased_and_sections_deduped():
    index = build_gene_section_index(
        systems_config=SYSTEMS_CONFIG,
        system_genes={"Dopamine System": ["comt", "COMT"]},
        risk_genes=["comt"],
        pgx_symbols=[],
    )
    assert "comt" not in index
    assert index["COMT"] == ["addiction", "mental-health", "risk"]


def test_sections_are_sorted():
    index = build_gene_section_index(
        systems_config=SYSTEMS_CONFIG,
        system_genes={"Dopamine System": ["DRD2"]},
        risk_genes=["DRD2"],
        pgx_symbols=["DRD2"],
    )
    assert index["DRD2"] == sorted(index["DRD2"])
    assert index["DRD2"] == ["addiction", "mental-health", "pgx", "risk"]
