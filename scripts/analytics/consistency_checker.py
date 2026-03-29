#!/usr/bin/env python3
"""
Cross-validation consistency checker for genomics Obsidian vault.
Scans all .md files and detects inconsistent claims about genotypes,
metabolizer status, and key numerical facts.
"""
import os
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.config import VAULT_ROOT, OUTPUT_DIR


# --- Extraction Functions ---

def extract_genotype_claims(text, filename):
    """Extract rsid + genotype pairs from text.

    Matches patterns like:
      rs4680 A;G
      rs4680 A/G
      rs1799853 C;T
      | rs4680 | A;G |
      rs4680: A;G
      rs3918290 C;C, rs67376798 T;T
    """
    claims = []
    # Pattern: rsid followed (within a short span) by a genotype (X;Y or X/Y)
    # Allow separators: space, colon, pipe, comma
    pattern = r'(rs\d+)\s*[:|]?\s*([ACGT])\s*[;/]\s*([ACGT])'
    for match in re.finditer(pattern, text):
        rsid = match.group(1)
        allele1 = match.group(2)
        allele2 = match.group(3)
        separator = ";" if ";" in match.group(0) else "/"
        genotype = f"{allele1}{separator}{allele2}"
        claims.append({
            "rsid": rsid,
            "genotype": genotype,
            "file": filename,
        })
    return claims


def extract_metabolizer_claims(text, filename):
    """Extract metabolizer status claims linked to CYP genes.

    Matches patterns like:
      CYP2C9 intermediate metabolizer
      CYP2C19 normal metabolizer
      Functional poor metabolizer ... CYP2C19
      CYP1A2 slow-to-intermediate metabolizer
      CYP1A2 slow metabolizer
    """
    claims = []

    statuses = [
        "functional poor metabolizer",
        "poor metabolizer",
        "intermediate metabolizer",
        "normal metabolizer",
        "rapid metabolizer",
        "ultrarapid metabolizer",
        "slow-to-intermediate metabolizer",
        "slow metabolizer",
    ]

    cyp_pattern = r'CYP\w+'

    for line in text.split('\n'):
        line_lower = line.lower()
        for status in statuses:
            if status.lower() in line_lower:
                # Find CYP gene in same line
                cyp_matches = re.findall(cyp_pattern, line, re.IGNORECASE)
                for gene in cyp_matches:
                    gene_upper = gene.upper()
                    claims.append({
                        "gene": gene_upper,
                        "status": status,
                        "file": filename,
                    })
                break  # Only match highest-priority status per line

    return claims


def extract_percentage_claims(text, filename):
    """Extract percentage and OR claims tied to specific genes.

    Matches patterns like:
      DRD2 5-14% reduced D2 binding
      30-40% fewer D2 receptors
      ~50% reduced enzyme activity
      OR 1.5
    """
    claims = []

    gene_pattern = r'(?:DRD[2-4]|COMT|CYP\w+|OPRM1|FKBP5|BDNF|SLC6A4|HTR\w+|MTHFR|ANKK1)'

    for line in text.split('\n'):
        # Percentage claims: N-M% or ~N% or N%
        pct_matches = re.finditer(r'~?(\d+(?:-\d+)?%)', line)
        for pct in pct_matches:
            value = pct.group(0)
            # Find gene in same line
            gene_matches = re.findall(gene_pattern, line, re.IGNORECASE)
            # Also check for D2 (implies DRD2)
            if not gene_matches and re.search(r'\bD2\b', line):
                gene_matches = ["DRD2"]
            for gene in gene_matches:
                gene_upper = gene.upper()
                # Get surrounding context
                start = max(0, pct.start() - 40)
                end = min(len(line), pct.end() + 40)
                context = line[start:end].strip()
                claims.append({
                    "gene": gene_upper,
                    "value": value,
                    "context": context,
                    "claim_type": "percentage",
                    "file": filename,
                })

        # OR (odds ratio) claims
        or_matches = re.finditer(r'\bOR\s+(\d+\.?\d*)', line)
        for or_match in or_matches:
            value = f"OR {or_match.group(1)}"
            gene_matches = re.findall(gene_pattern, line, re.IGNORECASE)
            for gene in gene_matches:
                gene_upper = gene.upper()
                start = max(0, or_match.start() - 40)
                end = min(len(line), or_match.end() + 40)
                context = line[start:end].strip()
                claims.append({
                    "gene": gene_upper,
                    "value": value,
                    "context": context,
                    "claim_type": "OR",
                    "file": filename,
                })

    return claims


