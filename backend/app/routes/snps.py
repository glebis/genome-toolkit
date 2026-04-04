"""REST API routes for SNP data."""
from fastapi import APIRouter, HTTPException, Query

from backend.app.main import genome_db

router = APIRouter(prefix="/api")


@router.get("/snps")
async def list_snps(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    search: str | None = None,
    chr: str | None = None,
    source: str | None = None,
    clinical: bool = False,
):
    return await genome_db.query_snps(
        page=page, limit=limit, search=search, chromosome=chr, source=source,
        clinically_relevant=clinical,
    )


@router.get("/snps/{rsid}")
async def get_snp(rsid: str):
    snp = await genome_db.get_snp(rsid)
    if not snp:
        raise HTTPException(status_code=404, detail="Variant not found")
    return snp


@router.get("/stats")
async def get_stats():
    return await genome_db.get_stats()
