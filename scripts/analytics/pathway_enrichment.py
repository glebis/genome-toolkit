#!/usr/bin/env python3
"""
Pathway Enrichment Analysis for Personal Genomic Variants

Analyzes which biological pathways are overrepresented among personal
genetic variants in the genome vault. Uses manual KEGG/Reactome pathway
mappings based on known gene-pathway associations.

IMPORTANT CAVEAT: This is NOT a proper GWAS enrichment analysis. The gene
panel is heavily biased toward clinically actionable genes (CYP450, immune,
neurotransmitter). Enrichment reflects ascertainment bias as much as biology.

Usage:
    python3 data/scripts/pathway_enrichment.py
"""

import os
import re
import math
from collections import defaultdict, Counter
from pathlib import Path

VAULT_ROOT = Path(__file__).resolve().parent.parent.parent
GENES_DIR = VAULT_ROOT / "Genes"
SYSTEMS_DIR = VAULT_ROOT / "Systems"

# ---------------------------------------------------------------------------
# Manual pathway mapping: gene -> list of (pathway_id, pathway_name)
# Based on KEGG, Reactome, and GO biological process annotations.
# ---------------------------------------------------------------------------

GENE_PATHWAY_MAP = {
    # --- Drug Metabolism (KEGG hsa00982, hsa00980) ---
    "CYP1A2":  [("hsa00982", "Drug metabolism - cytochrome P450"),
                 ("hsa00980", "Metabolism of xenobiotics by cytochrome P450"),
                 ("REACT_R-HSA-211981", "Xenobiotics")],
    "CYP2B6":  [("hsa00982", "Drug metabolism - cytochrome P450"),
                 ("hsa00980", "Metabolism of xenobiotics by cytochrome P450")],
    "CYP2C8":  [("hsa00982", "Drug metabolism - cytochrome P450"),
                 ("hsa00590", "Arachidonic acid metabolism")],
    "CYP2C9":  [("hsa00982", "Drug metabolism - cytochrome P450"),
                 ("hsa00980", "Metabolism of xenobiotics by cytochrome P450"),
                 ("hsa00590", "Arachidonic acid metabolism")],
    "CYP2C19": [("hsa00982", "Drug metabolism - cytochrome P450"),
                 ("hsa00980", "Metabolism of xenobiotics by cytochrome P450")],
    "CYP2D6":  [("hsa00982", "Drug metabolism - cytochrome P450")],
    "CYP3A4":  [("hsa00982", "Drug metabolism - cytochrome P450"),
                 ("hsa00980", "Metabolism of xenobiotics by cytochrome P450"),
                 ("REACT_R-HSA-211981", "Xenobiotics")],
    "ABCB1":   [("hsa02010", "ABC transporters"),
                 ("hsa00982", "Drug metabolism - cytochrome P450"),
                 ("REACT_R-HSA-382556", "ABC-family proteins mediated transport")],
    "GSTP1":   [("hsa00480", "Glutathione metabolism"),
                 ("hsa00982", "Drug metabolism - cytochrome P450"),
                 ("hsa05225", "Hepatocellular carcinoma")],

    # --- Dopaminergic Signaling (KEGG hsa04728) ---
    "COMT":    [("hsa04728", "Dopaminergic synapse"),
                 ("hsa00350", "Tyrosine metabolism"),
                 ("REACT_R-HSA-209931", "Catecholamine biosynthesis")],
    "DRD2":    [("hsa04728", "Dopaminergic synapse"),
                 ("hsa04080", "Neuroactive ligand-receptor interaction"),
                 ("hsa05030", "Cocaine addiction"),
                 ("hsa05034", "Alcoholism")],
    "DRD4":    [("hsa04728", "Dopaminergic synapse"),
                 ("hsa04080", "Neuroactive ligand-receptor interaction")],
    "ANKK1":   [("hsa04728", "Dopaminergic synapse")],
    "DAT1":    [("hsa04728", "Dopaminergic synapse"),
                 ("hsa04080", "Neuroactive ligand-receptor interaction")],

    # --- Serotonergic Signaling (KEGG hsa04726) ---
    "SLC6A4":  [("hsa04726", "Serotonergic synapse"),
                 ("hsa04080", "Neuroactive ligand-receptor interaction")],
    "HTR1A":   [("hsa04726", "Serotonergic synapse"),
                 ("hsa04080", "Neuroactive ligand-receptor interaction")],
    "HTR2A":   [("hsa04726", "Serotonergic synapse"),
                 ("hsa04080", "Neuroactive ligand-receptor interaction")],
    "MAOA":    [("hsa04726", "Serotonergic synapse"),
                 ("hsa00350", "Tyrosine metabolism"),
                 ("hsa00380", "Tryptophan metabolism")],

    # --- GABAergic Signaling (KEGG hsa04727) ---
    "GABRA2":  [("hsa04727", "GABAergic synapse"),
                 ("hsa04080", "Neuroactive ligand-receptor interaction"),
                 ("hsa05033", "Nicotine addiction")],
    "GABRA6":  [("hsa04727", "GABAergic synapse"),
                 ("hsa04080", "Neuroactive ligand-receptor interaction")],
    "GABRG2":  [("hsa04727", "GABAergic synapse"),
                 ("hsa04080", "Neuroactive ligand-receptor interaction")],
    "ALPL":    [("hsa04727", "GABAergic synapse"),
                 ("hsa00790", "Folate biosynthesis")],

    # --- Opioid Signaling ---
    "OPRM1":   [("hsa04080", "Neuroactive ligand-receptor interaction"),
                 ("REACT_R-HSA-111885", "Opioid signalling"),
                 ("hsa05032", "Morphine addiction")],

    # --- Immune / Inflammatory (KEGG hsa04060, hsa04630) ---
    "IL1B":    [("hsa04060", "Cytokine-cytokine receptor interaction"),
                 ("hsa04668", "TNF signaling pathway"),
                 ("hsa04621", "NOD-like receptor signaling pathway"),
                 ("REACT_R-HSA-449147", "Signaling by Interleukins")],
    "IL6":     [("hsa04060", "Cytokine-cytokine receptor interaction"),
                 ("hsa04630", "JAK-STAT signaling pathway"),
                 ("hsa04668", "TNF signaling pathway"),
                 ("REACT_R-HSA-449147", "Signaling by Interleukins")],
    "IL10":    [("hsa04060", "Cytokine-cytokine receptor interaction"),
                 ("hsa04630", "JAK-STAT signaling pathway"),
                 ("REACT_R-HSA-449147", "Signaling by Interleukins")],
    "IL17A":   [("hsa04060", "Cytokine-cytokine receptor interaction"),
                 ("hsa04657", "IL-17 signaling pathway"),
                 ("REACT_R-HSA-449147", "Signaling by Interleukins")],
    "TNF":     [("hsa04060", "Cytokine-cytokine receptor interaction"),
                 ("hsa04668", "TNF signaling pathway"),
                 ("hsa04064", "NF-kappa B signaling pathway")],
    "PTPN22":  [("hsa04660", "T cell receptor signaling pathway"),
                 ("REACT_R-HSA-202403", "TCR signaling")],
    "CD226":   [("hsa04514", "Cell adhesion molecules"),
                 ("hsa04660", "T cell receptor signaling pathway")],
    "SH2B3":   [("hsa04630", "JAK-STAT signaling pathway"),
                 ("hsa04660", "T cell receptor signaling pathway")],
    "STAT4":   [("hsa04630", "JAK-STAT signaling pathway"),
                 ("hsa04658", "Th1 and Th2 cell differentiation")],
    "HLA-B27": [("hsa04612", "Antigen processing and presentation"),
                 ("hsa04940", "Type I diabetes mellitus"),
                 ("REACT_R-HSA-983170", "Antigen Presentation")],
    "GLCCI1":  [("hsa04080", "Neuroactive ligand-receptor interaction")],

    # --- Circadian Rhythm (KEGG hsa04710) ---
    "CLOCK":   [("hsa04710", "Circadian rhythm"),
                 ("hsa04714", "Thermogenesis")],
    "PER3":    [("hsa04710", "Circadian rhythm")],
    "MTNR1B":  [("hsa04710", "Circadian rhythm"),
                 ("hsa04080", "Neuroactive ligand-receptor interaction")],

    # --- HPA Axis / Stress Response ---
    "FKBP5":   [("REACT_R-HSA-2160916", "Glucocorticoid receptor regulatory network"),
                 ("hsa04141", "Protein processing in endoplasmic reticulum")],
    "NR3C1":   [("REACT_R-HSA-2160916", "Glucocorticoid receptor regulatory network"),
                 ("hsa04080", "Neuroactive ligand-receptor interaction")],

    # --- Oxytocin Signaling ---
    "OXTR":    [("hsa04921", "Oxytocin signaling pathway"),
                 ("hsa04080", "Neuroactive ligand-receptor interaction")],

    # --- Cholinergic Signaling ---
    "CHRNA5":  [("hsa04725", "Cholinergic synapse"),
                 ("hsa04080", "Neuroactive ligand-receptor interaction"),
                 ("hsa05033", "Nicotine addiction")],

    # --- Adrenergic Signaling ---
    "ADRB2":   [("hsa04022", "cGMP-PKG signaling pathway"),
                 ("hsa04080", "Neuroactive ligand-receptor interaction"),
                 ("hsa04024", "cAMP signaling pathway")],
    "ADRA2A":  [("hsa04080", "Neuroactive ligand-receptor interaction"),
                 ("hsa04024", "cAMP signaling pathway")],
    "ADORA2A": [("hsa04080", "Neuroactive ligand-receptor interaction"),
                 ("hsa04024", "cAMP signaling pathway"),
                 ("hsa04728", "Dopaminergic synapse")],

    # --- Lipid Metabolism (KEGG hsa00062, hsa00590) ---
    "FADS1":   [("hsa01040", "Biosynthesis of unsaturated fatty acids"),
                 ("hsa00591", "Linoleic acid metabolism"),
                 ("hsa00590", "Arachidonic acid metabolism")],
    "FADS2":   [("hsa01040", "Biosynthesis of unsaturated fatty acids"),
                 ("hsa00591", "Linoleic acid metabolism"),
                 ("hsa00590", "Arachidonic acid metabolism")],
    "APOE":    [("hsa04979", "Cholesterol metabolism"),
                 ("hsa05010", "Alzheimer disease")],
    "PNPLA3":  [("hsa00561", "Glycerolipid metabolism"),
                 ("hsa04975", "Fat digestion and absorption")],
    "FTO":     [("hsa04932", "Non-alcoholic fatty liver disease"),
                 ("REACT_R-HSA-9614085", "FRAP/mTOR signalling")],
    "PPARG":   [("hsa03320", "PPAR signaling pathway"),
                 ("hsa04932", "Non-alcoholic fatty liver disease"),
                 ("hsa05200", "Pathways in cancer")],

    # --- Folate / One-Carbon Metabolism ---
    "MTHFR":   [("hsa00670", "One carbon pool by folate"),
                 ("hsa00790", "Folate biosynthesis"),
                 ("REACT_R-HSA-196757", "Metabolism of folate and pterines")],
    "MTRR":    [("hsa00670", "One carbon pool by folate"),
                 ("REACT_R-HSA-196757", "Metabolism of folate and pterines")],

    # --- Neurotrophin Signaling ---
    "BDNF":    [("hsa04722", "Neurotrophin signaling pathway"),
                 ("hsa04010", "MAPK signaling pathway")],

    # --- Vitamin D Signaling ---
    "VDR":     [("REACT_R-HSA-196791", "Vitamin D (calciferol) metabolism"),
                 ("hsa04978", "Mineral absorption")],

    # --- Iron Metabolism ---
    "HFE":     [("hsa04978", "Mineral absorption"),
                 ("REACT_R-HSA-917937", "Iron uptake and transport")],

    # --- Gut / Autophagy ---
    "ATG16L1": [("hsa04140", "Autophagy - animal"),
                 ("hsa04621", "NOD-like receptor signaling pathway"),
                 ("hsa05321", "Inflammatory bowel disease")],
    "FUT2":    [("hsa00601", "Glycosphingolipid biosynthesis"),
                 ("REACT_R-HSA-913709", "O-linked glycosylation of mucins")],
    "LCT":     [("hsa00052", "Galactose metabolism"),
                 ("hsa04973", "Carbohydrate digestion and absorption")],

    # --- Purine / Adenosine Signaling ---
    "ADA":     [("hsa00230", "Purine metabolism"),
                 ("hsa04080", "Neuroactive ligand-receptor interaction")],
    "ADORA1":  [("hsa04080", "Neuroactive ligand-receptor interaction"),
                 ("hsa04024", "cAMP signaling pathway")],

    # --- Vasopressin Signaling ---
    "AVPR1A":  [("hsa04080", "Neuroactive ligand-receptor interaction"),
                 ("REACT_R-HSA-416476", "Vasopressin signaling")],

    # --- One-Carbon / Methionine Metabolism ---
    "BHMT":    [("hsa00270", "Cysteine and methionine metabolism"),
                 ("hsa00670", "One carbon pool by folate")],
    "CBS":     [("hsa00270", "Cysteine and methionine metabolism"),
                 ("REACT_R-HSA-1614603", "Transsulfuration")],

    # --- Lipid / Cholesterol ---
    "CETP":    [("hsa04979", "Cholesterol metabolism"),
                 ("REACT_R-HSA-8963888", "HDL metabolism")],
    "HMGCR":   [("hsa00900", "Terpenoid backbone biosynthesis"),
                 ("hsa04979", "Cholesterol metabolism")],
    "LDLR":    [("hsa04979", "Cholesterol metabolism"),
                 ("REACT_R-HSA-8963888", "HDL metabolism")],
    "PCSK9":   [("hsa04979", "Cholesterol metabolism"),
                 ("REACT_R-HSA-8963888", "HDL metabolism")],

    # --- Endocannabinoid Signaling ---
    "CNR1":    [("REACT_R-HSA-400206", "Endocannabinoid signaling"),
                 ("hsa04080", "Neuroactive ligand-receptor interaction"),
                 ("hsa04723", "Retrograde endocannabinoid signaling")],
    "CNR2":    [("REACT_R-HSA-400206", "Endocannabinoid signaling"),
                 ("hsa04060", "Cytokine-cytokine receptor interaction")],
    "FAAH":    [("REACT_R-HSA-400206", "Endocannabinoid signaling"),
                 ("hsa00071", "Fatty acid degradation")],
    "DAGLA":   [("REACT_R-HSA-400206", "Endocannabinoid signaling"),
                 ("hsa00561", "Glycerolipid metabolism")],
    "MGLL":    [("REACT_R-HSA-400206", "Endocannabinoid signaling"),
                 ("hsa00071", "Fatty acid degradation")],
    "NAPE-PLD": [("REACT_R-HSA-400206", "Endocannabinoid signaling"),
                 ("hsa00565", "Ether lipid metabolism")],

    # --- HPA Axis Signaling (additional) ---
    "CRHR1":   [("hsa04080", "Neuroactive ligand-receptor interaction"),
                 ("REACT_R-HSA-2160916", "Glucocorticoid receptor regulatory network")],
    "CRHR2":   [("hsa04080", "Neuroactive ligand-receptor interaction"),
                 ("REACT_R-HSA-2160916", "Glucocorticoid receptor regulatory network")],
    "NR3C2":   [("hsa04080", "Neuroactive ligand-receptor interaction"),
                 ("REACT_R-HSA-2160916", "Glucocorticoid receptor regulatory network"),
                 ("hsa04960", "Aldosterone-regulated sodium reabsorption")],

    # --- Vitamin D Metabolism ---
    "CYP27B1": [("REACT_R-HSA-196791", "Vitamin D (calciferol) metabolism"),
                 ("hsa00140", "Steroid hormone biosynthesis")],
    "CYP2R1":  [("REACT_R-HSA-196791", "Vitamin D (calciferol) metabolism"),
                 ("hsa00140", "Steroid hormone biosynthesis")],
    "GC":      [("REACT_R-HSA-196791", "Vitamin D (calciferol) metabolism"),
                 ("hsa02010", "ABC transporters")],

    # --- Additional Drug Metabolism ---
    "CYP4F2":  [("hsa00982", "Drug metabolism - cytochrome P450"),
                 ("REACT_R-HSA-196849", "Vitamin K metabolism")],
    "CYP7A1":  [("hsa00120", "Primary bile acid biosynthesis"),
                 ("hsa04979", "Cholesterol metabolism")],
    "DPYD":    [("hsa00240", "Pyrimidine metabolism"),
                 ("hsa00982", "Drug metabolism - cytochrome P450")],
    "GSTM1":   [("hsa00480", "Glutathione metabolism"),
                 ("hsa00982", "Drug metabolism - cytochrome P450")],
    "SLCO1B1": [("hsa00982", "Drug metabolism - cytochrome P450"),
                 ("REACT_R-HSA-5619084", "Hepatic transport")],
    "TPMT":    [("hsa00982", "Drug metabolism - cytochrome P450"),
                 ("REACT_R-HSA-156580", "Thiopurine metabolism")],
    "UGT1A1":  [("hsa00982", "Drug metabolism - cytochrome P450"),
                 ("REACT_R-HSA-156588", "Glucuronidation")],
    "UGT2B15": [("hsa00982", "Drug metabolism - cytochrome P450"),
                 ("REACT_R-HSA-156588", "Glucuronidation")],
    "VKORC1":  [("REACT_R-HSA-196849", "Vitamin K metabolism"),
                 ("hsa00982", "Drug metabolism - cytochrome P450")],

    # --- Catecholamine Biosynthesis ---
    "DBH":     [("REACT_R-HSA-209931", "Catecholamine biosynthesis"),
                 ("hsa00350", "Tyrosine metabolism")],
    "DDC":     [("REACT_R-HSA-209931", "Catecholamine biosynthesis"),
                 ("hsa00380", "Tryptophan metabolism")],
    "TH":      [("REACT_R-HSA-209931", "Catecholamine biosynthesis"),
                 ("hsa00350", "Tyrosine metabolism")],

    # --- Dopamine Signaling (additional) ---
    "DRD3":    [("hsa04728", "Dopaminergic synapse"),
                 ("hsa04080", "Neuroactive ligand-receptor interaction")],
    "SLC18A2": [("hsa04728", "Dopaminergic synapse"),
                 ("hsa04726", "Serotonergic synapse"),
                 ("REACT_R-HSA-425366", "Vesicular transport")],

    # --- GABAergic Signaling (additional) ---
    "GAD1":    [("hsa04727", "GABAergic synapse"),
                 ("hsa00250", "Alanine, aspartate and glutamate metabolism")],
    "GAD2":    [("hsa04727", "GABAergic synapse"),
                 ("hsa00250", "Alanine, aspartate and glutamate metabolism")],

    # --- Glutamatergic Signaling ---
    "GRIN2A":  [("hsa04724", "Glutamatergic synapse"),
                 ("hsa04020", "Calcium signaling pathway")],

    # --- Serotonergic Signaling (additional) ---
    "HTR3A":   [("hsa04726", "Serotonergic synapse"),
                 ("hsa04080", "Neuroactive ligand-receptor interaction")],
    "TPH2":    [("hsa00380", "Tryptophan metabolism"),
                 ("hsa04726", "Serotonergic synapse")],

    # --- Immune Signaling (additional) ---
    "IL23R":   [("hsa04630", "JAK-STAT signaling pathway"),
                 ("hsa04659", "Th17 cell differentiation"),
                 ("hsa04060", "Cytokine-cytokine receptor interaction")],
    "NOD2":    [("hsa04621", "NOD-like receptor signaling pathway"),
                 ("hsa04064", "NF-kappa B signaling pathway"),
                 ("REACT_R-HSA-168643", "Pattern recognition receptors")],
    "TLR4":    [("hsa04620", "Toll-like receptor signaling pathway"),
                 ("hsa04064", "NF-kappa B signaling pathway"),
                 ("REACT_R-HSA-168643", "Pattern recognition receptors")],

    # --- Opioid Signaling (additional) ---
    "OPRK1":   [("hsa04080", "Neuroactive ligand-receptor interaction"),
                 ("REACT_R-HSA-111885", "Opioid signalling")],
    "OPRL1":   [("hsa04080", "Neuroactive ligand-receptor interaction"),
                 ("REACT_R-HSA-111885", "Opioid signalling")],
    "PDYN":    [("hsa04080", "Neuroactive ligand-receptor interaction"),
                 ("REACT_R-HSA-111885", "Opioid signalling")],
    "PENK":    [("hsa04080", "Neuroactive ligand-receptor interaction"),
                 ("REACT_R-HSA-111885", "Opioid signalling")],

    # --- Orexin Signaling ---
    "HCRTR2":  [("hsa04080", "Neuroactive ligand-receptor interaction"),
                 ("REACT_R-HSA-400206", "Endocannabinoid signaling")],

    # --- Neurotrophin Signaling (additional) ---
    "NTRK2":   [("hsa04722", "Neurotrophin signaling pathway"),
                 ("hsa04010", "MAPK signaling pathway")],

    # --- Neuropeptide / Appetite ---
    "NPY":     [("hsa04080", "Neuroactive ligand-receptor interaction"),
                 ("REACT_R-HSA-375276", "Appetite regulation")],

    # --- Circadian (additional) ---
    "RORA":    [("hsa04710", "Circadian rhythm"),
                 ("hsa03320", "PPAR signaling pathway")],
}


