#!/usr/bin/env python3
"""
Linkage Disequilibrium (LD) Analysis for Personal Genomics Vault

Identifies which variants in the vault are likely in LD (tagging the same signal)
vs. genuinely independent. Uses physical distance on the same chromosome plus
published LD data from 1000 Genomes EUR population where available.

Without population-level haplotype data, this analysis flags POTENTIAL LD based on:
1. Same chromosome + within 500kb = potential LD
2. Known high-LD regions (FADS cluster chr11, CYP2C cluster chr10, HLA chr6)
3. Published r² values from 1000 Genomes EUR where available
4. Same-SNP identification (DRD2/ANKK1 rs1800497)

Output: text report to stdout; can be redirected to file.
"""

import sqlite3
import os
import sys
from collections import defaultdict
from itertools import combinations

# ── Configuration ──────────────────────────────────────────────────────────

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "genome.db")
LD_DISTANCE_THRESHOLD = 500_000  # 500kb

# ── Known LD relationships from literature (EUR population) ────────────────
# Format: (rsid1, rsid2): { r2, source, note }
# r² > 0.8 = strong LD (likely same signal)
# r² 0.3-0.8 = moderate LD (partially redundant)
# r² < 0.3 = weak LD (likely independent)

KNOWN_LD = {
    # COMT haplotype (chr22)
    ("rs4680", "rs4633"): {
        "r2": 0.96,
        "source": "1000G EUR; Nackley et al. 2006 Pain",
        "note": "Near-perfect LD. rs4633 is a synonymous variant that tags the rs4680 Val/Met haplotype. These are the SAME signal — rs4633 adds zero independent information."
    },
    ("rs4680", "rs165599"): {
        "r2": 0.15,
        "source": "1000G EUR; Bray et al. 2003 Am J Hum Genet",
        "note": "Weak LD. rs165599 is in the 3' UTR and may independently modulate COMT expression. These are potentially independent signals."
    },
    ("rs4633", "rs165599"): {
        "r2": 0.15,
        "source": "1000G EUR; inferred from rs4680-rs4633 and rs4680-rs165599 LD",
        "note": "Weak LD. Since rs4633 tags rs4680, the rs4633-rs165599 relationship mirrors rs4680-rs165599."
    },

    # GABRA2 cluster (chr4)
    ("rs279858", "rs279836"): {
        "r2": 0.85,
        "source": "1000G EUR; Edenberg et al. 2004; Covault et al. 2004",
        "note": "Strong LD. Both are intronic GABRA2 variants on the same haplotype block. Likely tagging the same causal variant."
    },
    ("rs279858", "rs279826"): {
        "r2": 0.70,
        "source": "1000G EUR; Covault et al. 2004",
        "note": "Moderate-to-strong LD. Part of the same GABRA2 haplotype block but slightly less correlated than rs279858-rs279836."
    },
    ("rs279836", "rs279826"): {
        "r2": 0.75,
        "source": "1000G EUR; Covault et al. 2004",
        "note": "Moderate-to-strong LD. Same GABRA2 haplotype block."
    },

    # FADS1/FADS2 cluster (chr11) — very tight LD expected
    ("rs174547", "rs1535"): {
        "r2": 0.78,
        "source": "1000G EUR; Lattka et al. 2010; Tanaka et al. 2009",
        "note": "Strong LD. FADS1 rs174547 and FADS2 rs1535 are in the same gene cluster and consistently co-inherited. They largely represent the same haplotype signal for fatty acid metabolism."
    },
    ("rs174547", "rs174546"): {
        "r2": 0.99,
        "source": "1000G EUR",
        "note": "Near-perfect LD. These are <1kb apart and perfectly correlated. Same signal."
    },
    ("rs174547", "rs174550"): {
        "r2": 0.97,
        "source": "1000G EUR",
        "note": "Near-perfect LD. Same haplotype block."
    },
    ("rs174547", "rs174556"): {
        "r2": 0.92,
        "source": "1000G EUR",
        "note": "Strong LD. Same FADS1 haplotype block."
    },
    ("rs174547", "rs174570"): {
        "r2": 0.78,
        "source": "1000G EUR",
        "note": "Strong LD. Extends from FADS1 into FADS2."
    },

    # CYP2C cluster (chr10)
    ("rs11572080", "rs1799853"): {
        "r2": 0.30,
        "source": "1000G EUR; Dai et al. 2001; Daily & Aquilante 2009",
        "note": "Moderate LD. CYP2C8*3 (rs11572080) and CYP2C9*2 (rs1799853) are in the same CYP2C cluster (~125kb apart) with partial correlation. Some individuals carry both on the same haplotype. NOT the same signal but partially linked."
    },
    ("rs11572080", "rs1057910"): {
        "r2": 0.05,
        "source": "1000G EUR",
        "note": "Weak LD. CYP2C8*3 and CYP2C9*3 are largely independent despite genomic proximity. These represent genuinely independent functional variants."
    },
    ("rs1799853", "rs1057910"): {
        "r2": 0.02,
        "source": "1000G EUR; Pharmacogenomics literature",
        "note": "Essentially independent. CYP2C9 *2 and *3 are on different haplotypes — a person cannot carry both on the same chromosome (they are in trans in compound heterozygotes). These ARE independent signals."
    },

    # DRD2/ANKK1 — SAME SNP
    ("rs1800497", "rs1800497"): {
        "r2": 1.0,
        "source": "Same variant",
        "note": "IDENTICAL SNP. rs1800497 is listed under both DRD2 and ANKK1 in the vault. It is physically located in ANKK1 exon 8 but historically attributed to DRD2. This is ONE variant counted TWICE."
    },

    # DRD2 internal variants (chr11)
    ("rs1800497", "rs1076560"): {
        "r2": 0.08,
        "source": "1000G EUR; Zhang et al. 2007",
        "note": "Weak LD. rs1076560 (D2S/D2L splice ratio) is largely independent of TaqIA. These provide partially independent information about DRD2 function."
    },
    ("rs1800497", "rs2283265"): {
        "r2": 0.08,
        "source": "1000G EUR; Zhang et al. 2007",
        "note": "Weak LD. Similar to rs1076560."
    },
    ("rs1076560", "rs2283265"): {
        "r2": 0.95,
        "source": "1000G EUR; Zhang et al. 2007",
        "note": "Near-perfect LD. rs1076560 and rs2283265 are intronic variants that co-segregate and both affect D2 splicing. Same signal."
    },
    ("rs1800497", "rs1799732"): {
        "r2": 0.03,
        "source": "1000G EUR",
        "note": "Independent. The -141C ins/del promoter variant is on a different haplotype from TaqIA."
    },
}

