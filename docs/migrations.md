# Database Migrations

## Overview

Genome Toolkit uses forward-only SQL migrations tracked in a `schema_migrations` table. Migrations are plain `.sql` files in `scripts/data/migrations/`, applied automatically on startup.

## Migration Policy

### Non-destructive within major version

All migrations within a major version (e.g., 0.x.x) MUST be non-destructive:

- **ADD** new tables, columns, indexes — always safe
- **CREATE VIEW** — safe
- **INSERT default data** — safe (use INSERT OR IGNORE)
- **NEVER DROP** tables, columns, or indexes
- **NEVER ALTER** column types or constraints on existing data
- **NEVER DELETE** user data

Destructive changes (dropping tables, renaming columns) are only allowed in major version bumps (0.x → 1.0) and must include a data migration script.

### Naming convention

```
NNN_description.sql
```

- `NNN` — zero-padded sequential number (001, 002, ...)
- `description` — snake_case summary of what the migration does
- Migrations run in alphabetical order (sorted by filename)

### Current migrations

| Version | File | Description |
|---------|------|-------------|
| 001 | `001_initial_schema.sql` | profiles, snps, enrichments, genes, phenotypes, notes, pipeline_runs |
| 002 | `002_seed_genes_table.sql` | Placeholder — gene seeding done by `seed_genes.py` |
| 003 | `003_mental_health_tables.sql` | action_progress, clinical_annotations, gene_snp_map, biomarkers, substance_log |

## How migrations run

### On app startup (backend)

`backend/app/main.py` calls `init_db()` from `scripts/lib/db.py` which:

1. Opens SQLite connection with WAL mode + foreign keys
2. Creates `schema_migrations` table if not exists
3. Reads all `.sql` files from `scripts/data/migrations/`
4. Skips already-applied migrations (tracked by filename stem)
5. Applies pending migrations in order
6. Records each in `schema_migrations` with timestamp

### From scripts

```bash
# Apply all pending migrations
python -c "from scripts.lib.db import init_db; print(init_db())"

# Or via genome_init.py which calls init_db() internally
python scripts/genome_init.py --help
```

### Checking migration status

```bash
sqlite3 data/genome.db "SELECT * FROM schema_migrations ORDER BY version"
```

## Writing a new migration

1. Create `scripts/data/migrations/NNN_description.sql`
2. Use `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`
3. For adding columns: `ALTER TABLE x ADD COLUMN y` (SQLite doesn't support IF NOT EXISTS for ALTER — wrap in a check or handle the error)
4. Test: `python -c "from scripts.lib.db import init_db; print(init_db())"`
5. Update `docs/database-schema.md` with new tables/columns
6. Update this file's migration table

### Adding a column to an existing table

SQLite doesn't support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Use this pattern:

```sql
-- Check if column exists before adding (SQLite workaround)
-- If the column already exists, the ALTER will fail silently in executescript
ALTER TABLE snps ADD COLUMN gene_symbol TEXT;
```

Or create a Python migration script (`NNN_description.py`) instead of SQL:

```python
# scripts/data/migrations/NNN_add_gene_to_snps.py
# Python migrations are not yet supported by the runner — use SQL with IF NOT EXISTS patterns
```

## Update workflow for users

When a user pulls a new version:

```bash
# 1. Pull latest code
git pull

# 2. Install any new dependencies
pip install -e ".[web]"
cd frontend && npm install && cd ..

# 3. Migrations run automatically on next app start
# Or run manually:
python -c "from scripts.lib.db import init_db; print('Applied:', init_db())"

# 4. If setup.py was updated, re-run setup
python scripts/setup.py
```

### Future: update script

A `scripts/update.py` script is planned that will:
1. Check current migration version
2. Apply pending migrations
3. Install new dependencies
4. Rebuild frontend if needed
5. Report what changed

## Architecture notes

### Two databases

- **genome.db** — variant data + clinical annotations + user progress. Managed by migration system.
- **users.db** — chat sessions + import tracking. Schema managed by `UsersDB.init_schema()` (should be migrated to the same system in future).

### Backend sync

The backend (`FastAPI/aiosqlite`) connects to genome.db for async queries but runs migrations synchronously at startup via `scripts/lib/db.py`. This is safe because:
- Migrations run once before the server accepts requests (in lifespan handler)
- SQLite WAL mode handles concurrent reads during migration
- Migration runner is synchronous (sqlite3), query layer is async (aiosqlite)
