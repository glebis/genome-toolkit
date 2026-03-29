#!/usr/bin/env python3
"""
Intervention Coverage Matrix
Scans vault notes for mentioned interventions and maps which systems/genes each covers.
"""

import os
import re
import sys
from collections import defaultdict

# Known interventions with aliases (case-insensitive matching)
INTERVENTIONS = {
    "Exercise": ["exercise", "HIIT", "aerobic", "resistance training", "physical activity"],
    "Omega-3": ["omega-3", "EPA", "DHA", "fish oil", "EPA/DHA"],
    "NAC": ["NAC", "N-acetylcysteine"],
    "Sertraline": ["sertraline", "SSRI"],
    "B6/P5P": ["B6", "P5P", "pyridoxine", "pyridoxal"],
    "Methylfolate": ["methylfolate", "folate", "5-MTHF"],
    "B12": ["B12", "methylcobalamin", "cobalamin"],
    "Caffeine restriction": ["caffeine restriction", "caffeine limit", "reduce caffeine"],
    "Cold exposure": ["cold exposure", "cold shower"],
    "Curcumin": ["curcumin", "turmeric"],
    "Meditation/HRV": ["meditation", "HRV", "biofeedback", "mindfulness"],
    "CBT": ["CBT", "cognitive behavioral", "therapy"],
    "Vitamin D": ["vitamin D", "cholecalciferol", "25-OH"],
    "Probiotics": ["probiotics", "probiotic"],
    "Ketamine": ["ketamine", "esketamine", "Spravato"],
    "Bupropion": ["bupropion", "Wellbutrin"],
}

# Precompile regex patterns for each intervention
_PATTERNS = {}
for name, aliases in INTERVENTIONS.items():
    # Sort by length descending so longer aliases match first
    sorted_aliases = sorted(aliases, key=len, reverse=True)
    escaped = [re.escape(a) for a in sorted_aliases]
    # Use word boundaries for matching
    pattern = r'\b(?:' + '|'.join(escaped) + r')\b'
    _PATTERNS[name] = re.compile(pattern, re.IGNORECASE)


def find_interventions_in_text(text):
    """Find all known interventions mentioned in text. Returns a set of intervention names."""
    found = set()
    for name, pattern in _PATTERNS.items():
        if pattern.search(text):
            found.add(name)
    return found


def scan_vault_notes(vault_path):
    """
    Scan Systems/, Phenotypes/, Genes/, Protocols/ for intervention mentions.
    Returns dict: {"DirName/NoteName": set of intervention names}
    """
    results = {}
    dirs_to_scan = ["Systems", "Phenotypes", "Genes", "Protocols"]

    for subdir in dirs_to_scan:
        dirpath = os.path.join(vault_path, subdir)
        if not os.path.isdir(dirpath):
            continue
        for fname in sorted(os.listdir(dirpath)):
            if not fname.endswith(".md"):
                continue
            filepath = os.path.join(dirpath, fname)
            with open(filepath, "r", encoding="utf-8") as f:
                text = f.read()
            note_name = fname.replace(".md", "")
            key = f"{subdir}/{note_name}"
            found = find_interventions_in_text(text)
            results[key] = found

    return results


def build_matrix(scan_results):
    """
    Invert scan results: from {note: set(interventions)} to {intervention: set(notes)}.
    Returns dict: {intervention_name: set of note keys}
    """
    matrix = defaultdict(set)
    for note_key, interventions in scan_results.items():
        for intervention in interventions:
            matrix[intervention].add(note_key)
    return dict(matrix)


def rank_by_coverage(matrix):
    """
    Rank interventions by number of notes that mention them.
    Returns list of (intervention_name, count) sorted descending.
    """
    ranked = [(name, len(notes)) for name, notes in matrix.items()]
    ranked.sort(key=lambda x: (-x[1], x[0]))
    return ranked


def find_uncovered_systems(scan_results):
    """Find notes that have no interventions mentioned."""
    return [key for key, interventions in scan_results.items() if len(interventions) == 0]


def format_output(scan_results, matrix, ranked, uncovered):
    """Format the full report as text."""
    lines = []
    lines.append("=" * 70)
    lines.append("INTERVENTION COVERAGE MATRIX")
    lines.append("=" * 70)
    lines.append("")

    # Section 1: Ranked interventions
    lines.append("## Interventions Ranked by Coverage Breadth")
    lines.append("")
    lines.append(f"{'Rank':<6}{'Intervention':<25}{'Notes':>6}")
    lines.append("-" * 40)
    for i, (name, count) in enumerate(ranked, 1):
        lines.append(f"{i:<6}{name:<25}{count:>6}")
    lines.append("")

    # Section 2: Full matrix
    lines.append("## Coverage Details")
    lines.append("")
    for name, count in ranked:
        notes = sorted(matrix[name])
        lines.append(f"### {name} ({count} notes)")
        for note in notes:
            lines.append(f"  - {note}")
        lines.append("")

    # Section 3: Uncovered notes
    lines.append("## Notes With No Interventions Mentioned")
    lines.append("")
    if uncovered:
        for key in sorted(uncovered):
            lines.append(f"  - {key}")
    else:
        lines.append("  (none)")
    lines.append("")

    # Section 4: Per-directory summary
    lines.append("## Per-Directory Summary")
    lines.append("")
    dir_stats = defaultdict(lambda: {"total": 0, "with_interventions": 0, "interventions": set()})
    for key, interventions in scan_results.items():
        d = key.split("/")[0]
        dir_stats[d]["total"] += 1
        if interventions:
            dir_stats[d]["with_interventions"] += 1
        dir_stats[d]["interventions"].update(interventions)

    for d in sorted(dir_stats):
        s = dir_stats[d]
        pct = (s["with_interventions"] / s["total"] * 100) if s["total"] > 0 else 0
        lines.append(f"{d}: {s['with_interventions']}/{s['total']} notes mention interventions ({pct:.0f}%), {len(s['interventions'])} unique interventions")
    lines.append("")

    return "\n".join(lines)


def main():
    vault_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
    vault_path = os.path.normpath(vault_path)

    print(f"Scanning vault: {vault_path}")
    print()

    scan_results = scan_vault_notes(vault_path)
    matrix = build_matrix(scan_results)
    ranked = rank_by_coverage(matrix)
    uncovered = find_uncovered_systems(scan_results)

    output = format_output(scan_results, matrix, ranked, uncovered)
    print(output)

    # Write to file
    output_dir = os.path.join(vault_path, "data", "output")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "intervention_matrix.txt")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(output)
    print(f"Written to: {output_path}")


if __name__ == "__main__":
    main()