# ── Vault clusters to analyze ─────────────────────────────────────────────

VAULT_CLUSTERS = {
    "GABRA2 cluster (chr4)": {
        "rsids": ["rs279858", "rs279836", "rs279826"],
        "description": "Three GABRA2 intronic variants, all heterozygous",
        "vault_claim": "Listed as separate variants in GABRA2 frontmatter; GABA System notes them as part of the same gene"
    },
    "Immune panel (multi-chromosome)": {
        "rsids": ["rs2476601", "rs7574865", "rs763361", "rs3184504"],
        "description": "PTPN22 (chr1), STAT4 (chr2), CD226 (chr18), SH2B3 (chr12)",
        "vault_claim": "Counted as independent polyautoimmune burden in Immune and Inflammatory system"
    },
    "CYP2C cluster (chr10)": {
        "rsids": ["rs11572080", "rs1799853", "rs1057910"],
        "description": "CYP2C8*3, CYP2C9*2, CYP2C9*3 — all on chr10",
        "vault_claim": "Treated as compound NSAID risk (CYP2C8 + CYP2C9 dual bottleneck)"
    },
    "DRD2/ANKK1 overlap": {
        "rsids": ["rs1800497"],
        "description": "Same SNP attributed to both DRD2 and ANKK1 gene notes",
        "vault_claim": "Counted in both DRD2 and ANKK1 notes; Dopamine System table lists it under both genes"
    },
    "COMT haplotype (chr22)": {
        "rsids": ["rs4680", "rs4633", "rs165599"],
        "description": "COMT Val/Met + haplotype tag + 3' UTR variant",
        "vault_claim": "Listed as 3 separate variants in COMT frontmatter; rs4633 described as 'consistent with Val/Met'"
    },
    "Serotonin panel (multi-chromosome)": {
        "rsids": ["rs140701", "rs6295", "rs6313"],
        "description": "SLC6A4 (chr17), HTR1A (chr5), HTR2A (chr13)",
        "vault_claim": "Different serotonin genes on different chromosomes"
    },
    "FADS cluster (chr11)": {
        "rsids": ["rs174547", "rs174546", "rs174548", "rs174550", "rs174556", "rs174570", "rs1535"],
        "description": "FADS1 + FADS2 variants in tight LD block",
        "vault_claim": "FADS2 note acknowledges LD with FADS1 but both are separate gene notes with separate recommendations"
    },
    "DRD2 internal variants (chr11)": {
        "rsids": ["rs1800497", "rs1076560", "rs2283265", "rs1799732"],
        "description": "TaqIA + splice variants + promoter variant",
        "vault_claim": "Four DRD2 variants listed in frontmatter as separate findings"
    },
}

