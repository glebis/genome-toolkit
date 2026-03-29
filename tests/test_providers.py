"""Tests for genome data provider parsers."""
import pytest
from pathlib import Path

from lib.providers.base import read_header_lines, detect_provider
from lib.providers.twentythree import TwentyThreeAndMe
from lib.providers.ancestry import AncestryDNA
from lib.providers.myheritage import MyHeritage
from lib.providers.vcf import GenericVCF


class TestFormatDetection:
    """Test auto-detection of genome file formats."""

    def test_detect_23andme(self, sample_23andme):
        header = read_header_lines(sample_23andme)
        confidence = TwentyThreeAndMe.detect(sample_23andme, header)
        assert confidence >= 0.9, f"23andMe detection confidence too low: {confidence}"

    def test_detect_ancestry(self, sample_ancestry):
        header = read_header_lines(sample_ancestry)
        confidence = AncestryDNA.detect(sample_ancestry, header)
        assert confidence >= 0.9, f"AncestryDNA detection confidence too low: {confidence}"

    def test_detect_myheritage(self, sample_myheritage):
        header = read_header_lines(sample_myheritage)
        confidence = MyHeritage.detect(sample_myheritage, header)
        assert confidence >= 0.9, f"MyHeritage detection confidence too low: {confidence}"

    def test_detect_vcf(self, sample_vcf):
        header = read_header_lines(sample_vcf)
        confidence = GenericVCF.detect(sample_vcf, header)
        assert confidence >= 0.4, f"VCF detection confidence too low: {confidence}"

    def test_auto_detect_23andme(self, sample_23andme):
        provider_cls, confidence = detect_provider(sample_23andme)
        assert provider_cls == TwentyThreeAndMe
        assert confidence >= 0.9

    def test_auto_detect_ancestry(self, sample_ancestry):
        provider_cls, confidence = detect_provider(sample_ancestry)
        assert provider_cls == AncestryDNA
        assert confidence >= 0.9

    def test_auto_detect_myheritage(self, sample_myheritage):
        provider_cls, confidence = detect_provider(sample_myheritage)
        assert provider_cls == MyHeritage

    def test_auto_detect_vcf(self, sample_vcf):
        provider_cls, confidence = detect_provider(sample_vcf)
        assert provider_cls == GenericVCF

    def test_23andme_not_detected_as_ancestry(self, sample_23andme):
        header = read_header_lines(sample_23andme)
        confidence = AncestryDNA.detect(sample_23andme, header)
        assert confidence < 0.5, "23andMe file should not be detected as AncestryDNA"

    def test_ancestry_not_detected_as_23andme(self, sample_ancestry):
        """AncestryDNA has 5 columns, 23andMe has 4 — should not cross-detect."""
        header = read_header_lines(sample_ancestry)
        # 23andMe detector looks for 4-column data lines
        confidence = TwentyThreeAndMe.detect(sample_ancestry, header)
        # Should be lower than AncestryDNA's own confidence
        ancestry_confidence = AncestryDNA.detect(sample_ancestry, header)
        assert confidence < ancestry_confidence


class TestTwentyThreeAndMe:
    """Test 23andMe v4 parser."""

    def test_parse_basic(self, sample_23andme):
        provider = TwentyThreeAndMe()
        records, stats = provider.parse(sample_23andme)
        records = list(records)

        assert stats.total_input == 20
        assert stats.passed_qc > 0
        assert len(records) == stats.passed_qc

    def test_skips_nocalls(self, sample_23andme):
        provider = TwentyThreeAndMe()
        _, stats = provider.parse(sample_23andme)
        assert stats.no_calls == 1  # rs11260588 has "--"

    def test_counts_non_rsid(self, sample_23andme):
        provider = TwentyThreeAndMe()
        _, stats = provider.parse(sample_23andme)
        assert stats.non_rsid == 1  # i6019299

    def test_record_fields(self, sample_23andme):
        provider = TwentyThreeAndMe()
        records, _ = provider.parse(sample_23andme)
        records = list(records)

        first = records[0]
        assert first.source_id == "rs4477212"
        assert first.chromosome == "1"
        assert first.position == 82154
        assert first.genotype == "AA"
        assert first.is_rsid is True

    def test_metadata(self, sample_23andme):
        provider = TwentyThreeAndMe()
        header = read_header_lines(sample_23andme)
        meta = provider.metadata(sample_23andme, header)
        assert meta.provider == "23andme"
        assert meta.assembly == "GRCh37"


class TestAncestryDNA:
    """Test AncestryDNA parser."""

    def test_parse_basic(self, sample_ancestry):
        provider = AncestryDNA()
        records, stats = provider.parse(sample_ancestry)
        records = list(records)

        assert stats.total_input > 0
        assert stats.passed_qc > 0

    def test_allele_concatenation(self, sample_ancestry):
        """AncestryDNA has allele1 + allele2 — should concatenate."""
        provider = AncestryDNA()
        records, _ = provider.parse(sample_ancestry)
        records = list(records)

        # rs3094315: allele1=A, allele2=G -> genotype=AG
        het = [r for r in records if r.source_id == "rs3094315"]
        assert len(het) == 1
        assert het[0].genotype == "AG"

    def test_skips_nocalls(self, sample_ancestry):
        """AncestryDNA uses "0" for no-calls."""
        provider = AncestryDNA()
        _, stats = provider.parse(sample_ancestry)
        assert stats.no_calls == 1  # rs11260588 has allele "0"


