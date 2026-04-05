"""Custom MCP tools for the genome agent.

These tools are registered via create_sdk_mcp_server() and give the agent
access to the user's genome data in SQLite and the Obsidian vault.
"""
import json
import os
from pathlib import Path
from typing import Any

from claude_agent_sdk import tool, create_sdk_mcp_server, ToolAnnotations


# Global references — set by main.py at startup
_genome_db = None
_vault_path: str | None = None


def set_genome_db(db):
    global _genome_db
    _genome_db = db


def set_vault_path(path: str):
    global _vault_path
    _vault_path = path


@tool(
    "query_snps",
    "Search and filter the user's genetic variants. Returns matching SNPs with rsID, chromosome, position, genotype, and source. Use this when the user asks about specific variants, genes, chromosomes, or wants to explore their data.",
    {
        "search": str,
        "chromosome": str,
        "source": str,
        "limit": int,
    },
    annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False),
)
async def query_snps(args: dict[str, Any]) -> dict[str, Any]:
    result = await _genome_db.query_snps(
        search=args.get("search"),
        chromosome=args.get("chromosome"),
        source=args.get("source"),
        limit=args.get("limit", 20),
    )
    items = result["items"]
    if not items:
        text = "No variants found matching your query."
    else:
        lines = [f"Found {result['total']} variants. Showing first {len(items)}:\n"]
        for snp in items:
            lines.append(
                f"- {snp['rsid']}: chr{snp['chromosome']}:{snp['position']} "
                f"genotype={snp['genotype']} source={snp['source']}"
            )
        text = "\n".join(lines)
    return {"content": [{"type": "text", "text": text}]}


@tool(
    "get_snp_detail",
    "Get full details for a specific variant by rsID. Use when the user asks about a specific SNP like 'what is rs1800497'.",
    {"rsid": str},
    annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False),
)
async def get_snp_detail(args: dict[str, Any]) -> dict[str, Any]:
    snp = await _genome_db.get_snp(args["rsid"])
    if not snp:
        text = f"Variant {args['rsid']} not found in your data."
    else:
        text = json.dumps(snp, indent=2)
    return {"content": [{"type": "text", "text": text}]}


@tool(
    "get_genome_stats",
    "Get summary statistics about the user's loaded genetic data: total variants, genotyped count, imputed count, chromosomes covered.",
    {},
    annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False),
)
async def get_genome_stats(args: dict[str, Any]) -> dict[str, Any]:
    stats = await _genome_db.get_stats()
    text = (
        f"Your genome data:\n"
        f"- Total variants: {stats['total']:,}\n"
        f"- Genotyped: {stats['genotyped']:,}\n"
        f"- Imputed: {stats['imputed']:,}\n"
        f"- Chromosomes: {stats['chromosomes']}"
    )
    return {"content": [{"type": "text", "text": text}]}


@tool(
    "update_table_view",
    """Update the SNP browser table in the user's UI. Sets filters and the frontend applies them.
IMPORTANT: By default the UI has an ACTIONABLE filter ON that hides benign/not-provided variants.
When you search for specific variants, genes, or conditions, set clear_restrictive_filters=true
to disable ACTIONABLE and significance filters so results are not hidden.
Only keep ACTIONABLE on when the user explicitly asks for actionable/clinically relevant variants.""",
    {
        "search": str,
        "chromosome": str,
        "source": str,
        "gene": str,
        "condition": str,
        "significance": str,
        "zygosity": str,
        "clear_restrictive_filters": bool,
    },
)
async def update_table_view(args: dict[str, Any]) -> dict[str, Any]:
    text = f"Table view updated with filters: {json.dumps(args)}"
    return {"content": [{"type": "text", "text": text}]}


@tool(
    "suggest_responses",
    "Suggest 2-4 follow-up responses the user can click to continue the conversation. ALWAYS call this tool at the end of every response. Provide short, actionable options that help the user explore their genome data further.",
    {
        "suggestions": str,  # JSON array of strings will be passed
    },
)
async def suggest_responses(args: dict[str, Any]) -> dict[str, Any]:
    # The suggestions are intercepted by the SSE handler and sent as a ui_action event.
    # The tool just acknowledges.
    return {"content": [{"type": "text", "text": "Suggestions displayed to user."}]}


@tool(
    "voice_summary",
    """Provide a short 1-3 sentence spoken summary of your response for text-to-speech.
ONLY call this when voice mode is active (indicated in the conversation context).
Rules for voice output:
- Spell gene names letter by letter with dashes: CYP2D6 → C-Y-P-2-D-6
- Spell rsIDs: rs4680 → r-s-4-6-8-0
- No markdown, no tables, no lists
- Conversational, warm tone
- Focus on what matters most and what to do about it
- Keep under 30 seconds of speech (roughly 60-80 words)
- You can use Orpheus emotion tags: [cheerful], [whisper], [calm], [excited]
- You can embed sounds: <laugh>, <sigh>, <gasp>, <chuckle>""",
    {"text": str, "emotion": str},
)
async def voice_summary(args: dict[str, Any]) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": "Voice summary delivered."}]}


