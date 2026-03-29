"""23andMe v4/v5 raw data parser."""
from __future__ import annotations

import gzip
from pathlib import Path
from typing import Iterator

from .base import GenomeProvider, ProviderMetadata, QcStats, SnpRecord

VALID_ALLELES = set("ACGT")
VALID_CHROMS = {str(i) for i in range(1, 23)} | {"X", "Y", "MT"}
AUTOSOMAL_CHROMS = {str(i) for i in range(1, 23)} | {"X"}


class TwentyThreeAndMe(GenomeProvider):
    """Parser for 23andMe v4 and v5 raw data files."""

    @classmethod
    def detect(cls, filepath: Path, header_lines: list[str]) -> float:
        """Detect 23andMe format from header lines."""
        has_23andme_comment = False
        has_correct_header = False

        for line in header_lines:
            lower = line.lower()
            if "23andme" in lower:
                has_23andme_comment = True
            # Data header (non-comment line with 4 tab-separated fields)
            if not line.startswith("#") and "\t" in line:
                parts = line.split("\t")
                if len(parts) == 4:
                    # Check if first field looks like rsid/internal ID
                    if parts[0].startswith("rs") or parts[0].startswith("i"):
                        has_correct_header = True

        if has_23andme_comment and has_correct_header:
            return 0.95
        if has_23andme_comment:
            return 0.7
        if has_correct_header:
            # Could be 23andMe but no explicit marker
            return 0.3
        return 0.0

    def metadata(self, filepath: Path, header_lines: list[str]) -> ProviderMetadata:
        """Extract 23andMe metadata."""
        # Version detection: count non-comment lines to estimate chip version
        # v4: ~600K SNPs, v5: ~630K SNPs
        # We can't count all lines from headers alone, so mark as "unknown" initially
        version = "unknown"
        for line in header_lines:
            if "v5" in line.lower():
                version = "v5"
                break
            if "v4" in line.lower():
                version = "v4"
                break

        return ProviderMetadata(
            provider="23andme",
            provider_version=version,
            assembly="GRCh37",
            file_path=str(filepath),
        )

    def parse(self, filepath: Path) -> tuple[Iterator[SnpRecord], QcStats]:
        """Parse 23andMe raw data file."""
        stats = QcStats()
        records = list(self._parse_iter(filepath, stats))
        return iter(records), stats

    @staticmethod
    def _open_file(filepath: Path):
        """Open file, handling gzip transparently."""
        if str(filepath).endswith(".gz"):
            return gzip.open(filepath, "rt")
        return open(filepath, "r")

    def _parse_iter(self, filepath: Path, stats: QcStats) -> Iterator[SnpRecord]:
        """Internal parser yielding SnpRecord objects."""
        with self._open_file(filepath) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue

                parts = line.split("\t")
                if len(parts) != 4:
                    stats.malformed_lines += 1
                    continue

                snp_id, chrom, pos_str, genotype = parts
                stats.total_input += 1

                # Skip no-calls
                if genotype == "--" or not genotype:
                    stats.no_calls += 1
                    continue

                # Skip non-rsid variants
                is_rsid = snp_id.startswith("rs")
                if not is_rsid:
                    stats.non_rsid += 1
                    # Still include internal IDs but flag them
                    # They can be useful for region-based lookup

                # Skip indels
                if "D" in genotype or "I" in genotype:
                    stats.indels += 1
                    continue

                # Validate alleles
                if not all(a in VALID_ALLELES for a in genotype):
                    stats.invalid_alleles += 1
                    continue

                # Skip unknown chromosomes
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
                    source_id=snp_id,
                    chromosome=chrom,
                    position=pos,
                    genotype=genotype,
                    is_rsid=is_rsid,
                )
