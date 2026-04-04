"""Custom MCP tools for the genome agent.

These tools are registered via create_sdk_mcp_server() and give the agent
access to the user's genome data in SQLite.
"""
import json
from typing import Any

from claude_agent_sdk import tool, create_sdk_mcp_server, ToolAnnotations


# Global reference to genome_db — set by main.py at startup
_genome_db = None


def set_genome_db(db):
    global _genome_db
    _genome_db = db


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
    "Update the SNP browser table in the user's UI. Use this to filter, search, or highlight specific variants in response to the user's questions. The frontend will apply these filters.",
    {
        "search": str,
        "chromosome": str,
        "source": str,
        "highlight_rsid": str,
    },
)
async def update_table_view(args: dict[str, Any]) -> dict[str, Any]:
    text = f"Table view updated with filters: {json.dumps(args)}"
    return {"content": [{"type": "text", "text": text}]}


def create_genome_mcp_server():
    """Create an in-process MCP server with all genome tools."""
    return create_sdk_mcp_server(
        name="genome",
        version="1.0.0",
        tools=[query_snps, get_snp_detail, get_genome_stats, update_table_view],
    )