class TestMyHeritage:
    """Test MyHeritage parser."""

    def test_parse_basic(self, sample_myheritage):
        provider = MyHeritage()
        records, stats = provider.parse(sample_myheritage)
        records = list(records)

        assert stats.total_input > 0
        assert stats.passed_qc > 0

    def test_skips_nocalls(self, sample_myheritage):
        provider = MyHeritage()
        _, stats = provider.parse(sample_myheritage)
        assert stats.no_calls == 1  # rs11260588 has "--"

    def test_csv_delimiter_detection(self, sample_myheritage):
        """MyHeritage uses CSV with commas."""
        provider = MyHeritage()
        records, _ = provider.parse(sample_myheritage)
        records = list(records)
        assert len(records) > 0
        assert records[0].source_id == "rs4477212"


class TestGenericVCF:
    """Test VCF parser."""

    def test_parse_basic(self, sample_vcf):
        provider = GenericVCF()
        records, stats = provider.parse(sample_vcf)
        records = list(records)

        assert stats.total_input == 10
        assert stats.passed_qc > 0

    def test_r2_extraction(self, sample_vcf):
        """VCF should extract r² from INFO field."""
        provider = GenericVCF()
        records, _ = provider.parse(sample_vcf)
        records = list(records)

        # rs4477212 has R2=0.95
        first = [r for r in records if r.source_id == "rs4477212"]
        assert len(first) == 1
        assert first[0].quality == pytest.approx(0.95)

    def test_missing_r2(self, sample_vcf):
        """Variant without R2 in INFO should have quality=None."""
        provider = GenericVCF()
        records, _ = provider.parse(sample_vcf)
        records = list(records)

        # rs13302982 has "." in INFO (no R2)
        no_r2 = [r for r in records if r.source_id == "rs13302982"]
        assert len(no_r2) == 1
        assert no_r2[0].quality is None

    def test_genotype_conversion(self, sample_vcf):
        """VCF GT 0/1 with REF=A ALT=G should become AG."""
        provider = GenericVCF()
        records, _ = provider.parse(sample_vcf)
        records = list(records)

        het = [r for r in records if r.source_id == "rs3094315"]
        assert len(het) == 1
        assert het[0].genotype == "AG"

    def test_homozygous_ref(self, sample_vcf):
        """VCF GT 0/0 with REF=A should become AA."""
        provider = GenericVCF()
        records, _ = provider.parse(sample_vcf)
        records = list(records)

        hom = [r for r in records if r.source_id == "rs4477212"]
        assert len(hom) == 1
        assert hom[0].genotype == "AA"

    def test_metadata_assembly(self, sample_vcf):
        provider = GenericVCF()
        header = read_header_lines(sample_vcf)
        meta = provider.metadata(sample_vcf, header)
        assert meta.assembly == "GRCh37"
        assert meta.provider == "vcf"


class TestCrossProviderConsistency:
    """Verify that the same SNPs parse to the same genotypes across providers."""

    def test_rs4477212_consistent(self, sample_23andme, sample_ancestry, sample_myheritage, sample_vcf):
        """rs4477212 should be AA across all providers."""
        results = {}

        for name, path, cls in [
            ("23andme", sample_23andme, TwentyThreeAndMe),
            ("ancestry", sample_ancestry, AncestryDNA),
            ("myheritage", sample_myheritage, MyHeritage),
            ("vcf", sample_vcf, GenericVCF),
        ]:
            provider = cls()
            records, _ = provider.parse(path)
            records = list(records)
            match = [r for r in records if r.source_id == "rs4477212"]
            if match:
                results[name] = match[0].genotype

        # All should agree
        genotypes = set(results.values())
        assert len(genotypes) == 1, f"Inconsistent genotypes for rs4477212: {results}"
        assert "AA" in genotypes

    def test_rs3094315_consistent(self, sample_23andme, sample_ancestry, sample_myheritage, sample_vcf):
        """rs3094315 should be AG across all providers."""
        results = {}

        for name, path, cls in [
            ("23andme", sample_23andme, TwentyThreeAndMe),
            ("ancestry", sample_ancestry, AncestryDNA),
            ("myheritage", sample_myheritage, MyHeritage),
            ("vcf", sample_vcf, GenericVCF),
        ]:
            provider = cls()
            records, _ = provider.parse(path)
            records = list(records)
            match = [r for r in records if r.source_id == "rs3094315"]
            if match:
                results[name] = match[0].genotype

        genotypes = set(results.values())
        assert len(genotypes) == 1, f"Inconsistent genotypes for rs3094315: {results}"
        assert "AG" in genotypes
