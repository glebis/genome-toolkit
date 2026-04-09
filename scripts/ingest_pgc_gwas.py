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
import os
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
        "fallback_configs": ["ptsd2019"],
        "publication": "PGC PTSD Working Group, Nature Genetics, 2024",
        "citation": (
            "Nievergelt CM et al. Genome-wide association meta-analysis of "
            "post-traumatic stress disorder. Nature Genetics, 2024."
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


def _is_vcf_shard(table) -> bool:
    """Detect if a parquet shard contains VCF-format data instead of tabular GWAS.

    Some PGC datasets (e.g. ptsd2024) were converted from VCF format but the
    conversion produced broken parquet files: the first column name is a VCF
    header line (starts with '##') and the actual GWAS data is missing.
    """
    if not table.column_names:
        return False
    return table.column_names[0].startswith("##")


def _parse_vcf_shard(table):
    """Attempt to parse GWAS data from a VCF-format parquet shard.

    VCF-format shards from broken HuggingFace conversions store VCF header
    fragments in a single text column. This function extracts any parseable
    VCF data lines and converts them to standard GWAS row dicts.

    VCF INFO fields typically contain: BETA or Z (effect), P (p-value),
    SE (standard error), etc. as semicolon-separated key=value pairs.

    Returns a list of (row_dict, col_map) tuples, or empty list if the
    shard contains only header metadata (which is the common case for
    the broken ptsd2024 conversion).
    """
    vcf_col = table.column_names[0]
    rows = [v.as_py() for v in table.column(vcf_col) if v.as_py() is not None]

    # Check if any row looks like a VCF data line (tab-separated, starts with chr/number)
    data_lines = []
    header_line = None
    for row in rows:
        if not row:
            continue
        if row.startswith("#CHROM") or row.startswith("#chrom"):
            header_line = row
        elif not row.startswith("#") and "\t" in row:
            data_lines.append(row)

    if not data_lines:
        return []

    # Parse VCF header to get column names
    if header_line:
        vcf_columns = header_line.lstrip("#").split("\t")
    else:
        # Standard VCF columns
        vcf_columns = ["CHROM", "POS", "ID", "REF", "ALT", "QUAL", "FILTER", "INFO"]

    col_map = {
        "snp": "ID",
        "chr": "CHROM",
        "pos": "POS",
        "a1": "ALT",
        "a2": "REF",
        "effect": "BETA",
        "p": "P",
        "se": "SE",
    }

    results = []
    for line in data_lines:
        fields = line.split("\t")
        if len(fields) < 8:
            continue

        rec = {}
        for i, col_name in enumerate(vcf_columns[:len(fields)]):
            rec[col_name] = fields[i]

        # Parse INFO field (key=value pairs separated by semicolons)
        info_str = rec.get("INFO", "")
        info_fields = {}
        for kv in info_str.split(";"):
            if "=" in kv:
                k, v = kv.split("=", 1)
                info_fields[k] = v

        # Merge INFO fields into record for column detection
        for k, v in info_fields.items():
            if k not in rec:
                rec[k] = v

        # Try to find effect size (BETA or Z) and p-value from INFO
        effect_val = info_fields.get("BETA") or info_fields.get("Z")
        p_val = info_fields.get("P") or info_fields.get("PVAL")
        se_val = info_fields.get("SE")

        if effect_val:
            rec["BETA"] = effect_val
        if p_val:
            rec["P"] = p_val
        if se_val:
            rec["SE"] = se_val

        results.append((rec, col_map))

    return results


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
    hf_token = os.environ.get("HF_TOKEN")
    if hf_token:
        session.headers["Authorization"] = f"Bearer {hf_token}"

    def _fetch_table(url: str):
        import time
        for attempt in range(8):
            r = session.get(url, timeout=120)
            if r.status_code == 429:
                wait = min(2 ** attempt * 15, 600)  # 15, 30, 60, 120, 240, 480, 600, 600
                print(f"  ⏳ rate limited, waiting {wait}s (attempt {attempt+1}/8)...")
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

    # Probe shard 0 to detect format
    if shard_urls:
        probe = _fetch_table(shard_urls[0])

        # Detect VCF-format shards (broken parquet conversion)
        if _is_vcf_shard(probe):
            print(f"  Detected VCF-format parquet shards (column: '{probe.column_names[0]}')")
            # Try to parse VCF data from all shards
            vcf_results = _parse_vcf_shard(probe)
            if vcf_results:
                print(f"  Parsed {len(vcf_results)} VCF data lines from shard 0")
            else:
                # Check remaining shards too
                all_vcf_results = []
                for url in shard_urls[1:]:
                    t = _fetch_table(url)
                    all_vcf_results.extend(_parse_vcf_shard(t))
                if all_vcf_results:
                    vcf_results = all_vcf_results
                    print(f"  Parsed {len(vcf_results)} VCF data lines across all shards")

            if not vcf_results:
                raise RuntimeError(
                    f"Config '{config}' uses VCF format but the HuggingFace parquet "
                    f"conversion is broken (shards contain only VCF header fragments, "
                    f"~{len(probe)} rows of metadata instead of GWAS data). "
                    f"The upstream dataset needs to be re-converted. "
                    f"Try an older config (e.g. ptsd2019) or check for updates at "
                    f"https://huggingface.co/datasets/{dataset}"
                )

            # Filter VCF results by p-value threshold
            for row, col_map in vcf_results:
                p = _safe_float(row.get(col_map.get("p", "P")))
                if p is not None and p < threshold:
                    yield row, col_map
            return

        # Skip shard 0 if it's metadata-only (cohort info, no GWAS columns)
        if "p_value" not in probe.column_names and "P" not in probe.column_names:
            shard_urls = shard_urls[1:]

    print(f"  Found {len(shard_urls)} GWAS parquet shard(s) for config '{config}'")

    seen_total = 0
    hits_total = 0
    schemas_seen: set[tuple] = set()

    for idx, url in enumerate(shard_urls):
        table = _fetch_table(url)

        # Detect columns per-shard — schemas can differ across sub-studies
        shard_cols = detect_columns(list(table.column_names))
        missing = [k for k in ("snp", "chr", "pos", "a1", "a2", "effect", "p") if shard_cols[k] is None]
        if missing:
            continue  # skip shards with incompatible schema

        col_key = tuple(table.column_names)
        if col_key not in schemas_seen:
            schemas_seen.add(col_key)
            print(f"  Columns: {list(table.column_names)}")
            print(f"  Column map: {shard_cols}")

        p_col = shard_cols["p"]
        # Filter using pyarrow compute — much faster than row-by-row Python
        p_arr = table.column(p_col)
        mask = pc.less(pc.cast(p_arr, "float64"), threshold)
        filtered = table.filter(mask)

        seen_total += len(table)
        hits_total += len(filtered)

        for row in filtered.to_pylist():
            yield row, shard_cols

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
    user_config = config  # None if not explicitly specified by user
    config = config or meta["default_config"]

    # Build list of configs to try: requested config first, then fallbacks
    configs_to_try = [config]
    if not user_config and "fallback_configs" in meta:
        configs_to_try.extend(meta["fallback_configs"])

    filtered: list[tuple[dict, dict[str, str | None]]] = []  # (row, col_map)
    cols: dict[str, str | None] = {}
    actual_config = config

    for try_config in configs_to_try:
        print(f"▸ Loading {meta['dataset']} / {try_config} ...")

        # Try datasets library first (fast path), fall back to per-shard pyarrow
        # reads if schema unification fails.
        filtered = []
        cols = {}
        use_fallback = False

        try:
            ds = load_dataset(meta["dataset"], try_config, split="train", streaming=True)
            first_row = next(iter(ds))
            available_cols = list(first_row.keys())
            print(f"  Columns: {available_cols}")

            cols = detect_columns(available_cols)
            missing = [k for k in ("snp", "chr", "pos", "a1", "a2", "effect", "p") if cols[k] is None]
            if missing:
                raise RuntimeError(f"missing columns: {missing}")

            p_col = cols["p"]
            ds = load_dataset(meta["dataset"], try_config, split="train", streaming=True)
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
            try:
                for row, col_map in _read_via_pyarrow(meta["dataset"], try_config, threshold):
                    filtered.append((row, col_map))
                # Use the col_map from the most recent shard for effect scale detection
                if filtered:
                    cols = filtered[-1][1]
                print(f"  Hits: {len(filtered):,}")
            except RuntimeError as vcf_err:
                if "VCF format" in str(vcf_err) and try_config != configs_to_try[-1]:
                    print(f"  ⚠️  {vcf_err}")
                    print(f"  ▸ Trying fallback config...")
                    continue
                raise

        if filtered:
            actual_config = try_config
            break

    if not filtered:
        print("ERROR: no hits collected. Try a different --config or --threshold.", file=sys.stderr)
        sys.exit(4)

    config = actual_config

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
