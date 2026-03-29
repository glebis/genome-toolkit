#!/usr/bin/env python3
"""Check for stale enrichments and notes needing refresh.

Usage:
    python3 staleness_checker.py
"""
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.db import get_connection, init_db


def main():
    init_db()
    conn = get_connection()

    print(f"Staleness Report — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 60)

    # Stale enrichments by source
    stale = conn.execute("""
        SELECT source, COUNT(*) as cnt
        FROM enrichments
        WHERE expires_at < datetime('now')
        GROUP BY source
        ORDER BY cnt DESC
    """).fetchall()

    if stale:
        print("\nStale Enrichments:")
        for row in stale:
            print(f"  {row[0]:15s}: {row[1]:>6,} entries need refresh")
    else:
        print("\nNo stale enrichments.")

    # Notes needing refresh
    needs_refresh = conn.execute(
        "SELECT note_path, note_type FROM notes WHERE needs_refresh = 1"
    ).fetchall()

    if needs_refresh:
        print(f"\nNotes Needing Refresh: {len(needs_refresh)}")
        for row in needs_refresh:
            print(f"  [{row[1]}] {row[0]}")

    # Enrichment coverage
    total_rsids = conn.execute("SELECT COUNT(*) FROM snps WHERE is_rsid = 1").fetchone()[0]
    enriched = conn.execute("SELECT COUNT(DISTINCT rsid) FROM enrichments").fetchone()[0]

    print(f"\nOverall Coverage:")
    print(f"  Total rsids:  {total_rsids:,}")
    print(f"  Enriched:     {enriched:,} ({enriched/total_rsids*100:.1f}%)" if total_rsids else "  No data imported yet.")

    # Last pipeline runs
    runs = conn.execute(
        "SELECT script, started_at, status, stats FROM pipeline_runs ORDER BY started_at DESC LIMIT 5"
    ).fetchall()

    if runs:
        print(f"\nRecent Pipeline Runs:")
        for row in runs:
            print(f"  {row[1]} | {row[0]:20s} | {row[2]}")

    conn.close()


if __name__ == "__main__":
    main()
