"""Generic VCF and Nebula Genomics parser."""
from __future__ import annotations

import gzip
import re
from pathlib import Path
from typing import Iterator

from .base import GenomeProvider, ProviderMetadata, QcStats, SnpRecord, read_header_lines

VALID_ALLELES = set("ACGT")


class GenericVCF(GenomeProvider):
    """Parser for VCF files (generic and Nebula Genomics).

    Handles both standard VCF from imputation servers and DTC VCF exports.
    Supports .vcf and .vcf.gz files.
    """

    @classmethod
    def detect(cls, filepath: Path, header_lines: list[str]) -> float:
        """Detect VCF format."""
        is_vcf = False
        is_nebula = False

        for line in header_lines:
            if line.startswith("##fileformat=VCF"):
                is_vcf = True
            if "nebula" in line.lower():
                is_nebula = True

        if is_nebula and is_vcf:
            return 0.95
        if is_vcf:
            return 0.5  # lower than specific providers to avoid false matches
        if str(filepath).endswith((".vcf", ".vcf.gz")):
            return 0.3
        return 0.0

    def metadata(self, filepath: Path, header_lines: list[str]) -> ProviderMetadata:
        assembly = "unknown"
        provider = "vcf"

        for line in header_lines:
            lower = line.lower()
            # Detect assembly from VCF header
            if "grch37" in lower or "hg19" in lower or "b37" in lower:
                assembly = "GRCh37"
            elif "grch38" in lower or "hg38" in lower or "b38" in lower:
                assembly = "GRCh38"
            # Detect Nebula
            if "nebula" in lower:
                provider = "nebula"

        return ProviderMetadata(
            provider=provider,
            provider_version="unknown",
            assembly=assembly,
            file_path=str(filepath),
        )

    def parse(self, filepath: Path) -> tuple[Iterator[SnpRecord], QcStats]:
        stats = QcStats()
        header_lines = read_header_lines(filepath)
        meta = self.metadata(filepath, header_lines)
        records = list(self._parse_iter(filepath, stats, assembly=meta.assembly))
        return iter(records), stats

    def _open_vcf(self, filepath: Path):
        """Open VCF file, handling gzip transparently."""
        if str(filepath).endswith(".gz"):
            return gzip.open(filepath, "rt")
        return open(filepath, "r")

    def _extract_r2(self, info_field: str) -> float | None:
        """Extract imputation r² from VCF INFO field."""
        for pattern in [r"R2=([\d.]+)", r"DR2=([\d.]+)", r"AR2=([\d.]+)"]:
            m = re.search(pattern, info_field)
            if m:
                try:
                    return float(m.group(1))
                except ValueError:
                    return None
        return None

    def _parse_iter(
        self, filepath: Path, stats: QcStats, assembly: str = "unknown"
    ) -> Iterator[SnpRecord]:
        do_liftover = assembly == "GRCh38"
        if do_liftover:
            from lib.liftover import lift_grch38_to_grch37

        with self._open_vcf(filepath) as f:
            for line in f:
                if line.startswith("#"):
                    continue

                parts = line.strip().split("\t")
                if len(parts) < 10:
                    stats.malformed_lines += 1
                    continue

                chrom = parts[0].replace("chr", "")  # Normalize chr1 -> 1
                pos_str = parts[1]
                rsid = parts[2]
                ref = parts[3]
                alt = parts[4]
                filt = parts[6]
                info = parts[7]
                format_field = parts[8]
                sample = parts[9]  # First sample only

                stats.total_input += 1

                # Skip hard-filtered sites
                if filt not in ("PASS", ".", ""):
                    stats.details["filtered_sites"] = stats.details.get("filtered_sites", 0) + 1
                    continue

                # Skip multiallelic
                if "," in alt:
                    stats.multiallelic += 1
                    continue

                is_rsid = rsid.startswith("rs")
                if not is_rsid:
                    stats.non_rsid += 1

                # Extract r² quality
                r2 = self._extract_r2(info)

                # Parse genotype
                format_keys = format_field.split(":")
                sample_values = sample.split(":")
                gt_idx = format_keys.index("GT") if "GT" in format_keys else 0
                gt_raw = sample_values[gt_idx] if gt_idx < len(sample_values) else None

                if not gt_raw or gt_raw == "./.":
                    stats.no_calls += 1
                    continue

                # Convert GT to genotype
                gt_parts = re.split(r"[/|]", gt_raw)
                alleles = [ref] + alt.split(",")

                try:
                    indices = [int(p) for p in gt_parts if p != "."]
                except ValueError:
                    stats.malformed_lines += 1
                    continue

                if not indices:
                    stats.no_calls += 1
                    continue

                gt_alleles = []
                valid = True
                for idx in indices:
                    if idx < len(alleles):
                        gt_alleles.append(alleles[idx])
                    else:
                        valid = False
                        break

                if not valid:
                    stats.malformed_lines += 1
                    continue

                gt_alleles.sort()
                genotype = "".join(gt_alleles)

                # Validate alleles
                if not all(a in VALID_ALLELES for a in genotype):
                    stats.invalid_alleles += 1
                    continue

                try:
                    pos = int(pos_str)
                except ValueError:
                    stats.malformed_lines += 1
                    continue

                if do_liftover:
                    lifted = lift_grch38_to_grch37(chrom, pos)
                    if lifted is None:
                        stats.details["liftover_failed"] = (
                            stats.details.get("liftover_failed", 0) + 1
                        )
                        continue
                    pos = lifted

                stats.passed_qc += 1
                yield SnpRecord(
                    source_id=rsid,
                    chromosome=chrom,
                    position=pos,
                    genotype=genotype,
                    is_rsid=is_rsid,
                    ref=ref,
                    alt=alt if alt != "." else None,
                    quality=r2,
                )
