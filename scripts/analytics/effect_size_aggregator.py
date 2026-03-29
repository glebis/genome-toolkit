#!/usr/bin/env python3
"""
Effect Size Aggregator — extracts and compiles effect sizes from gene notes.

Reads all gene notes, extracts mentioned effect sizes (OR, RR, Cohen's d,
beta, hazard ratio, percent changes), compiles them into a table, and
identifies claims without effect sizes.

Output: data/output/effect_sizes_report.txt

Usage:
    python3 data/scripts/effect_size_aggregator.py
"""

import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.config import VAULT_ROOT, GENES_DIR, PHENOTYPES_DIR, OUTPUT_DIR

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
OUTPUT_FILE = OUTPUT_DIR / "effect_sizes_report.txt"

# Patterns for effect sizes
# Each tuple: (label, regex pattern, group index for value)
EFFECT_PATTERNS = [
    ("OR", re.compile(
        r"(?:odds\s+ratio|OR)\s*[=:≈~]\s*(\d+\.?\d*)"
        r"|(?:OR)\s+(?:of\s+)?(\d+\.?\d*)"
        r"|(\d+\.?\d*)\s*[-–]\s*fold\s+(?:increased?\s+)?(?:odds|risk)",
        re.IGNORECASE
    )),
    ("RR", re.compile(
        r"(?:relative\s+risk|risk\s+ratio|RR)\s*[=:≈~]\s*(\d+\.?\d*)"
        r"|(?:RR)\s+(?:of\s+)?(\d+\.?\d*)",
        re.IGNORECASE
    )),
    ("HR", re.compile(
        r"(?:hazard\s+ratio|HR)\s*[=:≈~]\s*(\d+\.?\d*)"
        r"|(?:HR)\s+(?:of\s+)?(\d+\.?\d*)",
        re.IGNORECASE
    )),
    ("Cohen's d", re.compile(
        r"(?:Cohen'?s?\s+d|effect\s+size\s+d)\s*[=:≈~]\s*(\d+\.?\d*)",
        re.IGNORECASE
    )),
    ("Beta", re.compile(
        r"(?:beta|β)\s*[=:≈~]\s*(-?\d+\.?\d*)"
        r"|(?:beta|β)\s+(?:of\s+)?(-?\d+\.?\d*)",
        re.IGNORECASE
    )),
    ("Percent", re.compile(
        r"(\d+\.?\d*)\s*[-–]?\s*%\s+(?:increase|decrease|reduction|lower|higher|more|less|fewer|greater|reduced|increased|elevated|change)",
        re.IGNORECASE
    )),
    ("Percent", re.compile(
        r"(?:increase|decrease|reduction|lower|higher|reduced|elevated)\s+(?:of\s+)?(?:about\s+|approximately\s+|~)?(\d+\.?\d*)\s*%",
        re.IGNORECASE
    )),
    ("Fold-change", re.compile(
        r"(\d+\.?\d*)\s*[-–]?\s*fold\s+(?:increase|decrease|change|higher|lower|greater|reduction|elevated)",
        re.IGNORECASE
    )),
    ("x-change", re.compile(
        r"(\d+\.?\d*)\s*x\s+(?:increase|decrease|higher|lower|risk|activity|clearance)",
        re.IGNORECASE
    )),
]

# Pattern to detect quantitative claims without effect sizes
CLAIM_PATTERNS = re.compile(
    r"(?:associated\s+with|linked\s+to|increases?\s+risk|decreases?\s+risk"
    r"|predisposes?\s+to|contributes?\s+to|modulates?\s|affects?\s"
    r"|impairs?\s|enhances?\s|reduces?\s|elevates?\s)"
    r"\s+(.{10,80}?)(?:\.|,|\n|$)",
    re.IGNORECASE
)


