#!/usr/bin/env python3
"""
Import imputed variants from VCF into the genome vault SQLite database.

Reads imputed VCF files (from Michigan/TOPMed Imputation Server output),
filters by imputation quality (r²), and imports new variants into genome.db.

Directly genotyped variants (already in the database) are never overwritten —
they always take precedence over imputed calls.

Usage:
    python3 post_imputation_import.py --vcf path/to/chr1.dose.vcf.gz [--min-r2 0.3] [--dry-run]
    python3 post_imputation_import.py --vcf-dir path/to/imputed/ [--min-r2 0.3]

The --vcf-dir option processes all .vcf and .vcf.gz files in the directory.
"""

import argparse
import gzip
import os
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime

VAULT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(VAULT_ROOT, "data", "genome.db")


def open_vcf(filepath):
    """Open a VCF file, handling gzip transparently."""
    if filepath.endswith(".gz"):
        return gzip.open(filepath, "rt")
    return open(filepath, "r")


def extract_r2(info_field):
    """Extract imputation r² (quality) from VCF INFO field.

    Michigan server uses R2=... in INFO.
    TOPMed may use DR2=... or similar.
    """
    # Try common r² field names
    for pattern in [r"R2=([\d.]+)", r"DR2=([\d.]+)", r"AR2=([\d.]+)"]:
        match = re.search(pattern, info_field)
        if match:
            return float(match.group(1))

    # If no r² found in INFO, check if it's in a separate .info file
    # (handled at the file level, not per-variant)
    return None


def parse_gt(gt_string):
    """Convert VCF GT field to a two-character genotype string.

    Handles 0/0, 0/1, 1/1, 0|1, etc.
    Returns the genotype as alleles (e.g., 'AG') or None if unparseable.
    """
    # Split on / or |
    parts = re.split(r"[/|]", gt_string)
    return parts


def dosage_to_genotype(ref, alt, gt_parts):
    """Convert VCF GT allele indices to a genotype string.

    Args:
        ref: reference allele
        alt: alternate allele(s), comma-separated for multiallelic
        gt_parts: list of allele index strings ['0', '1']

    Returns:
        Two-character genotype string (e.g., 'AG') or None.
    """
    alleles = [ref] + alt.split(",")

    try:
        indices = [int(p) for p in gt_parts if p != "."]
    except ValueError:
        return None

    if not indices:
        return None

    # Build genotype from allele indices
    gt_alleles = []
    for idx in indices:
        if idx < len(alleles):
            gt_alleles.append(alleles[idx])
        else:
            return None

    # Sort alphabetically for consistency
    gt_alleles.sort()
    return "".join(gt_alleles)


def process_vcf(filepath, min_r2, existing_rsids, dry_run=False):
    """Process a single imputed VCF file.

    Returns:
        list of (rsid, chrom, pos, genotype) tuples to import
        dict of statistics
    """
    to_import = []
    stats = defaultdict(int)

    with open_vcf(filepath) as f:
        for line in f:
            if line.startswith("#"):
                continue

            parts = line.strip().split("\t")
            if len(parts) < 10:
                stats["malformed"] += 1
                continue

            chrom = parts[0].replace("chr", "")  # Normalize chr1 -> 1
            pos = parts[1]
            rsid = parts[2]
            ref = parts[3]
            alt = parts[4]
            info = parts[7]
            format_field = parts[8]
            sample = parts[9]

            stats["total"] += 1

            # Accept both rsid and positional IDs (chr:pos format from imputation)
            if not rsid.startswith("rs"):
                # Use positional ID as-is (e.g., "22:16050435")
                # These can be looked up later via chromosome+position
                pass
            stats["has_rsid" if rsid.startswith("rs") else "positional_id"] += 1

            # Skip multiallelic (more than one ALT)
            if "," in alt:
                stats["skipped_multiallelic"] += 1
                continue

            # Skip if already directly genotyped
            if rsid in existing_rsids:
                stats["skipped_existing"] += 1
                continue

            # Check r² quality
            r2 = extract_r2(info)
            if r2 is not None:
                if r2 < min_r2:
                    stats["skipped_low_r2"] += 1
                    continue
                # Track quality distribution
                if r2 >= 0.9:
                    stats["r2_above_0.9"] += 1
                elif r2 >= 0.8:
                    stats["r2_0.8_to_0.9"] += 1
                elif r2 >= 0.5:
                    stats["r2_0.5_to_0.8"] += 1
                else:
                    stats["r2_0.3_to_0.5"] += 1
            else:
                stats["r2_not_available"] += 1

            # Parse genotype
            format_keys = format_field.split(":")
            sample_values = sample.split(":")

            gt_idx = format_keys.index("GT") if "GT" in format_keys else 0
            gt_raw = sample_values[gt_idx] if gt_idx < len(sample_values) else None

            if not gt_raw or gt_raw == "./.":
                stats["skipped_nocall"] += 1
                continue

            gt_parts = parse_gt(gt_raw)
            genotype = dosage_to_genotype(ref, alt, gt_parts)

            if not genotype:
                stats["skipped_parse_error"] += 1
                continue

            try:
                pos_int = int(pos)
            except ValueError:
                stats["skipped_bad_pos"] += 1
                continue

            to_import.append((rsid, chrom, pos_int, genotype, r2))
            stats["to_import"] += 1

    return to_import, stats


