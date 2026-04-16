#!/usr/bin/env python3
"""Universal genome data import — supports 23andMe, AncestryDNA, MyHeritage, Nebula, VCF.

Usage:
    python3 genome_init.py <raw_file> [--profile NAME] [--min-r2 0.3] [--dry-run]
    python3 genome_init.py --detect-only <raw_file>

Examples:
    python3 genome_init.py ~/Downloads/23andme_raw.txt
    python3 genome_init.py my_ancestry.txt --profile "John"
    python3 genome_init.py imputed_chr1.vcf.gz --min-r2 0.3
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
import uuid
from datetime import datetime
from pathlib import Path

# Add parent to path for lib imports
sys.path.insert(0, str(Path(__file__).parent))

from lib.config import DB_PATH, MIGRATIONS_DIR
from lib.db import get_connection, apply_migrations, log_run, finish_run
from lib.providers.base import detect_provider, read_header_lines, SnpRecord


def compute_file_hash(filepath: Path) -> str:
    """Compute SHA-256 of the file."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(
        description="Import genome data from any supported provider"
    )
    parser.add_argument("file", type=Path, help="Path to raw genome data file")
    parser.add_argument("--profile", default=None, help="Profile name (default: auto from provider)")
    parser.add_argument("--min-r2", type=float, default=0.3, help="Min r² for imputed VCF data (default: 0.3)")
    parser.add_argument("--dry-run", action="store_true", help="Parse and detect but don't import")
    parser.add_argument("--detect-only", action="store_true", help="Only detect format, don't import")
    parser.add_argument("--db", type=Path, default=DB_PATH, help=f"Database path (default: {DB_PATH})")

    args = parser.parse_args()

    if not args.file.exists():
        print(f"Error: File not found: {args.file}")
        sys.exit(1)

    # Step 1: Detect format
    print("=" * 60)
    print("Genome Toolkit — Universal Import")
    print("=" * 60)
    print()

    header_lines = read_header_lines(args.file)
    provider_cls, confidence = detect_provider(args.file)
    provider = provider_cls()
    meta = provider.metadata(args.file, header_lines)

    print(f"  File:       {args.file}")
    print(f"  Provider:   {meta.provider} ({meta.provider_version})")
    print(f"  Assembly:   {meta.assembly}")
    print(f"  Confidence: {confidence:.0%}")
    print()

    if args.detect_only:
        print("Detection complete (--detect-only).")
        return

    # Step 2: Parse
    print("Parsing...")
    records_iter, qc_stats = provider.parse(args.file)
    records = list(records_iter)

    print(f"  Total input lines: {qc_stats.total_input:,}")
    print(f"  Passed QC:         {qc_stats.passed_qc:,}")
    print(f"  No-calls:          {qc_stats.no_calls:,}")
    print(f"  Non-rsid:          {qc_stats.non_rsid:,}")
    print(f"  Indels:            {qc_stats.indels:,}")
    print(f"  Invalid alleles:   {qc_stats.invalid_alleles:,}")
    print(f"  Malformed:         {qc_stats.malformed_lines:,}")
    if qc_stats.multiallelic:
        print(f"  Multiallelic:      {qc_stats.multiallelic:,}")
    print()

    if args.dry_run:
        print("Dry run complete. No data imported.")
        return

    # Step 3: Initialize database
    print("Initializing database...")
    conn = get_connection(args.db)
    applied = apply_migrations(conn, MIGRATIONS_DIR)
    if applied:
        print(f"  Applied migrations: {', '.join(applied)}")

    # Step 4: Create profile
    profile_id = args.profile or f"{meta.provider}_{datetime.now().strftime('%Y%m%d')}"
    file_hash = compute_file_hash(args.file)

    conn.execute(
        """INSERT OR REPLACE INTO profiles
           (profile_id, display_name, provider, provider_version, file_hash, assembly, snp_count)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (profile_id, profile_id, meta.provider, meta.provider_version,
         file_hash[:16], meta.assembly, len(records)),
    )

    # Step 5: Create import record
    import_id = str(uuid.uuid4())[:8]
    conn.execute(
        """INSERT INTO imports (import_id, profile_id, source_file, file_hash, detected_format, assembly)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (import_id, profile_id, args.file.name, file_hash[:16],
         f"{meta.provider}_{meta.provider_version}", meta.assembly),
    )

    # Step 6: Import records
    print(f"Importing {len(records):,} variants...")
    run_id = log_run(conn, "genome_init", "running")

    imported = 0
    skipped_dup = 0
    skipped_r2 = 0
    errors = 0

    conn.execute("BEGIN")
    for rec in records:
        # For VCF with r² quality, filter by min_r2
        if rec.quality is not None and rec.quality < args.min_r2:
            skipped_r2 += 1
            continue

        source = "imputed" if rec.quality is not None else "genotyped"
        try:
            conn.execute(
                """INSERT INTO snps
                   (rsid, profile_id, chromosome, position, genotype, is_rsid,
                    source, import_date, r2_quality, import_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (rec.source_id, profile_id, rec.chromosome, rec.position,
                 rec.genotype, rec.is_rsid, source,
                 datetime.now().strftime("%Y-%m-%d"), rec.quality, import_id),
            )
            imported += 1
        except sqlite3.IntegrityError:
            skipped_dup += 1
        except (sqlite3.Error, ValueError) as e:
            errors += 1
            if errors <= 5:
                print(f"  Warning: Failed to insert {rec.source_id}: {e}")
    conn.commit()

    # Step 7: Finalize
    stats = {
        "provider": meta.provider,
        "version": meta.provider_version,
        "assembly": meta.assembly,
        "total_input": qc_stats.total_input,
        "passed_qc": qc_stats.passed_qc,
        "imported": imported,
        "skipped_dup": skipped_dup,
        "skipped_r2": skipped_r2,
        "profile_id": profile_id,
        "import_id": import_id,
    }

    conn.execute(
        "UPDATE imports SET finished_at=datetime('now'), status='complete', stats=? WHERE import_id=?",
        (json.dumps(stats), import_id),
    )
    finish_run(conn, run_id, "success", stats)
    conn.close()

    # Report
    print()
    print("=" * 60)
    print("Import Complete")
    print("=" * 60)
    print(f"  Profile:    {profile_id}")
    print(f"  Imported:   {imported:,}")
    if skipped_dup:
        print(f"  Duplicates: {skipped_dup:,} (existing variants preserved)")
    if skipped_r2:
        print(f"  Low r²:     {skipped_r2:,} (below {args.min_r2})")
    print()
    print("Next steps:")
    print("  1. Run /genome-onboard to set up your vault with health goals")
    print("  2. Or run /genome-import with --prepare-imputation for imputation prep")
    print("  3. See Guides/Getting Started.md for the full walkthrough")


if __name__ == "__main__":
    main()