@tool(
    "read_gene_note",
    """Read the detailed gene note from the personal genomics vault. Returns the FULL note including:
- Gene description and what it does
- Personal variants with genotypes and clinical significance
- Drug interaction tables (which medications to avoid/adjust)
- Gene-gene interactions
- Actionable recommendations (what to change in behavior)
- Evidence tier and scientific sources
- Personal status (risk/neutral/optimal)

ALWAYS use this tool when the user asks about a specific gene. The vault contains
personalized, curated information that is far richer than ClinVar data alone.
Available genes: check with list_vault_notes first.""",
    {"gene_symbol": str},
    annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False),
)
async def read_gene_note(args: dict[str, Any]) -> dict[str, Any]:
    if not _vault_path:
        return {"content": [{"type": "text", "text": "Vault path not configured."}]}

    gene = args["gene_symbol"].upper()
    gene_file = Path(_vault_path) / "Genes" / f"{gene}.md"

    if not gene_file.exists():
        # Try case-insensitive match
        genes_dir = Path(_vault_path) / "Genes"
        if genes_dir.exists():
            for f in genes_dir.iterdir():
                if f.stem.upper() == gene:
                    gene_file = f
                    break

    if not gene_file.exists():
        return {"content": [{"type": "text", "text": f"No vault note found for gene {gene}. Available genes can be listed with list_vault_notes."}]}

    content = gene_file.read_text()
    return {"content": [{"type": "text", "text": content}]}


@tool(
    "read_vault_note",
    """Read any note from the personal genomics vault by type and name.
Types: Genes, Systems, Phenotypes, Protocols, Reports, Assessments.
Example: type=Systems, name=Drug Metabolism → reads Systems/Drug Metabolism.md
Use this to get context about biological systems, compound phenotypes, or treatment protocols.""",
    {"note_type": str, "name": str},
    annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False),
)
async def read_vault_note(args: dict[str, Any]) -> dict[str, Any]:
    if not _vault_path:
        return {"content": [{"type": "text", "text": "Vault path not configured."}]}

    note_type = args["note_type"]
    name = args["name"]
    note_file = Path(_vault_path) / note_type / f"{name}.md"

    if not note_file.exists():
        # Try case-insensitive search
        type_dir = Path(_vault_path) / note_type
        if type_dir.exists():
            for f in type_dir.iterdir():
                if f.stem.lower() == name.lower():
                    note_file = f
                    break

    if not note_file.exists():
        return {"content": [{"type": "text", "text": f"No vault note found: {note_type}/{name}.md"}]}

    content = note_file.read_text()
    return {"content": [{"type": "text", "text": content}]}


@tool(
    "list_vault_notes",
    "List all available notes in the vault by type. Returns note names for Genes, Systems, Phenotypes, Protocols, Reports, Assessments. Use this to discover what information is available before reading specific notes.",
    {"note_type": str},
    annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False),
)
async def list_vault_notes(args: dict[str, Any]) -> dict[str, Any]:
    if not _vault_path:
        return {"content": [{"type": "text", "text": "Vault path not configured."}]}

    note_type = args.get("note_type", "Genes")
    type_dir = Path(_vault_path) / note_type

    if not type_dir.exists():
        available = [d.name for d in Path(_vault_path).iterdir() if d.is_dir() and not d.name.startswith('.')]
        return {"content": [{"type": "text", "text": f"Type '{note_type}' not found. Available: {', '.join(sorted(available))}"}]}

    notes = sorted([f.stem for f in type_dir.iterdir() if f.suffix == '.md'])
    text = f"{note_type} ({len(notes)} notes):\n" + "\n".join(f"- {n}" for n in notes)
    return {"content": [{"type": "text", "text": text}]}


@tool(
    "suggest_actions",
    """Suggest 1-4 actionable items the user can execute with one click. Call this at the end of responses when there are concrete next steps.

Each action is a JSON object with:
- type: "add_to_checklist" | "show_gene" | "show_variant" | "open_link"
- label: short button text (e.g. "Add to checklist", "View MTHFR details")
- params: type-specific parameters

Parameter schemas by type:
- add_to_checklist: { title, gene_symbol?, action_type?, health_domain?, practical_category? }
- show_gene: { gene_symbol }
- show_variant: { rsid }
- open_link: { url, title? }

Pass a JSON array of action objects as the "actions" parameter.""",
    {"actions": str},
)
async def suggest_actions(args: dict[str, Any]) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": "Actions displayed to user."}]}


def create_genome_mcp_server():
    """Create an in-process MCP server with all genome tools."""
    return create_sdk_mcp_server(
        name="genome",
        version="1.0.0",
        tools=[
            query_snps, get_snp_detail, get_genome_stats,
            update_table_view, suggest_responses, suggest_actions,
            voice_summary,
            read_gene_note, read_vault_note, list_vault_notes,
        ],
    )
