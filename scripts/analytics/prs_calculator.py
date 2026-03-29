#!/usr/bin/env python3
"""Polygenic Risk Score (PRS) calculator using curated GWAS SNP weights.

Reads genotype data from genome.db and computes weighted PRS for each trait
defined in prs_snp_weights.json. Outputs percentile estimates and a summary.

Usage:
    python3 prs_calculator.py [--db PATH] [--weights PATH] [--trait TRAIT] [--output PATH]
    python3 prs_calculator.py --gwas-only   # conservative: exclude candidate gene SNPs

Limitations:
    - Uses 20-30 top SNPs per trait (full clinical PRS uses millions)
    - Percentile estimates are approximate (assumes normal distribution)
    - This is a SCREENING/EDUCATIONAL tool, NOT clinical-grade
    - PRS explains only a fraction of trait variance (typically 1-15%)
    - Effect sizes are from European-ancestry GWAS; may not generalize
"""
from __future__ import annotations

import argparse
import json
import math
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.config import DB_PATH, DATA_DIR

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_DB = DB_PATH
DEFAULT_WEIGHTS = SCRIPT_DIR.parent / "data" / "prs_snp_weights.json"

COVERAGE_WARNING_THRESHOLD = 80.0  # percent


# Standard normal CDF approximation (Abramowitz and Stegun)
def norm_cdf(x: float) -> float:
    """Approximate standard normal CDF using the Abramowitz & Stegun formula."""
    if x < -8:
        return 0.0
    if x > 8:
        return 1.0
    a1 = 0.254829592
    a2 = -0.284496736
    a3 = 1.421413741
    a4 = -1.453152027
    a5 = 1.061405429
    p = 0.3275911
    sign = 1 if x >= 0 else -1
    x_abs = abs(x)
    t = 1.0 / (1.0 + p * x_abs)
    y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * math.exp(-x_abs * x_abs / 2.0)
    return 0.5 * (1.0 + sign * y)


