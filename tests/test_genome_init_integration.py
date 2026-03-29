"""Integration tests for genome_init.py — end-to-end import pipeline."""
import sqlite3
import pytest
from pathlib import Path

from lib.db import get_connection, init_db
from lib.providers.base import detect_provider, read_header_lines


FIXTURES = Path(__file__).resolve().parent / "fixtures"
MIGRATIONS = Path(__file__).resolve().parent.parent / "scripts" / "data" / "migrations"


class TestGenomeInitEndToEnd:
    """End-to-end integration tests for the import pipeline."""

    def _import_file(self, filepath: Path, db_path: Path, profile: str = "test", min_r2: float = 0.3):
        """Helper: run the full import pipeline on a file."""
        import uuid
        from datetime import datetime

        init_db(db_path, MIGRATIONS)
        conn = get_connection(db_path)

        # Detect and parse
        provider_cls, confidence = detect_provider(filepath)
        provider = provider_cls()
        header_lines = read_header_lines(filepath)
        meta = provider.metadata(filepath, header_lines)
        records_iter, qc_stats = provider.parse(filepath)
        records = list(records_iter)

        # Create profile
        conn.execute(
            "INSERT OR REPLACE INTO profiles (profile_id, provider, provider_version, assembly, snp_count) VALUES (?, ?, ?, ?, ?)",
            (profile, meta.provider, meta.provider_version, meta.assembly, len(records)),
        )

        # Create import record
        import_id = str(uuid.uuid4())[:8]
        conn.execute(
            "INSERT INTO imports (import_id, profile_id, source_file, detected_format, assembly, status) VALUES (?, ?, ?, ?, ?, ?)",
            (import_id, profile, str(filepath), f"{meta.provider}_{meta.provider_version}", meta.assembly, "running"),
        )

        # Insert records
        imported = 0
        skipped_dup = 0
        skipped_r2 = 0
        for rec in records:
            if rec.quality is not None and rec.quality < min_r2:
                skipped_r2 += 1
                continue
            source = "imputed" if rec.quality is not None else "genotyped"
            try:
                conn.execute(
                    """INSERT INTO snps (rsid, profile_id, chromosome, position, genotype, is_rsid, source, import_date, r2_quality, import_id)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (rec.source_id, profile, rec.chromosome, rec.position, rec.genotype, rec.is_rsid,
                     source, datetime.now().strftime("%Y-%m-%d"), rec.quality, import_id),
                )
                imported += 1
            except sqlite3.IntegrityError:
                skipped_dup += 1

        conn.execute("UPDATE imports SET status='complete', finished_at=datetime('now') WHERE import_id=?", (import_id,))
        conn.commit()

        return conn, imported, skipped_dup, skipped_r2, qc_stats, meta

    def test_import_23andme(self, tmp_path):
        """Import 23andMe fixture and verify DB state."""
        db_path = tmp_path / "test.db"
        conn, imported, _, _, qc, meta = self._import_file(FIXTURES / "23andme_v4_sample.txt", db_path)

        assert meta.provider == "23andme"
        assert imported > 0

        # Verify profile created
        row = conn.execute("SELECT * FROM profiles WHERE profile_id='test'").fetchone()
        assert row is not None
        assert row["provider"] == "23andme"

        # Verify SNPs in DB
        count = conn.execute("SELECT COUNT(*) FROM snps WHERE profile_id='test'").fetchone()[0]
        assert count == imported
        assert count > 10  # fixture has 20 lines, some filtered

        # Verify a specific SNP
        snp = conn.execute("SELECT * FROM snps WHERE rsid='rs4477212' AND profile_id='test'").fetchone()
        assert snp is not None
        assert snp["genotype"] == "AA"
        assert snp["chromosome"] == "1"
        assert snp["source"] == "genotyped"

        conn.close()

    def test_import_ancestry(self, tmp_path):
        """Import AncestryDNA fixture."""
        db_path = tmp_path / "test.db"
        conn, imported, _, _, qc, meta = self._import_file(FIXTURES / "ancestry_sample.txt", db_path)

        assert meta.provider == "ancestry"
        assert imported > 0

        # Verify allele concatenation worked
        snp = conn.execute("SELECT * FROM snps WHERE rsid='rs3094315' AND profile_id='test'").fetchone()
        assert snp is not None
        assert snp["genotype"] == "AG"

        conn.close()

    def test_import_myheritage(self, tmp_path):
        """Import MyHeritage fixture."""
        db_path = tmp_path / "test.db"
        conn, imported, _, _, qc, meta = self._import_file(FIXTURES / "myheritage_sample.csv", db_path)

        assert meta.provider == "myheritage"
        assert imported > 0
        conn.close()

    def test_import_vcf_with_r2(self, tmp_path):
        """Import VCF fixture and verify r² quality stored."""
        db_path = tmp_path / "test.db"
        conn, imported, _, _, qc, meta = self._import_file(FIXTURES / "generic_sample.vcf", db_path)

        assert meta.provider == "vcf"
        assert imported > 0

        # Verify r² stored
        snp = conn.execute("SELECT * FROM snps WHERE rsid='rs4477212' AND profile_id='test'").fetchone()
        assert snp is not None
        assert snp["r2_quality"] == pytest.approx(0.95)
        assert snp["source"] == "imputed"  # has quality score -> imputed

        conn.close()

    def test_min_r2_filtering(self, tmp_path):
        """VCF import with min_r2=0.8 should filter low-quality variants."""
        db_path = tmp_path / "test.db"
        conn_low, imported_low, _, skipped_low, _, _ = self._import_file(
            FIXTURES / "generic_sample.vcf", db_path, profile="low", min_r2=0.3
        )

        db_path2 = tmp_path / "test2.db"
        conn_high, imported_high, _, skipped_high, _, _ = self._import_file(
            FIXTURES / "generic_sample.vcf", db_path2, profile="high", min_r2=0.8
        )

        assert imported_high < imported_low
        assert skipped_high > skipped_low

        conn_low.close()
        conn_high.close()

    def test_duplicate_handling(self, tmp_path):
        """Importing the same file twice should skip duplicates."""
        db_path = tmp_path / "test.db"
        _, imported1, _, _, _, _ = self._import_file(FIXTURES / "23andme_v4_sample.txt", db_path, profile="test")

        # Re-import same file same profile
        conn = get_connection(db_path)
        init_db(db_path, MIGRATIONS)

        from lib.providers.twentythree import TwentyThreeAndMe
        provider = TwentyThreeAndMe()
        records, _ = provider.parse(FIXTURES / "23andme_v4_sample.txt")

        skipped = 0
        for rec in records:
            try:
                conn.execute(
                    "INSERT INTO snps (rsid, profile_id, chromosome, position, genotype, is_rsid, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (rec.source_id, "test", rec.chromosome, rec.position, rec.genotype, rec.is_rsid, "genotyped"),
                )
            except sqlite3.IntegrityError:
                skipped += 1

        assert skipped == imported1  # all should be dupes
        conn.close()

    def test_multi_profile(self, tmp_path):
        """Two different profiles can have the same rsid."""
        db_path = tmp_path / "test.db"
        conn1, imp1, _, _, _, _ = self._import_file(FIXTURES / "23andme_v4_sample.txt", db_path, profile="user1")
        conn2, imp2, _, _, _, _ = self._import_file(FIXTURES / "23andme_v4_sample.txt", db_path, profile="user2")

        conn = get_connection(db_path)
        count = conn.execute("SELECT COUNT(DISTINCT profile_id) FROM snps").fetchone()[0]
        assert count == 2

        # Same rsid exists for both profiles
        rows = conn.execute("SELECT * FROM snps WHERE rsid='rs4477212'").fetchall()
        assert len(rows) == 2
        profiles = {row["profile_id"] for row in rows}
        assert profiles == {"user1", "user2"}

        conn.close()

    def test_import_record_created(self, tmp_path):
        """Import should create a record in the imports table."""
        db_path = tmp_path / "test.db"
        conn, _, _, _, _, _ = self._import_file(FIXTURES / "23andme_v4_sample.txt", db_path)

        row = conn.execute("SELECT * FROM imports WHERE profile_id='test'").fetchone()
        assert row is not None
        assert row["status"] == "complete"
        assert row["detected_format"].startswith("23andme")
        assert row["finished_at"] is not None

        conn.close()
