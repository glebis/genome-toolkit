#!/usr/bin/env python3
"""
Research Update Checker for Genome Vault

Scans Research/ notes for created_date in frontmatter, compares against
recommended re-check intervals, and outputs which topics are due for update.

Usage:
    python3 research_update_checker.py
    python3 research_update_checker.py --days-ahead 30  # show what's due in 30 days
    python3 research_update_checker.py --output markdown  # markdown table output
"""

import os
import re
import sys
import argparse
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.config import VAULT_ROOT, RESEARCH_DIR

BRAIN_RESEARCH_DIR = Path(os.path.expanduser("~/Brains/brain/ai-research"))

# Topic -> (re-check interval in days, search terms, databases)
# Derived from Research Update Tracker.md
RECHECK_INTERVALS = {
    "apoe": {
        "interval_days": 365,
        "search_terms": '"APOE" AND ("longevity" OR "Alzheimer\'s") AND "meta-analysis"',
        "databases": "PubMed, GWAS Catalog",
        "display_name": "APOE longevity/Alzheimer's",
    },
    "fads": {
        "interval_days": 180,
        "search_terms": '"FADS1" AND "omega-3" AND ("supplementation" OR "RCT")',
        "databases": "PubMed, ClinicalTrials.gov",
        "display_name": "FADS1/FADS2 omega-3 supplementation",
    },
    "fto": {
        "interval_days": 180,
        "search_terms": '"FTO" AND "physical activity" AND "gene-environment"',
        "databases": "PubMed, GWAS Catalog",
        "display_name": "FTO exercise attenuation",
    },
    "fut2": {
        "interval_days": 365,
        "search_terms": '"FUT2" AND "microbiome" AND "secretor"',
        "databases": "PubMed",
        "display_name": "FUT2 secretor/microbiome",
    },
    "per3": {
        "interval_days": 365,
        "search_terms": '("PER3" OR "CLOCK") AND ("chronotype" OR "anxiety")',
        "databases": "PubMed, GWAS Catalog",
        "display_name": "PER3/CLOCK circadian",
    },
    "clock": {
        "interval_days": 365,
        "search_terms": '("PER3" OR "CLOCK") AND ("chronotype" OR "anxiety")',
        "databases": "PubMed, GWAS Catalog",
        "display_name": "PER3/CLOCK circadian",
        "merge_with": "per3",
    },
    "vdr": {
        "interval_days": 180,
        "search_terms": '"VDR" AND ("FokI" OR "BsmI") AND ("immune" OR "autoimmune")',
        "databases": "PubMed",
        "display_name": "VDR vitamin D signaling",
    },
    "ssri-withdrawal": {
        "interval_days": 90,
        "search_terms": '"SSRI" AND "discontinuation" AND "pharmacogenomics"',
        "databases": "PubMed, PharmGKB",
        "display_name": "SSRI withdrawal genetics",
    },
    "withdrawal": {
        "interval_days": 180,
        "search_terms": '"withdrawal" AND "genetics" AND ("dopamine" OR "GABA")',
        "databases": "PubMed",
        "display_name": "Withdrawal genetics comprehensive",
    },
    "behavioral-change": {
        "interval_days": 180,
        "search_terms": '"DRD2" AND ("habit formation" OR "behavioral change") AND "genetics"',
        "databases": "PubMed, PsycINFO",
        "display_name": "Behavioral change genetics",
    },
    "actionable-health": {
        "interval_days": 180,
        "search_terms": '"pharmacogenomics" AND "Europe" AND "clinical"',
        "databases": "PubMed, CPIC, DPWG",
        "display_name": "European PGx testing landscape",
    },
    "snp-database": {
        "interval_days": 180,
        "search_terms": "N/A -- check ClinVar, MyVariant.info, PharmGKB versions",
        "databases": "ClinVar, PharmGKB, gnomAD",
        "display_name": "SNP database sources",
    },
    "gap-analysis": {
        "interval_days": 180,
        "search_terms": "Review vault gaps, check new GWAS findings",
        "databases": "GWAS Catalog, PubMed",
        "display_name": "Nutrigenomics/circadian gap analysis",
    },
    # Provider notes -- less frequent re-check
    "bioscientia": {"interval_days": 365, "search_terms": "N/A", "databases": "Provider website", "display_name": "Bioscientia (provider)", "category": "provider"},
    "cegat": {"interval_days": 365, "search_terms": "N/A", "databases": "Provider website", "display_name": "CeGaT (provider)", "category": "provider"},
    "centogene": {"interval_days": 365, "search_terms": "N/A", "databases": "Provider website", "display_name": "Centogene (provider)", "category": "provider"},
    "charite": {"interval_days": 365, "search_terms": "N/A", "databases": "Provider website", "display_name": "Charite Berlin (provider)", "category": "provider"},
    "dante-labs": {"interval_days": 365, "search_terms": "N/A", "databases": "Provider website", "display_name": "Dante Labs (provider)", "category": "provider"},
    "fagron": {"interval_days": 365, "search_terms": "N/A", "databases": "Provider website", "display_name": "Fagron Genomics (provider)", "category": "provider"},
    "ikp": {"interval_days": 365, "search_terms": "N/A", "databases": "Provider website", "display_name": "IKP Stuttgart (provider)", "category": "provider"},
    "imd": {"interval_days": 365, "search_terms": "N/A", "databases": "Provider website", "display_name": "IMD Berlin (provider)", "category": "provider"},
    "limbach": {"interval_days": 365, "search_terms": "N/A", "databases": "Provider website", "display_name": "Labor Limbach (provider)", "category": "provider"},
    "medicover": {"interval_days": 365, "search_terms": "N/A", "databases": "Provider website", "display_name": "Medicover Genetics (provider)", "category": "provider"},
    "mgz": {"interval_days": 365, "search_terms": "N/A", "databases": "Provider website", "display_name": "MGZ Munchen (provider)", "category": "provider"},
    "nebula": {"interval_days": 365, "search_terms": "N/A", "databases": "Provider website", "display_name": "Nebula Genomics (provider)", "category": "provider"},
    "novogenia": {"interval_days": 365, "search_terms": "N/A", "databases": "Provider website", "display_name": "Novogenia (provider)", "category": "provider"},
    "sano": {"interval_days": 365, "search_terms": "N/A", "databases": "Provider website", "display_name": "Sano Genetics (provider)", "category": "provider"},
    "synlab": {"interval_days": 365, "search_terms": "N/A", "databases": "Provider website", "display_name": "SYNLAB (provider)", "category": "provider"},
    "tellmegen": {"interval_days": 365, "search_terms": "N/A", "databases": "Provider website", "display_name": "tellmeGen (provider)", "category": "provider"},
    "u-pgx": {"interval_days": 365, "search_terms": "N/A", "databases": "Provider website", "display_name": "U-PGx (provider)", "category": "provider"},
}


