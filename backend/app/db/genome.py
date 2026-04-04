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
            conditions.append("e_cv.rsid IS NOT NULL AND json_extract(e_cv.data, '$.disease_name') LIKE ?")
            params.append(f"%{condition}%")

        if zygosity == "homozygous":
            conditions.append("length(s.genotype) = 2 AND substr(s.genotype, 1, 1) = substr(s.genotype, 2, 1)")
        elif zygosity == "heterozygous":
            conditions.append("length(s.genotype) = 2 AND substr(s.genotype, 1, 1) != substr(s.genotype, 2, 1)")

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        # Need myvariant join when gene filter is used
        mv_join = "LEFT JOIN enrichments e_mv ON s.rsid = e_mv.rsid AND e_mv.source = 'myvariant'"

        count_sql = f"""
            SELECT COUNT(DISTINCT s.rsid) FROM snps s
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
            GROUP BY s.rsid
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

    async def get_variant_guidance(self, rsid: str) -> dict:
        """Generate guidance data for a variant based on its enrichments."""
        snp = await self.get_snp(rsid)
        if not snp:
            return {}

        guidance: dict = {
            "severity": "unknown",
            "what_it_means": "",
            "suggested_actions": [],
            "discuss_with_clinician": False,
            "external_links": [],
        }

        sig = (snp.get("significance") or "").lower()
        disease = snp.get("disease") or ""

        if "pathogenic" in sig:
            guidance["severity"] = "high"
            guidance["what_it_means"] = (
                f"This variant is classified as {snp['significance']} and is associated with: {disease}. "
                "Pathogenic variants have strong evidence of causing disease."
            )
            guidance["suggested_actions"] = [
                "Discuss with your healthcare provider",
                "Consider genetic counseling",
                "Ask about relevant screening tests",
            ]
            guidance["discuss_with_clinician"] = True
        elif "drug response" in sig:
            guidance["severity"] = "moderate"
            guidance["what_it_means"] = (
                f"This variant affects how you metabolize certain medications. Associated with: {disease}."
            )
            guidance["suggested_actions"] = [
                "Share this with your prescribing physician",
                "Request pharmacogenomic review before new medications",
                "Keep a copy in your medical records",
            ]
            guidance["discuss_with_clinician"] = True
        elif "risk factor" in sig:
            guidance["severity"] = "moderate"
            guidance["what_it_means"] = (
                f"This variant is a risk factor for: {disease}. "
                "It increases probability but does not guarantee disease."
            )
            guidance["suggested_actions"] = [
                "Learn about modifiable risk factors for this condition",
                "Discuss preventive screening options",
            ]
            guidance["discuss_with_clinician"] = True
        elif "protective" in sig:
            guidance["severity"] = "low"
            guidance["what_it_means"] = f"This variant may offer some protection related to: {disease}."
            guidance["suggested_actions"] = []
        elif "benign" in sig:
            guidance["severity"] = "low"
            guidance["what_it_means"] = "This variant is classified as benign — it is not expected to cause disease."
            guidance["suggested_actions"] = []
        elif "uncertain" in sig:
            guidance["severity"] = "moderate"
            guidance["what_it_means"] = (
                f"The clinical significance of this variant is uncertain. Associated with: {disease}. "
                "More research is needed."
            )
            guidance["suggested_actions"] = [
                "Check back periodically — classifications can change",
                "Discuss with a genetic counselor if concerned",
            ]
        else:
            guidance["what_it_means"] = "No clinical annotation available for this variant."

        guidance["external_links"] = [
            {"label": "ClinVar", "url": f"https://www.ncbi.nlm.nih.gov/clinvar/?term={rsid}"},
            {"label": "dbSNP", "url": f"https://www.ncbi.nlm.nih.gov/snp/{rsid}"},
            {"label": "SNPedia", "url": f"https://www.snpedia.com/index.php/{rsid}"},
        ]

        if snp.get("gene_name"):
            guidance["external_links"].append(
                {"label": "GeneCards", "url": f"https://www.genecards.org/cgi-bin/carddisp.pl?gene={snp['gene_name']}"}
            )

        return guidance

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

    async def get_insights(self) -> dict:
        """Return dashboard summary stats for the insight panel."""
        insights: dict = {}

        # Total / genotyped / imputed
        async with self._conn.execute("SELECT COUNT(*) FROM snps") as c:
            insights["total_variants"] = (await c.fetchone())[0]
        async with self._conn.execute("SELECT COUNT(*) FROM snps WHERE source = 'genotyped'") as c:
            insights["genotyped"] = (await c.fetchone())[0]
        async with self._conn.execute("SELECT COUNT(*) FROM snps WHERE source = 'imputed'") as c:
            insights["imputed"] = (await c.fetchone())[0]

        # Clinical significance counts from ClinVar enrichments
        sig_queries = {
            "pathogenic_count": "%athogenic%",
            "drug_response_count": "%drug response%",
            "risk_factor_count": "%risk factor%",
            "uncertain_count": "%Uncertain%",
        }
        for key, pattern in sig_queries.items():
            sql = """
                SELECT COUNT(*) FROM enrichments
                WHERE source = 'clinvar'
                AND json_extract(data, '$.clinical_significance') LIKE ?
            """
            async with self._conn.execute(sql, [pattern]) as c:
                insights[key] = (await c.fetchone())[0]

        # Actionable count (same logic as clinically_relevant filter)
        actionable_sql = """
            SELECT COUNT(*) FROM snps s
            JOIN enrichments e_cv ON s.rsid = e_cv.rsid AND e_cv.source = 'clinvar'
            WHERE json_extract(e_cv.data, '$.clinical_significance') NOT IN (
                'Benign', 'Likely benign', 'Benign/Likely benign',
                'not provided', 'no classification for the single variant',
                'no classifications from unflagged records'
            )
            AND json_extract(e_cv.data, '$.disease_name') NOT IN ('not provided', 'not specified', '')
        """
        async with self._conn.execute(actionable_sql) as c:
            insights["actionable_count"] = (await c.fetchone())[0]

        # Top 10 genes by variant count
        top_genes_sql = """
            SELECT json_extract(data, '$.gene_symbol') as gene, COUNT(*) as cnt
            FROM enrichments
            WHERE source = 'myvariant'
            AND gene IS NOT NULL
            GROUP BY gene
            ORDER BY cnt DESC
            LIMIT 10
        """
        async with self._conn.execute(top_genes_sql) as c:
            insights["top_genes"] = [
                {"gene": row[0], "count": row[1]} for row in await c.fetchall()
            ]

        return insights

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
