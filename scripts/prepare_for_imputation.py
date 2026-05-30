#!/usr/bin/env python3
"""
Prepare genotyped SNPs from SQLite for imputation servers (GRCh37 → TOPMed).

REF/ALT in a VCF must be the *reference-genome* alleles at each position. They
cannot be inferred from the observed sample genotype — doing so silently flips
homozygous-alternate calls (observed AA at reference G must be REF=G/ALT=A/GT=1/1,
not REF=A/ALT=./GT=0/0). So this script does NOT hand-roll a VCF. It exports a
reference-free TSV and delegates VCF construction to `bcftools convert --tsv2vcf`
against a GRCh37 FASTA, which resolves REF/ALT/GT correctly.

Input:  SQLite database (genome.db) — provider-agnostic, works with any imported data
Output: data/output/for_imputation.tsv  (always)
        data/output/for_imputation.vcf.gz  (when --reference FASTA is provided)

QC steps applied (Python side):
  - Remove no-calls (-- genotype)
  - Remove indels (D/I alleles)
  - Remove non-rsid variants (internal provider IDs)
  - Remove mitochondrial (MT) and Y chromosome variants
  - Remove duplicate rsIDs and duplicate (chrom, pos) loci
  - Sort by chromosome and position

Reference-anchored steps (bcftools side, when --reference is given):
  - Derive REF/ALT/GT from the FASTA via `convert --tsv2vcf`
  - Drop strand-ambiguous palindromic SNPs (A/T, C/G) unless --keep-palindromic
  - Sort, bgzip, and index
"""

import argparse
import os
import shutil
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.config import DB_PATH, OUTPUT_DIR
from lib.db import get_connection

# Valid nucleotides for SNPs
VALID_ALLELES = set("ACGT")

# Chromosome sort order
CHROM_ORDER = {str(i): i for i in range(1, 23)}
CHROM_ORDER["X"] = 23


def query_genotyped_snps(db_path, profile_id="default"):
    """Query genotyped SNPs from SQLite database.

    Returns list of (chrom, pos, rsid, genotype) tuples and QC stats.
    The profile_id parameter is reserved for future multi-profile support.
    """
    variants = []
    stats = defaultdict(int)

    conn = get_connection(db_path)
    cursor = conn.execute(
        "SELECT rsid, chromosome, position, genotype FROM snps WHERE source = 'genotyped'"
    )

    for row in cursor:
        rsid, chrom, pos, genotype = row["rsid"], row["chromosome"], row["position"], row["genotype"]
        stats["total_input"] += 1

        # Skip non-rsid variants (internal provider IDs like i6019299)
        if not rsid.startswith("rs"):
            stats["skipped_non_rsid"] += 1
            continue

        # Skip no-calls
        if genotype == "--" or not genotype:
            stats["skipped_nocall"] += 1
            continue

        # Skip MT and Y chromosomes (not imputable)
        if chrom in ("MT", "Y"):
            stats[f"skipped_{chrom}"] += 1
            continue

        # Skip indels (D = deletion, I = insertion)
        if "D" in genotype or "I" in genotype:
            stats["skipped_indel"] += 1
            continue

        # Validate alleles are standard nucleotides
        if not all(a in VALID_ALLELES for a in genotype):
            stats["skipped_invalid_allele"] += 1
            continue

        # Skip if chromosome not in expected set
        if chrom not in CHROM_ORDER:
            stats["skipped_unknown_chrom"] += 1
            continue

        variants.append((chrom, pos, rsid, genotype))
        stats["passed_qc"] += 1

    conn.close()
    return variants, stats


# Strand-ambiguous (palindromic) allele pairs. Without a population-frequency
# reference these cannot be reliably oriented, so they are dropped by default.
PALINDROMIC_PAIRS = (frozenset(("A", "T")), frozenset(("C", "G")))

# bcftools filter excluding palindromic biallelic SNPs once REF/ALT are
# reference-anchored (catches both homozygous and heterozygous palindromes).
PALINDROME_EXCLUDE_EXPR = (
    '(REF="A"&&ALT="T")||(REF="T"&&ALT="A")'
    '||(REF="C"&&ALT="G")||(REF="G"&&ALT="C")'
)


def is_palindromic(a1, a2):
    """True if the two alleles form a strand-ambiguous (palindromic) pair."""
    return frozenset((a1.upper(), a2.upper())) in PALINDROMIC_PAIRS


def het_palindromic_genotype(genotype):
    """True for a heterozygous call whose two observed alleles are palindromic.

    Homozygous calls expose only one allele, so the variant's full pair is
    unknown from the genotype alone — those are resolved later against the
    reference FASTA, not here.
    """
    g = genotype.upper()
    return len(g) == 2 and g[0] != g[1] and is_palindromic(g[0], g[1])


