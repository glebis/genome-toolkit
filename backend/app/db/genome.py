"""Async SQLite wrapper for genome.db (variant storage)."""
from pathlib import Path

import aiosqlite


class GenomeDB:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._conn: aiosqlite.Connection | None = None

    async def connect(self):
        self._conn = await aiosqlite.connect(self.db_path)
        self._conn.row_factory = aiosqlite.Row

    async def close(self):
        if self._conn:
            await self._conn.close()

    async def count(self) -> int:
        async with self._conn.execute("SELECT COUNT(*) FROM snps") as cursor:
            row = await cursor.fetchone()
            return row[0]

    async def query_snps(
        self,
        page: int = 1,
        limit: int = 50,
        search: str | None = None,
        chromosome: str | None = None,
        source: str | None = None,
        clinically_relevant: bool = False,
        significance: str | None = None,
        gene: str | None = None,
        zygosity: str | None = None,
        condition: str | None = None,
    ) -> dict:
        conditions = []
        params: list = []

        if search:
            conditions.append("""(
                s.rsid LIKE ? OR s.rsid = ?
                OR json_extract(e_mv.data, '$.gene_symbol') LIKE ?
                OR json_extract(e_cv.data, '$.disease_name') LIKE ?
            )""")
            params.extend([f"%{search}%", search, f"%{search}%", f"%{search}%"])

        if chromosome:
            conditions.append("s.chromosome = ?")
            params.append(chromosome)

        if source:
            conditions.append("s.source = ?")
            params.append(source)

        if clinically_relevant:
            conditions.append("""
                e_cv.rsid IS NOT NULL
                AND json_extract(e_cv.data, '$.clinical_significance') NOT IN (
                    'Benign', 'Likely benign', 'Benign/Likely benign',
                    'not provided', 'no classification for the single variant',
                    'no classifications from unflagged records'
                )
                AND json_extract(e_cv.data, '$.disease_name') NOT IN ('not provided', 'not specified', '')
            """)

        if significance:
            conditions.append("json_extract(e_cv.data, '$.clinical_significance') LIKE ?")
            params.append(f"%{significance}%")

        if gene:
            conditions.append("json_extract(e_mv.data, '$.gene_symbol') = ?")
            params.append(gene.upper())

        if condition:
            conditions.append("json_extract(e_cv.data, '$.disease_name') LIKE ?")
            params.append(f"%{condition}%")

        if zygosity == "homozygous":
            conditions.append("length(s.genotype) = 2 AND substr(s.genotype, 1, 1) = substr(s.genotype, 2, 1)")
        elif zygosity == "heterozygous":
            conditions.append("length(s.genotype) = 2 AND substr(s.genotype, 1, 1) != substr(s.genotype, 2, 1)")

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        # Need myvariant join when gene filter is used
        mv_join = "LEFT JOIN enrichments e_mv ON s.rsid = e_mv.rsid AND e_mv.source = 'myvariant'"

        count_sql = f"""
            SELECT COUNT(*) FROM snps s
            LEFT JOIN enrichments e_cv ON s.rsid = e_cv.rsid AND e_cv.source = 'clinvar'
            {mv_join}
            {where}
        """
        async with self._conn.execute(count_sql, params) as cursor:
            total = (await cursor.fetchone())[0]

        offset = (page - 1) * limit
        data_sql = f"""
            SELECT s.rsid, s.chromosome, s.position, s.genotype, s.is_rsid,
                   s.source, s.r2_quality,
                   json_extract(e_cv.data, '$.clinical_significance') as significance,
                   json_extract(e_cv.data, '$.disease_name') as disease,
                   json_extract(e_mv.data, '$.gene_symbol') as gene_symbol
            FROM snps s
            LEFT JOIN enrichments e_cv ON s.rsid = e_cv.rsid AND e_cv.source = 'clinvar'
            {mv_join}
            {where}
            ORDER BY CASE
                WHEN s.chromosome GLOB '[0-9]*' THEN CAST(s.chromosome AS INTEGER)
                WHEN s.chromosome = 'X' THEN 23
                WHEN s.chromosome = 'Y' THEN 24
                WHEN s.chromosome = 'MT' THEN 25
                ELSE 26
            END, s.position
            LIMIT ? OFFSET ?
        """
        async with self._conn.execute(data_sql, params + [limit, offset]) as cursor:
            rows = await cursor.fetchall()
            items = [dict(row) for row in rows]

        return {"items": items, "total": total, "page": page, "limit": limit}

    async def list_genes(self) -> list[str]:
        """Return all gene symbols from myvariant enrichments."""
        sql = """
            SELECT DISTINCT json_extract(data, '$.gene_symbol') as gene
            FROM enrichments WHERE source = 'myvariant'
            AND gene IS NOT NULL
            ORDER BY gene
        """
        async with self._conn.execute(sql) as cursor:
            return [row[0] for row in await cursor.fetchall()]

    async def get_snp(self, rsid: str) -> dict | None:
        sql = """
            SELECT s.rsid, s.chromosome, s.position, s.genotype, s.is_rsid,
                   s.source, s.r2_quality,
                   json_extract(e_cv.data, '$.clinical_significance') as significance,
                   json_extract(e_cv.data, '$.disease_name') as disease,
                   json_extract(e_cv.data, '$.review_status') as review_status,
                   json_extract(e_cv.data, '$.ref') as ref_allele,
                   json_extract(e_cv.data, '$.alt') as alt_allele,
                   json_extract(e_mv.data, '$.gene_name') as gene_name,
                   json_extract(e_mv.data, '$.clinvar_significance') as mv_significance
            FROM snps s
            LEFT JOIN enrichments e_cv ON s.rsid = e_cv.rsid AND e_cv.source = 'clinvar'
            LEFT JOIN enrichments e_mv ON s.rsid = e_mv.rsid AND e_mv.source = 'myvariant'
            WHERE s.rsid = ?
        """
        async with self._conn.execute(sql, [rsid]) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def get_stats(self) -> dict:
        stats = {}
        async with self._conn.execute("SELECT COUNT(*) FROM snps") as c:
            stats["total"] = (await c.fetchone())[0]
        async with self._conn.execute("SELECT COUNT(*) FROM snps WHERE source = 'genotyped'") as c:
            stats["genotyped"] = (await c.fetchone())[0]
        async with self._conn.execute("SELECT COUNT(*) FROM snps WHERE source = 'imputed'") as c:
            stats["imputed"] = (await c.fetchone())[0]
        async with self._conn.execute("SELECT COUNT(DISTINCT chromosome) FROM snps") as c:
            stats["chromosomes"] = (await c.fetchone())[0]
        return stats

    async def insert_batch(self, records: list[tuple]) -> int:
        """Insert a batch of SNP records. Returns number inserted."""
        await self._conn.executemany(
            "INSERT OR IGNORE INTO snps (rsid, chromosome, position, genotype, is_rsid, source, r2_quality) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            records,
        )
        await self._conn.commit()
        return len(records)

    async def ensure_schema(self):
        """Create tables if they don't exist (for fresh databases)."""
        await self._conn.execute("""
            CREATE TABLE IF NOT EXISTS snps (
                rsid TEXT PRIMARY KEY,
                chromosome TEXT NOT NULL,
                position INTEGER NOT NULL,
                genotype TEXT NOT NULL,
                is_rsid BOOLEAN NOT NULL DEFAULT 1,
                source TEXT DEFAULT 'genotyped',
                r2_quality REAL,
                imported_at TEXT DEFAULT (datetime('now'))
            )
        """)
        await self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_snps_chr_pos ON snps(chromosome, position)"
        )
        await self._conn.commit()
