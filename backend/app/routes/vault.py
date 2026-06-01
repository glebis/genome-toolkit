"""Vault-backed data API — reads gene notes from Obsidian vault and serves config YAML."""
import re
from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException

from backend.app.agent import tools as _tools

router = APIRouter(prefix="/api")


def _get_vault_path() -> Path:
    """Return the vault path or raise 503 if not configured."""
    if not _tools._vault_path:
        raise HTTPException(status_code=503, detail="Vault path not configured")
    return Path(_tools._vault_path)


def _strip_wikilinks(value: str) -> str:
    """Remove Obsidian wikilink brackets: '[[Foo]]' -> 'Foo'."""
    return re.sub(r"\[\[([^\]]+)\]\]", r"\1", value)


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    """Split a markdown file into YAML frontmatter dict and body text."""
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    fm = yaml.safe_load(parts[1]) or {}
    body = parts[2]
    return fm, body


def _count_studies(body: str) -> int:
    """Count reference-like lines in the body (PMID, doi:, pubmed)."""
    count = 0
    for line in body.splitlines():
        if re.search(r"(PMID|doi:|pubmed)", line, re.IGNORECASE):
            count += 1
    return count


def _parse_gene_file(filepath: Path) -> dict | None:
    """Parse a single gene .md file into a structured dict."""
    try:
        text = filepath.read_text()
    except Exception:
        return None

    fm, body = _parse_frontmatter(text)
    if not fm or fm.get("type") != "gene":
        return None

    # Clean systems wikilinks
    systems = fm.get("systems", [])
    if isinstance(systems, list):
        systems = [_strip_wikilinks(s) if isinstance(s, str) else s for s in systems]

    return {
        "symbol": fm.get("gene_symbol", filepath.stem),
        "full_name": fm.get("full_name", ""),
        "chromosome": fm.get("chromosome", ""),
        "systems": systems,
        "personal_variants": fm.get("personal_variants", []),
        "evidence_tier": fm.get("evidence_tier", ""),
        "personal_status": fm.get("personal_status", ""),
        "relevance": fm.get("relevance", ""),
        "description": fm.get("description", ""),
        "tags": fm.get("tags", []),
        "study_count": _count_studies(body),
        "has_vault_note": True,
    }


# ---------------------------------------------------------------------------
# GET /api/vault/genes
# ---------------------------------------------------------------------------


@router.get("/vault/genes")
async def list_vault_genes():
    vault = _get_vault_path()
    genes_dir = vault / "Genes"
    if not genes_dir.exists():
        return {"genes": [], "total": 0}

    genes = []
    for f in sorted(genes_dir.iterdir()):
        if f.suffix != ".md":
            continue
        gene = _parse_gene_file(f)
        if gene:
            genes.append(gene)

    return {"genes": genes, "total": len(genes)}


# ---------------------------------------------------------------------------
# GET /api/vault/genes/{symbol}/actions
# ---------------------------------------------------------------------------

_ACTION_HEADING_RE = re.compile(
    r"^##\s+(Recommended\s+Actions|Actions|Action\s+Items|What\s+Changes\s+This|What\s+To\s+Do|Actionable\s+Recommendations)\s*$", re.IGNORECASE
)
_BOLD_ACTION_RE = re.compile(
    r"^-\s+\*\*(Consider|Monitor|Discuss|Avoid)\*\*:\s*(.+)", re.IGNORECASE
)
_VERB_ACTION_RE = re.compile(
    r"^-\s+(Consider|Monitor|Discuss|Avoid|Test|Check|Ask)\b\s*(.+)", re.IGNORECASE
)