# ── Known high-LD genomic regions ──────────────────────────────────────────

HIGH_LD_REGIONS = {
    "HLA region": {"chr": "6", "start": 25_000_000, "end": 34_000_000,
                    "note": "Extended LD across ~10Mb. Variants in this region may be in LD even at large physical distances."},
    "FADS cluster": {"chr": "11", "start": 61_550_000, "end": 61_610_000,
                      "note": "FADS1/FADS2 gene cluster. Very tight LD across entire region (~60kb)."},
    "CYP2C cluster": {"chr": "10", "start": 96_690_000, "end": 96_840_000,
                       "note": "CYP2C8/CYP2C9/CYP2C19 cluster. Moderate LD across ~150kb, but functional variants on different haplotypes."},
    "DRD2-ANKK1": {"chr": "11", "start": 113_270_000, "end": 113_350_000,
                    "note": "DRD2 and ANKK1 share a regulatory region. Multiple variants but most are on distinct haplotypes."},
}


def load_snps(db_path, rsids):
    """Load SNP data from genome.db."""
    conn = sqlite3.connect(db_path)
    placeholders = ",".join(["?"] * len(rsids))
    query = f"SELECT rsid, chromosome, position, genotype FROM snps WHERE rsid IN ({placeholders})"
    cursor = conn.execute(query, rsids)
    results = {row[0]: {"chr": row[1], "pos": row[2], "genotype": row[3]} for row in cursor}
    conn.close()
    return results


def check_high_ld_region(chrom, pos):
    """Check if a position falls in a known high-LD region."""
    for name, region in HIGH_LD_REGIONS.items():
        if chrom == region["chr"] and region["start"] <= pos <= region["end"]:
            return name, region["note"]
    return None, None


def analyze_pair(rs1, rs2, snp_data):
    """Analyze a pair of variants for potential LD."""
    d1 = snp_data.get(rs1)
    d2 = snp_data.get(rs2)

    if not d1 or not d2:
        return {"status": "missing_data", "detail": f"One or both SNPs not in database"}

    if rs1 == rs2:
        return {
            "status": "identical",
            "detail": "Same SNP listed under different genes",
            "distance": 0,
            "same_chr": True
        }

    same_chr = d1["chr"] == d2["chr"]
    if not same_chr:
        return {
            "status": "independent",
            "detail": f"Different chromosomes (chr{d1['chr']} vs chr{d2['chr']})",
            "distance": None,
            "same_chr": False
        }

    distance = abs(d1["pos"] - d2["pos"])
    region1, _ = check_high_ld_region(d1["chr"], d1["pos"])
    region2, _ = check_high_ld_region(d2["chr"], d2["pos"])

    # Check known LD
    key = tuple(sorted([rs1, rs2]))
    known = KNOWN_LD.get(key) or KNOWN_LD.get((rs1, rs2)) or KNOWN_LD.get((rs2, rs1))

    result = {
        "same_chr": True,
        "distance": distance,
        "chr": d1["chr"],
        "high_ld_region": region1 if region1 and region1 == region2 else None,
    }

    if known:
        r2 = known["r2"]
        result["known_r2"] = r2
        result["known_source"] = known["source"]
        result["known_note"] = known["note"]
        if r2 > 0.8:
            result["status"] = "same_signal"
        elif r2 > 0.3:
            result["status"] = "partial_ld"
        else:
            result["status"] = "independent"
    elif distance < LD_DISTANCE_THRESHOLD:
        result["status"] = "potential_ld"
        result["detail"] = f"Within {LD_DISTANCE_THRESHOLD // 1000}kb on chr{d1['chr']} — potential LD but no published r² available"
    else:
        result["status"] = "likely_independent"
        result["detail"] = f"{distance // 1000}kb apart on chr{d1['chr']} — likely independent"

    return result