def import_to_db(variants, db_path, dry_run=False):
    """Import imputed variants into genome.db.

    Adds variants to the snps table with is_rsid=1.
    The imported_at timestamp distinguishes imputed from original.
    """
    if dry_run:
        print(f"  DRY RUN: Would import {len(variants)} variants")
        return len(variants)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Check if 'source' column exists; add it if not
    cursor.execute("PRAGMA table_info(snps)")
    columns = [row[1] for row in cursor.fetchall()]
    if "source" not in columns:
        print("  Adding 'source' column to snps table...")
        cursor.execute("ALTER TABLE snps ADD COLUMN source TEXT DEFAULT 'genotyped'")
        cursor.execute("UPDATE snps SET source = 'genotyped' WHERE source IS NULL")

    if "import_date" not in columns:
        print("  Adding 'import_date' column to snps table...")
        cursor.execute("ALTER TABLE snps ADD COLUMN import_date TEXT")

    if "r2_quality" not in columns:
        print("  Adding 'r2_quality' column to snps table...")
        cursor.execute("ALTER TABLE snps ADD COLUMN r2_quality REAL")

    imported = 0
    skipped_dup = 0

    import_date = datetime.now().strftime("%Y-%m-%d")

    for rsid, chrom, pos, genotype, r2 in variants:
        try:
            cursor.execute(
                """INSERT INTO snps (rsid, chromosome, position, genotype, is_rsid, source, import_date, r2_quality)
                   VALUES (?, ?, ?, ?, 1, 'imputed', ?, ?)""",
                (rsid, chrom, pos, genotype, import_date, r2),
            )
            imported += 1
        except sqlite3.IntegrityError:
            # Duplicate rsid — directly genotyped takes precedence
            skipped_dup += 1

    # Log the pipeline run
    cursor.execute(
        """INSERT INTO pipeline_runs (script, started_at, finished_at, status, stats)
           VALUES (?, ?, ?, ?, ?)""",
        (
            "post_imputation_import.py",
            datetime.now().isoformat(),
            datetime.now().isoformat(),
            "complete",
            f"imported={imported}, skipped_dup={skipped_dup}, total_candidates={len(variants)}",
        ),
    )

    conn.commit()
    conn.close()

    if skipped_dup:
        print(f"  Skipped {skipped_dup} duplicates (already in database)")

    return imported