def parse_gene_notes():
    """Parse all gene notes and extract gene symbol + personal_status."""
    genes = {}
    for md_file in sorted(GENES_DIR.glob("*.md")):
        gene_symbol = md_file.stem
        content = md_file.read_text(encoding="utf-8")

        # Extract personal_status from frontmatter
        status_match = re.search(r"personal_status:\s*(\S+)", content)
        status = status_match.group(1) if status_match else "unknown"

        # Extract systems from frontmatter
        systems = []
        sys_match = re.search(r"systems:\s*\n((?:\s+-\s+.*\n)*)", content)
        if sys_match:
            systems = re.findall(r"-\s+(.+)", sys_match.group(1))

        genes[gene_symbol] = {
            "status": status,
            "systems": systems,
            "has_variant": status not in ("reference", "optimal", "protective"),
        }
    return genes


def get_existing_systems():
    """Get list of existing system notes."""
    systems = []
    for md_file in sorted(SYSTEMS_DIR.glob("*.md")):
        systems.append(md_file.stem)
    return systems


def classify_variant(status):
    """Classify whether a gene has a functionally relevant non-reference variant."""
    # These statuses indicate the genotype differs from reference/optimal
    non_ref = {"risk", "risk-proxy", "intermediate", "genotyped-uncertain"}
    return status in non_ref