def _parse_actions(body: str, gene_symbol: str) -> list[dict]:
    """Extract action items from the markdown body."""
    actions: list[dict] = []
    in_action_section = False

    for line in body.splitlines():
        stripped = line.strip()

        # Track whether we're inside an action heading section
        if stripped.startswith("## "):
            in_action_section = bool(_ACTION_HEADING_RE.match(stripped))
            continue

        # Bold-prefixed actions (anywhere in the doc)
        m = _BOLD_ACTION_RE.match(stripped)
        if m:
            actions.append({
                "type": m.group(1).lower(),
                "title": m.group(2).strip(),
                "gene_symbol": gene_symbol,
            })
            continue

        # Verb-prefixed actions (anywhere in the doc)
        m = _VERB_ACTION_RE.match(stripped)
        if m:
            actions.append({
                "type": m.group(1).lower(),
                "title": m.group(2).strip(),
                "gene_symbol": gene_symbol,
            })
            continue

        # "- **Title**: Description" format (common in vault notes)
        if in_action_section and stripped.startswith("- **"):
            parts = stripped.lstrip("- ").split("**", 2)
            if len(parts) >= 3:
                title = parts[1].strip(":").strip()
                desc = parts[2].strip(":").strip()
                # Infer action type from content
                lower = (title + " " + desc).lower()
                atype = "consider"
                if any(w in lower for w in ["test", "measure", "check", "blood", "level"]):
                    atype = "monitor"
                elif any(w in lower for w in ["discuss", "ask", "doctor", "clinician"]):
                    atype = "discuss"
                elif any(w in lower for w in ["exercise", "meditation", "walk", "sleep", "avoid", "reduce"]):
                    atype = "try"
                actions.append({
                    "type": atype,
                    "title": title,
                    "description": desc,
                    "gene_symbol": gene_symbol,
                })
                continue

        # Plain bullet items inside action sections
        if in_action_section and stripped.startswith("- "):
            title = stripped[2:].strip()
            if title:
                actions.append({
                    "type": "consider",
                    "title": title,
                    "gene_symbol": gene_symbol,
                })

    return actions


@router.get("/vault/genes/{symbol}/actions")
async def get_gene_actions(symbol: str):
    vault = _get_vault_path()
    gene_symbol = symbol.upper()
    gene_file = vault / "Genes" / f"{gene_symbol}.md"

    # Case-insensitive fallback
    if not gene_file.exists():
        genes_dir = vault / "Genes"
        if genes_dir.exists():
            for f in genes_dir.iterdir():
                if f.stem.upper() == gene_symbol and f.suffix == ".md":
                    gene_file = f
                    break

    if not gene_file.exists():
        raise HTTPException(status_code=404, detail=f"No vault note found for {symbol}")

    try:
        text = gene_file.read_text()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    _, body = _parse_frontmatter(text)
    actions = _parse_actions(body, gene_symbol)
    return {"actions": actions}


# ---------------------------------------------------------------------------
# GET /api/vault/systems
# ---------------------------------------------------------------------------

_CONFIG_DIR = Path(__file__).resolve().parents[3] / "config"


def _load_pathway_systems() -> dict:
    """Load pathway systems from config/pathway-systems.yaml."""
    config_file = _CONFIG_DIR / "pathway-systems.yaml"
    if not config_file.exists():
        return {"systems": {}, "goal_pills": []}
    data = yaml.safe_load(config_file.read_text()) or {}
    return data


@router.get("/vault/systems")
async def list_vault_systems(domain: str | None = None):
    """Return pathway systems from config, enriched with actual gene counts from vault.

    Optional query param `domain` filters to systems for a specific view
    (mental-health, addiction, risk, pgx).
    """
    config = _load_pathway_systems()
    systems_config = config.get("systems", {})

    # Build a map of all vault genes by their system tags
    system_genes = _build_system_genes_map()

    # Enrich config systems with actual gene counts
    result = {}
    for key, sys in systems_config.items():
        domains = sys.get("domains", [])
        if domain and domain not in domains:
            continue

        # Find matching genes from vault
        matched_genes: list[str] = []
        for tag in sys.get("tags", []):
            matched_genes.extend(system_genes.get(tag, []))
        # Deduplicate preserving order
        seen: set[str] = set()
        unique_genes = []
        for g in matched_genes:
            if g not in seen:
                seen.add(g)
                unique_genes.append(g)

        result[key] = {
            "name": sys["name"],
            "tags": sys.get("tags", []),
            "domains": domains,
            "gene_count": len(unique_genes),
            "genes": unique_genes,
        }

    # Find systems in vault that aren't in config (undiscovered)
    configured_tags = set()
    for sys in systems_config.values():
        for tag in sys.get("tags", []):
            configured_tags.add(tag)

    unconfigured = {}
    for tag, genes in system_genes.items():
        if tag not in configured_tags:
            unconfigured[tag] = {"gene_count": len(genes), "genes": genes}

    return {
        "systems": result,
        "unconfigured": unconfigured,
        "goal_pills": config.get("goal_pills", []),
    }


