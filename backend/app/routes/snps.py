"""REST API routes for SNP data."""
import os

from fastapi import APIRouter, HTTPException, Query

from backend.app.main import genome_db

VAULT_PATH = os.environ.get("GENOME_VAULT_PATH", os.path.expanduser("~/Brains/genome"))

router = APIRouter(prefix="/api")


@router.get("/snps")
async def list_snps(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    search: str | None = None,
    chr: str | None = None,
    source: str | None = None,
    clinical: bool = False,
    significance: str | None = None,
    gene: str | None = None,
    zygosity: str | None = None,
    condition: str | None = None,
):
    return await genome_db.query_snps(
        page=page, limit=limit, search=search, chromosome=chr, source=source,
        clinically_relevant=clinical, significance=significance, gene=gene,
        zygosity=zygosity, condition=condition,
    )


@router.get("/genes")
async def list_genes():
    return await genome_db.list_genes(vault_path=VAULT_PATH)


@router.get("/snps/{rsid}")
async def get_snp(rsid: str):
    snp = await genome_db.get_snp(rsid)
    if not snp:
        raise HTTPException(status_code=404, detail="Variant not found")
    return snp


@router.get("/snps/{rsid}/guidance")
async def get_variant_guidance(rsid: str):
    guidance = await genome_db.get_variant_guidance(rsid)
    if not guidance:
        raise HTTPException(status_code=404, detail="Variant not found")
    return guidance


@router.get("/insights")
async def get_insights():
    return await genome_db.get_insights()


@router.get("/stats")
async def get_stats():
    return await genome_db.get_stats()