def extract_date_from_frontmatter(filepath: Path) -> datetime | None:
    """Extract created_date from YAML frontmatter."""
    try:
        content = filepath.read_text(encoding="utf-8")
    except Exception:
        return None

    # Match created_date: '[[YYYYMMDD]]' or created_date: '2026-03-16' or similar
    patterns = [
        r"created_date:\s*'\[\[(\d{8})\]\]'",
        r"created_date:\s*'(\d{4}-\d{2}-\d{2})'",
        r"created_date:\s*(\d{8})",
    ]
    for pat in patterns:
        m = re.search(pat, content)
        if m:
            date_str = m.group(1)
            try:
                if "-" in date_str:
                    return datetime.strptime(date_str, "%Y-%m-%d")
                else:
                    return datetime.strptime(date_str, "%Y%m%d")
            except ValueError:
                continue
    return None


def match_topic(filename: str) -> str | None:
    """Match a research filename to a topic key."""
    # Strip date prefix and extension
    name = filename.lower()
    # Remove date prefix like 20260316-
    name = re.sub(r"^\d{8}-", "", name)
    name = name.replace(".md", "")

    # Direct matches
    for key in RECHECK_INTERVALS:
        if key in name:
            # Check for merge_with
            config = RECHECK_INTERVALS[key]
            if "merge_with" in config:
                return config["merge_with"]
            return key

    # Fuzzy matches for common patterns
    if "fads1" in name or "fads2" in name:
        return "fads"
    if "per3" in name or "clock" in name:
        return "per3"
    if "ssri" in name and "withdrawal" in name:
        return "ssri-withdrawal"
    if "behavioral" in name and "change" in name:
        return "behavioral-change"
    if "gap-analysis" in name:
        return "gap-analysis"
    if "snp-database" in name:
        return "snp-database"
    if "actionable-health" in name:
        return "actionable-health"
    if "labor-limbach" in name:
        return "limbach"
    if "ikp-stuttgart" in name:
        return "ikp"
    if "imd-berlin" in name:
        return "imd"
    if "mgz-muenchen" in name:
        return "mgz"
    if "dante" in name:
        return "dante-labs"
    if "u-pgx" in name:
        return "u-pgx"

    return None


