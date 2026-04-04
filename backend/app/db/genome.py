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
    ) -> dict:
        conditions = []
        params: list = []

        if search:
            conditions.append("(rsid LIKE ? OR rsid = ?)")
            params.extend([f"%{search}%", search])

        if chromosome:
            conditions.append("chromosome = ?")
            params.append(chromosome)

        if source:
            conditions.append("source = ?")
            params.append(source)

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        count_sql = f"SELECT COUNT(*) FROM snps {where}"
        async with self._conn.execute(count_sql, params) as cursor:
            total = (await cursor.fetchone())[0]

        offset = (page - 1) * limit
        data_sql = (
            f"SELECT rsid, chromosome, position, genotype, is_rsid, source, r2_quality "
            f"FROM snps {where} ORDER BY chromosome, position LIMIT ? OFFSET ?"
        )
        async with self._conn.execute(data_sql, params + [limit, offset]) as cursor:
            rows = await cursor.fetchall()
            items = [dict(row) for row in rows]

        return {"items": items, "total": total, "page": page, "limit": limit}

    async def get_snp(self, rsid: str) -> dict | None:
        sql = "SELECT rsid, chromosome, position, genotype, is_rsid, source, r2_quality FROM snps WHERE rsid = ?"
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
