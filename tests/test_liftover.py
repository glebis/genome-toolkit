"""Tests for GRCh38->GRCh37 liftover."""
import sys
from pathlib import Path

# Ensure scripts/ is on the path (mirrors conftest.py convention)
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

import pytest
from lib.liftover import lift_grch38_to_grch37


# Known GRCh38 -> GRCh37 mappings verified against UCSC liftOver chain.
KNOWN_MAPPINGS = [
    # (chrom, grch38_pos, expected_grch37_pos)
    ("17", 43071077, 41223094),   # BRCA1 region
    ("7", 117559590, 117199644),  # CFTR region
    ("1", 925952, 861332),        # chr1 stable region
    ("22", 36591380, 36987427),   # chr22 region
]


@pytest.mark.parametrize("chrom,pos38,expected37", KNOWN_MAPPINGS)
def test_lift_known_positions(chrom, pos38, expected37):
    result = lift_grch38_to_grch37(chrom, pos38)
    assert result == expected37, (
        f"chr{chrom}:{pos38} lifted to {result}, expected {expected37}"
    )


def test_lift_returns_int():
    result = lift_grch38_to_grch37("17", 43071077)
    assert isinstance(result, int)


def test_lift_unmappable_returns_none():
    # Position 0 is out of range for any chromosome — should return None.
    result = lift_grch38_to_grch37("1", 0)
    assert result is None


def test_lift_chrom_without_prefix():
    """Chromosome should be supplied without 'chr' prefix."""
    # Same as the BRCA1 test but confirms bare-number input works.
    result = lift_grch38_to_grch37("17", 43071077)
    assert result == 41223094
