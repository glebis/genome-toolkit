"""Unit tests for GWAS effect-allele counting (audit findings #11 and #12).

These exercise the pure helpers in backend.app.routes.gwas directly, with no
database — covering strand orientation, palindromic-SNP skipping, and the
per-trait effect-allele counting on pleiotropic overlap entries.
"""
from backend.app.routes.gwas import _count_effect_alleles, _count_traits_per_entry


# ---------------------------------------------------------------------------
# #11 — strand/orientation aware allele counting
# ---------------------------------------------------------------------------

def test_direct_match_homozygous_het_zero():
    # effect=A, other=G — direct (same-strand) matches
    assert _count_effect_alleles("AA", "A", "G") == 2  # hom effect
    assert _count_effect_alleles("AG", "A", "G") == 1  # het
    assert _count_effect_alleles("GG", "A", "G") == 0  # hom other
    assert _count_effect_alleles("G/A", "A", "G") == 1  # separators tolerated


def test_complement_strand_match_unambiguous():
    # Genotype reported on opposite strand: T/C is the complement of A/G.
    # effect=A, other=G -> complement maps T->A, C->G.
    assert _count_effect_alleles("TT", "A", "G") == 2  # complement hom effect
    assert _count_effect_alleles("TC", "A", "G") == 1  # complement het
    assert _count_effect_alleles("CC", "A", "G") == 0  # complement hom other


def test_palindromic_at_returns_none():
    # A/T is palindromic (its own complement) -> unorientable -> None
    assert _count_effect_alleles("AT", "A", "T") is None
    assert _count_effect_alleles("AA", "A", "T") is None
    assert _count_effect_alleles("TT", "A", "T") is None


def test_palindromic_cg_returns_none():
    # C/G is palindromic -> None
    assert _count_effect_alleles("CG", "C", "G") is None
    assert _count_effect_alleles("CC", "C", "G") is None
    assert _count_effect_alleles("GG", "C", "G") is None


def test_unorientable_genotype_returns_none():
    # Genotype alleles match neither {effect,other} directly nor by complement.
    # effect=A, other=G ({A,G}, complement {T,C}); genotype "AC" mixes an in-set
    # base (A) with an out-of-set one (C), and its complement "TG" also fails ->
    # unresolvable -> None.
    assert _count_effect_alleles("AC", "A", "G") is None


def test_backward_compatible_without_other_allele():
    # With no other_allele context, behaves as a plain letter count (legacy).
    assert _count_effect_alleles("AG", "A") == 1
    assert _count_effect_alleles("AA", "A") == 2
    assert _count_effect_alleles("GG", "A") == 0
    assert _count_effect_alleles(None, "A") is None
    assert _count_effect_alleles("AGT", "A") is None


# ---------------------------------------------------------------------------
# #12 — per-trait effect-allele counting on pleiotropic SNPs
# ---------------------------------------------------------------------------

def test_per_trait_counts_use_each_traits_effect_allele():
    # Same user genotype "AG"; two traits with *opposite* effect alleles.
    traits_list = [
        {"trait": "depression", "effect_allele": "A", "other_allele": "G"},
        {"trait": "bipolar", "effect_allele": "G", "other_allele": "A"},
    ]
    counted = _count_traits_per_entry("AG", traits_list)

    by_trait = {t["trait"]: t["effect_allele_count"] for t in counted}
    assert by_trait["depression"] == 1  # one copy of A
    assert by_trait["bipolar"] == 1  # one copy of G
    # Original metadata preserved
    assert counted[0]["effect_allele"] == "A"
    assert counted[1]["effect_allele"] == "G"


def test_per_trait_counts_differ_when_effect_alleles_differ():
    # Genotype hom "AA": effect=A trait -> 2, effect=G trait -> 0.
    traits_list = [
        {"trait": "t1", "effect_allele": "A", "other_allele": "G"},
        {"trait": "t2", "effect_allele": "G", "other_allele": "A"},
    ]
    counted = _count_traits_per_entry("AA", traits_list)
    by_trait = {t["trait"]: t["effect_allele_count"] for t in counted}
    assert by_trait["t1"] == 2
    assert by_trait["t2"] == 0


def test_per_trait_palindromic_is_none_only_for_that_trait():
    # One palindromic trait (A/T) -> None; the other (A/G) still counts.
    traits_list = [
        {"trait": "palin", "effect_allele": "A", "other_allele": "T"},
        {"trait": "ok", "effect_allele": "A", "other_allele": "G"},
    ]
    counted = _count_traits_per_entry("AG", traits_list)
    by_trait = {t["trait"]: t["effect_allele_count"] for t in counted}
    assert by_trait["palin"] is None
    assert by_trait["ok"] == 1