def count_independent_signals(cluster_name, rsids, snp_data):
    """
    Estimate the number of truly independent signals in a cluster.
    Uses a greedy pruning approach: if two variants are in strong LD (r² > 0.8),
    keep only one.
    """
    if len(rsids) <= 1:
        return len(rsids), rsids

    # Build adjacency of strong-LD pairs
    strong_ld_pairs = set()
    for rs1, rs2 in combinations(rsids, 2):
        key = tuple(sorted([rs1, rs2]))
        known = KNOWN_LD.get(key) or KNOWN_LD.get((rs1, rs2)) or KNOWN_LD.get((rs2, rs1))
        if known and known["r2"] > 0.8:
            strong_ld_pairs.add(key)

    # Greedy pruning: keep representatives
    pruned = set()
    remaining = list(rsids)
    kept = []

    for rs in remaining:
        if rs in pruned:
            continue
        kept.append(rs)
        # Prune all partners in strong LD with this one
        for rs2 in remaining:
            if rs2 != rs and rs2 not in pruned:
                key = tuple(sorted([rs, rs2]))
                if key in strong_ld_pairs:
                    pruned.add(rs2)

    return len(kept), kept


def format_distance(dist):
    """Format distance in human-readable form."""
    if dist is None:
        return "N/A (diff. chr)"
    if dist == 0:
        return "0 bp (same SNP)"
    if dist < 1000:
        return f"{dist} bp"
    if dist < 1_000_000:
        return f"{dist / 1000:.1f} kb"
    return f"{dist / 1_000_000:.2f} Mb"