def build_pathway_counts(genes):
    """Count how many variant-carrying genes map to each pathway."""
    pathway_variant_genes = defaultdict(set)   # pathway -> set of genes with variants
    pathway_all_genes = defaultdict(set)        # pathway -> set of all mapped genes
    pathway_names = {}                          # pathway_id -> pathway_name

    for gene, info in genes.items():
        if gene not in GENE_PATHWAY_MAP:
            continue
        for pathway_id, pathway_name in GENE_PATHWAY_MAP[gene]:
            pathway_names[pathway_id] = pathway_name
            pathway_all_genes[pathway_id].add(gene)
            if classify_variant(info["status"]):
                pathway_variant_genes[pathway_id].add(gene)

    return pathway_variant_genes, pathway_all_genes, pathway_names


def log_choose(n, k):
    """Log of binomial coefficient C(n, k) using lgamma."""
    if k < 0 or k > n:
        return float("-inf")
    return math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)


def hypergeometric_pvalue(k, n, K, N):
    """
    One-sided hypergeometric test (enrichment).
    k = variant genes in pathway
    n = total genes in pathway (from our panel)
    K = total variant genes in panel
    N = total genes in panel
    P(X >= k)
    """
    p_value = 0.0
    for i in range(k, min(n, K) + 1):
        log_p = (log_choose(K, i) + log_choose(N - K, n - i) - log_choose(N, n))
        p_value += math.exp(log_p)
    return min(p_value, 1.0)


