"""AncestryDNA raw data parser."""
from __future__ import annotations

import gzip
from pathlib import Path
from typing import Iterator

from .base import GenomeProvider, ProviderMetadata, QcStats, SnpRecord

VALID_ALLELES = set("ACGT")
VALID_CHROMS = {str(i) for i in range(1, 23)} | {"X", "Y", "MT"}


class AncestryDNA(GenomeProvider):
    """Parser for AncestryDNA raw data files.

    AncestryDNA exports use 5 columns: rsid, chromosome, position, allele1, allele2.
    Alleles are reported separately (not concatenated like 23andMe).
    """

    @classmethod
    def detect(cls, filepath: Path, header_lines: list[str]) -> float:
        """Detect AncestryDNA format."""
        has_ancestry_comment = False
        has_5col_header = False

        for line in header_lines:
            lower = line.lower()
            if "ancestrydna" in lower or "ancestry" in lower:
                has_ancestry_comment = True
            if not line.startswith("#"):
                parts = line.split("\t")
                if len(parts) == 5:
                    # Check column pattern: rsid + chrom + pos + single allele + single allele
                    if parts[0].startswith("rs") and len(parts[3]) <= 2 and len(parts[4]) <= 2:
                        has_5col_header = True

        if has_ancestry_comment and has_5col_header:
            return 0.95
        if has_ancestry_comment:
            return 0.6
        if has_5col_header:
            return 0.4
        return 0.0

    def metadata(self, filepath: Path, header_lines: list[str]) -> ProviderMetadata:
        return ProviderMetadata(
            provider="ancestry",
            provider_version="unknown",
            assembly="GRCh37",
            file_path=str(filepath),
        )

    def parse(self, filepath: Path) -> tuple[Iterator[SnpRecord], QcStats]:
        stats = QcStats()
        records = list(self._parse_iter(filepath, stats))
        return iter(records), stats

    @staticmethod
    def _open_file(filepath: Path):
        if str(filepath).endswith(".gz"):
            return gzip.open(filepath, "rt")
        return open(filepath, "r")

    def _parse_iter(self, filepath: Path, stats: QcStats) -> Iterator[SnpRecord]:
        with self._open_file(filepath) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue

                parts = line.split("\t")
                if len(parts) != 5:
                    stats.malformed_lines += 1
                    continue

                rsid, chrom, pos_str, allele1, allele2 = parts
                stats.total_input += 1

                # Skip header row
                if rsid.lower() == "rsid":
                    continue

                # Skip no-calls (AncestryDNA uses "0" for no-call)
                if allele1 == "0" or allele2 == "0":
                    stats.no_calls += 1
                    continue

                is_rsid = rsid.startswith("rs")
                if not is_rsid:
                    stats.non_rsid += 1

                # Concatenate alleles into genotype
                genotype = allele1 + allele2

                # Validate alleles
                if not all(a in VALID_ALLELES for a in genotype):
                    stats.invalid_alleles += 1
                    continue

                if chrom not in VALID_CHROMS:
                    stats.skipped_chrom += 1
                    continue

                try:
                    pos = int(pos_str)
                except ValueError:
                    stats.malformed_lines += 1
                    continue

                stats.passed_qc += 1
                yield SnpRecord(
                    source_id=rsid,
                    chromosome=chrom,
                    position=pos,
                    genotype=genotype,
                    is_rsid=is_rsid,
                )
