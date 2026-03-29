"""Tests for gzip support in DTC parsers (Task 5)."""
import gzip
import shutil
import pytest
from pathlib import Path

from lib.providers.twentythree import TwentyThreeAndMe
from lib.providers.ancestry import AncestryDNA
from lib.providers.myheritage import MyHeritage
from lib.providers.base import detect_provider, read_header_lines


FIXTURES = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture
def gzipped_23andme(tmp_path):
    """Create a gzipped version of the 23andMe fixture."""
    src = FIXTURES / "23andme_v4_sample.txt"
    dst = tmp_path / "23andme_v4_sample.txt.gz"
    with open(src, "rb") as f_in, gzip.open(dst, "wb") as f_out:
        shutil.copyfileobj(f_in, f_out)
    return dst


@pytest.fixture
def gzipped_ancestry(tmp_path):
    src = FIXTURES / "ancestry_sample.txt"
    dst = tmp_path / "ancestry_sample.txt.gz"
    with open(src, "rb") as f_in, gzip.open(dst, "wb") as f_out:
        shutil.copyfileobj(f_in, f_out)
    return dst


@pytest.fixture
def gzipped_myheritage(tmp_path):
    src = FIXTURES / "myheritage_sample.csv"
    dst = tmp_path / "myheritage_sample.csv.gz"
    with open(src, "rb") as f_in, gzip.open(dst, "wb") as f_out:
        shutil.copyfileobj(f_in, f_out)
    return dst


class TestGzipDetection:
    """Gzipped files should be auto-detected correctly."""

    def test_detect_23andme_gz(self, gzipped_23andme):
        header = read_header_lines(gzipped_23andme)
        confidence = TwentyThreeAndMe.detect(gzipped_23andme, header)
        assert confidence >= 0.9

    def test_detect_ancestry_gz(self, gzipped_ancestry):
        header = read_header_lines(gzipped_ancestry)
        confidence = AncestryDNA.detect(gzipped_ancestry, header)
        assert confidence >= 0.9

    def test_detect_myheritage_gz(self, gzipped_myheritage):
        header = read_header_lines(gzipped_myheritage)
        confidence = MyHeritage.detect(gzipped_myheritage, header)
        assert confidence >= 0.9

    def test_auto_detect_23andme_gz(self, gzipped_23andme):
        provider_cls, _ = detect_provider(gzipped_23andme)
        assert provider_cls == TwentyThreeAndMe


class TestGzipParsing:
    """Gzipped files should parse identically to plaintext."""

    def test_23andme_gz_parse(self, gzipped_23andme):
        provider = TwentyThreeAndMe()
        records, stats = provider.parse(gzipped_23andme)
        records = list(records)

        # Compare with plaintext parse
        provider2 = TwentyThreeAndMe()
        records2, stats2 = provider2.parse(FIXTURES / "23andme_v4_sample.txt")
        records2 = list(records2)

        assert stats.total_input == stats2.total_input
        assert stats.passed_qc == stats2.passed_qc
        assert len(records) == len(records2)

    def test_ancestry_gz_parse(self, gzipped_ancestry):
        provider = AncestryDNA()
        records, stats = provider.parse(gzipped_ancestry)
        records = list(records)

        provider2 = AncestryDNA()
        records2, _ = provider2.parse(FIXTURES / "ancestry_sample.txt")
        records2 = list(records2)

        assert len(records) == len(records2)

    def test_myheritage_gz_parse(self, gzipped_myheritage):
        provider = MyHeritage()
        records, stats = provider.parse(gzipped_myheritage)
        records = list(records)

        provider2 = MyHeritage()
        records2, _ = provider2.parse(FIXTURES / "myheritage_sample.csv")
        records2 = list(records2)

        assert len(records) == len(records2)

    def test_23andme_gz_same_genotypes(self, gzipped_23andme):
        """Verify genotype data is identical between gz and plaintext."""
        provider = TwentyThreeAndMe()
        gz_records, _ = provider.parse(gzipped_23andme)
        gz_map = {r.source_id: r.genotype for r in gz_records}

        provider2 = TwentyThreeAndMe()
        plain_records, _ = provider2.parse(FIXTURES / "23andme_v4_sample.txt")
        plain_map = {r.source_id: r.genotype for r in plain_records}

        assert gz_map == plain_map