def aggregate_to_superpathways(pathway_variant_genes, pathway_all_genes, pathway_names):
    """
    Group pathways into higher-level biological themes for interpretability.
    """
    THEME_MAP = {
        "Drug Metabolism / Pharmacogenomics": [
            "hsa00982", "hsa00980", "REACT_R-HSA-211981", "hsa02010",
            "REACT_R-HSA-382556", "hsa00480",
            "REACT_R-HSA-156580", "REACT_R-HSA-156588",
            "REACT_R-HSA-196849", "REACT_R-HSA-5619084",
        ],
        "Dopaminergic Signaling": [
            "hsa04728", "hsa05030", "hsa05034",
        ],
        "Serotonergic Signaling": [
            "hsa04726", "hsa00380",
        ],
        "GABAergic Signaling": [
            "hsa04727", "hsa00250",
        ],
        "Glutamatergic Signaling": [
            "hsa04724", "hsa04020",
        ],
        "Opioid / Reward": [
            "REACT_R-HSA-111885", "hsa05032",
        ],
        "Endocannabinoid Signaling": [
            "REACT_R-HSA-400206", "hsa04723", "hsa00071",
            "hsa00565",
        ],
        "Cytokine / Inflammatory Signaling": [
            "hsa04060", "hsa04668", "hsa04621", "REACT_R-HSA-449147",
            "hsa04657", "hsa04064", "hsa04620",
            "REACT_R-HSA-168643",
        ],
        "Adaptive Immune / Autoimmune": [
            "hsa04660", "REACT_R-HSA-202403", "hsa04514",
            "hsa04612", "hsa04940", "REACT_R-HSA-983170", "hsa04658",
            "hsa04659",
        ],
        "JAK-STAT Signaling": [
            "hsa04630",
        ],
        "Neuroactive Ligand-Receptor Interaction": [
            "hsa04080",
        ],
        "Circadian Rhythm": [
            "hsa04710", "hsa04714",
        ],
        "HPA Axis / Glucocorticoid": [
            "REACT_R-HSA-2160916", "hsa04960",
        ],
        "Lipid / Fatty Acid Metabolism": [
            "hsa01040", "hsa00591", "hsa00590", "hsa04979",
            "hsa00561", "hsa04975", "hsa03320", "hsa04932",
            "REACT_R-HSA-8963888", "hsa00900",
        ],
        "Folate / One-Carbon Metabolism": [
            "hsa00670", "hsa00790", "REACT_R-HSA-196757",
            "hsa00270", "REACT_R-HSA-1614603",
        ],
        "Neurotrophin Signaling": [
            "hsa04722", "hsa04010",
        ],
        "Catecholamine Biosynthesis": [
            "hsa00350", "REACT_R-HSA-209931",
        ],
        "Autophagy / Gut Barrier": [
            "hsa04140", "hsa05321", "hsa00601",
            "REACT_R-HSA-913709", "hsa00052", "hsa04973",
        ],
        "Iron / Mineral Metabolism": [
            "hsa04978", "REACT_R-HSA-917937",
        ],
        "Vitamin D Metabolism": [
            "REACT_R-HSA-196791", "hsa00140",
        ],
        "Oxytocin Signaling": [
            "hsa04921",
        ],
        "Cholinergic / Nicotinic Signaling": [
            "hsa04725", "hsa05033",
        ],
        "cAMP / cGMP Signaling": [
            "hsa04022", "hsa04024",
        ],
        "Purine Metabolism": [
            "hsa00230",
        ],
        "Bile Acid Metabolism": [
            "hsa00120",
        ],
        "Pyrimidine Metabolism": [
            "hsa00240",
        ],
        "Vesicular Transport": [
            "REACT_R-HSA-425366",
        ],
    }

    theme_results = {}
    for theme, pathway_ids in THEME_MAP.items():
        variant_genes = set()
        all_genes = set()
        for pid in pathway_ids:
            variant_genes |= pathway_variant_genes.get(pid, set())
            all_genes |= pathway_all_genes.get(pid, set())
        if all_genes:
            theme_results[theme] = {
                "variant_genes": variant_genes,
                "all_genes": all_genes,
                "ratio": len(variant_genes) / len(all_genes) if all_genes else 0,
            }
    return theme_results


