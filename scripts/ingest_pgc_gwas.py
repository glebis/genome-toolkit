#!/usr/bin/env python3
"""Ingest PGC GWAS summary statistics, filter to significant hits.

Downloads the specified psychiatric trait from OpenMed's HuggingFace mirror
of the Psychiatric Genomics Consortium (PGC) GWAS summary statistics,
filters to genome-wide significant hits (default p < 5e-8), and writes
a compact JSON file to config/gwas/{trait}-hits.json.

The output JSON is designed to be small enough to commit to the repo
and to be joined at runtime against the user's genome.db for risk
allele matching.

Usage:
    python scripts/ingest_pgc_gwas.py anxiety
    python scripts/ingest_pgc_gwas.py anxiety --threshold 1e-5
    python scripts/ingest_pgc_gwas.py anxiety --config anx2026

Requires:
    pip install "genome-toolkit[gwas]"
    (installs datasets + pyarrow)

License:
    Output derived from PGC data licensed CC BY 4.0.
    Cite the original publication when using.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Trait registry — each entry describes one PGC dataset on HuggingFace.
# `default_config` is the subset we want to use by default (newest high-power study).
TRAITS: dict[str, dict] = {
    "anxiety": {
        "dataset": "OpenMed/pgc-anxiety",
        "default_config": "anx2026",
        "publication": "Nature Genetics, 2026",
        "citation": (
            "Psychiatric Genomics Consortium Anxiety Working Group. "
            "Genome-wide association study of anxiety disorders. "
            "Nature Genetics, 2026."
        ),
        "display_name": "Anxiety disorders (case-control)",
    },
    # Future traits — uncomment when ready:
    # "depression": {"dataset": "OpenMed/pgc-mdd", "default_config": ...},
    # "bipolar": {"dataset": "OpenMed/pgc-bipolar", ...},
    # "adhd": {"dataset": "OpenMed/pgc-adhd", ...},
    # "ptsd": {"dataset": "OpenMed/pgc-ptsd", ...},
    # "schizophrenia": {"dataset": "OpenMed/pgc-schizophrenia", ...},
}


# PGC summary stats files use several naming conventions. This maps
# our canonical column names to a list of candidates to try.
COLUMN_CANDIDATES: dict[str, list[str]] = {
    "snp": ["SNP", "SNPID", "rsid", "MarkerName", "ID"],
    "chr": ["CHR", "chromosome", "chrom", "#CHROM"],
    "pos": ["BP", "POS", "position"],
    "a1": ["A1", "Allele1", "effect_allele", "EA"],
    "a2": ["A2", "Allele2", "other_allele", "NEA"],
    "effect": ["BETA", "Effect", "OR", "log_OR", "b"],
    "se": ["SE", "StdErr", "se"],
    "p": ["P", "P.value", "P-value", "pvalue", "P_value", "P_VAL"],
    "freq": ["Freq1", "FRQ", "EAF", "FRQ_A_35018", "MAF"],
    "n": ["TotalN", "N", "Neff", "Neff_half"],
}


def detect_columns(available: list[str]) -> dict[str, str | None]:
    """Resolve canonical column names against what's actually present."""
    lower_to_orig = {c.lower(): c for c in available}
    resolved: dict[str, str | None] = {}
    for canonical, candidates in COLUMN_CANDIDATES.items():
        resolved[canonical] = None
        for cand in candidates:
            if cand.lower() in lower_to_orig:
                resolved[canonical] = lower_to_orig[cand.lower()]
                break
    return resolved


def _safe_float(val) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
    except (TypeError, ValueError):
        return None
    # NaN check without numpy
    if f != f:
        return None
    return f


def _safe_int(val) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def ingest(trait: str, config: str | None, threshold: float, out_dir: Path) -> None:
    if trait not in TRAITS:
        print(f"ERROR: unknown trait '{trait}'. Known: {list(TRAITS.keys())}", file=sys.stderr)
        sys.exit(2)

    try:
        from datasets import load_dataset
    except ImportError:
        print(
            "ERROR: `datasets` library not installed.\n"
            "Run: pip install 'genome-toolkit[gwas]'\n"
            "     (or: pip install datasets pyarrow)",
            file=sys.stderr,
        )
        sys.exit(1)

    meta = TRAITS[trait]
    config = config or meta["default_config"]

    print(f"▸ Loading {meta['dataset']} / {config} ...")
    ds = load_dataset(meta["dataset"], config, split="train")
    print(f"  Total rows: {len(ds):,}")
    print(f"  Columns: {ds.column_names}")

    cols = detect_columns(ds.column_names)
    missing = [k for k in ("snp", "chr", "pos", "a1", "a2", "effect", "p") if cols[k] is None]
    if missing:
        print(f"ERROR: could not detect required columns: {missing}", file=sys.stderr)
        print(f"  Available: {ds.column_names}", file=sys.stderr)
        sys.exit(3)

    print(f"  Column map: {cols}")

    # Filter to significant hits (streaming row-by-row to keep memory low).
    p_col = cols["p"]
    print(f"▸ Filtering to p < {threshold} ...")
    filtered = ds.filter(
        lambda row: row[p_col] is not None and _safe_float(row[p_col]) is not None and _safe_float(row[p_col]) < threshold
    )
    print(f"  Hits: {len(filtered):,}")

    # Convert to compact records.
    hits: list[dict] = []
    for row in filtered:
        rec = {
            "rsid": str(row[cols["snp"]]) if row[cols["snp"]] else None,
            "chr": _safe_int(row[cols["chr"]]),
            "pos": _safe_int(row[cols["pos"]]),
            "effect_allele": (row[cols["a1"]] or "").upper() or None,
            "other_allele": (row[cols["a2"]] or "").upper() or None,
            "effect": _safe_float(row[cols["effect"]]),
            "p_value": _safe_float(row[p_col]),
        }
        if cols["se"]:
            rec["se"] = _safe_float(row[cols["se"]])
        if cols["freq"]:
            rec["freq"] = _safe_float(row[cols["freq"]])
        if cols["n"]:
            rec["n"] = _safe_int(row[cols["n"]])

        # Skip records with no rsid or unusable effect
        if not rec["rsid"] or rec["effect"] is None or rec["p_value"] is None:
            continue
        hits.append(rec)

    # Sort by p-value ascending (strongest hits first).
    hits.sort(key=lambda h: h["p_value"])

    output = {
        "trait": trait,
        "display_name": meta["display_name"],
        "source": meta["dataset"],
        "config": config,
        "publication": meta["publication"],
        "citation": meta["citation"],
        "license": "CC BY 4.0",
        "threshold": threshold,
        "n_hits": len(hits),
        "hits": hits,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{trait}-hits.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"✓ Wrote {len(hits):,} hits to {out_path}")
    if hits:
        top = hits[0]
        print(f"  Top hit: {top['rsid']} (chr{top['chr']}:{top['pos']}) p={top['p_value']:.2e}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest PGC GWAS summary statistics and filter to significant hits.",
    )
    parser.add_argument("trait", choices=list(TRAITS.keys()), help="Psychiatric trait to ingest.")
    parser.add_argument(
        "--threshold",
        type=float,
        default=5e-8,
        help="P-value threshold (default: 5e-8, genome-wide significance).",
    )
    parser.add_argument(
        "--config",
        type=str,
        default=None,
        help="Override dataset subset (e.g. 'anx2026' or 'anx2016' for anxiety).",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("config/gwas"),
        help="Output directory for JSON hits file.",
    )
    args = parser.parse_args()

    ingest(args.trait, args.config, args.threshold, args.out_dir)


if __name__ == "__main__":
    main()
