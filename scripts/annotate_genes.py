#!/usr/bin/env python3
"""Annotate GWAS hit SNPs with gene symbols using UCSC refGene positions.

Downloads the UCSC refGene table for hg38 (or hg19), builds a chromosome-position
interval lookup, and maps each GWAS SNP to the gene(s) it falls within.

Outputs:
  - data/snp_gene_map.json   (rsid -> gene_symbol mapping)
  - genome.db gene_snp_map table populated
  - genome.db snps.gene_symbol column added and populated (for SNPs present in snps table)

Usage:
    python3 scripts/annotate_genes.py
    python3 scripts/annotate_genes.py --build hg19
    python3 scripts/annotate_genes.py --gwas-only --dry-run
"""
from __future__ import annotations

import argparse
import gzip
import io
import json
import sqlite3
import sys
import time
from bisect import bisect_left, bisect_right, insort
from collections import defaultdict
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
GWAS_CONFIG_DIR = REPO_ROOT / "config" / "gwas"
DATA_DIR = REPO_ROOT / "data"
DB_PATH = DATA_DIR / "genome.db"
OUTPUT_PATH = DATA_DIR / "snp_gene_map.json"
CACHE_DIR = DATA_DIR / "cache"

# UCSC refGene download URLs per build
REFGENE_URLS = {
    "hg38": "https://hgdownload.soe.ucsc.edu/goldenPath/hg38/database/refGene.txt.gz",
    "hg19": "https://hgdownload.soe.ucsc.edu/goldenPath/hg19/database/refGene.txt.gz",
}

# ---------------------------------------------------------------------------
# Gene interval index
# ---------------------------------------------------------------------------


class GeneIntervalIndex:
    """Fast chromosome-position to gene lookup using sorted intervals.

    For each chromosome, maintains a sorted list of (start, end, gene_symbol)
    tuples. Lookup uses binary search to find candidate intervals.
    """

    def __init__(self):
        # chr -> list of (start, end, gene_symbol) sorted by start
        self._intervals: dict[str, list[tuple[int, int, str]]] = defaultdict(list)
        # chr -> sorted list of interval start positions (parallel to _intervals)
        self._starts: dict[str, list[int]] = defaultdict(list)
        self._built = False

    def add(self, chrom: str, start: int, end: int, gene_symbol: str):
        """Add a gene interval. Call build() after adding all intervals."""
        self._intervals[chrom].append((start, end, gene_symbol))
        self._built = False

    def build(self):
        """Sort intervals by start position for binary search."""
        for chrom in self._intervals:
            self._intervals[chrom].sort(key=lambda x: x[0])
            self._starts[chrom] = [iv[0] for iv in self._intervals[chrom]]
        self._built = True

    def lookup(self, chrom: str, pos: int) -> str | None:
        """Find the gene containing this position. Returns first match or None.

        Uses binary search: finds all intervals whose start <= pos,
        then checks if pos <= end for each candidate.
        """
        if not self._built:
            raise RuntimeError("Call build() before lookup()")

        intervals = self._intervals.get(chrom)
        if not intervals:
            return None

        starts = self._starts[chrom]
        # Find rightmost interval with start <= pos
        idx = bisect_right(starts, pos) - 1
        if idx < 0:
            return None

        # Check backwards from idx — multiple genes can overlap
        # But typically we just want the best match (smallest interval)
        best_gene = None
        best_span = float("inf")

        # Check a window of intervals near the insertion point
        # Go backwards while start <= pos
        i = idx
        while i >= 0 and intervals[i][0] <= pos:
            start, end, gene = intervals[i]
            if pos <= end:
                span = end - start
                if span < best_span:
                    best_span = span
                    best_gene = gene
            i -= 1

        # Also check forward in case of overlapping intervals
        i = idx + 1
        while i < len(intervals) and intervals[i][0] <= pos:
            start, end, gene = intervals[i]
            if pos <= end:
                span = end - start
                if span < best_span:
                    best_span = span
                    best_gene = gene
            i += 1

        return best_gene


# ---------------------------------------------------------------------------
# Download and parse refGene
# ---------------------------------------------------------------------------


