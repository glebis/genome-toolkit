"""GWAS analytics API — gene-level aggregation and PRS-like scoring.

Provides higher-level analyses built on top of the base GWAS hit data:
- Gene-level aggregation across all traits
- Per-trait PRS-like weighted scoring
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/gwas")

REPO_ROOT = Path(__file__).resolve().parents[3]
GWAS_CONFIG_DIR = REPO_ROOT / "config" / "gwas"


def _count_effect_alleles(genotype: str | None, effect_allele: str | None) -> int | None:
    """Count copies of the effect allele in a diploid genotype like 'AG' or 'A/G'."""
    if not genotype or not effect_allele:
        return None
    g = genotype.replace("/", "").replace("|", "").upper()
    ea = effect_allele.upper()
    if len(g) != 2 or len(ea) != 1:
        return None
    return sum(1 for base in g if base == ea)


def _load_all_hits() -> list[tuple[dict, dict]]:
    """Load all GWAS hit files. Returns list of (metadata, hit) tuples."""
    if not GWAS_CONFIG_DIR.exists():
        return []
    results = []
    for f in sorted(GWAS_CONFIG_DIR.glob("*-hits.json")):
        try:
            data = json.loads(f.read_text())
        except Exception:
            continue
        meta = {
            "trait": data.get("trait", ""),
            "display_name": data.get("display_name", data.get("trait", "")),
        }
        for hit in data.get("hits", []):
            results.append((meta, hit))
    return results


# ---------------------------------------------------------------------------
# Task 1: Gene-level aggregation
# ---------------------------------------------------------------------------

@router.get("/gene-map")
async def get_gene_map():
    """Map GWAS SNPs to genes and aggregate hits per gene across all traits.

    For each gene with 2+ GWAS hits, returns: gene symbol, chromosome,
    number of hits across traits, best p_value, traits represented,
    and user's total risk allele count for that gene.

    Returns top 50 genes sorted by hit count.
    """
    from backend.app.main import genome_db

    all_hits = _load_all_hits()
    if not all_hits:
        return {"genes": [], "total_genes_with_hits": 0}

    # Collect per-gene data. Key = gene_symbol.
    gene_data: dict[str, dict] = {}
    # Track rsids per gene to avoid double-counting same SNP across traits
    gene_rsids: dict[str, set[str]] = defaultdict(set)

    for meta, hit in all_hits:
        rsid = hit.get("rsid")
        if not rsid:
            continue

        snp = await genome_db.get_snp(rsid, profile_id="default")
        if not snp:
            continue

        gene_symbol = snp.get("gene_symbol")
        if not gene_symbol:
            continue

        trait = meta["trait"]
        display_name = meta["display_name"]
        p_value = hit.get("p_value")
        effect_allele = hit.get("effect_allele")

        ea_count = _count_effect_alleles(snp.get("genotype"), effect_allele)

        # Initialize gene entry if needed
        if gene_symbol not in gene_data:
            gene_data[gene_symbol] = {
                "gene_symbol": gene_symbol,
                "chromosome": hit.get("chr"),
                "hit_count": 0,
                "best_p_value": None,
                "traits": {},  # trait -> display_name
                "risk_allele_count": 0,
                "risk_allele_possible": 0,
            }

        gd = gene_data[gene_symbol]
        gd["hit_count"] += 1
        gd["traits"][trait] = display_name

        # Track best (lowest) p-value
        if p_value is not None:
            if gd["best_p_value"] is None or p_value < gd["best_p_value"]:
                gd["best_p_value"] = p_value

        # Accumulate risk allele counts (only once per unique rsid per gene)
        if ea_count is not None and rsid not in gene_rsids[gene_symbol]:
            gene_rsids[gene_symbol].add(rsid)
            gd["risk_allele_count"] += ea_count
            gd["risk_allele_possible"] += 2

    # Filter to genes with 2+ hits
    filtered = [g for g in gene_data.values() if g["hit_count"] >= 2]

    # Sort by hit count descending, then best p-value ascending
    filtered.sort(key=lambda g: (-g["hit_count"], g["best_p_value"] or 1))

    # Convert traits dict to list for JSON output and take top 50
    top_genes = []
    for g in filtered[:50]:
        top_genes.append({
            "gene_symbol": g["gene_symbol"],
            "chromosome": g["chromosome"],
            "hit_count": g["hit_count"],
            "best_p_value": g["best_p_value"],
            "traits": [
                {"trait": t, "display_name": dn}
                for t, dn in g["traits"].items()
            ],
            "n_traits": len(g["traits"]),
            "risk_allele_count": g["risk_allele_count"],
            "risk_allele_possible": g["risk_allele_possible"],
        })

    return {
        "total_genes_with_hits": len(filtered),
        "showing": len(top_genes),
        "genes": top_genes,
    }


# ---------------------------------------------------------------------------
# Task 2: PRS-like weighted scoring
# ---------------------------------------------------------------------------

@router.get("/{trait}/prs")
async def get_trait_prs(trait: str):
    """Compute a PRS-like weighted risk score for a single GWAS trait.

    For each matched SNP: weight = effect_allele_count * abs(effect).
    Sums risk and protective contributions separately.

    DISCLAIMER: This is NOT a calibrated polygenic risk score. It uses
    only genome-wide significant hits (not full summary statistics),
    has no population-level calibration, and should not be used for
    clinical decision-making.
    """
    hits_file = GWAS_CONFIG_DIR / f"{trait}-hits.json"
    if not hits_file.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No GWAS data for trait '{trait}'.",
        )

    data = json.loads(hits_file.read_text())
    hits: list[dict] = data.get("hits", [])

    from backend.app.main import genome_db

    weighted_risk = 0.0
    weighted_protective = 0.0
    max_possible_risk = 0.0
    max_possible_protective = 0.0
    contributors: list[dict] = []
    matched_count = 0

    for hit in hits:
        rsid = hit.get("rsid")
        if not rsid:
            continue

        snp = await genome_db.get_snp(rsid, profile_id="default")
        if not snp:
            continue

        effect_allele = hit.get("effect_allele")
        ea_count = _count_effect_alleles(snp.get("genotype"), effect_allele)
        if ea_count is None:
            continue

        effect = hit.get("effect") or 0.0
        abs_effect = abs(effect)
        weight = ea_count * abs_effect
        max_weight = 2 * abs_effect  # max possible for this SNP

        matched_count += 1

        if effect > 0:
            # Risk direction
            weighted_risk += weight
            max_possible_risk += max_weight
        elif effect < 0:
            # Protective direction
            weighted_protective += weight
            max_possible_protective += max_weight

        contributors.append({
            "rsid": rsid,
            "gene_symbol": snp.get("gene_symbol"),
            "effect_allele": effect_allele,
            "user_genotype": snp.get("genotype"),
            "effect_allele_count": ea_count,
            "effect": effect,
            "direction": "risk" if effect > 0 else ("protective" if effect < 0 else "neutral"),
            "weight": round(weight, 6),
            "max_weight": round(max_weight, 6),
        })

    # Sort contributors by weight descending, take top 10
    contributors.sort(key=lambda c: c["weight"], reverse=True)
    top_contributors = contributors[:10]

    raw_score = weighted_risk - weighted_protective
    max_possible = max_possible_risk + max_possible_protective
    percentile_estimate = (
        round((weighted_risk / max_possible_risk) * 100, 1)
        if max_possible_risk > 0 else None
    )

    return {
        "trait": trait,
        "display_name": data.get("display_name"),
        "matched_snps": matched_count,
        "total_hits": data.get("n_hits", len(hits)),
        "raw_score": round(raw_score, 4),
        "weighted_risk_score": round(weighted_risk, 4),
        "weighted_protective_score": round(weighted_protective, 4),
        "max_possible_risk": round(max_possible_risk, 4),
        "max_possible_protective": round(max_possible_protective, 4),
        "percentile_estimate": percentile_estimate,
        "top_contributors": top_contributors,
        "disclaimer": (
            "This is NOT a calibrated polygenic risk score (PRS). "
            "It uses only genome-wide significant hits, lacks population-level "
            "normalization, and must not be used for clinical decision-making. "
            "A true PRS requires full summary statistics, an independent "
            "validation cohort, and proper LD clumping."
        ),
    }