def get_existing_rsids(db_path):
    """Load all existing rsids from the database for deduplication."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT rsid FROM snps")
    rsids = set(row[0] for row in cursor.fetchall())
    conn.close()
    return rsids


def main():
    parser = argparse.ArgumentParser(
        description="Import imputed variants into genome.db"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--vcf", help="Path to a single imputed VCF file")
    group.add_argument("--vcf-dir", help="Directory containing imputed VCF files")
    parser.add_argument(
        "--min-r2",
        type=float,
        default=0.3,
        help="Minimum imputation quality r² (default: 0.3)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and filter but do not import into database",
    )
    parser.add_argument(
        "--db",
        default=DB_PATH,
        help=f"Path to genome.db (default: {DB_PATH})",
    )

    args = parser.parse_args()

    print("=" * 60)
    print("Post-Imputation Import")
    print("=" * 60)
    print(f"  Database: {args.db}")
    print(f"  Min r²:   {args.min_r2}")
    print(f"  Dry run:  {args.dry_run}")
    print()

    # Check database exists
    if not os.path.exists(args.db):
        print(f"ERROR: Database not found: {args.db}")
        sys.exit(1)

    # Collect VCF files
    vcf_files = []
    if args.vcf:
        if not os.path.exists(args.vcf):
            print(f"ERROR: VCF file not found: {args.vcf}")
            sys.exit(1)
        vcf_files.append(args.vcf)
    else:
        if not os.path.isdir(args.vcf_dir):
            print(f"ERROR: Directory not found: {args.vcf_dir}")
            sys.exit(1)
        for fname in sorted(os.listdir(args.vcf_dir)):
            if fname.endswith(".vcf") or fname.endswith(".vcf.gz"):
                vcf_files.append(os.path.join(args.vcf_dir, fname))

    if not vcf_files:
        print("ERROR: No VCF files found")
        sys.exit(1)

    print(f"  VCF files to process: {len(vcf_files)}")
    print()

    # Load existing rsids
    print("Loading existing variants from database...")
    existing = get_existing_rsids(args.db)
    print(f"  {len(existing):,} variants already in database")
    print()

    # Process each VCF
    total_stats = defaultdict(int)
    all_variants = []

    for vcf_path in vcf_files:
        print(f"Processing: {os.path.basename(vcf_path)}...")
        variants, stats = process_vcf(vcf_path, args.min_r2, existing, args.dry_run)
        all_variants.extend(variants)

        for k, v in stats.items():
            total_stats[k] += v

    # Import
    print()
    print("Importing variants...")
    imported = import_to_db(all_variants, args.db, args.dry_run)

    # Final report
    print()
    print("=" * 60)
    print("Import Summary")
    print("=" * 60)
    print(f"  Total variants in VCF(s):   {total_stats['total']:>12,}")
    print(f"  Passed all filters:         {total_stats['to_import']:>12,}")
    print(f"  Imported to database:       {imported:>12,}")
    print()
    print("  Filtered out:")
    print(f"    No rsid:                  {total_stats['skipped_no_rsid']:>12,}")
    print(f"    Already genotyped:        {total_stats['skipped_existing']:>12,}")
    print(f"    Low r² (< {args.min_r2}):          {total_stats['skipped_low_r2']:>12,}")
    print(f"    Multiallelic:             {total_stats['skipped_multiallelic']:>12,}")
    print(f"    No-call:                  {total_stats['skipped_nocall']:>12,}")
    print(f"    Parse error:              {total_stats['skipped_parse_error']:>12,}")
    print()
    print("  Quality distribution (imported):")
    print(f"    r² >= 0.9:                {total_stats['r2_above_0.9']:>12,}")
    print(f"    r² 0.8-0.9:              {total_stats['r2_0.8_to_0.9']:>12,}")
    print(f"    r² 0.5-0.8:              {total_stats['r2_0.5_to_0.8']:>12,}")
    print(f"    r² 0.3-0.5:              {total_stats['r2_0.3_to_0.5']:>12,}")
    if total_stats["r2_not_available"]:
        print(f"    r² not in INFO:           {total_stats['r2_not_available']:>12,}")
    print()

    if not args.dry_run:
        # Report new totals
        conn = sqlite3.connect(args.db)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM snps")
        total = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM snps WHERE source = 'imputed'")
        imputed_total = cursor.fetchone()[0]
        conn.close()
        print(f"  Database now contains {total:,} total variants ({imputed_total:,} imputed)")

    print()
    print("Next steps:")
    print("  1. Run gap_audit.py to check newly covered variants")
    print("  2. Re-run enrichment for high-interest imputed variants")
    print("  3. Calculate PRS using imputed data")


if __name__ == "__main__":
    main()
