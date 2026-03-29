#!/usr/bin/env python3
"""Enrich SNPs with external database annotations.

Usage:
    python3 snp_enrich.py --rsid rs4680              # Single SNP via SNPedia
    python3 snp_enrich.py --batch-snpedia FILE        # Batch from file
    python3 snp_enrich.py --import-clinvar PATH       # Import ClinVar VCF
    python3 snp_enrich.py --stale                     # Re-enrich expired entries
    python3 snp_enrich.py --stats                     # Show coverage stats
"""
import sys
import json
import time
import re
import argparse
import gzip
from pathlib import Path
from datetime import datetime, timedelta

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.config import RATE_LIMITS, CACHE_TTL
from lib.db import get_connection, init_db, log_run, finish_run

try:
    import requests
except ImportError:
    print("Install requests: pip install requests")
    sys.exit(1)


def query_snpedia(rsids: list[str], conn) -> int:
    """Query SNPedia for a batch of rsids. Returns count of enriched."""
    enriched = 0
    # SNPedia titles use capitalized Rs prefix
    batch_size = 50

    for i in range(0, len(rsids), batch_size):
        batch = rsids[i:i + batch_size]
        titles = "|".join(f"Rs{rid[2:]}" if rid.startswith("rs") else rid for rid in batch)

        try:
            resp = requests.get(
                "https://bots.snpedia.com/api.php",
                params={
                    "action": "query",
                    "titles": titles,
                    "prop": "revisions",
                    "rvprop": "content",
                    "format": "json",
                },
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"  SNPedia API error: {e}")
            time.sleep(RATE_LIMITS["snpedia"])
            continue

        pages = data.get("query", {}).get("pages", {})
        for page_id, page in pages.items():
            if page_id == "-1" or "missing" in page:
                continue

            title = page.get("title", "")
            rsid = "rs" + title[2:].lower() if title.startswith("Rs") else title.lower()

            revisions = page.get("revisions", [])
            if not revisions:
                continue

            content = revisions[0].get("*", "")
            parsed = parse_snpedia_content(content)

            if parsed:
                expires = (datetime.now() + timedelta(days=CACHE_TTL["snpedia"])).isoformat()
                conn.execute(
                    "INSERT OR REPLACE INTO enrichments (rsid, source, data, expires_at) VALUES (?, ?, ?, ?)",
                    (rsid, "snpedia", json.dumps(parsed), expires)
                )
                enriched += 1

        conn.commit()
        time.sleep(RATE_LIMITS["snpedia"])

        if (i // batch_size + 1) % 10 == 0:
            print(f"  Processed {i + len(batch)}/{len(rsids)} rsids...")

    return enriched


def parse_snpedia_content(content: str) -> dict | None:
    """Parse SNPedia wiki markup to extract structured data."""
    result = {}

    # Extract magnitude
    mag_match = re.search(r'\|\s*magnitude\s*=\s*([\d.]+)', content)
    if mag_match:
        result["magnitude"] = float(mag_match.group(1))

    # Extract repute
    rep_match = re.search(r'\|\s*repute\s*=\s*(\w+)', content)
    if rep_match:
        result["repute"] = rep_match.group(1).strip()

    # Extract summary
    sum_match = re.search(r'\|\s*summary\s*=\s*(.+?)(?:\n\||\n\})', content, re.DOTALL)
    if sum_match:
        result["summary"] = sum_match.group(1).strip()

    # Extract gene
    gene_match = re.search(r'\|\s*gene\s*=\s*(\w+)', content)
    if gene_match:
        result["gene"] = gene_match.group(1).strip()

    # Extract chromosome
    chr_match = re.search(r'\|\s*chromosome\s*=\s*(\w+)', content)
    if chr_match:
        result["chromosome"] = chr_match.group(1).strip()

    return result if result else None


def import_clinvar_vcf(vcf_path: Path, conn) -> int:
    """Import ClinVar VCF and match against our SNPs. Returns count enriched."""
    # Get our rsids
    our_rsids = set(
        row[0] for row in conn.execute("SELECT rsid FROM snps WHERE is_rsid = 1").fetchall()
    )
    print(f"  Our rsids: {len(our_rsids):,}")

    enriched = 0
    opener = gzip.open if str(vcf_path).endswith(".gz") else open

    with opener(vcf_path, "rt") as f:
        for line in f:
            if line.startswith("#"):
                continue
            parts = line.strip().split("\t")
            if len(parts) < 8:
                continue

            chrom, pos, vid, ref, alt, qual, filt, info = parts[:8]

            # Extract rsid - first try ID field, then INFO RS= field
            rsid = None
            for id_part in vid.split(";"):
                if id_part.startswith("rs"):
                    rsid = id_part
                    break

            if not rsid:
                # ClinVar stores rsid in INFO as RS=NNNNN
                rs_match = re.search(r"RS=(\d+)", info)
                if rs_match:
                    rsid = f"rs{rs_match.group(1)}"

            if not rsid or rsid not in our_rsids:
                continue

            # Parse INFO field
            info_dict = {}
            for item in info.split(";"):
                if "=" in item:
                    k, v = item.split("=", 1)
                    info_dict[k] = v

            parsed = {
                "clinical_significance": info_dict.get("CLNSIG", "").replace("_", " "),
                "disease_name": info_dict.get("CLNDN", "").replace("_", " ").replace("|", "; "),
                "review_status": info_dict.get("CLNREVSTAT", "").replace("_", " "),
                "ref": ref,
                "alt": alt,
            }

            expires = (datetime.now() + timedelta(days=CACHE_TTL["clinvar"])).isoformat()
            conn.execute(
                "INSERT OR REPLACE INTO enrichments (rsid, source, data, expires_at) VALUES (?, ?, ?, ?)",
                (rsid, "clinvar", json.dumps(parsed), expires)
            )
            enriched += 1

            if enriched % 1000 == 0:
                conn.commit()
                print(f"  Matched {enriched:,} variants...")

    conn.commit()
    return enriched


def show_stats(conn):
    """Print enrichment coverage statistics."""
    total = conn.execute("SELECT COUNT(*) FROM snps").fetchone()[0]
    rsids = conn.execute("SELECT COUNT(*) FROM snps WHERE is_rsid = 1").fetchone()[0]

    print(f"\nDatabase Statistics:")
    print(f"  Total SNPs:     {total:,}")
    print(f"  rs-prefixed:    {rsids:,}")
    print(f"  Internal IDs:   {total - rsids:,}")

    sources = conn.execute(
        "SELECT source, COUNT(*) as cnt FROM enrichments GROUP BY source ORDER BY cnt DESC"
    ).fetchall()

    if sources:
        print(f"\nEnrichment Coverage:")
        for row in sources:
            pct = (row[1] / rsids * 100) if rsids > 0 else 0
            print(f"  {row[0]:15s}: {row[1]:>8,} ({pct:.1f}% of rsids)")
    else:
        print("\n  No enrichments yet. Run --import-clinvar or --rsid to start.")

    stale = conn.execute(
        "SELECT COUNT(*) FROM enrichments WHERE expires_at < datetime('now')"
    ).fetchone()[0]
    if stale:
        print(f"\n  Stale entries: {stale:,} (run --stale to refresh)")


def main():
    parser = argparse.ArgumentParser(description="Enrich SNPs with external annotations")
    parser.add_argument("--rsid", help="Enrich a single rsid via SNPedia")
    parser.add_argument("--batch-snpedia", type=Path, help="Enrich rsids from file via SNPedia")
    parser.add_argument("--import-clinvar", type=Path, help="Import ClinVar VCF file")
    parser.add_argument("--stale", action="store_true", help="Re-enrich expired entries")
    parser.add_argument("--stats", action="store_true", help="Show coverage statistics")
    args = parser.parse_args()

    init_db()
    conn = get_connection()

    if args.stats:
        show_stats(conn)
    elif args.rsid:
        rsid = args.rsid.lower()
        print(f"Enriching {rsid} via SNPedia...")
        count = query_snpedia([rsid], conn)
        print(f"  Enriched: {count}")
    elif args.batch_snpedia:
        rsids = [line.strip() for line in open(args.batch_snpedia) if line.strip().startswith("rs")]
        print(f"Enriching {len(rsids)} rsids via SNPedia...")
        count = query_snpedia(rsids, conn)
        print(f"  Enriched: {count}")
    elif args.import_clinvar:
        if not args.import_clinvar.exists():
            print(f"Error: {args.import_clinvar} not found")
            sys.exit(1)
        print(f"Importing ClinVar VCF: {args.import_clinvar}")
        count = import_clinvar_vcf(args.import_clinvar, conn)
        print(f"  Matched variants: {count:,}")
    elif args.stale:
        stale = conn.execute(
            "SELECT DISTINCT rsid FROM enrichments WHERE expires_at < datetime('now') AND source='snpedia'"
        ).fetchall()
        rsids = [row[0] for row in stale]
        print(f"Re-enriching {len(rsids)} stale SNPedia entries...")
        count = query_snpedia(rsids, conn)
        print(f"  Refreshed: {count}")
    else:
        parser.print_help()

    conn.close()


if __name__ == "__main__":
    main()