def load_weights(path: Path) -> Dict[str, Any]:
    """Load SNP weights JSON file."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["traits"]


def count_effect_alleles(genotype: str, effect_allele: str) -> int:
    """Count how many copies of the effect allele are in the genotype string.

    23andMe genotypes are two characters (e.g. 'AG', 'CC', 'AT').
    Returns 0, 1, or 2.
    """
    if not genotype or len(genotype) < 2:
        return 0
    count = 0
    for allele in genotype:
        if allele == effect_allele:
            count += 1
    return count


def trait_has_candidate_snps(trait_data: Dict[str, Any]) -> bool:
    """Check whether a trait has any candidate_gene SNPs."""
    return any(s.get("source_type") == "candidate_gene" for s in trait_data["snps"])


def filter_snps_by_source(snps: List[Dict], gwas_only: bool) -> List[Dict]:
    """Filter SNP list based on source_type. If gwas_only, exclude candidate_gene SNPs."""
    if not gwas_only:
        return snps
    return [s for s in snps if s.get("source_type", "gwas") != "candidate_gene"]


def compute_prs_for_trait(
    conn: sqlite3.Connection,
    trait_key: str,
    trait_data: Dict[str, Any],
    gwas_only: bool = False,
) -> Dict[str, Any]:
    """Compute PRS for a single trait.

    Returns a dict with score details, matched/missing SNPs, and percentile.
    """
    all_snps = trait_data["snps"]
    snps = filter_snps_by_source(all_snps, gwas_only)

    # Deduplicate rsids (keep first occurrence)
    seen = set()
    unique_snps = []
    for s in snps:
        if s["rsid"] not in seen:
            seen.add(s["rsid"])
            unique_snps.append(s)
    snps = unique_snps

    # Query all relevant genotypes in one go
    placeholders = ",".join("?" for _ in snps)
    cursor = conn.execute(
        f"SELECT rsid, genotype FROM snps WHERE rsid IN ({placeholders})",
        [s["rsid"] for s in snps],
    )
    genotype_map = {row[0]: row[1] for row in cursor.fetchall()}

    total_score = 0.0
    max_possible_score = 0.0
    min_possible_score = 0.0
    matched_snps = []
    missing_snps = []
    snp_details = []

    for snp in snps:
        rsid = snp["rsid"]
        effect_allele = snp["effect_allele"]
        beta = snp["beta"]

        # Max/min possible regardless of availability
        if beta > 0:
            max_possible_score += 2 * beta
        else:
            min_possible_score += 2 * beta
            max_possible_score += 0  # 0 copies of protective allele = no negative contribution

        if rsid in genotype_map:
            genotype = genotype_map[rsid]
            allele_count = count_effect_alleles(genotype, effect_allele)
            contribution = allele_count * beta
            total_score += contribution
            matched_snps.append(rsid)
            snp_details.append({
                "rsid": rsid,
                "genotype": genotype,
                "effect_allele": effect_allele,
                "allele_count": allele_count,
                "beta": beta,
                "contribution": round(contribution, 6),
                "source": snp.get("source", ""),
                "source_type": snp.get("source_type", "gwas"),
            })
        else:
            missing_snps.append(rsid)

    # Estimate percentile
    matched_betas = [s["beta"] for s in snp_details]
    if matched_betas:
        expected_mean = sum(matched_betas)  # 2p * beta, p~0.5 => sum(beta)
        expected_var = sum(b ** 2 * 0.5 for b in matched_betas)
        expected_sd = math.sqrt(expected_var) if expected_var > 0 else 0.001

        z_score = (total_score - expected_mean) / expected_sd if expected_sd > 0 else 0.0
        percentile = norm_cdf(z_score) * 100
    else:
        z_score = 0.0
        percentile = 50.0
        expected_mean = 0.0
        expected_sd = 0.0

    # Count candidate gene SNPs included
    candidate_count = sum(1 for s in snps if s.get("source_type") == "candidate_gene")
    gwas_count = len(snps) - candidate_count

    return {
        "trait_key": trait_key,
        "full_name": trait_data["full_name"],
        "trait_type": trait_data["trait_type"],
        "raw_score": round(total_score, 6),
        "expected_mean": round(expected_mean, 6),
        "expected_sd": round(expected_sd, 6),
        "z_score": round(z_score, 3),
        "percentile": round(percentile, 1),
        "snps_matched": len(matched_snps),
        "snps_missing": len(missing_snps),
        "snps_total": len(snps),
        "snps_gwas": gwas_count,
        "snps_candidate": candidate_count,
        "coverage_pct": round(len(matched_snps) / len(snps) * 100, 1) if snps else 0,
        "missing_rsids": missing_snps,
        "snp_details": snp_details,
        "sources": trait_data.get("sources", []),
        "notes": trait_data.get("notes", ""),
        "population_prevalence": trait_data.get("population_prevalence"),
        "gwas_only": gwas_only,
    }


def risk_category(percentile: float) -> str:
    """Assign a qualitative risk category based on percentile."""
    if percentile >= 90:
        return "HIGH"
    elif percentile >= 75:
        return "ABOVE AVERAGE"
    elif percentile >= 25:
        return "AVERAGE"
    elif percentile >= 10:
        return "BELOW AVERAGE"
    else:
        return "LOW"


def format_coverage_warning(result: Dict[str, Any]) -> Optional[str]:
    """Return a coverage warning string if coverage < threshold, else None."""
    if result["coverage_pct"] < COVERAGE_WARNING_THRESHOLD:
        return (
            f"  ** WARNING: Coverage {result['coverage_pct']}% is below {COVERAGE_WARNING_THRESHOLD:.0f}% threshold. "
            f"Percentile estimate is unreliable for {result['full_name']}. **"
        )
    return None


def format_report(
    results: List[Dict[str, Any]],
    show_details: bool = False,
    candidate_results: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """Format PRS results as a human-readable report.

    If candidate_results is provided, show both GWAS-only and full PRS side by side
    for traits that have candidate gene SNPs.
    """
    lines = []
    lines.append("=" * 76)
    lines.append("POLYGENIC RISK SCORE (PRS) SUMMARY REPORT")
    lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append(f"Mode: {'GWAS-only (conservative default)' if results[0].get('gwas_only') else 'Full (GWAS + candidate gene)'}")
    lines.append("=" * 76)
    lines.append("")
    lines.append("IMPORTANT CAVEATS:")
    lines.append("  - This uses 20-30 top SNPs per trait. Clinical PRS uses millions.")
    lines.append("  - Percentiles are APPROXIMATE (assumes normal distribution, p=0.5).")
    lines.append("  - This is a SCREENING/EDUCATIONAL tool, NOT a clinical diagnosis.")
    lines.append("  - PRS explains only 1-15% of trait variance for most conditions.")
    lines.append("  - Effect sizes from European-ancestry GWAS; cross-ancestry use limited.")
    lines.append("  - Environmental factors, lifestyle, and gene-gene interactions matter.")
    lines.append("")

    # Build a lookup for candidate results
    candidate_map = {}
    if candidate_results:
        for cr in candidate_results:
            candidate_map[cr["trait_key"]] = cr

    lines.append("-" * 76)

    for r in results:
        category = risk_category(r["percentile"])
        trait_label = r["full_name"]
        has_candidate = r["trait_key"] in candidate_map

        lines.append("")
        lines.append(f"  {trait_label}")
        lines.append(f"  {'.' * len(trait_label)}")

        # Coverage warning
        warning = format_coverage_warning(r)
        if warning:
            lines.append("")
            lines.append(warning)
            lines.append("")

        if has_candidate:
            cr = candidate_map[r["trait_key"]]
            cr_cat = risk_category(cr["percentile"])

            lines.append(f"  [GWAS-only]       Raw PRS: {r['raw_score']:.4f}  |  Z: {r['z_score']:+.2f}  |  Percentile: {r['percentile']:.1f}% ({category})")
            lines.append(f"  [GWAS+candidate]  Raw PRS: {cr['raw_score']:.4f}  |  Z: {cr['z_score']:+.2f}  |  Percentile: {cr['percentile']:.1f}% ({cr_cat})")
            lines.append(f"  SNP panel: {r['snps_gwas']} GWAS + {cr['snps_candidate']} candidate gene = {cr['snps_total']} total")
            lines.append(f"  Coverage (GWAS-only): {r['snps_matched']}/{r['snps_total']} ({r['coverage_pct']}%)")
            lines.append(f"  Coverage (full):      {cr['snps_matched']}/{cr['snps_total']} ({cr['coverage_pct']}%)")

            # Coverage warning for the full result too
            full_warning = format_coverage_warning(cr)
            if full_warning:
                lines.append(full_warning.replace("WARNING:", "WARNING (full):"))

            lines.append("")
            lines.append("  NOTE: Candidate gene SNPs have potentially inflated effect sizes.")
            lines.append("  The GWAS-only score is the conservative (recommended) estimate.")
        else:
            lines.append(f"  Raw PRS:      {r['raw_score']:.4f}")
            lines.append(f"  Expected:     {r['expected_mean']:.4f} +/- {r['expected_sd']:.4f}")
            lines.append(f"  Z-score:      {r['z_score']:+.2f}")
            lines.append(f"  Percentile:   {r['percentile']:.1f}%")
            lines.append(f"  Category:     {category}")
            lines.append(f"  SNP coverage: {r['snps_matched']}/{r['snps_total']} ({r['coverage_pct']}%)")

        if r["trait_type"] == "binary" and r.get("population_prevalence"):
            prev = r["population_prevalence"]
            lines.append(f"  Pop. prevalence: {prev*100:.1f}%")

        if r["missing_rsids"]:
            lines.append(f"  Missing SNPs: {', '.join(r['missing_rsids'][:5])}"
                         + (f" (+{len(r['missing_rsids'])-5} more)" if len(r["missing_rsids"]) > 5 else ""))

        lines.append(f"  Sources: {'; '.join(r['sources'][:2])}")

        if show_details and r["snp_details"]:
            lines.append("")
            lines.append(f"  {'rsid':<14} {'geno':>4} {'eff':>3} {'#':>1} {'beta':>7} {'contrib':>8}  {'type':<10} source")
            lines.append(f"  {'-'*14} {'-'*4} {'-'*3} {'-'*1} {'-'*7} {'-'*8}  {'-'*10} {'-'*12}")
            for s in sorted(r["snp_details"], key=lambda x: abs(x["contribution"]), reverse=True):
                lines.append(
                    f"  {s['rsid']:<14} {s['genotype']:>4} {s['effect_allele']:>3} {s['allele_count']:>1} "
                    f"{s['beta']:>7.4f} {s['contribution']:>+8.5f}  {s.get('source_type','gwas'):<10} {s['source']}"
                )

        lines.append("")
        lines.append("-" * 76)

    # Summary of coverage warnings
    low_coverage = [r for r in results if r["coverage_pct"] < COVERAGE_WARNING_THRESHOLD]
    if low_coverage:
        lines.append("")
        lines.append("=" * 76)
        lines.append(f"COVERAGE WARNINGS ({len(low_coverage)} trait(s) below {COVERAGE_WARNING_THRESHOLD:.0f}%)")
        lines.append("=" * 76)
        for r in low_coverage:
            lines.append(f"  - {r['full_name']}: {r['snps_matched']}/{r['snps_total']} ({r['coverage_pct']}%) -- percentile unreliable")
        lines.append("")
        lines.append("  Low coverage means many risk-carrying (or protective) SNPs are unmeasured.")
        lines.append("  The resulting percentile may shift substantially if more SNPs are added.")
        lines.append("")

    lines.append("")
    lines.append("METHODOLOGY:")
    lines.append("  PRS = sum(effect_allele_count x beta_weight) for matched SNPs")
    lines.append("  Percentile estimated via z = (score - mean) / sd, assuming p(allele) = 0.5")
    lines.append("  This is illustrative. Full PRS requires LD-clumped genome-wide weights.")
    lines.append("  Default mode is GWAS-only (conservative). Use --include-candidate for full PRS.")
    lines.append("")

    return "\n".join(lines)


def generate_obsidian_note(results: List[Dict[str, Any]], output_path: Path) -> None:
    """Write results as an Obsidian-compatible markdown note."""
    lines = []
    lines.append("---")
    lines.append("type: research")
    lines.append("topic: Polygenic Risk Scores - Personal Analysis")
    lines.append(f"created_date: '[[{datetime.now().strftime('%Y%m%d')}]]'")
    lines.append("tags:")
    lines.append("  - prs")
    lines.append("  - gwas")
    lines.append("  - risk-assessment")
    lines.append("genes:")
    # Collect unique gene-relevant rsids
    all_rsids = set()
    for r in results:
        for s in r["snp_details"]:
            all_rsids.add(s["rsid"])
    lines.append("systems:")
    lines.append("  - Metabolic System")
    lines.append("  - Stress Response System")
    lines.append("  - Cardiovascular")
    lines.append("  - Immune System")
    lines.append("actionable_findings: true")
    lines.append("evidence_tier: E3")
    lines.append("---")
    lines.append("")
    lines.append("# Polygenic Risk Scores - Personal Analysis")
    lines.append("")
    lines.append("> [!warning] Screening Tool Only")
    lines.append("> This PRS analysis uses 20-30 top GWAS SNPs per trait from the 601K SNP array. Clinical-grade PRS uses millions of variants. Percentiles are approximate. This is for educational/screening purposes only.")
    lines.append("")
    lines.append("## Summary Table")
    lines.append("")
    lines.append("| Trait | Percentile | Z-score | Category | Coverage |")
    lines.append("|-------|-----------|---------|----------|----------|")

    for r in results:
        cat = risk_category(r["percentile"])
        lines.append(
            f"| {r['full_name']} | {r['percentile']:.1f}% | {r['z_score']:+.2f} | {cat} | {r['snps_matched']}/{r['snps_total']} |"
        )

    lines.append("")
    lines.append("## Trait Details")

    for r in results:
        cat = risk_category(r["percentile"])
        lines.append("")
        lines.append(f"### {r['full_name']}")
        lines.append("")
        lines.append(f"- **Percentile**: {r['percentile']:.1f}% ({cat})")
        lines.append(f"- **Raw PRS**: {r['raw_score']:.4f} (expected: {r['expected_mean']:.4f} +/- {r['expected_sd']:.4f})")
        lines.append(f"- **Z-score**: {r['z_score']:+.2f}")
        lines.append(f"- **SNP coverage**: {r['snps_matched']}/{r['snps_total']} ({r['coverage_pct']}%)")

        if r["trait_type"] == "binary" and r.get("population_prevalence"):
            lines.append(f"- **Population prevalence**: {r['population_prevalence']*100:.1f}%")

        lines.append("")
        if r.get("notes"):
            lines.append(f"> {r['notes']}")
            lines.append("")

        # Top contributing SNPs
        top_snps = sorted(r["snp_details"], key=lambda x: abs(x["contribution"]), reverse=True)[:10]
        if top_snps:
            lines.append("**Top contributing SNPs:**")
            lines.append("")
            lines.append("| rsid | Genotype | Effect Allele | Count | Beta | Contribution | Source |")
            lines.append("|------|----------|---------------|-------|------|-------------|--------|")
            for s in top_snps:
                lines.append(
                    f"| {s['rsid']} | {s['genotype']} | {s['effect_allele']} | {s['allele_count']} | {s['beta']:.4f} | {s['contribution']:+.5f} | {s['source']} |"
                )
            lines.append("")

        lines.append("**Sources:**")
        for src in r["sources"]:
            lines.append(f"- {src}")
        lines.append("")

    lines.append("## Methodology")
    lines.append("")
    lines.append("PRS = sum(effect_allele_count x beta_weight) for all matched SNPs in the genotype database.")
    lines.append("")
    lines.append("- Effect sizes (beta) from published GWAS meta-analyses (see sources per trait)")
    lines.append("- For binary traits, beta = ln(OR)")
    lines.append("- Percentile estimated assuming PRS ~ N(mean, sd) with allele frequency p = 0.5")
    lines.append("- SNP weights curated from top genome-wide significant loci only")
    lines.append("")
    lines.append("## Limitations")
    lines.append("")
    lines.append("1. **SNP count**: Uses 20-30 SNPs per trait. Full PRS (e.g., PGS Catalog scores) use 100K-6M variants")
    lines.append("2. **Array coverage**: 601K SNP chip captures only a fraction of informative variants")
    lines.append("3. **LD structure**: No LD-clumping or pruning applied (top hits are approximately independent)")
    lines.append("4. **Allele frequencies**: Percentiles assume p=0.5 for all SNPs (rough approximation)")
    lines.append("5. **Ancestry**: Effect sizes from European-ancestry GWAS; generalizability is limited")
    lines.append("6. **Environment**: PRS does not account for lifestyle, diet, stress, medication, or gene-environment interactions")
    lines.append("7. **Clinical utility**: Not validated for clinical decision-making at this SNP count")
    lines.append("")
    lines.append("## Cross-References")
    lines.append("")
    lines.append("- [[Genetic Determinism - Limits and Caveats]]")
    lines.append("- [[MoC - All Systems]]")
    lines.append("- [[MoC - All Genes]]")
    lines.append("- [[Dashboard]]")
    lines.append("")
    lines.append("> [!brain] See also: brain vault notes on specific conditions and protocols related to these risk scores.")
    lines.append("")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(
        description="Calculate Polygenic Risk Scores from personal genotype data"
    )
    parser.add_argument(
        "--db", type=Path, default=DEFAULT_DB,
        help=f"Path to genome.db (default: {DEFAULT_DB})"
    )
    parser.add_argument(
        "--weights", type=Path, default=DEFAULT_WEIGHTS,
        help=f"Path to SNP weights JSON (default: {DEFAULT_WEIGHTS})"
    )
    parser.add_argument(
        "--trait", type=str, default=None,
        help="Calculate PRS for a specific trait only (e.g., 'bmi', 't2d')"
    )
    parser.add_argument(
        "--details", action="store_true",
        help="Show per-SNP details in the console report"
    )
    parser.add_argument(
        "--gwas-only", action="store_true", default=True,
        help="Exclude candidate gene SNPs (DEFAULT -- conservative estimate)"
    )
    parser.add_argument(
        "--include-candidate", action="store_true", default=False,
        help="Include candidate gene SNPs in PRS (overrides --gwas-only)"
    )
    parser.add_argument(
        "--output", type=Path, default=None,
        help="Path for Obsidian markdown output note"
    )
    parser.add_argument(
        "--json-output", type=Path, default=None,
        help="Path for JSON output (machine-readable results)"
    )

    args = parser.parse_args()

    if not args.db.exists():
        print(f"Error: database not found at {args.db}", file=sys.stderr)
        sys.exit(1)
    if not args.weights.exists():
        print(f"Error: weights file not found at {args.weights}", file=sys.stderr)
        sys.exit(1)

    gwas_only = not args.include_candidate

    traits = load_weights(args.weights)
    conn = sqlite3.connect(str(args.db))

    results = []
    candidate_results = []  # Full results for traits with candidate SNPs
    trait_keys = [args.trait] if args.trait else sorted(traits.keys())

    for key in trait_keys:
        if key not in traits:
            print(f"Warning: trait '{key}' not found in weights file, skipping", file=sys.stderr)
            continue

        # Always compute GWAS-only as the primary result
        result = compute_prs_for_trait(conn, key, traits[key], gwas_only=True)
        results.append(result)

        # If trait has candidate SNPs, also compute full PRS for comparison
        if trait_has_candidate_snps(traits[key]):
            full_result = compute_prs_for_trait(conn, key, traits[key], gwas_only=False)
            candidate_results.append(full_result)

    conn.close()

    # Console report
    report = format_report(
        results,
        show_details=args.details,
        candidate_results=candidate_results if candidate_results else None,
    )
    print(report)

    # Obsidian note
    if args.output:
        generate_obsidian_note(results, args.output)
        print(f"\nObsidian note written to: {args.output}")

    # JSON output
    if args.json_output:
        json_results = {
            "generated": datetime.now().isoformat(),
            "database": str(args.db),
            "weights_file": str(args.weights),
            "mode": "gwas_only" if gwas_only else "full",
            "results": results,
            "candidate_results": candidate_results,
        }
        with open(args.json_output, "w", encoding="utf-8") as f:
            json.dump(json_results, f, indent=2)
        print(f"JSON results written to: {args.json_output}")


if __name__ == "__main__":
    main()
