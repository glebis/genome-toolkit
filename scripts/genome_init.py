#!/usr/bin/env python3
"""Universal genome data import — supports 23andMe, AncestryDNA, MyHeritage, Nebula, VCF.

Usage:
    python3 genome_init.py <raw_file> [--profile NAME] [--min-r2 0.3] [--dry-run]
    python3 genome_init.py --detect-only <raw_file>

Examples:
    python3 genome_init.py ~/Downloads/23andme_raw.txt
    python3 genome_init.py my_ancestry.txt --profile "John"
    python3 genome_init.py imputed_chr1.vcf.gz --min-r2 0.3

The actual detect + parse + import pipeline lives in ``lib.importer`` so the CLI and
the web API (POST /api/import/upload) share one tested code path.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add parent to path for lib imports
sys.path.insert(0, str(Path(__file__).parent))

from lib.config import DB_PATH
from lib.importer import detect_file, import_genome_file, ProfileExistsError


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

    print("=" * 60)
    print("Genome Toolkit — Universal Import")
    print("=" * 60)
    print()

    # Step 1: Detect format
    try:
        info = detect_file(args.file)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)

    print(f"  File:       {args.file}")
    print(f"  Provider:   {info['provider']} ({info['provider_version']})")
    print(f"  Assembly:   {info['assembly']}")
    print(f"  Confidence: {info['confidence']:.0%}")
    print()

    if args.detect_only:
        print("Detection complete (--detect-only).")
        return

    # Step 2: Import (or dry-run) via the shared pipeline
    if args.dry_run:
        print("Parsing (dry run)...")
    else:
        print("Importing...")

    try:
        stats = import_genome_file(
            args.file,
            db_path=args.db,
            profile=args.profile,
            min_r2=args.min_r2,
            dry_run=args.dry_run,
        )
    except ProfileExistsError as e:
        print(f"Error: profile '{e}' already exists. Choose another with --profile NAME.")
        sys.exit(1)

    if args.dry_run:
        print()
        print(f"  Total input:  {stats['total_input']:,}")
        print(f"  Passed QC:    {stats['passed_qc']:,}")
        print(f"  Would skip (low r²): {stats['skipped_r2']:,}")
        print()
        print("Dry run complete. No data imported.")
        return

    # Report
    print()
    print("=" * 60)
    print("Import Complete")
    print("=" * 60)
    print(f"  Profile:    {stats['profile_id']}")
    print(f"  Imported:   {stats['imported']:,}")
    if stats["skipped_dup"]:
        print(f"  Duplicates: {stats['skipped_dup']:,} (existing variants preserved)")
    if stats["skipped_r2"]:
        print(f"  Low r²:     {stats['skipped_r2']:,} (below {args.min_r2})")
    print()
    print("Next steps:")
    print("  1. Run /genome-onboard to set up your vault with health goals")
    print("  2. Or run /genome-import with --prepare-imputation for imputation prep")
    print("  3. See Guides/Getting Started.md for the full walkthrough")


if __name__ == "__main__":
    main()