def scan_research_notes() -> dict[str, datetime]:
    """Scan Research/ directory and return topic -> most recent date mapping."""
    topic_dates: dict[str, datetime] = {}

    if not RESEARCH_DIR.exists():
        print(f"Warning: {RESEARCH_DIR} does not exist", file=sys.stderr)
        return topic_dates

    for filepath in RESEARCH_DIR.glob("*.md"):
        date = extract_date_from_frontmatter(filepath)
        if not date:
            # Try to extract from filename
            m = re.match(r"(\d{8})-", filepath.name)
            if m:
                try:
                    date = datetime.strptime(m.group(1), "%Y%m%d")
                except ValueError:
                    continue

        if not date:
            continue

        topic = match_topic(filepath.name)
        if topic:
            if topic not in topic_dates or date > topic_dates[topic]:
                topic_dates[topic] = date

    return topic_dates


def check_staleness(days_ahead: int = 0) -> list[dict]:
    """Check which topics are stale or approaching staleness."""
    topic_dates = scan_research_notes()
    now = datetime.now()
    check_date = now + timedelta(days=days_ahead)
    results = []

    seen_topics = set()
    for key, config in RECHECK_INTERVALS.items():
        # Skip merged topics
        if "merge_with" in config:
            continue
        if key in seen_topics:
            continue
        seen_topics.add(key)

        last_researched = topic_dates.get(key)
        interval = timedelta(days=config["interval_days"])

        if last_researched:
            due_date = last_researched + interval
            days_until_due = (due_date - now).days
            if due_date <= check_date:
                status = "OVERDUE" if due_date <= now else "DUE SOON"
            else:
                status = "Current"
        else:
            due_date = None
            days_until_due = None
            status = "NO DATE"

        results.append({
            "topic": config["display_name"],
            "key": key,
            "last_researched": last_researched,
            "interval_days": config["interval_days"],
            "due_date": due_date,
            "days_until_due": days_until_due,
            "status": status,
            "search_terms": config["search_terms"],
            "databases": config["databases"],
            "category": config.get("category", "research"),
        })

    # Sort: OVERDUE first, then DUE SOON, then by days until due
    status_order = {"OVERDUE": 0, "DUE SOON": 1, "NO DATE": 2, "Current": 3}
    results.sort(key=lambda r: (
        status_order.get(r["status"], 9),
        r["days_until_due"] if r["days_until_due"] is not None else 9999,
    ))

    return results


