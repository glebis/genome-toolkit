#!/usr/bin/env python3
"""
Claim Density Analyzer for gene notes.

Counts actionable claims per gene — distinguishes between
"well-documented but no actions" vs "few claims but all actionable."

Usage:
    python3 data/scripts/claim_density.py
    python3 data/scripts/claim_density.py --genes-dir Genes/
    python3 data/scripts/claim_density.py --output data/output/claim_density_report.txt
"""

import argparse
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.config import VAULT_ROOT, GENES_DIR, OUTPUT_DIR

# Expected sections in a complete gene note
EXPECTED_SECTIONS = [
    "What This Gene Does",
    "Personal Genotype",
    "Health Relevance",
    "Drug Interactions",
    "Gene-Gene Interactions",
    "What Changes This",
    "Confidence & Caveats",
]


def parse_frontmatter(text):
    """Extract YAML frontmatter as a dict of key: value strings."""
    fm = {}
    match = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    if not match:
        return fm
    for line in match.group(1).splitlines():
        # Simple key: value parsing (no nested YAML)
        m = re.match(r"^(\w[\w_]*):\s*(.+)$", line)
        if m:
            fm[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return fm


def extract_sections(text):
    """Split a gene note into sections by ## headings. Returns dict of heading -> content."""
    sections = {}
    # Remove frontmatter
    body = re.sub(r"^---.*?---\s*", "", text, count=1, flags=re.DOTALL)
    # Split on ## headings (level 2)
    parts = re.split(r"^## (.+)$", body, flags=re.MULTILINE)
    # parts[0] is text before first ##, then alternating heading/content
    for i in range(1, len(parts), 2):
        heading = parts[i].strip()
        content = parts[i + 1] if i + 1 < len(parts) else ""
        sections[heading] = content.strip()
    return sections


def parse_gene_note(text):
    """Parse a gene note into a structured dict."""
    fm = parse_frontmatter(text)
    sections = extract_sections(text)
    return {
        "gene_symbol": fm.get("gene_symbol", "UNKNOWN"),
        "evidence_tier": fm.get("evidence_tier", ""),
        "frontmatter": fm,
        "sections": sections,
        "raw": text,
    }


def count_table_rows(section_text):
    """Count data rows in a markdown table (excludes header and separator)."""
    lines = section_text.strip().splitlines()
    count = 0
    for line in lines:
        stripped = line.strip()
        if not stripped.startswith("|"):
            continue
        # Skip header separator (|---|---|...)
        if re.match(r"^\|[\s\-|]+\|$", stripped):
            continue
        # Skip header row (first row with column names)
        # We detect it by checking if it's the first table row
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        # Header rows typically contain things like "Drug", "Interaction", "SNP", etc.
        # Data rows typically contain bold text (**Drug**) or rsid patterns
        if any(c in ("Drug", "Interaction", "Mechanism", "Action", "SNP", "Genotype", "Significance", "Evidence") for c in cells):
            continue
        if stripped:
            count += 1
    return count


def count_drug_interactions(parsed):
    """Count drug interaction entries (table rows in Drug Interactions section)."""
    sections = parsed["sections"]
    di_text = sections.get("Drug Interactions", "")
    if not di_text:
        return 0
    return count_table_rows(di_text)


def count_gene_gene_interactions(parsed):
    """Count gene-gene interaction entries (bullet points starting with - **)."""
    sections = parsed["sections"]
    gg_text = sections.get("Gene-Gene Interactions", "")
    if not gg_text:
        return 0
    # Count lines starting with - ** (the pattern used for gene-gene entries)
    count = 0
    for line in gg_text.splitlines():
        stripped = line.strip()
        if re.match(r"^-\s+\*\*", stripped):
            count += 1
    return count


def count_actionable_items(parsed):
    """Count actionable items in 'What Changes This' section (bullet points)."""
    sections = parsed["sections"]
    wct_text = sections.get("What Changes This", "")
    if not wct_text:
        return 0
    count = 0
    for line in wct_text.splitlines():
        stripped = line.strip()
        if re.match(r"^-\s+\*\*", stripped):
            count += 1
    return count


def count_sections_present(parsed):
    """Count how many of the expected sections are present. Returns (present, total)."""
    sections = parsed["sections"]
    present = sum(1 for s in EXPECTED_SECTIONS if s in sections)
    return present, len(EXPECTED_SECTIONS)


def extract_evidence_tier(parsed):
    """Extract evidence tier from parsed note."""
    return parsed["evidence_tier"]


def _actionability_score(parsed):
    """Compute actionability score: drug interactions + actionable items."""
    return count_drug_interactions(parsed) + count_actionable_items(parsed)


def rank_by_actionability(notes):
    """Rank gene notes by actionability (drug interactions + modifiable factors), descending."""
    return sorted(notes, key=lambda n: _actionability_score(n), reverse=True)


def find_documented_but_no_actions(notes):
    """Find genes that have documentation but no 'What Changes This' section."""
    result = []
    for n in notes:
        if count_actionable_items(n) == 0:
            result.append(n)
    return result


def generate_report(notes):
    """Generate the full claim density report as a string."""
    lines = []
    lines.append("=" * 70)
    lines.append("CLAIM DENSITY REPORT")
    lines.append(f"Analyzed {len(notes)} gene notes")
    lines.append("=" * 70)

    # Compute metrics for each note
    metrics = []
    for n in notes:
        drug_count = count_drug_interactions(n)
        gg_count = count_gene_gene_interactions(n)
        action_count = count_actionable_items(n)
        present, total = count_sections_present(n)
        tier = extract_evidence_tier(n)
        actionability = drug_count + action_count
        metrics.append({
            "gene_symbol": n["gene_symbol"],
            "evidence_tier": tier,
            "drug_interactions": drug_count,
            "gene_gene_interactions": gg_count,
            "actionable_items": action_count,
            "sections_present": present,
            "sections_total": total,
            "completeness": present / total if total > 0 else 0,
            "actionability_score": actionability,
        })

    # Table 1: Most Actionable Genes
    lines.append("")
    lines.append("-" * 70)
    lines.append("1. Most Actionable Genes (drug interactions + modifiable factors)")
    lines.append("-" * 70)
    by_action = sorted(metrics, key=lambda m: m["actionability_score"], reverse=True)
    lines.append(f"{'Gene':<12} {'Tier':<6} {'Drugs':>5} {'Actions':>7} {'Score':>5}")
    lines.append(f"{'----':<12} {'----':<6} {'-----':>5} {'-------':>7} {'-----':>5}")
    for m in by_action:
        if m["actionability_score"] > 0:
            lines.append(
                f"{m['gene_symbol']:<12} {m['evidence_tier']:<6} "
                f"{m['drug_interactions']:>5} {m['actionable_items']:>7} "
                f"{m['actionability_score']:>5}"
            )

    # Table 2: Least Actionable Genes (documented but no actions)
    lines.append("")
    lines.append("-" * 70)
    lines.append("2. Least Actionable Genes (documented but no 'What Changes This')")
    lines.append("-" * 70)
    no_actions = [m for m in metrics if m["actionable_items"] == 0]
    no_actions.sort(key=lambda m: m["sections_present"], reverse=True)
    lines.append(f"{'Gene':<12} {'Tier':<6} {'Drugs':>5} {'G-G':>5} {'Sections':>8}")
    lines.append(f"{'----':<12} {'----':<6} {'-----':>5} {'---':>5} {'--------':>8}")
    for m in no_actions:
        lines.append(
            f"{m['gene_symbol']:<12} {m['evidence_tier']:<6} "
            f"{m['drug_interactions']:>5} {m['gene_gene_interactions']:>5} "
            f"{m['sections_present']:>4}/{m['sections_total']}"
        )

    # Table 3: Most Connected Genes (most gene-gene interactions)
    lines.append("")
    lines.append("-" * 70)
    lines.append("3. Most Connected Genes (gene-gene interactions)")
    lines.append("-" * 70)
    by_gg = sorted(metrics, key=lambda m: m["gene_gene_interactions"], reverse=True)
    lines.append(f"{'Gene':<12} {'Tier':<6} {'G-G':>5} {'Drugs':>5} {'Actions':>7}")
    lines.append(f"{'----':<12} {'----':<6} {'---':>5} {'-----':>5} {'-------':>7}")
    for m in by_gg:
        if m["gene_gene_interactions"] > 0:
            lines.append(
                f"{m['gene_symbol']:<12} {m['evidence_tier']:<6} "
                f"{m['gene_gene_interactions']:>5} {m['drug_interactions']:>5} "
                f"{m['actionable_items']:>7}"
            )

    # Table 4: Gene Completeness Score
    lines.append("")
    lines.append("-" * 70)
    lines.append("4. Gene Completeness Score (sections present / 7)")
    lines.append("-" * 70)
    by_complete = sorted(metrics, key=lambda m: m["completeness"], reverse=True)
    lines.append(f"{'Gene':<12} {'Tier':<6} {'Sections':>8} {'Complete':>8}")
    lines.append(f"{'----':<12} {'----':<6} {'--------':>8} {'--------':>8}")
    for m in by_complete:
        pct = f"{m['completeness']:.0%}"
        lines.append(
            f"{m['gene_symbol']:<12} {m['evidence_tier']:<6} "
            f"{m['sections_present']:>4}/{m['sections_total']}   {pct:>5}"
        )

    # Summary stats
    lines.append("")
    lines.append("-" * 70)
    lines.append("Summary")
    lines.append("-" * 70)
    total_genes = len(metrics)
    complete_genes = sum(1 for m in metrics if m["completeness"] == 1.0)
    actionable_genes = sum(1 for m in metrics if m["actionability_score"] > 0)
    no_action_genes = sum(1 for m in metrics if m["actionable_items"] == 0)
    avg_completeness = sum(m["completeness"] for m in metrics) / total_genes if total_genes else 0
    avg_drug = sum(m["drug_interactions"] for m in metrics) / total_genes if total_genes else 0
    avg_gg = sum(m["gene_gene_interactions"] for m in metrics) / total_genes if total_genes else 0

    lines.append(f"Total genes analyzed:          {total_genes}")
    lines.append(f"Fully complete (7/7 sections): {complete_genes}")
    lines.append(f"With actionable items:         {actionable_genes}")
    lines.append(f"Documented but no actions:     {no_action_genes}")
    lines.append(f"Average completeness:          {avg_completeness:.0%}")
    lines.append(f"Average drug interactions:     {avg_drug:.1f}")
    lines.append(f"Average gene-gene interactions:{avg_gg:.1f}")
    lines.append("")

    return "\n".join(lines)


def load_gene_notes(genes_dir):
    """Load all .md files from a directory and parse them as gene notes."""
    notes = []
    for fname in sorted(os.listdir(genes_dir)):
        if not fname.endswith(".md"):
            continue
        fpath = os.path.join(genes_dir, fname)
        with open(fpath, "r", encoding="utf-8") as f:
            text = f.read()
        parsed = parse_gene_note(text)
        notes.append(parsed)
    return notes


def main():
    parser = argparse.ArgumentParser(description="Gene note claim density analyzer")
    parser.add_argument(
        "--genes-dir",
        default=os.path.join(os.path.dirname(__file__), "..", "..", "Genes"),
        help="Path to Genes/ directory",
    )
    parser.add_argument(
        "--output",
        default=os.path.join(os.path.dirname(__file__), "..", "output", "claim_density_report.txt"),
        help="Output file path",
    )
    args = parser.parse_args()

    genes_dir = os.path.abspath(args.genes_dir)
    output_path = os.path.abspath(args.output)

    if not os.path.isdir(genes_dir):
        print(f"Error: Genes directory not found: {genes_dir}", file=sys.stderr)
        sys.exit(1)

    notes = load_gene_notes(genes_dir)
    if not notes:
        print("No gene notes found.", file=sys.stderr)
        sys.exit(1)

    report = generate_report(notes)
    print(report)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"\nReport written to: {output_path}")


if __name__ == "__main__":
    main()
