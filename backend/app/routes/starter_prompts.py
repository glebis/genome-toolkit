"""FastAPI endpoint for personalized Ask.ai starter prompts."""
from __future__ import annotations

import json
import os
from pathlib import Path

import yaml
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# Config paths
# ---------------------------------------------------------------------------
_PROJECT_ROOT = Path(__file__).resolve().parents[4]  # genome-toolkit/
_GWAS_DIR = _PROJECT_ROOT / "config" / "gwas"
_PGX_YAML = _PROJECT_ROOT / "config" / "pgx-drugs.yaml"

_MENTAL_HEALTH_TRAITS = {"depression", "anxiety", "bipolar", "schizophrenia", "ptsd", "adhd"}
_MENTAL_HEALTH_SYSTEMS = {"serotonin", "dopamine", "gaba", "hpa axis", "glutamate", "neuroplasticity"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_frontmatter(filepath: Path) -> dict:
    """Return YAML frontmatter dict from a vault .md file, or {}."""
    try:
        text = filepath.read_text(encoding="utf-8")
        if text.startswith("---"):
            end = text.index("---", 3)
            return yaml.safe_load(text[3:end]) or {}
    except Exception:
        pass
    return {}


def _strip_wikilink(val: str) -> str:
    """[[Foo]] -> Foo"""
    if val.startswith("[[") and val.endswith("]]"):
        return val[2:-2]
    return val


# ---------------------------------------------------------------------------
# Per-view generators — each returns list[dict] with keys text/subtitle/priority
# ---------------------------------------------------------------------------

async def _prompts_snps(genome_db) -> list[dict]:
    insights = await genome_db.get_insights()
    pathogenic = insights.get("pathogenic_count", 0)
    drug_resp = insights.get("drug_response_count", 0)
    actionable = insights.get("actionable_count", 0)
    top_genes = insights.get("top_genes", [])
    top_gene = top_genes[0]["gene"] if top_genes else None

    prompts = []
    prompts.append({
        "text": f"Which of my {pathogenic} pathogenic or likely-pathogenic variants matter most?",
        "subtitle": "ClinVar-classified variants that may affect health",
        "priority": 1,
    })
    prompts.append({
        "text": f"I have {drug_resp} drug-response variants — what should my doctor know?",
        "subtitle": "Pharmacogenomic relevance across your genome",
        "priority": 2,
    })
    if top_gene:
        prompts.append({
            "text": f"Tell me about my {top_gene} variants and what they mean",
            "subtitle": f"Your most-annotated gene with {top_genes[0]['count']} variants",
            "priority": 3,
        })
    else:
        prompts.append({
            "text": f"Summarize my {actionable} clinically actionable findings",
            "subtitle": "Variants with confirmed disease associations",
            "priority": 3,
        })
    return prompts[:3]


async def _prompts_mental_health(vault_path: str) -> list[dict]:
    # Find trait with most GWAS hits
    best_trait = None
    best_display = None
    best_count = 0
    for hits_file in _GWAS_DIR.glob("*-hits.json"):
        try:
            data = json.loads(hits_file.read_text())
            trait = data.get("trait", "")
            if trait not in _MENTAL_HEALTH_TRAITS:
                continue
            n = data.get("n_hits", 0)
            if n > best_count:
                best_count = n
                best_trait = trait
                best_display = data.get("display_name", trait.title())
        except Exception:
            continue

    # Find top mental-health genes from vault by evidence_tier + system relevance
    top_gene = None
    top_tier = "E9"
    if vault_path:
        genes_dir = Path(vault_path) / "Genes"
        if genes_dir.exists():
            for md in genes_dir.glob("*.md"):
                fm = _parse_frontmatter(md)
                systems_raw = fm.get("systems") or []
                systems_lower = {_strip_wikilink(str(s)).lower() for s in systems_raw}
                if not systems_lower.intersection(_MENTAL_HEALTH_SYSTEMS):
                    continue
                tier = fm.get("evidence_tier", "E9")
                if str(tier) < str(top_tier):
                    top_tier = str(tier)
                    top_gene = fm.get("gene_symbol") or md.stem

    prompts = []
    if best_trait:
        prompts.append({
            "text": f"What do my {best_display} GWAS hits mean for my personal risk?",
            "subtitle": f"{best_count:,} genome-wide significant hits analyzed",
            "priority": 1,
        })
    else:
        prompts.append({
            "text": "Do I carry any mental health risk variants?",
            "subtitle": "Cross-trait GWAS analysis across psychiatric conditions",
            "priority": 1,
        })

    if top_gene:
        prompts.append({
            "text": f"Explain my {top_gene} variants and their mental health relevance",
            "subtitle": f"Top evidence-tier gene in your vault ({top_tier})",
            "priority": 2,
        })
    else:
        prompts.append({
            "text": "Which neurotransmitter systems do my variants affect most?",
            "subtitle": "Serotonin, dopamine, GABA, and glutamate pathway analysis",
            "priority": 2,
        })

    prompts.append({
        "text": "What lifestyle or treatment factors are most relevant given my psychiatric genetics?",
        "subtitle": "Evidence-based actions matched to your variant profile",
        "priority": 3,
    })
    return prompts[:3]


async def _prompts_pgx(vault_path: str) -> list[dict]:
    total_drug_cards = 0
    actionable_enzyme = None
    actionable_status = None

    try:
        pgx_data = yaml.safe_load(_PGX_YAML.read_text())
        enzymes = pgx_data.get("enzymes", [])
    except Exception:
        enzymes = []

    for enzyme in enzymes:
        symbol = enzyme.get("symbol", "")
        cards = enzyme.get("drug_cards", [])
        total_drug_cards += len(cards)

        if actionable_enzyme:
            continue  # already found one, keep counting drug cards
        if vault_path:
            md = Path(vault_path) / "Genes" / f"{symbol}.md"
            if md.exists():
                fm = _parse_frontmatter(md)
                status = fm.get("personal_status", "")
                if status in ("actionable", "risk"):
                    actionable_enzyme = symbol
                    actionable_status = status

    prompts = []
    if actionable_enzyme:
        prompts.append({
            "text": f"My {actionable_enzyme} status is {actionable_status} — which of my medications are affected?",
            "subtitle": "Personalized drug interaction analysis",
            "priority": 1,
        })
    else:
        prompts.append({
            "text": "Which of my enzyme variants affect how I process medications?",
            "subtitle": "CYP450 and other pharmacogenes in your genome",
            "priority": 1,
        })

    prompts.append({
        "text": f"Show me a summary of all {total_drug_cards} drug cards relevant to my genotype",
        "subtitle": "Full pharmacogenomic profile across all enzymes",
        "priority": 2,
    })
    prompts.append({
        "text": "Are any of my PGx variants relevant for psychiatric medications?",
        "subtitle": "Antidepressants, antipsychotics, and mood stabilizers",
        "priority": 3,
    })
    return prompts[:3]


async def _prompts_addiction(vault_path: str) -> list[dict]:
    aldh2_genotype = None
    adh1b_genotype = None

    if vault_path:
        for symbol, target in [("ALDH2", "aldh2_genotype"), ("ADH1B", "adh1b_genotype")]:
            md = Path(vault_path) / "Genes" / f"{symbol}.md"
            if md.exists():
                fm = _parse_frontmatter(md)
                variants = fm.get("personal_variants") or []
                if variants and isinstance(variants[0], dict):
                    geno = variants[0].get("genotype")
                    if symbol == "ALDH2":
                        aldh2_genotype = geno
                    else:
                        adh1b_genotype = geno

    prompts = []
    if aldh2_genotype:
        prompts.append({
            "text": f"I have ALDH2 genotype {aldh2_genotype} — what does that mean for alcohol metabolism?",
            "subtitle": "Acetaldehyde clearance and flush reaction risk",
            "priority": 1,
        })
    else:
        prompts.append({
            "text": "What do my variants say about alcohol metabolism and sensitivity?",
            "subtitle": "ALDH2, ADH1B, and related enzyme analysis",
            "priority": 1,
        })

    if adh1b_genotype:
        prompts.append({
            "text": f"My ADH1B genotype is {adh1b_genotype} — how does this interact with my ALDH2 status?",
            "subtitle": "Combined alcohol metabolism enzyme profile",
            "priority": 2,
        })
    else:
        prompts.append({
            "text": "Do I have any variants associated with addiction vulnerability or protection?",
            "subtitle": "Dopamine, opioid, and alcohol pathway genetics",
            "priority": 2,
        })

    prompts.append({
        "text": "What does my genome say about cannabis sensitivity and THC metabolism?",
        "subtitle": "CYP2C9, CNR1, and endocannabinoid system variants",
        "priority": 3,
    })
    return prompts[:3]


async def _prompts_risk() -> list[dict]:
    gwas_count = len(list(_GWAS_DIR.glob("*-hits.json")))
    # Exclude clumped files from display count
    non_clumped = [f for f in _GWAS_DIR.glob("*-hits.json") if "clumped" not in f.name]
    trait_count = len(non_clumped)

    prompts = [
        {
            "text": f"Across {trait_count} risk traits in my genome, where do I sit in the population distribution?",
            "subtitle": f"{gwas_count} GWAS hit files loaded from PGC and OpenMed",
            "priority": 1,
        },
        {
            "text": "Which of my polygenic risk scores are most elevated compared to population averages?",
            "subtitle": "Genome-wide risk landscape summary",
            "priority": 2,
        },
        {
            "text": "What actionable steps can I take based on my highest-risk trait scores?",
            "subtitle": "Evidence-based interventions matched to your PRS profile",
            "priority": 3,
        },
    ]
    return prompts[:3]


# ---------------------------------------------------------------------------
# Capabilities helper
# ---------------------------------------------------------------------------

async def _get_capabilities(genome_db) -> list[str]:
    try:
        insights = await genome_db.get_insights()
        n = insights.get("total_variants", 0)
        variant_cap = f"Search {n:,} variants"
    except Exception:
        variant_cap = "Search your genome variants"
    return [
        "Read your vault notes",
        variant_cap,
        "Check drug interactions",
        "Add to checklist",
    ]


# ---------------------------------------------------------------------------
# Explore prompts (static)
# ---------------------------------------------------------------------------
_EXPLORE = [
    "What's interesting in my genome?",
    "What should I bring to my next doctor visit?",
]

_FALLBACK_CAPABILITIES = [
    "Read your vault notes",
    "Search your genome variants",
    "Check drug interactions",
    "Add to checklist",
]


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("/starter-prompts")
async def get_starter_prompts(view: str = Query("snps")):
    from backend.app.main import genome_db
    from backend.app.agent.tools import _vault_path

    vault_path: str = _vault_path or os.environ.get(
        "GENOME_VAULT_ROOT", os.environ.get("GENOME_VAULT_PATH", os.path.expanduser("~/genome-vault"))
    )

    # Capabilities (best-effort)
    try:
        capabilities = await _get_capabilities(genome_db)
    except Exception:
        capabilities = _FALLBACK_CAPABILITIES

    # Dispatch per-view generator
    try:
        if view == "snps":
            prompts = await _prompts_snps(genome_db)
        elif view == "mental-health":
            prompts = await _prompts_mental_health(vault_path)
        elif view == "pgx":
            prompts = await _prompts_pgx(vault_path)
        elif view == "addiction":
            prompts = await _prompts_addiction(vault_path)
        elif view == "risk":
            prompts = await _prompts_risk()
        else:
            prompts = await _prompts_snps(genome_db)
    except Exception:
        prompts = []

    return {
        "capabilities": capabilities,
        "prompts": prompts,
        "explore": _EXPLORE,
    }