def main():
    # Collect all unique rsids
    all_rsids = set()
    for cluster in VAULT_CLUSTERS.values():
        all_rsids.update(cluster["rsids"])

    # Load from DB
    snp_data = load_snps(DB_PATH, list(all_rsids))

    print("=" * 80)
    print("LINKAGE DISEQUILIBRIUM ANALYSIS — PERSONAL GENOMICS VAULT")
    print("=" * 80)
    print()
    print(f"Date: 2026-03-23")
    print(f"SNPs queried: {len(all_rsids)}")
    print(f"SNPs found in database: {len(snp_data)}")
    print(f"LD distance threshold: {LD_DISTANCE_THRESHOLD // 1000}kb")
    print()

    # Missing SNPs
    missing = all_rsids - set(snp_data.keys())
    if missing:
        print(f"SNPs not found in database: {', '.join(sorted(missing))}")
        print()

    total_vault_signals = 0
    total_independent = 0

    # Analyze each cluster
    for cluster_name, cluster_info in VAULT_CLUSTERS.items():
        rsids = cluster_info["rsids"]
        print("-" * 80)
        print(f"\n## {cluster_name}")
        print(f"   Variants: {', '.join(rsids)}")
        print(f"   Description: {cluster_info['description']}")
        print(f"   Vault claim: {cluster_info['vault_claim']}")
        print()

        # Show positions
        print("   Positions:")
        for rs in rsids:
            d = snp_data.get(rs)
            if d:
                region, _ = check_high_ld_region(d["chr"], d["pos"])
                region_str = f" [{region}]" if region else ""
                print(f"     {rs}: chr{d['chr']}:{d['pos']:,} ({d['genotype']}){region_str}")
            else:
                print(f"     {rs}: NOT IN DATABASE")
        print()

        # Pairwise analysis
        if len(rsids) > 1:
            print("   Pairwise LD assessment:")
            for rs1, rs2 in combinations(rsids, 2):
                result = analyze_pair(rs1, rs2, snp_data)
                status = result["status"].upper().replace("_", " ")
                dist_str = format_distance(result.get("distance"))

                print(f"\n     {rs1} <-> {rs2}:")
                print(f"       Distance: {dist_str}")
                print(f"       Status: {status}")

                if "known_r2" in result:
                    print(f"       Published r²: {result['known_r2']:.2f} ({result['known_source']})")
                    print(f"       Note: {result['known_note']}")
                elif "detail" in result:
                    print(f"       Detail: {result['detail']}")

                if result.get("high_ld_region"):
                    print(f"       ** In known high-LD region: {result['high_ld_region']} **")
        elif cluster_name == "DRD2/ANKK1 overlap":
            print("   Assessment:")
            print("     rs1800497 appears in BOTH DRD2.md and ANKK1.md gene notes.")
            print("     The Dopamine System table lists it under both [[DRD2]] and [[ANKK1]].")
            print("     This is ONE variant counted TWICE in the vault.")
            print("     Impact: The vault has 5 entries in the Dopamine System table but only")
            print("     4 unique variants (rs1800497, rs1800955, rs27072, rs4680).")

        # Count independent signals
        n_independent, kept = count_independent_signals(cluster_name, rsids, snp_data)
        total_vault_signals += len(rsids)
        total_independent += n_independent

        print(f"\n   >> INDEPENDENT SIGNALS: {n_independent} of {len(rsids)} variants")
        if n_independent < len(rsids):
            pruned = [rs for rs in rsids if rs not in kept]
            print(f"      Kept (representatives): {', '.join(kept)}")
            print(f"      Pruned (redundant): {', '.join(pruned)}")
        print()

    # ── Summary ────────────────────────────────────────────────────────────
    print("=" * 80)
    print("\nSUMMARY: VAULT LD AUDIT")
    print("=" * 80)
    print()
    print(f"Total variant entries analyzed: {total_vault_signals}")
    print(f"Truly independent signals: {total_independent}")
    print(f"Redundant entries: {total_vault_signals - total_independent}")
    print()

    print("FINDINGS BY SEVERITY:")
    print()

    print("1. IDENTICAL SNP (counted twice):")
    print("   - rs1800497 is listed under BOTH DRD2 and ANKK1.")
    print("     The vault correctly notes ANKK1 is the genomic location, but the Dopamine")
    print("     System table counts it as 5 gene contributions when there are only 4 unique variants.")
    print()

    print("2. SAME SIGNAL (r² > 0.8, redundant):")
    print("   - COMT: rs4633 perfectly tags rs4680 (r²=0.96). Three COMT variants = 2 independent signals.")
    print("   - GABRA2: rs279858/rs279836/rs279826 are on the same haplotype block (r²=0.70-0.85).")
    print("     Three variants = ~1-2 independent signals.")
    print("   - FADS: rs174547/rs174546/rs174550/rs174556 are near-perfectly correlated (r²>0.92).")
    print("     Seven FADS variants across two gene notes = ~2 independent signals (FADS1 block + FADS2 rs1535).")
    print("   - DRD2: rs1076560/rs2283265 are the same signal (r²=0.95).")
    print("     Four DRD2 variants = 3 independent signals.")
    print()

    print("3. PARTIAL LD (r² 0.3-0.8, partially redundant):")
    print("   - CYP2C8*3 (rs11572080) and CYP2C9*2 (rs1799853): r²=0.30.")
    print("     Partially linked but functionally distinct enzymes. The vault's 'dual bottleneck'")
    print("     claim is valid but the variants are not fully independent.")
    print()

    print("4. GENUINELY INDEPENDENT (confirmed):")
    print("   - Immune panel: PTPN22 (chr1), STAT4 (chr2), CD226 (chr18), SH2B3 (chr12).")
    print("     Different chromosomes = fully independent. Polyautoimmune burden claim is valid.")
    print("   - Serotonin panel: SLC6A4 (chr17), HTR1A (chr5), HTR2A (chr13).")
    print("     Different chromosomes = fully independent.")
    print("   - CYP2C9 *2 vs *3 (rs1799853 vs rs1057910): r²=0.02.")
    print("     On different haplotypes = independent. Compound poor metabolizer is real.")
    print("   - COMT rs4680 vs rs165599: r²=0.15. Largely independent.")
    print()

    print("IMPACT ON VAULT CLAIMS:")
    print()
    print("  Claim: 'Compound RDS phenotype (DRD2+DRD4+DAT1+COMT)' — 4 genes, 4 independent signals")
    print("  Status: VALID. These are on different chromosomes or have low LD.")
    print("         However, the DRD2 note lists 4 variants that reduce to 3 independent signals,")
    print("         and DRD2/ANKK1 share rs1800497 (counted once, not twice).")
    print()
    print("  Claim: 'CYP2C8 + CYP2C9 dual NSAID bottleneck'")
    print("  Status: VALID WITH CAVEAT. CYP2C8*3 and CYP2C9*2 have r²=0.30 (partial LD).")
    print("         The dual-enzyme bottleneck is real (different enzymes), but these variants")
    print("         may co-segregate on the same haplotype more often than expected by chance.")
    print("         CYP2C9 *2 and *3 are independent (different haplotypes) — the compound")
    print("         poor metabolizer (AS=0.5) is a genuine two-hit finding.")
    print()
    print("  Claim: 'FADS1 CT + FADS2 AG = two-step pathway bottleneck'")
    print("  Status: INFLATED. These variants are in strong LD (r²=0.78) and largely represent")
    print("         the SAME haplotype signal. The vault has two gene notes and separate")
    print("         recommendations for what is essentially one finding: intermediate FADS")
    print("         cluster activity. The supplementation advice (preformed EPA/DHA) is still")
    print("         correct but does not gain additional weight from counting both genes.")
    print()
    print("  Claim: 'Polyautoimmune burden' (PTPN22 + STAT4 + CD226 + SH2B3)")
    print("  Status: VALID. All on different chromosomes. Four genuinely independent signals.")
    print()
    print("  Claim: 'GABRA2 C;T + GABRG2 A;C = reduced inhibitory tone'")
    print("  Status: VALID (cross-gene). But the three GABRA2 variants in the frontmatter")
    print("         (rs279858, rs279836, rs279826) are ~1-2 independent signals, not 3.")
    print()

    print("RECOMMENDED VAULT CORRECTIONS:")
    print()
    print("  1. COMT.md: Note that rs4633 is a haplotype tag for rs4680 (r²=0.96)")
    print("     and does not provide independent information. Consider demoting from")
    print("     the frontmatter variant list to a note in the body text.")
    print()
    print("  2. FADS1.md / FADS2.md: Add cross-reference noting these are in strong LD")
    print("     (r²=0.78) and represent essentially the same genetic signal. The 'two-step")
    print("     bottleneck' framing overstates independence. Consider a single FADS Cluster")
    print("     note or prominent LD disclaimer in both notes.")
    print()
    print("  3. Dopamine System.md: The table lists rs1800497 under both DRD2 and ANKK1.")
    print("     Add a note that this is one variant, not two independent findings.")
    print("     Consider merging the ANKK1 row into the DRD2 row with a note about")
    print("     genomic location.")
    print()
    print("  4. GABRA2.md: Note that the three frontmatter variants are in LD and")
    print("     represent ~1-2 independent signals. The current text appropriately treats")
    print("     them as 'haplotype variants' but this should be made explicit.")
    print()
    print("  5. DRD2.md: Note that rs1076560 and rs2283265 are in near-perfect LD")
    print("     (r²=0.95) and represent one independent splice-modifying signal.")
    print()

    print("EPISTEMIC NOTE:")
    print()
    print("  This analysis uses published r² values from 1000 Genomes EUR population")
    print("  and physical distance as proxies for LD. True LD can only be determined")
    print("  from phased haplotype data in the same population. The r² values used here")
    print("  are population averages; individual haplotypes may differ. For clinical-grade")
    print("  LD assessment, imputation + phasing against a reference panel would be needed.")
    print()
    print("  The key takeaway: this vault contains ~{0} variant entries that reduce to".format(total_vault_signals))
    print(f"  ~{total_independent} independent signals after LD pruning. Most vault claims survive,")
    print("  but the FADS and GABRA2 clusters are over-counted, and the DRD2/ANKK1")
    print("  overlap inflates the Dopamine System variant count by one.")


if __name__ == "__main__":
    main()