# ---------------------------------------------------------------------------
# GET /api/vault/gene-sections  (cross-section gene index, #35)
# ---------------------------------------------------------------------------

# Systems-derived membership is limited to these domains. Risk and PGx
# membership come from their dedicated config sources (risk-landscape
# relevant_genes, pgx-drugs symbols) so the index matches what each view
# actually renders.
_TAG_DERIVED_DOMAINS = {"mental-health", "addiction"}


def build_gene_section_index(
    systems_config: dict,
    system_genes: dict[str, list[str]],
    risk_genes: list[str],
    pgx_symbols: list[str],
) -> dict[str, list[str]]:
    """Map each gene symbol (upper-cased) to the sorted sections it appears in.

    Sources:
      - pathway-systems tag match -> mental-health / addiction
      - risk-landscape relevant_genes -> risk
      - pgx-drugs enzyme symbols -> pgx
    """
    index: dict[str, set[str]] = {}

    def add(symbol: str, section: str) -> None:
        index.setdefault(symbol.upper(), set()).add(section)

    for sys in systems_config.values():
        domains = [d for d in sys.get("domains", []) if d in _TAG_DERIVED_DOMAINS]
        if not domains:
            continue
        for tag in sys.get("tags", []):
            for symbol in system_genes.get(tag, []):
                for domain in domains:
                    add(symbol, domain)

    for symbol in risk_genes:
        add(symbol, "risk")

    for symbol in pgx_symbols:
        add(symbol, "pgx")

    return {symbol: sorted(sections) for symbol, sections in index.items()}


def _build_system_genes_map() -> dict[str, list[str]]:
    """Map vault system tags to the gene symbols carrying them."""
    vault = _get_vault_path()
    genes_dir = vault / "Genes"
    system_genes: dict[str, list[str]] = {}
    if genes_dir.exists():
        for f in sorted(genes_dir.iterdir()):
            if f.suffix != ".md":
                continue
            gene = _parse_gene_file(f)
            if not gene:
                continue
            for sys_tag in gene.get("systems", []):
                normalized = sys_tag.split("|")[0].strip()
                system_genes.setdefault(normalized, []).append(gene["symbol"])
    return system_genes


def _load_config_file(name: str) -> dict:
    config_file = _CONFIG_DIR / name
    if not config_file.exists():
        return {}
    return yaml.safe_load(config_file.read_text()) or {}


@router.get("/vault/gene-sections")
async def list_gene_sections():
    """Return the cross-section gene index: {symbol: [sections]}."""
    systems_config = _load_pathway_systems().get("systems", {})
    system_genes = _build_system_genes_map()

    risk = _load_config_file("risk-landscape.yaml")
    causes = risk.get("causes", risk if isinstance(risk, list) else [])
    risk_genes: list[str] = []
    for cause in causes:
        risk_genes.extend(cause.get("relevant_genes", []))

    pgx = _load_config_file("pgx-drugs.yaml")
    enzymes = pgx.get("enzymes", pgx if isinstance(pgx, list) else [])
    pgx_symbols = [e["symbol"] for e in enzymes if e.get("symbol")]

    index = build_gene_section_index(
        systems_config=systems_config,
        system_genes=system_genes,
        risk_genes=risk_genes,
        pgx_symbols=pgx_symbols,
    )
    return {"index": index}


# ---------------------------------------------------------------------------
# GET /api/config/{name}
# ---------------------------------------------------------------------------


@router.get("/config/{name}")
async def get_config(name: str):
    # Prevent path traversal
    if ".." in name or "/" in name or "\\" in name:
        raise HTTPException(status_code=400, detail="Invalid config name")

    # Ensure .yaml extension
    if not name.endswith(".yaml") and not name.endswith(".yml"):
        name = f"{name}.yaml"

    config_file = _CONFIG_DIR / name
    if not config_file.exists():
        raise HTTPException(status_code=404, detail=f"Config '{name}' not found")

    try:
        data = yaml.safe_load(config_file.read_text())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse config: {e}")

    return data
