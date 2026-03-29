"""Tests for database initialization and versioned migrations."""
import sqlite3
import pytest

from lib.db import get_connection, apply_migrations, init_db, log_run, finish_run


class TestMigrations:
    """Test versioned migration system."""

    def test_init_creates_db(self, tmp_db, migrations_dir):
        """init_db should create the database file and apply migrations."""
        assert not tmp_db.exists()
        applied = init_db(tmp_db, migrations_dir)
        assert tmp_db.exists()
        assert len(applied) > 0

    def test_migrations_applied_once(self, tmp_db, migrations_dir):
        """Running init_db twice should not re-apply migrations."""
        first = init_db(tmp_db, migrations_dir)
        second = init_db(tmp_db, migrations_dir)
        assert len(first) > 0
        assert len(second) == 0  # already applied

    def test_migration_tracking(self, tmp_db, migrations_dir):
        init_db(tmp_db, migrations_dir)
        conn = get_connection(tmp_db)
        cursor = conn.execute("SELECT version FROM schema_migrations")
        versions = [row[0] for row in cursor.fetchall()]
        conn.close()
        assert "001_initial_schema" in versions

    def test_schema_has_profiles(self, tmp_db, migrations_dir):
        init_db(tmp_db, migrations_dir)
        conn = get_connection(tmp_db)
        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cursor.fetchall()}
        conn.close()

        assert "profiles" in tables
        assert "imports" in tables
        assert "snps" in tables
        assert "enrichments" in tables
        assert "pipeline_runs" in tables
        assert "notes" in tables

    def test_snps_has_profile_id(self, tmp_db, migrations_dir):
        """snps table should have profile_id column."""
        init_db(tmp_db, migrations_dir)
        conn = get_connection(tmp_db)
        cursor = conn.execute("PRAGMA table_info(snps)")
        columns = {row[1] for row in cursor.fetchall()}
        conn.close()

        assert "profile_id" in columns
        assert "source" in columns
        assert "r2_quality" in columns
        assert "import_id" in columns

    def test_snps_composite_pk(self, tmp_db, migrations_dir):
        """snps should have composite PK (rsid, profile_id)."""
        init_db(tmp_db, migrations_dir)
        conn = get_connection(tmp_db)

        # Insert same rsid for two profiles — should work
        conn.execute(
            "INSERT INTO snps (rsid, profile_id, chromosome, position, genotype) VALUES (?, ?, ?, ?, ?)",
            ("rs4680", "user1", "22", 19951271, "AG"),
        )
        conn.execute(
            "INSERT INTO snps (rsid, profile_id, chromosome, position, genotype) VALUES (?, ?, ?, ?, ?)",
            ("rs4680", "user2", "22", 19951271, "AA"),
        )
        conn.commit()

        cursor = conn.execute("SELECT COUNT(*) FROM snps WHERE rsid='rs4680'")
        assert cursor.fetchone()[0] == 2

        # Duplicate (rsid + profile_id) should fail
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO snps (rsid, profile_id, chromosome, position, genotype) VALUES (?, ?, ?, ?, ?)",
                ("rs4680", "user1", "22", 19951271, "GG"),
            )
        conn.close()

    def test_legacy_view(self, tmp_db, migrations_dir):
        """snps_v1 view should exist and filter by default profile."""
        init_db(tmp_db, migrations_dir)
        conn = get_connection(tmp_db)

        # Insert for default profile
        conn.execute(
            "INSERT INTO snps (rsid, profile_id, chromosome, position, genotype) VALUES (?, ?, ?, ?, ?)",
            ("rs4680", "default", "22", 19951271, "AG"),
        )
        # Insert for other profile
        conn.execute(
            "INSERT INTO snps (rsid, profile_id, chromosome, position, genotype) VALUES (?, ?, ?, ?, ?)",
            ("rs4680", "other", "22", 19951271, "AA"),
        )
        conn.commit()

        # Legacy view should only show default
        cursor = conn.execute("SELECT * FROM snps_v1 WHERE rsid='rs4680'")
        rows = cursor.fetchall()
        assert len(rows) == 1
        conn.close()


class TestPipelineRuns:
    """Test pipeline run logging."""

    def test_log_and_finish(self, tmp_db, migrations_dir):
        init_db(tmp_db, migrations_dir)
        conn = get_connection(tmp_db)

        run_id = log_run(conn, "test_script", "running")
        assert run_id is not None
        assert run_id > 0

        finish_run(conn, run_id, "success", {"imported": 100})

        cursor = conn.execute("SELECT status, stats FROM pipeline_runs WHERE id=?", (run_id,))
        row = cursor.fetchone()
        assert row[0] == "success"
        assert '"imported": 100' in row[1]
        conn.close()


class TestConnection:
    """Test database connection settings."""

    def test_wal_mode(self, tmp_db, migrations_dir):
        init_db(tmp_db, migrations_dir)
        conn = get_connection(tmp_db)
        cursor = conn.execute("PRAGMA journal_mode")
        mode = cursor.fetchone()[0]
        assert mode == "wal"
        conn.close()

    def test_row_factory(self, tmp_db, migrations_dir):
        init_db(tmp_db, migrations_dir)
        conn = get_connection(tmp_db)
        assert conn.row_factory == sqlite3.Row
        conn.close()