def download_refgene(build: str) -> Path:
    """Download UCSC refGene.txt.gz, caching locally. Returns path to cached file."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = CACHE_DIR / f"refGene_{build}.txt.gz"

    if cached.exists():
        age_days = (time.time() - cached.stat().st_mtime) / 86400
        if age_days < 30:
            print(f"  Using cached refGene ({age_days:.0f} days old): {cached}")
            return cached
        print(f"  Cache expired ({age_days:.0f} days old), re-downloading...")

    url = REFGENE_URLS.get(build)
    if not url:
        print(f"Error: Unknown build '{build}'. Use hg38 or hg19.")
        sys.exit(1)

    print(f"  Downloading {url} ...")
    resp = requests.get(url, stream=True, timeout=120)
    resp.raise_for_status()

    total_size = int(resp.headers.get("content-length", 0))
    downloaded = 0
    with open(cached, "wb") as f:
        for chunk in resp.iter_content(chunk_size=65536):
            f.write(chunk)
            downloaded += len(chunk)
            if total_size:
                pct = downloaded / total_size * 100
                print(f"\r  Downloaded {downloaded // 1024}KB / {total_size // 1024}KB ({pct:.0f}%)", end="", flush=True)
    print()

    return cached


def parse_refgene(gz_path: Path) -> GeneIntervalIndex:
    """Parse UCSC refGene.txt.gz into a GeneIntervalIndex.

    refGene.txt columns (0-indexed):
      0: bin
      1: name (transcript accession)
      2: chrom (e.g., chr1)
      3: strand
      4: txStart
      5: txEnd
      6: cdsStart
      7: cdsEnd
      ...
      12: name2 (gene symbol)
    """
    index = GeneIntervalIndex()
    gene_count = 0
    skipped = 0

    print("  Parsing refGene...")
    with gzip.open(gz_path, "rt") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 13:
                skipped += 1
                continue

            chrom_raw = parts[2]  # e.g., "chr1"
            tx_start = int(parts[4])
            tx_end = int(parts[5])
            gene_symbol = parts[12]

            if not gene_symbol or gene_symbol == "":
                skipped += 1
                continue

            # Skip non-standard chromosomes (patches, haplotypes, etc.)
            if "_" in chrom_raw:
                continue

            # Normalize chromosome: "chr1" -> "1", "chrX" -> "X"
            chrom = chrom_raw.replace("chr", "")

            index.add(chrom, tx_start, tx_end, gene_symbol)
            gene_count += 1

    index.build()
    unique_genes = set()
    for intervals in index._intervals.values():
        for _, _, gene in intervals:
            unique_genes.add(gene)

    print(f"  Loaded {gene_count} transcript intervals covering {len(unique_genes)} unique genes across {len(index._intervals)} chromosomes")
    return index


# ---------------------------------------------------------------------------
# Load GWAS hits
# ---------------------------------------------------------------------------


def load_gwas_rsids() -> dict[str, tuple[str, int]]:
    """Load all GWAS hit rsids with their chr:pos. Returns {rsid: (chr, pos)}."""
    rsid_map: dict[str, tuple[str, int]] = {}

    if not GWAS_CONFIG_DIR.exists():
        print("Warning: GWAS config directory not found")
        return rsid_map

    for f in sorted(GWAS_CONFIG_DIR.glob("*-hits.json")):
        try:
            data = json.loads(f.read_text())
        except Exception as e:
            print(f"  Warning: Failed to parse {f.name}: {e}")
            continue

        hits = data.get("hits", [])
        for hit in hits:
            rsid = hit.get("rsid")
            chrom = hit.get("chr")
            pos = hit.get("pos")
            if rsid and chrom is not None and pos is not None:
                rsid_map[rsid] = (str(chrom), int(pos))

    return rsid_map


# ---------------------------------------------------------------------------
# Database operations
# ---------------------------------------------------------------------------


def get_connection() -> sqlite3.Connection:
    """Open genome.db with WAL mode."""
    if not DB_PATH.exists():
        print(f"Error: Database not found at {DB_PATH}")
        sys.exit(1)
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def ensure_gene_symbol_column(conn: sqlite3.Connection):
    """Add gene_symbol column to snps table if it doesn't exist."""
    cursor = conn.execute("PRAGMA table_info(snps)")
    columns = {row[1] for row in cursor.fetchall()}
    if "gene_symbol" not in columns:
        conn.execute("ALTER TABLE snps ADD COLUMN gene_symbol TEXT")
        conn.commit()
        print("  Added gene_symbol column to snps table")
    else:
        print("  gene_symbol column already exists in snps table")


def populate_gene_snp_map(conn: sqlite3.Connection, mapping: dict[str, str], dry_run: bool = False):
    """Insert rsid->gene_symbol pairs into gene_snp_map table."""
    if dry_run:
        print(f"  [DRY RUN] Would insert {len(mapping)} rows into gene_snp_map")
        return

    # Clear existing GWAS-sourced mappings and re-insert
    conn.execute("DELETE FROM gene_snp_map WHERE relationship = 'gwas_proximity'")

    batch = [(rsid, gene, "gwas_proximity") for rsid, gene in mapping.items()]
    conn.executemany(
        "INSERT OR IGNORE INTO gene_snp_map (rsid, gene_symbol, relationship) VALUES (?, ?, ?)",
        batch,
    )
    conn.commit()
    print(f"  Inserted {len(batch)} rows into gene_snp_map table")


