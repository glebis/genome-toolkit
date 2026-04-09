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
        "display_name": "Anxiety disorders",
    },
    "depression": {
        "dataset": "OpenMed/pgc-mdd",
        "default_config": "mdd2025",
        "publication": "PGC MDD Working Group, 2025",
        "citation": (
            "Psychiatric Genomics Consortium MDD Working Group. "
            "Genome-wide association meta-analysis of major depressive disorder. "
            "2025."
        ),
        "display_name": "Major depressive disorder",
    },
    "bipolar": {
        "dataset": "OpenMed/pgc-bipolar",
        "default_config": "bip2024",
        "publication": "PGC Bipolar Working Group, 2024",
        "citation": (
            "Psychiatric Genomics Consortium Bipolar Disorder Working Group. "
            "Genome-wide association study of bipolar disorder. 2024."
        ),
        "display_name": "Bipolar disorder",
    },
    "adhd": {
        "dataset": "OpenMed/pgc-adhd",
        "default_config": "adhd2022",
        "publication": "PGC ADHD Working Group, 2022",
        "citation": (
            "Psychiatric Genomics Consortium ADHD Working Group. "
            "Genome-wide association meta-analysis of ADHD. 2022."
        ),
        "display_name": "ADHD",
    },
    "ptsd": {
        "dataset": "OpenMed/pgc-ptsd",
        "default_config": "ptsd2024",
        "publication": "PGC PTSD Working Group, 2024",
        "citation": (
            "Psychiatric Genomics Consortium PTSD Working Group. "
            "Genome-wide association study of PTSD. 2024."
        ),
        "display_name": "Post-traumatic stress disorder",
    },
    "substance-use": {
        "dataset": "OpenMed/pgc-substance-use",
        "default_config": "SUD2023",
        "publication": "PGC Substance Use Disorders Working Group, 2023",
        "citation": (
            "Psychiatric Genomics Consortium Substance Use Disorders Working Group. "
            "Genome-wide association study of substance use disorders. 2023."
        ),
        "display_name": "Substance use disorders",
    },
}