def main():
    genes = parse_gene_notes()
    existing_systems = get_existing_systems()

    total_genes = len(genes)
    variant_genes = {g for g, info in genes.items() if classify_variant(info["status"])}
    reference_genes = {g for g, info in genes.items() if not classify_variant(info["status"])}
    total_variant = len(variant_genes)
    total_reference = len(reference_genes)

    print("=" * 72)
    print("PATHWAY ENRICHMENT ANALYSIS — Personal Genomic Variants")
    print("=" * 72)
    print()
    print(f"Total genes in vault:           {total_genes}")
    print(f"Genes with non-ref variants:    {total_variant} ({100*total_variant/total_genes:.0f}%)")
    print(f"Reference/optimal/protective:   {total_reference}")
    print()

    # --- Per-pathway analysis ---
    pathway_variant_genes, pathway_all_genes, pathway_names = build_pathway_counts(genes)

    print("-" * 72)
    print("INDIVIDUAL KEGG/REACTOME PATHWAY RESULTS")
    print("-" * 72)
    print(f"{'Pathway':<50} {'Var/Tot':>8} {'Ratio':>6} {'p-val':>8}")
    print("-" * 72)

    pathway_results = []
    for pid in sorted(pathway_all_genes.keys(), key=lambda x: pathway_names.get(x, x)):
        name = pathway_names[pid]
        n = len(pathway_all_genes[pid])
        k = len(pathway_variant_genes.get(pid, set()))
        pval = hypergeometric_pvalue(k, n, total_variant, total_genes)
        ratio = k / n if n > 0 else 0
        pathway_results.append((name, pid, k, n, ratio, pval,
                                pathway_variant_genes.get(pid, set()),
                                pathway_all_genes[pid]))

    # Sort by p-value
    pathway_results.sort(key=lambda x: x[5])

    for name, pid, k, n, ratio, pval, vgenes, agenes in pathway_results:
        display = name[:48]
        print(f"{display:<50} {k:>3}/{n:<3} {ratio:>6.0%} {pval:>8.4f}")

    # --- Superpathway / theme analysis ---
    print()
    print("=" * 72)
    print("BIOLOGICAL THEME ENRICHMENT (aggregated pathways)")
    print("=" * 72)
    print(f"{'Theme':<45} {'Var/Tot':>8} {'Ratio':>6} {'p-val':>8}")
    print("-" * 72)

    theme_results = aggregate_to_superpathways(
        pathway_variant_genes, pathway_all_genes, pathway_names
    )

    theme_rows = []
    for theme, data in theme_results.items():
        k = len(data["variant_genes"])
        n = len(data["all_genes"])
        pval = hypergeometric_pvalue(k, n, total_variant, total_genes)
        theme_rows.append((theme, k, n, data["ratio"], pval,
                           data["variant_genes"], data["all_genes"]))

    theme_rows.sort(key=lambda x: x[4])

    for theme, k, n, ratio, pval, vgenes, agenes in theme_rows:
        marker = " *" if pval < 0.25 else ""
        print(f"{theme:<45} {k:>3}/{n:<3} {ratio:>6.0%} {pval:>8.4f}{marker}")

    # --- Vault coverage analysis ---
    print()
    print("=" * 72)
    print("VAULT COVERAGE: Themes vs. Existing System Notes")
    print("=" * 72)

    THEME_SYSTEM_MAP = {
        "Drug Metabolism / Pharmacogenomics": "Drug Metabolism",
        "Dopaminergic Signaling": "Dopamine System",
        "Serotonergic Signaling": "Serotonin System",
        "GABAergic Signaling": "GABA System",
        "Glutamatergic Signaling": None,
        "Opioid / Reward": "Opioid and Reward",
        "Endocannabinoid Signaling": "Endocannabinoid System",
        "Cytokine / Inflammatory Signaling": "Immune and Inflammatory",
        "Adaptive Immune / Autoimmune": "Immune and Inflammatory",
        "JAK-STAT Signaling": None,
        "Neuroactive Ligand-Receptor Interaction": None,
        "Circadian Rhythm": "Sleep Architecture",
        "HPA Axis / Glucocorticoid": "HPA Axis",
        "Lipid / Fatty Acid Metabolism": "Lipid Metabolism",
        "Folate / One-Carbon Metabolism": "Methylation",
        "Neurotrophin Signaling": None,
        "Catecholamine Biosynthesis": "Neurotransmitter Synthesis",
        "Autophagy / Gut Barrier": "Gut Microbiome",
        "Iron / Mineral Metabolism": "Liver and Metabolism",
        "Vitamin D Metabolism": "Vitamin D Signaling",
        "Oxytocin Signaling": None,
        "Cholinergic / Nicotinic Signaling": None,
        "cAMP / cGMP Signaling": None,
        "Purine Metabolism": None,
        "Bile Acid Metabolism": None,
        "Pyrimidine Metabolism": None,
        "Vesicular Transport": None,
    }

    covered = []
    uncovered = []
    for theme, k, n, ratio, pval, vgenes, agenes in theme_rows:
        system = THEME_SYSTEM_MAP.get(theme)
        has_system = system in existing_systems if system else False
        status = f"COVERED ({system})" if has_system else "NO SYSTEM NOTE"
        if has_system:
            covered.append((theme, system, k, n, pval))
        else:
            uncovered.append((theme, system, k, n, pval))
        print(f"  {theme:<42} -> {status}")

    # --- Recommendations ---
    print()
    print("=" * 72)
    print("RECOMMENDATIONS: New System Notes Based on Enrichment")
    print("=" * 72)

    recommendations = []
    for theme, system, k, n, pval in uncovered:
        if k >= 2:  # at least 2 variant genes
            recommendations.append((theme, k, n, pval))

    recommendations.sort(key=lambda x: (-x[1], x[3]))
    for i, (theme, k, n, pval) in enumerate(recommendations, 1):
        print(f"  {i}. {theme} ({k} variant genes / {n} total, p={pval:.3f})")

    # --- Genes not mapped to any pathway ---
    mapped_genes = set(GENE_PATHWAY_MAP.keys())
    unmapped = set(genes.keys()) - mapped_genes
    if unmapped:
        print()
        print(f"NOTE: {len(unmapped)} genes not in pathway map (no KEGG annotation):")
        print(f"  {', '.join(sorted(unmapped))}")

    print()
    print("=" * 72)
    print("METHODOLOGY LIMITATIONS")
    print("=" * 72)
    print("""
  1. ASCERTAINMENT BIAS: Genes were selected for clinical/PGx relevance,
     not randomly sampled. Drug metabolism and neurotransmitter pathways
     are overrepresented by design, not because of unusual genetic load.

  2. SMALL N: With ~109 genes, statistical power is still low. The
     hypergeometric test is underpowered and most p-values will not
     survive multiple testing correction.

  3. MANUAL MAPPING: Pathway assignments are curated, not from a formal
     gene ontology database query. Some secondary pathway memberships
     may be missing.

  4. VARIANT CLASSIFICATION: 'Non-reference' includes heterozygous states
     that may have minimal functional impact. The binary variant/no-variant
     classification loses effect-size information.

  5. NOT A GWAS: This analysis cannot identify novel biology. It can only
     confirm that the existing panel is enriched where expected, and flag
     potential coverage gaps.
""")


if __name__ == "__main__":
    main()