def dedupe_variants(variants):
    """Drop variants sharing an rsID or a (chromosome, position) locus.

    Keeps the first occurrence. Returns (deduped_variants, n_dropped).
    """
    seen_rsids = set()
    seen_loci = set()
    deduped = []
    dropped = 0
    for v in variants:
        chrom, pos, rsid, _genotype = v
        locus = (chrom, pos)
        if rsid in seen_rsids or locus in seen_loci:
            dropped += 1
            continue
        seen_rsids.add(rsid)
        seen_loci.add(locus)
        deduped.append(v)
    return deduped, dropped


def write_tsv(variants, output_path):
    """Write variants as a reference-free TSV for `bcftools convert --tsv2vcf`.

    Columns match `-c ID,CHROM,POS,AA`: rsid, chromosome, position, genotype.
    REF/ALT are intentionally NOT emitted here — they are derived from the
    reference FASTA downstream. Sorted by chromosome (numeric) then position.
    Returns the number of rows written.
    """
    variants = sorted(variants, key=lambda v: (CHROM_ORDER.get(v[0], 99), v[1]))

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    written = 0
    with open(output_path, "w") as f:
        for chrom, pos, rsid, genotype in variants:
            f.write(f"{rsid}\t{chrom}\t{pos}\t{genotype}\n")
            written += 1
    return written


def count_het_palindromic(variants):
    """Count heterozygous palindromic calls (informational QC signal)."""
    return sum(1 for v in variants if het_palindromic_genotype(v[3]))


def build_tsv2vcf_command(tsv_path, ref_fasta, sample="SAMPLE"):
    """Build the `bcftools convert --tsv2vcf` argv. REF comes from the FASTA."""
    return [
        "bcftools", "convert",
        "-c", "ID,CHROM,POS,AA",
        "-s", str(sample),
        "-f", str(ref_fasta),
        "--tsv2vcf", str(tsv_path),
    ]


def prepare_vcf(tsv_path, ref_fasta, output_vcf, sample="SAMPLE", drop_palindromic=True):
    """Produce a reference-anchored VCF from the TSV via bcftools.

    Pipeline: convert --tsv2vcf (REF/ALT from FASTA) → optionally drop
    palindromic sites → sort. Output is bgzipped + indexed when the path ends
    in .gz, otherwise a plain VCF. Returns the output path.

    Raises RuntimeError with actionable guidance if bcftools or the reference
    FASTA is unavailable — never silently writes an unreferenced VCF.
    """
    bcftools = shutil.which("bcftools")
    if not bcftools:
        raise RuntimeError(
            "bcftools not found on PATH. Install it (e.g. `brew install bcftools`) — "
            "REF/ALT must be derived from a reference FASTA, not the sample genotype."
        )

    ref_fasta = Path(ref_fasta)
    if not ref_fasta.exists():
        raise RuntimeError(
            f"Reference FASTA not found: {ref_fasta}. Download a GRCh37 reference "
            "(e.g. human_g1k_v37.fasta) — REF alleles come from it."
        )

    tsv_path = Path(tsv_path)
    if not tsv_path.exists():
        raise RuntimeError(f"Input TSV not found: {tsv_path}")

    output_vcf = Path(output_vcf)
    os.makedirs(output_vcf.parent, exist_ok=True)
    bgzip = str(output_vcf).endswith(".gz")
    out_type = "z" if bgzip else "v"

    convert = build_tsv2vcf_command(tsv_path, ref_fasta, sample=sample)
    convert = [bcftools if convert[0] == "bcftools" else convert[0]] + convert[1:]

    # convert | [view -e palindrome] | sort -O{z,v} -o output
    procs = []
    convert_proc = subprocess.Popen(convert, stdout=subprocess.PIPE)
    procs.append(convert_proc)
    upstream = convert_proc

    if drop_palindromic:
        view = subprocess.Popen(
            [bcftools, "view", "-e", PALINDROME_EXCLUDE_EXPR],
            stdin=upstream.stdout, stdout=subprocess.PIPE,
        )
        upstream.stdout.close()
        procs.append(view)
        upstream = view

    sort = subprocess.Popen(
        [bcftools, "sort", f"-O{out_type}", "-o", str(output_vcf)],
        stdin=upstream.stdout,
    )
    upstream.stdout.close()
    procs.append(sort)

    sort.communicate()
    for p in procs:
        if p.wait() != 0:
            raise RuntimeError(
                f"bcftools step failed ({' '.join(p.args)}). "
                "Check the reference build matches the genotype coordinates (GRCh37)."
            )

    if bgzip:
        subprocess.run([bcftools, "index", "-t", str(output_vcf)], check=True)

    return str(output_vcf)


