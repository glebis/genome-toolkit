"""SQLite database with versioned migrations for the Genome Toolkit."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from .config import DB_PATH, MIGRATIONS_DIR


def get_connection(db_path: Path = DB_PATH) -> sqlite3.Connection:
    """Get a SQLite connection with WAL mode and foreign keys."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_migration_table(conn: sqlite3.Connection) -> None:
    """Create the schema_migrations tracking table if it doesn't exist."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.commit()


def _get_applied_migrations(conn: sqlite3.Connection) -> set[str]:
    """Return set of already-applied migration versions."""
    _ensure_migration_table(conn)
    cursor = conn.execute("SELECT version FROM schema_migrations ORDER BY version")
    return {row[0] for row in cursor.fetchall()}


def apply_migrations(conn: sqlite3.Connection, migrations_dir: Path = MIGRATIONS_DIR) -> list[str]:
    """Apply all pending SQL migrations in order. Returns list of applied versions.

    Fails loudly (RuntimeError) when the migrations directory is absent or
    contains no ``*.sql`` files, rather than silently leaving an empty schema.
    """
    if not migrations_dir.is_dir():
        raise RuntimeError(
            f"Migrations directory not found: {migrations_dir}. "
            "Refusing to start with an empty schema."
        )

    migration_files = sorted(migrations_dir.glob("*.sql"))
    if not migration_files:
        raise RuntimeError(
            f"No migration files (*.sql) found in {migrations_dir}. "
            "Refusing to start with an empty schema."
        )

    applied = _get_applied_migrations(conn)
    newly_applied = []

    for mig_file in migration_files:
        version = mig_file.stem  # e.g., "001_initial_schema"
        if version in applied:
            continue

        sql = mig_file.read_text()
        try:
            conn.executescript(sql)
            conn.execute(
                "INSERT INTO schema_migrations (version) VALUES (?)",
                (version,),
            )
            conn.commit()
            newly_applied.append(version)
        except sqlite3.Error as e:
            conn.rollback()
            raise RuntimeError(f"Migration {version} failed: {e}") from e

    return newly_applied


def init_db(db_path: Path = DB_PATH, migrations_dir: Path = MIGRATIONS_DIR) -> list[str]:
    """Initialize database: create file if needed, apply all migrations."""
    conn = get_connection(db_path)
    applied = apply_migrations(conn, migrations_dir)
    conn.close()
    return applied


def log_run(conn: sqlite3.Connection, script: str, status: str, stats: dict | None = None) -> int:
    """Log a pipeline run. Returns run ID."""
    cur = conn.execute(
        "INSERT INTO pipeline_runs (script, status, stats) VALUES (?, ?, ?)",
        (script, status, json.dumps(stats) if stats else None),
    )
    conn.commit()
    return cur.lastrowid


def finish_run(conn: sqlite3.Connection, run_id: int, status: str, stats: dict | None = None) -> None:
    """Mark a pipeline run as finished."""
    conn.execute(
        "UPDATE pipeline_runs SET finished_at=datetime('now'), status=?, stats=? WHERE id=?",
        (status, json.dumps(stats) if stats else None, run_id),
    )
    conn.commit()
