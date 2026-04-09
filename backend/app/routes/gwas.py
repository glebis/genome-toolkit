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


@router.get("/overlap")
async def get_gwas_overlap():
    """Find pleiotropic SNPs — rsids significant across 2+ traits — with user genotypes."""
    if not GWAS_CONFIG_DIR.exists():
        return {"overlap": [], "total_pleiotropic": 0}

    # Collect all hits keyed by rsid
    rsid_traits: dict[str, list[dict]] = {}
    rsid_info: dict[str, dict] = {}

    for f in sorted(GWAS_CONFIG_DIR.glob("*-hits.json")):
        try:
            data = json.loads(f.read_text())
        except Exception:
            continue
        trait = data.get("trait", "")
        display_name = data.get("display_name", trait)
        for hit in data.get("hits", []):
            rsid = hit.get("rsid")
            if not rsid:
                continue
            entry = {
                "trait": trait,
                "display_name": display_name,
                "effect": hit.get("effect") or 0.0,
                "p_value": hit.get("p_value"),
                "effect_allele": hit.get("effect_allele"),
                "other_allele": hit.get("other_allele"),
                "direction": "risk" if (hit.get("effect") or 0) > 0
                             else ("protective" if (hit.get("effect") or 0) < 0 else "neutral"),
            }
            # Deduplicate per rsid+trait — keep entry with lowest p_value
            existing = rsid_traits.get(rsid, [])
            dup = next((i for i, e in enumerate(existing) if e["trait"] == trait), None)
            if dup is not None:
                if (entry["p_value"] or 1) < (existing[dup]["p_value"] or 1):
                    existing[dup] = entry
            else:
                rsid_traits.setdefault(rsid, []).append(entry)
            if rsid not in rsid_info:
                rsid_info[rsid] = {"chr": hit.get("chr"), "pos": hit.get("pos")}

    # Keep only rsids in 2+ traits
    pleiotropic = {r: ts for r, ts in rsid_traits.items() if len(ts) >= 2}

    from backend.app.main import genome_db

    results: list[dict] = []
    for rsid, traits_list in pleiotropic.items():
        snp = await genome_db.get_snp(rsid)
        # Use the first trait's effect allele for counting (they may differ across studies)
        ea = traits_list[0].get("effect_allele")
        ea_count = _count_effect_alleles(
            snp.get("genotype") if snp else None, ea
        )

        avg_p = sum(t["p_value"] for t in traits_list if t["p_value"]) / max(
            sum(1 for t in traits_list if t["p_value"]), 1
        )

        results.append({
            "rsid": rsid,
            "chr": rsid_info[rsid]["chr"],
            "pos": rsid_info[rsid]["pos"],
            "n_traits": len(traits_list),
            "avg_p_value": avg_p,
            "user_genotype": snp.get("genotype") if snp else None,
            "effect_allele_count": ea_count,
            "traits": traits_list,
        })

    # Sort: most traits first, then lowest average p-value
    results.sort(key=lambda r: (-r["n_traits"], r["avg_p_value"]))

    # Group by chromosome
    by_chr: dict[int | str, list[dict]] = {}
    for r in results:
        by_chr.setdefault(r["chr"], []).append(r)

    return {
        "total_pleiotropic": len(results),
        "by_chromosome": by_chr,
    }


@router.get("/summary")
async def get_gwas_summary():
    """Aggregate view across all GWAS traits: per-trait stats and cross-trait overlap."""
    if not GWAS_CONFIG_DIR.exists():
        return {"traits": [], "overall": {}}

    from backend.app.main import genome_db

    trait_summaries: list[dict] = []
    all_matched_rsids: dict[str, set] = {}  # rsid -> set of traits
    global_matched: set[str] = set()

    for f in sorted(GWAS_CONFIG_DIR.glob("*-hits.json")):
        try:
            data = json.loads(f.read_text())
        except Exception:
            continue

        trait = data.get("trait", "")
        display_name = data.get("display_name", trait)
        hits: list[dict] = data.get("hits", [])
        total_hits = data.get("n_hits", len(hits))

        matched = 0
        risk_allele_count = 0
        risk_allele_possible = 0

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

            matched += 1
            global_matched.add(rsid)
            all_matched_rsids.setdefault(rsid, set()).add(trait)

            effect = hit.get("effect") or 0.0
            if effect > 0:
                risk_allele_count += ea_count
                risk_allele_possible += 2
            elif effect < 0:
                risk_allele_count += (2 - ea_count)
                risk_allele_possible += 2

        risk_pct = (risk_allele_count / risk_allele_possible * 100) if risk_allele_possible else None

        trait_summaries.append({
            "trait": trait,
            "display_name": display_name,
            "total_hits": total_hits,
            "matched_hits": matched,
            "risk_allele_pct": round(risk_pct, 1) if risk_pct is not None else None,
        })

    cross_trait_count = sum(1 for rs, ts in all_matched_rsids.items() if len(ts) >= 2)

    return {
        "traits": trait_summaries,
        "overall": {
            "total_unique_matched": len(global_matched),
            "cross_trait_overlap": cross_trait_count,
        },
    }


# ---------------------------------------------------------------------------
# Mapping: risk-landscape mortality causes → GWAS traits
# ---------------------------------------------------------------------------