def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description=(
            "Export genotyped SNPs from SQLite to a reference-free TSV, then "
            "(optionally) build a reference-anchored VCF for imputation servers "
            "via `bcftools convert --tsv2vcf` against a GRCh37 FASTA."
        )
    )
    parser.add_argument(
        "--profile",
        default="default",
        help="Profile ID to export (default: 'default'). Reserved for future multi-profile support.",
    )
    parser.add_argument(
        "--output",
        default=None,
        help=f"Output TSV path (default: {OUTPUT_DIR / 'for_imputation.tsv'})",
    )
    parser.add_argument(
        "--db",
        default=None,
        help=f"Path to SQLite database (default: {DB_PATH})",
    )
    parser.add_argument(
        "--reference",
        default=None,
        help="GRCh37 reference FASTA. If provided (and bcftools is installed), a "
             "reference-anchored VCF is produced. Without it, only the TSV is written.",
    )
    parser.add_argument(
        "--vcf-output",
        default=None,
        help=f"VCF output path when --reference is given (default: {OUTPUT_DIR / 'for_imputation.vcf.gz'}).",
    )
    parser.add_argument(
        "--sample",
        default="SAMPLE",
        help="Sample name written into the VCF (default: SAMPLE).",
    )
    parser.add_argument(
        "--keep-palindromic",
        action="store_true",
        help="Keep strand-ambiguous A/T and C/G SNPs (dropped by default).",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    db_path = Path(args.db) if args.db else DB_PATH
    output_file = args.output if args.output else str(OUTPUT_DIR / "for_imputation.tsv")

    print("=" * 60)
    print("Genotyped SNPs → reference-anchored imputation prep")
    print("=" * 60)
    print()

    # Check database exists
    if not db_path.exists():
        print(f"ERROR: Database not found: {db_path}")
        sys.exit(1)

    print(f"Database: {db_path}")
    print(f"Profile:  {args.profile}")
    print(f"Output:   {output_file}")
    print()

    # Query genotyped SNPs
    print("Querying genotyped SNPs from database...")
    variants, stats = query_genotyped_snps(db_path, profile_id=args.profile)

    # De-duplicate by rsID and locus before export
    variants, dup_dropped = dedupe_variants(variants)
    het_palindromic = count_het_palindromic(variants)

    # Write the reference-free TSV (REF/ALT are resolved downstream from the FASTA)
    print("Writing reference-free TSV (ID, CHROM, POS, AA)...")
    written = write_tsv(variants, output_file)

    # Report
    print()
    print("=" * 60)
    print("QC Summary")
    print("=" * 60)
    print(f"  Total genotyped SNPs:       {stats['total_input']:>10,}")
    print(f"  Passed QC:                  {stats['passed_qc']:>10,}")
    print(f"  Duplicate rsID/locus:       {dup_dropped:>10,}")
    print(f"  Written to TSV:             {written:>10,}")
    print()
    print("  Filtered out:")
    print(f"    No-calls (--):            {stats['skipped_nocall']:>10,}")
    print(f"    Non-rsid (internal IDs):  {stats['skipped_non_rsid']:>10,}")
    print(f"    Indels (D/I):             {stats['skipped_indel']:>10,}")
    print(f"    MT chromosome:            {stats['skipped_MT']:>10,}")
    print(f"    Y chromosome:             {stats['skipped_Y']:>10,}")
    print(f"    Invalid alleles:          {stats['skipped_invalid_allele']:>10,}")
    print(f"    Unknown chromosome:       {stats['skipped_unknown_chrom']:>10,}")
    print()
    print(f"  Heterozygous palindromic (A/T, C/G), informational: {het_palindromic:>8,}")
    if not args.keep_palindromic:
        print("    → all palindromic sites are dropped from the VCF by default.")
    print()

    # Optionally build the reference-anchored VCF
    if args.reference:
        vcf_output = args.vcf_output or str(OUTPUT_DIR / "for_imputation.vcf.gz")
        print("Building reference-anchored VCF via bcftools convert --tsv2vcf...")
        try:
            prepare_vcf(
                output_file,
                args.reference,
                vcf_output,
                sample=args.sample,
                drop_palindromic=not args.keep_palindromic,
            )
        except RuntimeError as exc:
            print(f"ERROR: {exc}")
            sys.exit(1)
        size_mb = os.path.getsize(vcf_output) / (1024 * 1024)
        print(f"  VCF written: {vcf_output} ({size_mb:.1f} MB)")
        print()
        print("Next steps:")
        print(f"  1. Validate strand:  bcftools +fixref {vcf_output} -- -f {args.reference}")
        print("  2. Panel check (HRC/TOPMed): Will Rayner HRC-1000G-check-bim.pl")
        print("  3. Upload to https://imputationserver.sph.umich.edu (TOPMed r3)")
        print("  4. See research/20260323-genome-imputation-guide.md for full instructions")
    else:
        print("No --reference given: wrote TSV only (no VCF).")
        print()
        print("Next steps:")
        print("  REF/ALT must come from a GRCh37 reference FASTA — re-run with")
        print(f"  --reference human_g1k_v37.fasta to produce a valid VCF, or follow")
        print("  research/20260323-genome-imputation-guide.md for the manual bcftools flow.")


if __name__ == "__main__":
    main()
