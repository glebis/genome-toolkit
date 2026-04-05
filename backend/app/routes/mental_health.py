"""Mental health dashboard API — reads vault notes, returns structured dashboard data."""
from pathlib import Path

from fastapi import APIRouter

from backend.app.agent import tools as _tools

router = APIRouter(prefix="/api/mental-health")


def _normalize_gene_symbol(symbol: str) -> str:
    """Normalize gene symbol for file lookup: MAO-A -> MAOA, SLC6A3 -> SLC6A3."""
    return symbol.replace("-", "").upper()


def _read_gene_note(symbol: str) -> dict | None:
    if not _tools._vault_path:
        return None
    normalized = _normalize_gene_symbol(symbol)
    vault = _tools._vault_path
    gene_file = Path(vault) / "Genes" / f"{normalized}.md"
    if not gene_file.exists():
        gene_file = Path(vault) / "Genes" / f"{symbol}.md"
    if not gene_file.exists():
        genes_dir = Path(vault) / "Genes"
        if genes_dir.exists():
            for f in genes_dir.iterdir():
                if f.stem.upper().replace("-", "") == normalized:
                    gene_file = f
                    break
    if not gene_file.exists():
        return None
    content = gene_file.read_text()
    return {"symbol": symbol, "content": content}


@router.get("/genes")
async def list_mental_health_genes():
    mh_genes = [
        "MTHFR", "COMT", "MAO-A", "SLC6A4", "BDNF",
        "GAD1", "CRHR1", "FKBP5", "TPH2", "HTR2A",
        "DRD2", "DRD4", "OPRM1", "GABRA2", "SLC6A3",
    ]
    result = []
    for symbol in mh_genes:
        note = _read_gene_note(symbol)
        result.append({"symbol": symbol, "has_vault_note": note is not None})
    return {"genes": result}


@router.get("/genes/{symbol}")
async def get_gene_detail(symbol: str):
    note = _read_gene_note(symbol.upper())
    if not note:
        return {"error": f"No vault note found for {symbol}"}
    return note
