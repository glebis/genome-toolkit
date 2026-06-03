"""Strand/palindrome-safe effect-allele counting.

Single source of truth shared by:
- ``backend/app/routes/gwas.py``
- ``backend/app/routes/gwas_analytics.py``
- ``scripts/analytics/prs_calculator.py``

A naive ``allele == effect_allele`` count silently miscounts whenever the
genotype is reported on the opposite DNA strand, and it cannot detect
palindromic (A/T, C/G) SNPs, which are un-orientable from genotype alone.
This module centralises the safe logic so the analytics paths can never
drift apart again (GPT-5.5 Pro validation finding #16).
"""
from __future__ import annotations

_COMPLEMENT = str.maketrans("ACGT", "TGCA")
_PALINDROMIC = {frozenset(("A", "T")), frozenset(("C", "G"))}


def count_effect_alleles(
    genotype: str | None,
    effect_allele: str | None,
    other_allele: str | None = None,
) -> int | None:
    """Count copies of the effect allele in a diploid genotype like 'AG' or 'A/G'.

    When ``other_allele`` is supplied, the genotype is validated against the
    {effect, other} allele pair so it can be oriented to the reference strand:

    * If the genotype alleles already fall within {effect, other}, count directly.
    * Otherwise try the complement strand; count only if it then matches.
    * Palindromic SNPs (A/T, C/G) are their own complement and therefore
      un-orientable from genotype alone — return ``None``.
    * Genotypes matching neither orientation are unresolvable — return ``None``.

    When ``other_allele`` is *not* supplied (e.g. PRS weight tables that only
    carry an effect allele), strand orientation and palindrome detection are
    impossible, so we fall back to a plain in-genotype count for valid SNP
    calls. Callers that have richer data (an other_allele) should always pass
    it so ambiguous SNPs can be excluded.

    Returns ``None`` when the call can't be determined (missing data, indel,
    strand-ambiguous, or unorientable).
    """
    if not genotype or not effect_allele:
        return None

    # Normalise: strip separators, uppercase.
    g = genotype.replace("/", "").replace("|", "").upper()
    ea = effect_allele.upper()

    # Only handle biallelic SNP-level calls.
    if len(g) != 2 or len(ea) != 1:
        return None

    oa = other_allele.upper() if other_allele else None
    if oa is not None and len(oa) != 1:
        return None

    if oa:
        expected = {ea, oa}
        # Palindromic SNPs are un-orientable from genotype alone.
        if frozenset(expected) in _PALINDROMIC:
            return None

        if set(g) <= expected:
            return sum(1 for base in g if base == ea)

        comp = g.translate(_COMPLEMENT)
        if set(comp) <= expected:
            return sum(1 for base in comp if base == ea)

        # Matches neither orientation — unresolvable.
        return None

    # No other_allele context: plain count (strand/palindrome cannot be checked).
    return sum(1 for base in g if base == ea)
