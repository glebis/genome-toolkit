"""GRCh38 -> GRCh37 liftover using pyliftover with cached chain file."""
from __future__ import annotations

import urllib.request
from pathlib import Path

_CHAIN_URL = "https://hgdownload.cse.ucsc.edu/goldenPath/hg38/liftOver/hg38ToHg19.over.chain.gz"
_CACHE_DIR = Path.home() / ".cache" / "genome-toolkit"
_CHAIN_FILE = _CACHE_DIR / "hg38ToHg19.over.chain.gz"

_lo = None  # module-level cache of the LiftOver instance


def _get_liftover():
    """Return a cached LiftOver instance, downloading chain file on first use."""
    global _lo
    if _lo is not None:
        return _lo

    from pyliftover import LiftOver  # type: ignore

    if not _CHAIN_FILE.exists():
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        print(f"Downloading liftover chain file to {_CHAIN_FILE} ...")
        urllib.request.urlretrieve(_CHAIN_URL, _CHAIN_FILE)

    _lo = LiftOver(str(_CHAIN_FILE))
    return _lo


def lift_grch38_to_grch37(chrom: str, pos: int) -> int | None:
    """Lift a GRCh38 position to GRCh37.

    Args:
        chrom: Chromosome without 'chr' prefix (e.g. "1", "X").
        pos:   1-based position in GRCh38.

    Returns:
        1-based position in GRCh37, or None if the position is unmappable.
    """
    lo = _get_liftover()
    # pyliftover uses 0-based coordinates internally
    result = lo.convert_coordinate(f"chr{chrom}", pos - 1)
    if not result:
        return None
    # result is a list of (chrom, pos, strand, score) tuples; take first hit
    lifted_pos_0based = result[0][1]
    return lifted_pos_0based + 1  # back to 1-based
