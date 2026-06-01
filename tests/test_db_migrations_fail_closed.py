"""Tests that apply_migrations fails loudly instead of silently producing an empty schema.

Audit finding #18 (High): apply_migrations previously returned [] when the
migrations directory was absent (or contained no *.sql files), allowing app
startup to proceed with NO schema (fail-open). It must instead raise loudly.
"""
import pytest

from lib.db import get_connection, apply_migrations


def test_missing_migrations_dir_raises(tmp_db, tmp_path):
    """A non-existent migrations directory must raise RuntimeError, not return []."""
    conn = get_connection(tmp_db)
    missing = tmp_path / "does_not_exist"
    assert not missing.exists()
    with pytest.raises(RuntimeError):
        apply_migrations(conn, missing)
    conn.close()


def test_empty_migrations_dir_raises(tmp_db, tmp_path):
    """An existing dir with no *.sql files must raise RuntimeError, not return []."""
    conn = get_connection(tmp_db)
    empty = tmp_path / "empty_migrations"
    empty.mkdir()
    # A stray non-sql file must not count as a migration.
    (empty / "README.txt").write_text("not a migration")
    with pytest.raises(RuntimeError):
        apply_migrations(conn, empty)
    conn.close()
