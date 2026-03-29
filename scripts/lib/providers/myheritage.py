"""MyHeritage raw data parser."""
from __future__ import annotations

import csv
import gzip
from pathlib import Path
from typing import Iterator

from .base import GenomeProvider, ProviderMetadata, QcStats, SnpRecord

VALID_ALLELES = set("ACGT")
VALID_CHROMS = {str(i) for i in range(1, 23)} | {"X", "Y", "MT"}


class MyHeritage(GenomeProvider):
    """Parser for MyHeritage DNA raw data files.

    MyHeritage exports as CSV with columns: RSID, CHROMOSOME, POSITION, RESULT.
    The RESULT field contains the two-character genotype (e.g., "AG").
    Some files use tab delimiter instead of comma.
    """

    @classmethod
    def detect(cls, filepath: Path, header_lines: list[str]) -> float:
        """Detect MyHeritage format."""
        has_myheritage_comment = False
        has_csv_header = False

        for line in header_lines:
            lower = line.lower()
            if "myheritage" in lower:
                has_myheritage_comment = True
            # Check for CSV header pattern
            if "rsid" in lower and "result" in lower:
                if "," in line or "\t" in line:
                    has_csv_header = True

        if has_myheritage_comment and has_csv_header:
            return 0.95
        if has_myheritage_comment:
            return 0.6
        if has_csv_header:
            return 0.3
        return 0.0

    def metadata(self, filepath: Path, header_lines: list[str]) -> ProviderMetadata:
        return ProviderMetadata(
            provider="myheritage",
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
        # Detect delimiter
        with self._open_file(filepath) as f:
            first_data_line = ""
            for line in f:
                if not line.startswith("#") and line.strip():
                    first_data_line = line
                    break
        delimiter = "," if "," in first_data_line else "\t"

        with self._open_file(filepath) as f:
            # Skip comment lines
            lines = (line for line in f if not line.startswith("#"))
            reader = csv.DictReader(lines, delimiter=delimiter)

            for row in reader:
                stats.total_input += 1

                # Normalize column names (MyHeritage uses uppercase)
                rsid = row.get("RSID") or row.get("rsid", "")
                chrom = row.get("CHROMOSOME") or row.get("chromosome", "")
                pos_str = row.get("POSITION") or row.get("position", "")
                genotype = row.get("RESULT") or row.get("result", "")

                if not rsid or not genotype:
                    stats.malformed_lines += 1
                    continue

                # Skip no-calls
                if genotype == "--" or not genotype.strip():
                    stats.no_calls += 1
                    continue

                is_rsid = rsid.startswith("rs")
                if not is_rsid:
                    stats.non_rsid += 1

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