# ---------------------------------------------------------------------------
# Extract effect sizes from a file
# ---------------------------------------------------------------------------
def extract_effect_sizes(filepath: Path) -> tuple[list[dict], list[str]]:
    """
    Returns:
        found: list of {type, value, context, file}
        qualitative: list of claim strings without quantitative backing
    """
    try:
        text = filepath.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return [], []

    # Remove frontmatter
    if text.startswith("---"):
        end = text.find("---", 3)
        if end > 0:
            text = text[end + 3:]

    found = []
    quantitative_lines = set()

    for label, pattern in EFFECT_PATTERNS:
        for m in pattern.finditer(text):
            # Get the first non-None group
            value = None
            for g in m.groups():
                if g is not None:
                    value = g
                    break
            if value is None:
                continue

            # Get context: the line containing the match
            start = text.rfind("\n", 0, m.start())
            end = text.find("\n", m.end())
            if start < 0:
                start = 0
            if end < 0:
                end = len(text)
            context = text[start:end].strip()
            # Trim very long contexts
            if len(context) > 200:
                context = context[:200] + "..."

            line_num = text[:m.start()].count("\n")
            quantitative_lines.add(line_num)

            found.append({
                "type": label,
                "value": value,
                "context": context,
                "file": filepath.stem,
            })

    # Find qualitative claims (lines with claims but no effect size)
    qualitative = []
    for m in CLAIM_PATTERNS.finditer(text):
        line_num = text[:m.start()].count("\n")
        if line_num not in quantitative_lines:
            claim = m.group(0).strip()
            if len(claim) > 20:  # Skip trivially short matches
                qualitative.append(claim)

    # Deduplicate qualitative
    seen = set()
    unique_qual = []
    for c in qualitative:
        key = c[:50].lower()
        if key not in seen:
            seen.add(key)
            unique_qual.append(c)

    return found, unique_qual


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
def generate_report(all_effects: list[dict], all_qualitative: dict[str, list[str]]) -> str:
    lines = []
    lines.append("=" * 80)
    lines.append("EFFECT SIZE AGGREGATION REPORT")
    lines.append("=" * 80)
    lines.append("")

    # Summary
    lines.append(f"Total quantitative effect sizes found:  {len(all_effects)}")
    by_type = defaultdict(int)
    for e in all_effects:
        by_type[e["type"]] += 1
    for t, c in sorted(by_type.items(), key=lambda x: -x[1]):
        lines.append(f"  {t:<15} {c}")
    lines.append("")

    qual_count = sum(len(v) for v in all_qualitative.values())
    genes_qual_only = sum(1 for v in all_qualitative.values() if v)
    lines.append(f"Qualitative-only claims found:          {qual_count}")
    lines.append(f"Genes/phenotypes with qualitative claims: {genes_qual_only}")
    lines.append("")

    # Detailed table of effect sizes
    lines.append("-" * 80)
    lines.append("QUANTITATIVE EFFECT SIZES")
    lines.append("-" * 80)
    lines.append("")
    lines.append(f"{'Gene/Note':<15} {'Type':<15} {'Value':<10} {'Context'}")
    lines.append(f"{'─'*14} {'─'*14} {'─'*9} {'─'*40}")

    # Sort by gene, then by type
    for e in sorted(all_effects, key=lambda x: (x["file"], x["type"])):
        ctx = e["context"]
        if len(ctx) > 80:
            ctx = ctx[:77] + "..."
        lines.append(f"{e['file']:<15} {e['type']:<15} {e['value']:<10} {ctx}")
    lines.append("")

    # Qualitative claims without effect sizes
    lines.append("-" * 80)
    lines.append("QUALITATIVE CLAIMS (no effect size found)")
    lines.append("-" * 80)
    lines.append("")
    for gene, claims in sorted(all_qualitative.items()):
        if not claims:
            continue
        lines.append(f"### {gene}")
        for c in claims[:10]:  # Limit per gene
            c_trimmed = c if len(c) <= 120 else c[:117] + "..."
            lines.append(f"  - {c_trimmed}")
        if len(claims) > 10:
            lines.append(f"  ... and {len(claims) - 10} more")
        lines.append("")

    # Genes with zero quantitative data
    lines.append("-" * 80)
    lines.append("GENES/NOTES WITH NO QUANTITATIVE EFFECT SIZES")
    lines.append("-" * 80)
    genes_with_effects = {e["file"] for e in all_effects}
    all_scanned = set(all_qualitative.keys())
    no_quant = sorted(all_scanned - genes_with_effects)
    for name in no_quant:
        lines.append(f"  {name}")
    lines.append(f"\nTotal: {len(no_quant)}")
    lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print("Scanning gene notes...", flush=True)
    all_effects = []
    all_qualitative = {}

    dirs_to_scan = [
        ("Genes", GENES_DIR),
        ("Phenotypes", PHENOTYPES_DIR),
    ]

    for label, directory in dirs_to_scan:
        if not directory.exists():
            continue
        for md in sorted(directory.glob("*.md")):
            effects, qualitative = extract_effect_sizes(md)
            all_effects.extend(effects)
            all_qualitative[md.stem] = qualitative
            if effects:
                print(f"  {md.stem}: {len(effects)} effect size(s)")

    print(f"\nTotal effect sizes: {len(all_effects)}")
    report = generate_report(all_effects, all_qualitative)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(report, encoding="utf-8")
    print(f"Report saved to {OUTPUT_FILE}")
    print("\n" + report)


if __name__ == "__main__":
    main()
