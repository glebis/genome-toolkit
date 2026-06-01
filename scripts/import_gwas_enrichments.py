#!/usr/bin/env python3
"""Import per-rsid GWAS effect sizes into the enrichments table.

The SNP browser's EFFECT column reads `gwas_catalog` enrichments keyed by rsid.
This script is the data source for that column: it loads the curated GWAS hit
files in config/gwas/*-hits.json (the same files used by the gene-note
generator) and writes one `gwas_catalog` enrichment row per rsid, holding every
trait association that variant participates in, ordered most-significant-first.

Schema written (matches the json_extract paths in backend/app/db/genome.py):

    {
      "associations": [
        {"trait": "<display name>", "beta": <effect>, "effect_scale": "beta|log_or",
         "effect_allele": "A", "p_value": 3.1e-09},
        ...
      ]
    }

`beta` is the raw effect on whatever scale the source reports; `effect_scale`
preserves whether it is a linear beta or a log(OR) so the UI can label it
honestly rather than calling a log(OR) "β".
"""
import sys
import json
import argparse
from pathlib import Path
from datetime import datetime, timedelta

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.config import CACHE_TTL, DB_PATH
from lib.db import get_connection, init_db

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_GWAS_DIR = PROJECT_ROOT / "config" / "gwas"


def aggregate_associations(gwas_dir: Path) -> dict[str, list[dict]]:
    """Build {rsid: [association, ...]} from every *-hits.json in gwas_dir.

    Associations for an rsid are sorted by p_value ascending so that index 0 is
    the most statistically significant hit — the one the SNP browser surfaces.
    Hits without an rsid are skipped. *-hits-clumped.json files are ignored to
    avoid double-counting (glob '*-hits.json' already excludes them).
    """
    by_rsid: dict[str, list[dict]] = {}

    for path in sorted(gwas_dir.glob("*-hits.json")):
        with open(path) as f:
            data = json.load(f)
        display_name = data.get("display_name") or data.get("trait") or path.stem
        effect_scale = data.get("effect_scale", "beta")

        for hit in data.get("hits", []):
            rsid = hit.get("rsid")
            if not rsid:
                continue
            by_rsid.setdefault(rsid, []).append({
                "trait": display_name,
                "beta": hit.get("effect"),
                "effect_scale": effect_scale,
                "effect_allele": hit.get("effect_allele"),
                "p_value": hit.get("p_value"),
            })

    for assocs in by_rsid.values():
        # None p-values sort last (treated as least significant).
        assocs.sort(key=lambda a: a["p_value"] if a["p_value"] is not None else float("inf"))

    return by_rsid


def import_gwas_enrichments(gwas_dir: Path, conn) -> int:
    """Write one gwas_catalog enrichment row per rsid. Returns rows written."""
    by_rsid = aggregate_associations(gwas_dir)
    expires = (datetime.now() + timedelta(days=CACHE_TTL["gwas_catalog"])).isoformat()

    for rsid, associations in by_rsid.items():
        payload = json.dumps({"associations": associations})
        conn.execute(
            "INSERT OR REPLACE INTO enrichments (rsid, source, data, expires_at) "
            "VALUES (?, 'gwas_catalog', ?, ?)",
            (rsid, payload, expires),
        )

    conn.commit()
    return len(by_rsid)


def main():
    parser = argparse.ArgumentParser(description="Import GWAS effect sizes into enrichments")
    parser.add_argument("--gwas-dir", type=Path, default=DEFAULT_GWAS_DIR,
                        help="Directory of *-hits.json files (default: config/gwas)")
    parser.add_argument("--db", type=Path, default=DB_PATH, help="SQLite database path")
    args = parser.parse_args()

    init_db()
    conn = get_connection()
    count = import_gwas_enrichments(args.gwas_dir, conn)
    conn.close()
    print(f"Enriched {count:,} rsids with GWAS effect sizes from {args.gwas_dir}")


if __name__ == "__main__":
    main()
