import pytest
import pytest_asyncio
import aiosqlite

from backend.app.db.genome import GenomeDB


@pytest_asyncio.fixture
async def genome_db(tmp_path):
    db_path = tmp_path / "test_genome.db"
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("""
            CREATE TABLE snps (
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
        await conn.execute("CREATE INDEX idx_snps_chr_pos ON snps(chromosome, position)")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS gene_snp_map (
                rsid TEXT NOT NULL,
                gene_symbol TEXT NOT NULL,
                PRIMARY KEY (rsid, gene_symbol)
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS enrichments (
                rsid TEXT NOT NULL,
                source TEXT NOT NULL,
                data TEXT,
                PRIMARY KEY (rsid, source)
            )
        """)
        test_snps = [
            ("rs1065852", "22", 42526694, "CT", 1, "genotyped", None),
            ("rs4680", "22", 19951271, "GA", 1, "genotyped", None),
            ("rs1800497", "11", 113270828, "CT", 1, "genotyped", None),
            ("rs1801133", "1", 11856378, "CT", 1, "genotyped", None),
            ("rs1799971", "6", 154360797, "AG", 1, "genotyped", None),
            ("i713426", "1", 1000000, "AA", 0, "genotyped", None),
            ("rs999999", "1", 2000000, "GG", 1, "imputed", 0.85),
        ]
        await conn.executemany(
            "INSERT INTO snps (rsid, chromosome, position, genotype, is_rsid, source, r2_quality) VALUES (?, ?, ?, ?, ?, ?, ?)",
            test_snps,
        )
        await conn.commit()

    db = GenomeDB(db_path)
    await db.connect()
    yield db
    await db.close()


@pytest.mark.asyncio
async def test_count_snps(genome_db):
    assert await genome_db.count() == 7


@pytest.mark.asyncio
async def test_query_paginated(genome_db):
    result = await genome_db.query_snps(page=1, limit=3)
    assert len(result["items"]) == 3
    assert result["total"] == 7


@pytest.mark.asyncio
async def test_query_search_by_rsid(genome_db):
    result = await genome_db.query_snps(search="rs4680")
    assert len(result["items"]) == 1
    assert result["items"][0]["rsid"] == "rs4680"


@pytest.mark.asyncio
async def test_query_filter_chromosome(genome_db):
    result = await genome_db.query_snps(chromosome="22")
    assert len(result["items"]) == 2


@pytest.mark.asyncio
async def test_query_filter_source(genome_db):
    result = await genome_db.query_snps(source="imputed")
    assert len(result["items"]) == 1
    assert result["items"][0]["rsid"] == "rs999999"


@pytest.mark.asyncio
async def test_get_snp(genome_db):
    snp = await genome_db.get_snp("rs4680")
    assert snp is not None
    assert snp["genotype"] == "GA"


@pytest.mark.asyncio
async def test_get_snp_not_found(genome_db):
    assert await genome_db.get_snp("rs0000000") is None


@pytest.mark.asyncio
async def test_get_snp_accepts_profile_id_default(genome_db):
    """Single-profile schema (no profile_id column) must still work and
    accept the new profile_id param, defaulting to 'default'."""
    snp = await genome_db.get_snp("rs4680", profile_id="default")
    assert snp is not None
    assert snp["genotype"] == "GA"


@pytest_asyncio.fixture
async def multi_profile_db(tmp_path):
    """Schema matching migration 001: snps keyed by (rsid, profile_id)."""
    db_path = tmp_path / "test_multi.db"
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("""
            CREATE TABLE snps (
                rsid TEXT NOT NULL,
                profile_id TEXT NOT NULL DEFAULT 'default',
                chromosome TEXT NOT NULL,
                position INTEGER NOT NULL,
                genotype TEXT NOT NULL,
                is_rsid BOOLEAN NOT NULL DEFAULT 1,
                source TEXT DEFAULT 'genotyped',
                r2_quality REAL,
                imported_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (rsid, profile_id)
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS gene_snp_map (
                rsid TEXT NOT NULL,
                gene_symbol TEXT NOT NULL,
                PRIMARY KEY (rsid, gene_symbol)
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS enrichments (
                rsid TEXT NOT NULL,
                source TEXT NOT NULL,
                data TEXT,
                PRIMARY KEY (rsid, source)
            )
        """)
        # Same rsid, two different profiles, different genotypes.
        await conn.executemany(
            "INSERT INTO snps (rsid, profile_id, chromosome, position, genotype) VALUES (?, ?, ?, ?, ?)",
            [
                ("rs4680", "default", "22", 19951271, "GA"),
                ("rs4680", "alice", "22", 19951271, "AA"),
            ],
        )
        await conn.commit()

    db = GenomeDB(db_path)
    await db.connect()
    yield db
    await db.close()


@pytest.mark.asyncio
async def test_get_snp_scoped_by_profile(multi_profile_db):
    """get_snp must return the genotype of the requested profile, not
    another profile's row for the same rsid."""
    default_snp = await multi_profile_db.get_snp("rs4680")
    assert default_snp is not None
    assert default_snp["genotype"] == "GA"

    alice_snp = await multi_profile_db.get_snp("rs4680", profile_id="alice")
    assert alice_snp is not None
    assert alice_snp["genotype"] == "AA"

    assert await multi_profile_db.get_snp("rs4680", profile_id="nobody") is None


@pytest.mark.asyncio
async def test_get_stats(genome_db):
    stats = await genome_db.get_stats()
    assert stats["total"] == 7
    assert stats["genotyped"] == 6
    assert stats["imputed"] == 1
