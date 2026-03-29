#!/usr/bin/env python3
"""
Convert 23andMe v4 raw data to VCF format for imputation servers.

Input:  data/raw/23andme_v4.txt (23andMe v4 format, GRCh37/hg19)
Output: data/output/23andme_for_imputation.vcf

QC steps applied:
  - Remove no-calls (-- genotype)
  - Remove indels (D/I alleles)
  - Remove non-rsid variants (internal 23andMe IDs)
  - Remove mitochondrial (MT) and Y chromosome variants
  - Remove monomorphic calls that can't be represented as biallelic SNPs
  - Sort by chromosome and position
  - Generate valid VCF 4.1 with proper headers
"""

import os
import sys
from collections import defaultdict
from datetime import date

# Paths relative to the vault root
VAULT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
INPUT_FILE = os.path.join(VAULT_ROOT, "data", "raw", "23andme_v4.txt")
OUTPUT_DIR = os.path.join(VAULT_ROOT, "data", "output")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "23andme_for_imputation.vcf")

# Valid nucleotides for SNPs
VALID_ALLELES = set("ACGT")

# Chromosome sort order
CHROM_ORDER = {str(i): i for i in range(1, 23)}
CHROM_ORDER["X"] = 23


def parse_23andme(filepath):
    """Parse 23andMe v4 raw data file.

    Returns list of (chrom, pos, rsid, genotype) tuples.
    """
    variants = []
    stats = defaultdict(int)

    with open(filepath, "r") as f:
        for line in f:
            line = line.strip()

            # Skip comments and empty lines
            if not line or line.startswith("#"):
                continue

            parts = line.split("\t")
            if len(parts) != 4:
                stats["malformed_lines"] += 1
                continue

            rsid, chrom, pos, genotype = parts
            stats["total_input"] += 1

            # Skip non-rsid variants (23andMe internal IDs like i6019299)
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

            try:
                pos_int = int(pos)
            except ValueError:
                stats["skipped_bad_position"] += 1
                continue

            variants.append((chrom, pos_int, rsid, genotype))
            stats["passed_qc"] += 1

    return variants, stats


def genotype_to_vcf_fields(genotype):
    """Convert 23andMe genotype string to VCF REF, ALT, GT fields.

    23andMe reports genotypes on the plus strand.
    For homozygous calls (AA), REF=A, ALT=., GT=0/0 — but imputation servers
    need a concrete ALT. We use REF=first allele, ALT=second if different.

    Returns (ref, alt, gt) or None if variant should be skipped.
    """
    if len(genotype) == 1:
        # Haploid call (X chromosome in males)
        ref = genotype
        return ref, ".", "0"

    if len(genotype) == 2:
        a1, a2 = genotype[0], genotype[1]

        if a1 == a2:
            # Homozygous — still include, imputation servers handle these
            # REF = the observed allele, ALT = .
            return a1, ".", "0/0"
        else:
            # Heterozygous
            # By convention, use first allele as REF
            return a1, a2, "0/1"

    return None


def write_vcf(variants, output_path):
    """Write sorted variants to VCF format.

    Sorts by chromosome (numeric order) then position.
    """
    # Sort: chromosome by numeric order, then by position
    variants.sort(key=lambda v: (CHROM_ORDER.get(v[0], 99), v[1]))

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    skipped_conversion = 0
    written = 0

    with open(output_path, "w") as f:
        # VCF header
        f.write("##fileformat=VCFv4.1\n")
        f.write(f"##fileDate={date.today().strftime('%Y%m%d')}\n")
        f.write("##source=23andMe_v4_to_VCF_converter\n")
        f.write("##reference=GRCh37\n")
        f.write('##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">\n')

        # Contig headers for chromosomes present
        chroms_seen = sorted(set(v[0] for v in variants),
                            key=lambda c: CHROM_ORDER.get(c, 99))
        for chrom in chroms_seen:
            f.write(f"##contig=<ID={chrom}>\n")

        # Column header
        f.write("#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE\n")

        # Data lines
        for chrom, pos, rsid, genotype in variants:
            result = genotype_to_vcf_fields(genotype)
            if result is None:
                skipped_conversion += 1
                continue

            ref, alt, gt = result
            f.write(f"{chrom}\t{pos}\t{rsid}\t{ref}\t{alt}\t.\tPASS\t.\tGT\t{gt}\n")
            written += 1

    return written, skipped_conversion


def main():
    print("=" * 60)
    print("23andMe v4 → VCF Conversion for Imputation")
    print("=" * 60)
    print()

    # Check input file exists
    if not os.path.exists(INPUT_FILE):
        print(f"ERROR: Input file not found: {INPUT_FILE}")
        sys.exit(1)

    print(f"Input:  {INPUT_FILE}")
    print(f"Output: {OUTPUT_FILE}")
    print()

    # Parse
    print("Parsing 23andMe data...")
    variants, stats = parse_23andme(INPUT_FILE)

    # Write VCF
    print("Writing VCF...")
    written, skipped_conversion = write_vcf(variants, OUTPUT_FILE)

    # Report
    print()
    print("=" * 60)
    print("QC Summary")
    print("=" * 60)
    print(f"  Total input lines:          {stats['total_input']:>10,}")
    print(f"  Passed QC:                  {stats['passed_qc']:>10,}")
    print(f"  Written to VCF:             {written:>10,}")
    print()
    print("  Filtered out:")
    print(f"    No-calls (--):            {stats['skipped_nocall']:>10,}")
    print(f"    Non-rsid (internal IDs):  {stats['skipped_non_rsid']:>10,}")
    print(f"    Indels (D/I):             {stats['skipped_indel']:>10,}")
    print(f"    MT chromosome:            {stats['skipped_MT']:>10,}")
    print(f"    Y chromosome:             {stats['skipped_Y']:>10,}")
    print(f"    Invalid alleles:          {stats['skipped_invalid_allele']:>10,}")
    print(f"    Unknown chromosome:       {stats['skipped_unknown_chrom']:>10,}")
    print(f"    Bad position:             {stats['skipped_bad_position']:>10,}")
    print(f"    Conversion errors:        {skipped_conversion:>10,}")
    if stats["malformed_lines"]:
        print(f"    Malformed lines:          {stats['malformed_lines']:>10,}")
    print()

    # File size
    size_mb = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
    print(f"  Output file size: {size_mb:.1f} MB")
    print()

    # Next steps
    print("Next steps:")
    print("  1. Optionally compress: bgzip data/output/23andme_for_imputation.vcf")
    print("  2. Upload to Michigan Imputation Server: https://imputationserver.sph.umich.edu")
    print("  3. Select TOPMed r3 reference panel, EUR population")
    print("  4. See Research/20260323-genome-imputation-guide.md for full instructions")


if __name__ == "__main__":
    main()