# PGC summary stats files use several naming conventions. This maps
# our canonical column names to a list of candidates to try.
COLUMN_CANDIDATES: dict[str, list[str]] = {
    "snp": ["SNP", "SNPID", "rsid", "MarkerName", "ID"],
    "chr": ["CHR", "Chr", "chromosome", "chrom", "#CHROM"],
    "pos": ["BP", "POS", "position", "base_pair_location"],
    "a1": ["A1", "Allele1", "effect_allele", "EA"],
    "a2": ["A2", "Allele2", "other_allele", "NEA"],
    # Z is included as a fallback effect — it's a signed Z-score, direction is correct
    # but magnitude is on a different scale than log(OR). The script tags this in metadata.
    "effect": ["BETA", "Beta", "beta", "Effect", "OR", "log_OR", "b", "Z"],
    "se": ["SE", "StdErr", "se", "standard_error"],
    "p": ["P", "P.value", "P-value", "pvalue", "P_value", "P_VAL", "p_value"],
    "freq": ["Freq1", "FRQ", "EAF", "FRQ_A_35018", "MAF", "effect_allele_frequency"],
    "n": ["TotalN", "N", "Neff", "Neff_half", "Weight", "n"],
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


def _read_via_pyarrow(dataset: str, config: str, threshold: float):
    """Read parquet shards via HF parquet API, bypassing the datasets library's
    schema-unification logic. Yields (row_dict, col_map) tuples.

    Downloads each shard via requests (handles HF redirects reliably) and
    filters using pyarrow compute for speed.
    """
    import io
    import pyarrow.parquet as pq
    import pyarrow.compute as pc
    import requests as _requests

    session = _requests.Session()

    def _fetch_table(url: str):
        import time
        for attempt in range(5):
            r = session.get(url, timeout=120)
            if r.status_code == 429:
                wait = 2 ** attempt * 10  # 10, 20, 40, 80, 160 seconds
                print(f"  ⏳ rate limited, waiting {wait}s (attempt {attempt+1}/5)...")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return pq.read_table(io.BytesIO(r.content))
        r.raise_for_status()  # raise on final failure

    # Discover shard URLs via HF parquet API
    parquet_api = f"https://huggingface.co/api/datasets/{dataset}/parquet/{config}/train"
    resp = session.get(parquet_api, timeout=30)
    resp.raise_for_status()
    shard_urls = resp.json()

    # Skip shard 0 if it's metadata-only (cohort info, no GWAS columns)
    if shard_urls:
        probe = _fetch_table(shard_urls[0])
        if "p_value" not in probe.column_names and "P" not in probe.column_names:
            shard_urls = shard_urls[1:]

    print(f"  Found {len(shard_urls)} GWAS parquet shard(s) for config '{config}'")

    seen_total = 0
    hits_total = 0
    cols = None

    for idx, url in enumerate(shard_urls):
        table = _fetch_table(url)

        if cols is None:
            cols = detect_columns(list(table.column_names))
            missing = [k for k in ("snp", "chr", "pos", "a1", "a2", "effect", "p") if cols[k] is None]
            if missing:
                raise RuntimeError(f"missing columns {missing} in {table.column_names}")
            print(f"  Columns: {list(table.column_names)}")
            print(f"  Column map: {cols}")

        p_col = cols["p"]
        # Filter using pyarrow compute — much faster than row-by-row Python
        p_arr = table.column(p_col)
        mask = pc.less(pc.cast(p_arr, "float64"), threshold)
        filtered = table.filter(mask)

        seen_total += len(table)
        hits_total += len(filtered)

        for row in filtered.to_pylist():
            yield row, cols

        if (idx + 1) % 200 == 0 or idx == len(shard_urls) - 1:
            print(f"  ├─ shard {idx+1}/{len(shard_urls)}: scanned {seen_total:,}, hits {hits_total:,}")

    print(f"  Total: {seen_total:,} rows scanned, {hits_total:,} hits")


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

    # Try datasets library first (fast path), fall back to per-shard pyarrow
    # reads if schema unification fails.
    filtered: list[tuple[dict, dict[str, str | None]]] = []  # (row, col_map)
    cols: dict[str, str | None] = {}
    use_fallback = False

    try:
        ds = load_dataset(meta["dataset"], config, split="train", streaming=True)
        first_row = next(iter(ds))
        available_cols = list(first_row.keys())
        print(f"  Columns: {available_cols}")

        cols = detect_columns(available_cols)
        missing = [k for k in ("snp", "chr", "pos", "a1", "a2", "effect", "p") if cols[k] is None]
        if missing:
            raise RuntimeError(f"missing columns: {missing}")

        p_col = cols["p"]
        ds = load_dataset(meta["dataset"], config, split="train", streaming=True)
        seen = 0
        for row in ds:
            seen += 1
            if seen % 500_000 == 0:
                print(f"  ... scanned {seen:,} rows, {len(filtered):,} hits so far")
            try:
                p = _safe_float(row.get(p_col))
                if p is not None and p < threshold:
                    filtered.append((row, cols))
            except Exception:
                continue
        print(f"  Total scanned: {seen:,} rows, hits: {len(filtered):,}")
    except Exception as e:
        print(f"  ⚠️  datasets library failed ({type(e).__name__}: {str(e)[:120]})")
        print(f"  ▸ Falling back to per-shard pyarrow reads...")
        use_fallback = True
        for row, col_map in _read_via_pyarrow(meta["dataset"], config, threshold):
            filtered.append((row, col_map))
        # Use the col_map from the most recent shard for effect scale detection
        if filtered:
            cols = filtered[-1][1]
        print(f"  Hits: {len(filtered):,}")

    if not filtered:
        print("ERROR: no hits collected. Try a different --config or --threshold.", file=sys.stderr)
        sys.exit(4)

    # Detect whether effect column is on log-scale (BETA) or odds-ratio (OR) or Z-score.
    # All converted to a single convention where positive = risk allele.
    effect_col_name = (cols.get("effect") or "").upper()
    effect_is_or = effect_col_name in ("OR", "ODDS_RATIO")
    effect_is_z = effect_col_name == "Z"
    if effect_is_or:
        scale_label = "log_or"
        scale_note = "OR (converted to log(OR))"
    elif effect_is_z:
        scale_label = "z_score"
        scale_note = "Z-score (sign preserved, magnitude on Z scale not log(OR) scale)"
    else:
        scale_label = "beta"
        scale_note = "BETA (log scale)"
    print(f"  Effect scale: {scale_note}")

    # Convert to compact records. Each entry uses its own col_map (for the
    # pyarrow fallback path where shards may have different schemas).
    import math
    hits: list[dict] = []
    for row, row_cols in filtered:
        eff_col = row_cols.get("effect")
        if not eff_col:
            continue
        raw_effect = _safe_float(row.get(eff_col))
        eff_is_or = (eff_col or "").upper() in ("OR", "ODDS_RATIO")

        if raw_effect is not None and eff_is_or:
            if raw_effect <= 0:
                raw_effect = None
            else:
                raw_effect = math.log(raw_effect)

        snp_val = row.get(row_cols["snp"])
        rec = {
            "rsid": str(snp_val) if snp_val else None,
            "chr": _safe_int(row.get(row_cols["chr"])),
            "pos": _safe_int(row.get(row_cols["pos"])),
            "effect_allele": (row.get(row_cols["a1"]) or "").upper() or None,
            "other_allele": (row.get(row_cols["a2"]) or "").upper() or None,
            "effect": raw_effect,
            "p_value": _safe_float(row.get(row_cols["p"])),
        }
        if row_cols.get("se"):
            rec["se"] = _safe_float(row.get(row_cols["se"]))
        if row_cols.get("freq"):
            rec["freq"] = _safe_float(row.get(row_cols["freq"]))
        if row_cols.get("n"):
            rec["n"] = _safe_int(row.get(row_cols["n"]))

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
        "effect_scale": scale_label,
        "note": (
            "Effect values: positive = effect allele raises risk, negative = protective. "
            f"Scale: {scale_note}."
        ),
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