# --- Normalization ---

def normalize_genotype(genotype):
    """Normalize genotype for comparison: A;G == A/G == G;A."""
    # Replace / with ;
    g = genotype.replace("/", ";")
    parts = g.split(";")
    if len(parts) == 2:
        return ";".join(sorted(parts))
    return g


# --- Inconsistency Detection ---

def find_genotype_inconsistencies(claims):
    """Find rsids with different genotypes across files."""
    by_rsid = defaultdict(list)
    for c in claims:
        by_rsid[c["rsid"]].append(c)

    inconsistencies = []
    for rsid, rsid_claims in by_rsid.items():
        normalized = set()
        for c in rsid_claims:
            normalized.add(normalize_genotype(c["genotype"]))
        if len(normalized) > 1:
            inconsistencies.append({
                "rsid": rsid,
                "variants": list(normalized),
                "files": [(c["genotype"], c["file"]) for c in rsid_claims],
            })

    return inconsistencies


def find_metabolizer_inconsistencies(claims):
    """Find genes with different metabolizer status across files.

    Special handling: 'functional poor metabolizer' is phenoconversion,
    not a genetic inconsistency with 'normal metabolizer'.
    """
    by_gene = defaultdict(list)
    for c in claims:
        by_gene[c["gene"]].append(c)

    inconsistencies = []
    for gene, gene_claims in by_gene.items():
        # Separate functional (phenoconversion) from genetic status
        genetic_statuses = set()
        functional_statuses = set()
        for c in gene_claims:
            if "functional" in c["status"].lower():
                functional_statuses.add(c["status"])
            else:
                genetic_statuses.add(c["status"])

        # Only flag inconsistencies within genetic statuses
        if len(genetic_statuses) > 1:
            inconsistencies.append({
                "gene": gene,
                "statuses": list(genetic_statuses),
                "files": [(c["status"], c["file"]) for c in gene_claims
                          if "functional" not in c["status"].lower()],
            })

    return inconsistencies


def find_percentage_inconsistencies(claims):
    """Find genes with different percentage claims for similar context."""
    # Group by gene + claim_type
    by_key = defaultdict(list)
    for c in claims:
        key = (c["gene"], c["claim_type"])
        by_key[key].append(c)

    inconsistencies = []
    for (gene, claim_type), group in by_key.items():
        values = set(c["value"] for c in group)
        if len(values) > 1:
            inconsistencies.append({
                "gene": gene,
                "claim_type": claim_type,
                "values": list(values),
                "files": [(c["value"], c["context"], c["file"]) for c in group],
            })

    return inconsistencies


# --- Vault Scanner ---

def scan_vault(vault_path):
    """Scan all .md files in vault, extract claims, find inconsistencies."""
    all_genotype_claims = []
    all_metabolizer_claims = []
    all_percentage_claims = []
    total_files = 0

    skip_dirs = {"Templates", ".obsidian", "data", ".git", ".claude", ".trash"}

    for root, dirs, files in os.walk(vault_path):
        # Skip certain directories
        dirs[:] = [d for d in dirs if d not in skip_dirs]

        for fname in files:
            if not fname.endswith(".md"):
                continue

            filepath = os.path.join(root, fname)
            rel_path = os.path.relpath(filepath, vault_path)

            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    text = f.read()
            except (IOError, UnicodeDecodeError):
                continue

            total_files += 1
            all_genotype_claims.extend(extract_genotype_claims(text, rel_path))
            all_metabolizer_claims.extend(extract_metabolizer_claims(text, rel_path))
            all_percentage_claims.extend(extract_percentage_claims(text, rel_path))

    genotype_incon = find_genotype_inconsistencies(all_genotype_claims)
    metabolizer_incon = find_metabolizer_inconsistencies(all_metabolizer_claims)
    percentage_incon = find_percentage_inconsistencies(all_percentage_claims)

    # Count consistent facts
    genotype_by_rsid = defaultdict(set)
    for c in all_genotype_claims:
        genotype_by_rsid[c["rsid"]].add(normalize_genotype(c["genotype"]))
    consistent_genotypes = sum(1 for v in genotype_by_rsid.values() if len(v) == 1)

    metabolizer_by_gene = defaultdict(set)
    for c in all_metabolizer_claims:
        if "functional" not in c["status"].lower():
            metabolizer_by_gene[c["gene"]].add(c["status"])
    consistent_metabolizers = sum(1 for v in metabolizer_by_gene.values() if len(v) == 1)

    # Most-cited genotypes
    genotype_counts = defaultdict(int)
    for c in all_genotype_claims:
        key = f"{c['rsid']} {normalize_genotype(c['genotype'])}"
        genotype_counts[key] += 1
    most_cited = sorted(genotype_counts.items(), key=lambda x: -x[1])[:20]

    return {
        "total_files": total_files,
        "total_genotype_claims": len(all_genotype_claims),
        "total_metabolizer_claims": len(all_metabolizer_claims),
        "total_percentage_claims": len(all_percentage_claims),
        "consistent_genotypes": consistent_genotypes,
        "consistent_metabolizers": consistent_metabolizers,
        "genotype_inconsistencies": genotype_incon,
        "metabolizer_inconsistencies": metabolizer_incon,
        "percentage_inconsistencies": percentage_incon,
        "most_cited": most_cited,
        "all_genotype_claims": all_genotype_claims,
        "all_metabolizer_claims": all_metabolizer_claims,
        "all_percentage_claims": all_percentage_claims,
    }