def format_text(results: list[dict], show_current: bool = False) -> str:
    """Format results as plain text."""
    lines = []
    lines.append("=" * 70)
    lines.append("RESEARCH UPDATE CHECKER")
    lines.append(f"Run: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append("=" * 70)

    overdue = [r for r in results if r["status"] in ("OVERDUE", "DUE SOON")]
    current = [r for r in results if r["status"] == "Current"]
    no_date = [r for r in results if r["status"] == "NO DATE"]

    if overdue:
        lines.append("\n## NEEDS UPDATE\n")
        for r in overdue:
            last = r["last_researched"].strftime("%Y-%m-%d") if r["last_researched"] else "?"
            lines.append(f"  [{r['status']}] {r['topic']}")
            lines.append(f"    Last: {last} | Interval: {r['interval_days']}d | Due: {r['days_until_due']}d")
            lines.append(f"    Search: {r['search_terms']}")
            lines.append(f"    Check: {r['databases']}")
            lines.append("")
    else:
        lines.append("\nAll research topics are current.\n")

    if no_date:
        lines.append("\n## NO DATE FOUND\n")
        for r in no_date:
            lines.append(f"  {r['topic']} (key: {r['key']})")

    if show_current and current:
        lines.append("\n## CURRENT (no action needed)\n")
        for r in current:
            research_topics = [r for r in current if r["category"] == "research"]
            provider_topics = [r for r in current if r["category"] == "provider"]

        if research_topics:
            lines.append("  Research topics:")
            for r in research_topics:
                last = r["last_researched"].strftime("%Y-%m-%d") if r["last_researched"] else "?"
                lines.append(f"    {r['topic']} (last: {last}, due in {r['days_until_due']}d)")

        if provider_topics:
            lines.append("\n  Provider notes:")
            for r in provider_topics:
                last = r["last_researched"].strftime("%Y-%m-%d") if r["last_researched"] else "?"
                lines.append(f"    {r['topic']} (last: {last})")

    return "\n".join(lines)


def format_markdown(results: list[dict]) -> str:
    """Format results as markdown suitable for pasting into Research Update Tracker."""
    lines = []
    lines.append(f"## Update Check: {datetime.now().strftime('%Y-%m-%d')}\n")

    overdue = [r for r in results if r["status"] in ("OVERDUE", "DUE SOON") and r.get("category") != "provider"]
    if overdue:
        lines.append("### Topics Due for Re-research\n")
        lines.append("| Topic | Last Researched | Days Overdue | Search Terms | Databases |")
        lines.append("|-------|----------------|-------------|-------------|-----------|")
        for r in overdue:
            last = r["last_researched"].strftime("%Y-%m-%d") if r["last_researched"] else "unknown"
            days = abs(r["days_until_due"]) if r["days_until_due"] is not None else "?"
            lines.append(f"| {r['topic']} | {last} | {days} | {r['search_terms']} | {r['databases']} |")
        lines.append("")
    else:
        lines.append("All research topics are current. Next check recommended in 30 days.\n")

    lines.append("### Upcoming (due within 60 days)\n")
    upcoming = [r for r in results if r["status"] == "Current" and r.get("category") != "provider"
                and r["days_until_due"] is not None and r["days_until_due"] <= 60]
    if upcoming:
        for r in upcoming:
            lines.append(f"- **{r['topic']}** -- due in {r['days_until_due']} days")
    else:
        lines.append("None due within 60 days.")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Check genome research notes for staleness")
    parser.add_argument("--days-ahead", type=int, default=0,
                        help="Show topics that will be due within N days from now")
    parser.add_argument("--output", choices=["text", "markdown"], default="text",
                        help="Output format (default: text)")
    parser.add_argument("--show-current", action="store_true",
                        help="Also show topics that are current")
    args = parser.parse_args()

    results = check_staleness(days_ahead=args.days_ahead)

    if args.output == "markdown":
        print(format_markdown(results))
    else:
        print(format_text(results, show_current=args.show_current))


if __name__ == "__main__":
    main()
