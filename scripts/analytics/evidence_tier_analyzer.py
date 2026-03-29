#!/usr/bin/env python3
"""Evidence Tier Distribution Analyzer.

Scans vault markdown notes and produces a distribution report of evidence
tier claims (E1-E5), broken down by note type.
"""

import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.config import VAULT_ROOT as _DEFAULT_VAULT_ROOT

# Directories to scan (relative to vault root)
SCAN_DIRS = ["Genes", "Systems", "Phenotypes", "Protocols", "Research"]

# Pattern for evidence tiers: E1, E2, ..., E5, and ranges like E2-E3.
# Excludes APOE E3/E3 genotype notation.
TIER_PATTERN = re.compile(
    r"\bE([1-5])"           # match E followed by digit 1-5
    r"(?:-E([1-5]))?"       # optionally followed by -E and another digit (range)
    r"(?![/])"              # not followed by / (excludes E3/E3)
)

# Pattern to detect APOE genotype mentions that should be excluded
APOE_PATTERN = re.compile(r"APOE[:\s]+E[1-5]")

# Definition lines look like "- E1: Clinical-grade ..." or "- E2: Well-replicated ..."
DEFINITION_PATTERN = re.compile(r"^\s*-\s+E[1-5]:\s+\w")


def extract_tiers_from_text(text: str) -> list[str]:
    """Extract all evidence tier mentions from text.

    Returns a list of strings like ["E1", "E2-E3", "E3"].
    Filters out definition lines and APOE E3/E3 notation.
    """
    tiers = []
    for line in text.split("\n"):
        if is_definition_block(line):
            continue
        # Skip lines that are APOE genotype references (E3/E3 etc.)
        if APOE_PATTERN.search(line):
            continue
        for match in TIER_PATTERN.finditer(line):
            first = match.group(1)
            second = match.group(2)
            if second:
                tiers.append(f"E{first}-E{second}")
            else:
                tiers.append(f"E{first}")
    return tiers


def resolve_tier_range(tier: str) -> str:
    """Resolve a tier or tier range to its conservative (lower confidence) value.

    E2-E3 -> E3 (higher number = lower confidence = more conservative).
    E2 -> E2 (unchanged).
    """
    if "-" in tier:
        parts = tier.split("-")
        # Higher number = lower confidence
        nums = [int(p.replace("E", "")) for p in parts]
        return f"E{max(nums)}"
    return tier


def is_definition_block(line: str) -> bool:
    """Return True if the line is an evidence tier definition (not a usage)."""
    return bool(DEFINITION_PATTERN.match(line))


def scan_vault(vault_root: str) -> list[dict]:
    """Scan all .md files in SCAN_DIRS and extract tier data.

    Returns a list of dicts:
        {"path": relative_path, "note_type": dir_name, "tiers": [tier_strings]}
    """
    results = []
    for subdir in SCAN_DIRS:
        dirpath = os.path.join(vault_root, subdir)
        if not os.path.isdir(dirpath):
            continue
        for filename in sorted(os.listdir(dirpath)):
            if not filename.endswith(".md"):
                continue
            filepath = os.path.join(dirpath, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                text = f.read()
            tiers = extract_tiers_from_text(text)
            results.append({
                "path": os.path.join(subdir, filename),
                "note_type": subdir,
                "tiers": tiers,
            })
    return results


def build_report(results: list[dict]) -> str:
    """Build a human-readable report from scan results."""
    lines = []
    lines.append("=" * 60)
    lines.append("EVIDENCE TIER DISTRIBUTION REPORT")
    lines.append("=" * 60)
    lines.append("")

    # --- Overall distribution ---
    all_resolved = []
    for r in results:
        for t in r["tiers"]:
            all_resolved.append(resolve_tier_range(t))
    total_claims = len(all_resolved)
    dist = Counter(all_resolved)

    lines.append("OVERALL DISTRIBUTION")
    lines.append("-" * 40)
    for tier in ["E1", "E2", "E3", "E4", "E5"]:
        count = dist.get(tier, 0)
        pct = (count / total_claims * 100) if total_claims else 0
        bar = "#" * int(pct / 2)
        lines.append(f"  {tier}: {count:4d}  ({pct:5.1f}%)  {bar}")
    lines.append(f"  Total claims: {total_claims}")
    lines.append("")

    # --- Per note-type breakdown ---
    lines.append("DISTRIBUTION BY NOTE TYPE")
    lines.append("-" * 40)
    type_tiers = defaultdict(list)
    type_counts = Counter()
    for r in results:
        type_counts[r["note_type"]] += 1
        for t in r["tiers"]:
            type_tiers[r["note_type"]].append(resolve_tier_range(t))

    for note_type in SCAN_DIRS:
        resolved = type_tiers.get(note_type, [])
        n_notes = type_counts.get(note_type, 0)
        if n_notes == 0:
            continue
        d = Counter(resolved)
        avg = len(resolved) / n_notes if n_notes else 0
        lines.append(f"\n  {note_type} ({n_notes} notes, {len(resolved)} claims, avg {avg:.1f}/note)")
        for tier in ["E1", "E2", "E3", "E4", "E5"]:
            c = d.get(tier, 0)
            if c > 0:
                lines.append(f"    {tier}: {c}")

    lines.append("")

    # --- Highest-confidence notes (most E1/E2) ---
    lines.append("HIGHEST-CONFIDENCE NOTES (most E1+E2 claims)")
    lines.append("-" * 40)
    scored = []
    for r in results:
        high = sum(1 for t in r["tiers"] if resolve_tier_range(t) in ("E1", "E2"))
        if high > 0:
            scored.append((high, r["path"]))
    scored.sort(key=lambda x: -x[0])
    for count, path in scored[:10]:
        lines.append(f"  {count:3d} E1/E2  {path}")
    lines.append("")

    # --- Lowest-confidence notes (most E4/E5) ---
    lines.append("LOWEST-CONFIDENCE NOTES (most E4+E5 claims)")
    lines.append("-" * 40)
    scored_low = []
    for r in results:
        low = sum(1 for t in r["tiers"] if resolve_tier_range(t) in ("E4", "E5"))
        if low > 0:
            scored_low.append((low, r["path"]))
    scored_low.sort(key=lambda x: -x[0])
    for count, path in scored_low[:10]:
        lines.append(f"  {count:3d} E4/E5  {path}")
    lines.append("")

    # --- Notes with NO evidence tiers ---
    no_tier = [r["path"] for r in results if len(r["tiers"]) == 0]
    lines.append(f"NOTES WITH NO EVIDENCE TIERS ({len(no_tier)} notes)")
    lines.append("-" * 40)
    for path in sorted(no_tier):
        lines.append(f"  {path}")
    lines.append("")

    return "\n".join(lines)


def main():
    """Run against the actual vault and write report."""
    # Default vault root: two levels up from this script
    vault_root = os.environ.get(
        "VAULT_ROOT",
        str(_DEFAULT_VAULT_ROOT)
    )

    print(f"Scanning vault: {vault_root}")
    results = scan_vault(vault_root)

    report = build_report(results)
    print(report)

    # Write to output file
    output_dir = os.path.join(vault_root, "data", "output")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "evidence_tier_report.txt")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"Report written to: {output_path}")


if __name__ == "__main__":
    main()