# Which GWAS trait files are relevant for each psychiatric/substance mortality cause.
# Keys must match cause names in config/risk-landscape.yaml exactly.
CAUSE_GWAS_TRAITS: dict[str, list[str]] = {
    "Suicide": ["depression", "bipolar", "ptsd"],
    "Accidents & Substance-Related": ["substance-use", "adhd"],
}


async def _compute_trait_summary(trait: str) -> dict | None:
    """Compute a quick polygenic summary for *trait* without returning per-SNP matches.

    Returns None when the hits file is missing or no SNPs matched.
    """
    hits_file = GWAS_CONFIG_DIR / f"{trait}-hits.json"
    if not hits_file.exists():
        return None

    data = json.loads(hits_file.read_text())
    hits: list[dict] = data.get("hits", [])
    total_hits = data.get("n_hits", len(hits))

    from backend.app.main import genome_db

    matched = 0
    risk_allele_count = 0
    risk_allele_possible = 0

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

        matched += 1
        effect = hit.get("effect") or 0.0
        if effect > 0:
            risk_allele_count += ea_count
            risk_allele_possible += 2
        elif effect < 0:
            risk_allele_count += (2 - ea_count)
            risk_allele_possible += 2

    if matched == 0:
        return None

    risk_pct = (
        round(risk_allele_count / risk_allele_possible * 100, 1)
        if risk_allele_possible else None
    )

    # Build human-readable summary, e.g.
    # "3,280 of 43,531 depression-associated SNPs matched; 52% risk alleles"
    display_name = data.get("display_name", trait)
    summary = (
        f"{matched:,} of {total_hits:,} {display_name.lower()}-associated SNPs matched"
    )
    if risk_pct is not None:
        summary += f"; {risk_pct}% risk alleles"

    return {
        "trait": trait,
        "display_name": display_name,
        "total_hits": total_hits,
        "matched_hits": matched,
        "risk_allele_pct": risk_pct,
        "summary": summary,
    }


@router.get("/risk-landscape-context")
async def get_risk_landscape_gwas_context():
    """Return GWAS polygenic summaries keyed by risk-landscape mortality cause.

    Only returns entries for causes that have GWAS trait mappings and at least
    one matched SNP.  Designed to be consumed alongside /api/config/risk-landscape.
    """
    result: dict[str, dict] = {}

    for cause, traits in CAUSE_GWAS_TRAITS.items():
        trait_summaries: list[dict] = []
        for trait in traits:
            summary = await _compute_trait_summary(trait)
            if summary:
                trait_summaries.append(summary)

        if not trait_summaries:
            continue

        # Build a combined one-liner, e.g.
        # "3,280 of 43,531 MDD SNPs matched (52% risk) | 410 of 1,200 PTSD SNPs …"
        combined_parts = [s["summary"] for s in trait_summaries]
        combined_summary = " | ".join(combined_parts)

        result[cause] = {
            "cause": cause,
            "gwas_polygenic_summary": combined_summary,
            "traits": trait_summaries,
        }

    return {"causes": result}


@router.get("/addiction-summary")
async def get_addiction_gwas_summary():
    """Compact GWAS polygenic summary for the addiction view.

    Returns substance-use GWAS stats (matched hits, risk allele percentage,
    top hits by effect size) so the frontend can display polygenic context
    alongside gene-level addiction data.
    """
    hits_file = GWAS_CONFIG_DIR / "substance-use-hits.json"
    if not hits_file.exists():
        return {
            "available": False,
            "trait": "substance-use",
            "display_name": "Substance use disorders",
        }

    data = json.loads(hits_file.read_text())
    hits: list[dict] = data.get("hits", [])

    from backend.app.main import genome_db

    matches: list[dict] = []
    risk_allele_total = 0
    risk_allele_max = 0
    risk_count = 0
    protective_count = 0

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
        direction = "risk" if effect > 0 else ("protective" if effect < 0 else "neutral")

        if direction == "risk":
            risk_allele_total += ea_count
            risk_allele_max += 2
            if ea_count > 0:
                risk_count += 1
        elif direction == "protective":
            risk_allele_total += (2 - ea_count)
            risk_allele_max += 2
            if ea_count > 0:
                protective_count += 1

        matches.append({
            "rsid": rsid,
            "chr": hit.get("chr"),
            "pos": hit.get("pos"),
            "gene_symbol": snp.get("gene_symbol"),
            "effect_allele": hit.get("effect_allele"),
            "other_allele": hit.get("other_allele"),
            "user_genotype": snp.get("genotype"),
            "effect_allele_count": ea_count,
            "effect": effect,
            "p_value": hit.get("p_value"),
            "direction": direction,
        })

    # Sort by effect magnitude, keep top 10 for display
    matches.sort(key=lambda m: abs(m["effect"] or 0), reverse=True)

    risk_pct = round(risk_allele_total / risk_allele_max * 100, 1) if risk_allele_max else None

    return {
        "available": True,
        "trait": "substance-use",
        "display_name": data.get("display_name", "Substance use disorders"),
        "source": data.get("source"),
        "config": data.get("config"),
        "publication": data.get("publication"),
        "citation": data.get("citation"),
        "total_hits": data.get("n_hits", 0),
        "matched_hits": len(matches),
        "risk_allele_total": risk_allele_total,
        "risk_allele_max": risk_allele_max,
        "risk_allele_pct": risk_pct,
        "risk_snp_count": risk_count,
        "protective_snp_count": protective_count,
        "top_hits": matches[:10],
    }


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