def update_snps_gene_symbol(conn: sqlite3.Connection, mapping: dict[str, str], dry_run: bool = False):
    """Update gene_symbol column in snps table for matching rsids."""
    # Only update rows that actually exist in the snps table
    cursor = conn.execute("SELECT COUNT(*) FROM snps")
    total_snps = cursor.fetchone()[0]

    if total_snps == 0:
        print("  snps table is empty — skipping column update (no genotype data loaded)")
        return

    if dry_run:
        # Count how many would match
        placeholders = ",".join("?" * min(len(mapping), 999))
        rsids = list(mapping.keys())
        match_count = 0
        for i in range(0, len(rsids), 999):
            chunk = rsids[i : i + 999]
            ph = ",".join("?" * len(chunk))
            cursor = conn.execute(f"SELECT COUNT(*) FROM snps WHERE rsid IN ({ph})", chunk)
            match_count += cursor.fetchone()[0]
        print(f"  [DRY RUN] Would update gene_symbol for {match_count} / {total_snps} SNPs in snps table")
        return

    updated = 0
    rsids = list(mapping.items())
    for i in range(0, len(rsids), 500):
        batch = rsids[i : i + 500]
        for rsid, gene in batch:
            conn.execute(
                "UPDATE snps SET gene_symbol = ? WHERE rsid = ? AND (gene_symbol IS NULL OR gene_symbol = '')",
                (gene, rsid),
            )
        conn.commit()
        updated += len(batch)
        if updated % 5000 == 0:
            print(f"\r  Updated {updated} / {len(rsids)} SNPs...", end="", flush=True)

    print(f"\r  Updated gene_symbol for SNPs in snps table (processed {updated} mappings)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Annotate GWAS SNPs with gene symbols from UCSC refGene"
    )
    parser.add_argument(
        "--build",
        default="hg38",
        choices=["hg38", "hg19"],
        help="Genome build for refGene coordinates (default: hg38)",
    )
    parser.add_argument(
        "--gwas-only",
        action="store_true",
        help="Only annotate SNPs found in GWAS hit files (not all variants in snps table)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without modifying the database",
    )
    args = parser.parse_args()

    print(f"=== Gene Annotation Script (build: {args.build}) ===\n")

    # Step 1: Download / load refGene
    print("[1/5] Loading gene reference data...")
    gz_path = download_refgene(args.build)
    gene_index = parse_refgene(gz_path)

    # Step 2: Load GWAS rsids with positions
    print("\n[2/5] Loading GWAS hit SNPs...")
    gwas_rsids = load_gwas_rsids()
    print(f"  Found {len(gwas_rsids)} unique GWAS SNPs across {len(list(GWAS_CONFIG_DIR.glob('*-hits.json')))} trait files")

    # Step 3: Annotate — map each SNP to a gene
    print("\n[3/5] Annotating SNPs with gene symbols...")
    mapping: dict[str, str] = {}
    no_gene = 0
    t0 = time.time()

    for i, (rsid, (chrom, pos)) in enumerate(gwas_rsids.items()):
        gene = gene_index.lookup(chrom, pos)
        if gene:
            mapping[rsid] = gene
        else:
            no_gene += 1

        if (i + 1) % 5000 == 0:
            elapsed = time.time() - t0
            print(f"\r  Processed {i + 1} / {len(gwas_rsids)} SNPs ({elapsed:.1f}s)...", end="", flush=True)

    elapsed = time.time() - t0
    print(f"\r  Annotated {len(mapping)} / {len(gwas_rsids)} GWAS SNPs with gene symbols ({no_gene} outside known gene regions) [{elapsed:.1f}s]")

    # Count unique genes
    unique_genes = set(mapping.values())
    print(f"  Mapped to {len(unique_genes)} unique genes")

    # Step 4: Save JSON mapping
    print("\n[4/5] Saving snp_gene_map.json...")
    if args.dry_run:
        print(f"  [DRY RUN] Would save {len(mapping)} mappings to {OUTPUT_PATH}")
    else:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        output = {
            "build": args.build,
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "total_gwas_snps": len(gwas_rsids),
            "annotated_snps": len(mapping),
            "unique_genes": len(unique_genes),
            "mapping": mapping,
        }
        OUTPUT_PATH.write_text(json.dumps(output, indent=2))
        print(f"  Saved {len(mapping)} mappings to {OUTPUT_PATH}")

    # Step 5: Update database
    print("\n[5/5] Updating genome.db...")
    conn = get_connection()
    try:
        if not args.dry_run:
            ensure_gene_symbol_column(conn)
        else:
            print("  [DRY RUN] Would add gene_symbol column to snps table if missing")

        populate_gene_snp_map(conn, mapping, dry_run=args.dry_run)
        update_snps_gene_symbol(conn, mapping, dry_run=args.dry_run)
    finally:
        conn.close()

    # Summary
    print(f"\n{'=' * 50}")
    print(f"Done! Summary:")
    print(f"  Build:            {args.build}")
    print(f"  GWAS SNPs:        {len(gwas_rsids)}")
    print(f"  Annotated:        {len(mapping)} ({len(mapping) / len(gwas_rsids) * 100:.1f}%)")
    print(f"  Unique genes:     {len(unique_genes)}")
    print(f"  No gene found:    {no_gene}")
    if args.dry_run:
        print(f"  Mode:             DRY RUN (no changes made)")
    else:
        print(f"  JSON output:      {OUTPUT_PATH}")
        print(f"  DB updated:       {DB_PATH}")


if __name__ == "__main__":
    main()