def format_report(result):
    """Format scan results as a readable report."""
    lines = []
    lines.append("=" * 70)
    lines.append("VAULT CONSISTENCY REPORT")
    lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append("=" * 70)
    lines.append("")

    # Summary
    lines.append("## SUMMARY")
    lines.append(f"Files scanned:           {result['total_files']}")
    lines.append(f"Genotype claims:         {result['total_genotype_claims']}")
    lines.append(f"Metabolizer claims:      {result['total_metabolizer_claims']}")
    lines.append(f"Percentage claims:       {result['total_percentage_claims']}")
    lines.append(f"Consistent genotypes:    {result['consistent_genotypes']}")
    lines.append(f"Consistent metabolizers: {result['consistent_metabolizers']}")
    lines.append("")

    # Genotype inconsistencies
    gi = result["genotype_inconsistencies"]
    lines.append(f"## GENOTYPE INCONSISTENCIES ({len(gi)} found)")
    if gi:
        for inc in gi:
            lines.append(f"\n  {inc['rsid']} — found as: {', '.join(inc['variants'])}")
            for genotype, filepath in inc["files"]:
                lines.append(f"    [{genotype}] in {filepath}")
    else:
        lines.append("  None found.")
    lines.append("")

    # Metabolizer inconsistencies
    mi = result["metabolizer_inconsistencies"]
    lines.append(f"## METABOLIZER STATUS INCONSISTENCIES ({len(mi)} found)")
    if mi:
        for inc in mi:
            lines.append(f"\n  {inc['gene']} — found as: {', '.join(inc['statuses'])}")
            for status, filepath in inc["files"]:
                lines.append(f"    [{status}] in {filepath}")
    else:
        lines.append("  None found.")
    lines.append("")

    # Percentage inconsistencies
    pi = result["percentage_inconsistencies"]
    lines.append(f"## NUMERICAL CLAIM INCONSISTENCIES ({len(pi)} found)")
    if pi:
        for inc in pi:
            lines.append(f"\n  {inc['gene']} ({inc['claim_type']}) — values: {', '.join(inc['values'])}")
            for value, context, filepath in inc["files"]:
                lines.append(f"    [{value}] \"{context}\" in {filepath}")
    else:
        lines.append("  None found.")
    lines.append("")

    # Most-cited
    lines.append("## MOST-CITED GENOTYPES (top 20)")
    for claim, count in result["most_cited"]:
        lines.append(f"  {count:3d}x  {claim}")
    lines.append("")

    return "\n".join(lines)


# --- Main ---

def main():
    vault_path = str(VAULT_ROOT)

    print(f"Scanning vault: {vault_path}")
    result = scan_vault(vault_path)
    report = format_report(result)

    # Write report
    output_dir = str(OUTPUT_DIR)
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "consistency_report.txt")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(report)

    print(report)
    print(f"\nReport written to: {output_path}")

    # Exit code: 1 if inconsistencies found
    total_issues = (
        len(result["genotype_inconsistencies"])
        + len(result["metabolizer_inconsistencies"])
        + len(result["percentage_inconsistencies"])
    )
    return 1 if total_issues > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
