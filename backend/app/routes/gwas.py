"""GWAS findings API — matches PGC summary statistics hits against user's genome.

Reads pre-computed top hits from config/gwas/{trait}-hits.json (produced by
scripts/ingest_pgc_gwas.py), joins against the user's genome.db by rsid,
and reports how many effect alleles the user carries for each significant SNP.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/gwas")

# Resolve config dir relative to repo root
REPO_ROOT = Path(__file__).resolve().parents[3]
GWAS_CONFIG_DIR = REPO_ROOT / "config" / "gwas"


def _count_effect_alleles(genotype: str | None, effect_allele: str | None) -> int | None:
    """Count copies of the effect allele in a diploid genotype like 'AG' or 'A/G'.

    Returns None if we can't determine (missing data, indel, etc).
    """
    if not genotype or not effect_allele:
        return None
    # Normalize: strip separators, uppercase
    g = genotype.replace("/", "").replace("|", "").upper()
    ea = effect_allele.upper()
    # Only handle SNP-level calls (length 2)
    if len(g) != 2:
        return None
    if len(ea) != 1:
        return None
    return sum(1 for base in g if base == ea)


@router.get("/traits")
async def list_traits():
    """List traits that have pre-computed GWAS hits available."""
    if not GWAS_CONFIG_DIR.exists():
        return {"traits": []}
    traits = []
    for f in sorted(GWAS_CONFIG_DIR.glob("*-hits.json")):
        try:
            data = json.loads(f.read_text())
            traits.append({
                "trait": data.get("trait"),
                "display_name": data.get("display_name"),
                "source": data.get("source"),
                "publication": data.get("publication"),
                "n_hits": data.get("n_hits", 0),
                "threshold": data.get("threshold"),
            })
        except Exception:
            continue
    return {"traits": traits}


@router.get("/{trait}")
async def get_gwas_matches(trait: str):
    """Join stored GWAS hits against genome.db, return matched SNPs with risk-allele counts."""
    hits_file = GWAS_CONFIG_DIR / f"{trait}-hits.json"
    if not hits_file.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                f"No GWAS data for trait '{trait}'. "
                f"Run: python scripts/ingest_pgc_gwas.py {trait}"
            ),
        )

    data = json.loads(hits_file.read_text())
    hits: list[dict] = data.get("hits", [])

    # Lazy import to avoid circular dependency with main.py
    from backend.app.main import genome_db

    matches: list[dict] = []
    risk_allele_total = 0
    risk_allele_max = 0

    for hit in hits:
        rsid = hit.get("rsid")
        if not rsid:
            continue

        snp = await genome_db.get_snp(rsid)
        if not snp:
            continue

        ea_count = _count_effect_alleles(snp.get("genotype"), hit.get("effect_allele"))
        if ea_count is None:
            continue

        effect = hit.get("effect") or 0.0
        # Effect > 0 means the effect allele raises risk (for case-control)
        # Effect < 0 means protective
        direction = "risk" if effect > 0 else ("protective" if effect < 0 else "neutral")

        matches.append({
            "rsid": rsid,
            "chr": hit.get("chr"),
            "pos": hit.get("pos"),
            "gene_symbol": snp.get("gene_symbol"),
            "effect_allele": hit.get("effect_allele"),
            "other_allele": hit.get("other_allele"),
            "user_genotype": snp.get("genotype"),
            "effect_allele_count": ea_count,  # 0, 1, or 2
            "effect": effect,
            "p_value": hit.get("p_value"),
            "direction": direction,
            "source_type": snp.get("source"),  # genotyped | imputed
        })

        # Weight by effect direction for a simple allele tally
        if direction == "risk":
            risk_allele_total += ea_count
            risk_allele_max += 2
        elif direction == "protective":
            # Protective alleles — invert: having 2 = 0 risk contribution
            risk_allele_total += (2 - ea_count)
            risk_allele_max += 2

    # Sort by strength of effect (largest |effect| first)
    matches.sort(key=lambda m: abs(m["effect"] or 0), reverse=True)

    return {
        "trait": trait,
        "display_name": data.get("display_name"),
        "source": data.get("source"),
        "config": data.get("config"),
        "publication": data.get("publication"),
        "citation": data.get("citation"),
        "license": data.get("license"),
        "threshold": data.get("threshold"),
        "total_hits": data.get("n_hits", 0),
        "matched_hits": len(matches),
        "risk_allele_total": risk_allele_total,
        "risk_allele_max": risk_allele_max,
        "matches": matches,
    }
