# Database Schema

Last updated: 2026-04-05
Migration version: 003

The toolkit uses two SQLite databases. This document is the source of truth for schema — update it whenever the structure changes. See `docs/migrations.md` for migration policy and workflow.

---

## genome.db

Stores genetic variant data, clinical annotations, and user progress. Path configured via `GENOME_DB_PATH` env var (default: `./data/genome.db`).

Schema managed by versioned migrations in `scripts/data/migrations/`.

### profiles (migration 001)

Multi-profile support. Each imported genome file creates a profile.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| profile_id | TEXT | PRIMARY KEY | Profile identifier (default: "default") |
| display_name | TEXT | | Human-readable name |
| provider | TEXT | NOT NULL | 23andme, ancestry, myheritage, vcf |
| provider_version | TEXT | | Chip version (e.g., v5) |
| file_hash | TEXT | | SHA256 of source file |
| assembly | TEXT | DEFAULT 'GRCh37' | Genome build |
| snp_count | INTEGER | | Total variants in this profile |
| created_at | TEXT | DEFAULT datetime('now') | |

### imports (migration 001)

Import history per profile.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| import_id | TEXT | PRIMARY KEY | UUID |
| profile_id | TEXT | NOT NULL, FK → profiles | |
| source_file | TEXT | | Path to source file |
| file_hash | TEXT | | SHA256 |
| detected_format | TEXT | | Auto-detected provider format |
| assembly | TEXT | | Genome build |
| qc_json | TEXT | | Quality control results (JSON) |
| started_at | TEXT | DEFAULT datetime('now') | |
| finished_at | TEXT | | |
| status | TEXT | DEFAULT 'running' | running, done, failed |
| stats | TEXT | | Import stats (JSON) |

### snps (migration 001)

Primary variant storage. Composite key (rsid, profile_id) for multi-profile.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| rsid | TEXT | NOT NULL, PK(1) | dbSNP identifier (e.g., rs1801133) |
| profile_id | TEXT | NOT NULL DEFAULT 'default', PK(2) | Profile this variant belongs to |
| chromosome | TEXT | NOT NULL | Chromosome: 1-22, X, Y, MT |
| position | INTEGER | NOT NULL | Genomic position (GRCh37/hg19) |
| genotype | TEXT | NOT NULL | Diploid genotype (e.g., T/T, A/G) |
| is_rsid | BOOLEAN | NOT NULL DEFAULT 1 | True if valid rsID format |
| source | TEXT | NOT NULL DEFAULT 'genotyped' | genotyped or imputed |
| import_date | TEXT | | Legacy field |
| r2_quality | REAL | | Imputation quality (0.0-1.0). NULL for genotyped. |
| import_id | TEXT | | FK to imports table |
| imported_at | TEXT | DEFAULT datetime('now') | |

**Indexes:**
- `idx_snps_chr_pos` on (chromosome, position)
- `idx_snps_profile` on (profile_id)
- `idx_snps_source` on (source)

**Views:**
- `snps_v1` — legacy compatibility view filtering to profile_id='default'

### enrichments (migration 001)

Cached external API responses (ClinVar, SNPedia, PharmGKB).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| rsid | TEXT | NOT NULL, PK(1) | |
| source | TEXT | NOT NULL, PK(2) | snpedia, clinvar, pharmgkb, gwas_catalog |
| data | TEXT | NOT NULL | JSON payload |
| fetched_at | TEXT | DEFAULT datetime('now') | |
| expires_at | TEXT | | Cache expiry |

**Indexes:**
- `idx_enrichments_source` on (source)
- `idx_enrichments_expires` on (expires_at)

### genes (migration 001)

Gene reference data. Populated by `scripts/seed_genes.py`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| gene_symbol | TEXT | PRIMARY KEY | e.g., MTHFR, COMT, CYP2D6 |
| full_name | TEXT | | Full gene name |
| chromosome | TEXT | | |
| rsids | TEXT | | JSON array of associated rsIDs |

### phenotypes (migration 001)

Phenotype/trait definitions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| name | TEXT | UNIQUE NOT NULL | e.g., "Reward Deficiency Syndrome" |
| category | TEXT | | mental_health, cardiovascular, etc. |
| genes | TEXT | | JSON array of gene symbols |
| rsids | TEXT | | JSON array of associated rsIDs |

### notes (migration 001)

Vault note tracking for freshness/regeneration.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| note_path | TEXT | PRIMARY KEY | Path relative to vault root |
| note_type | TEXT | NOT NULL | Genes, Systems, Phenotypes, Protocols |
| generated_at | TEXT | | |
| data_version | TEXT | | Version of data used to generate |
| needs_refresh | BOOLEAN | DEFAULT 0 | Flagged for regeneration |

### pipeline_runs (migration 001)

Script execution tracking.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| script | TEXT | NOT NULL | Script name |
| started_at | TEXT | DEFAULT datetime('now') | |
| finished_at | TEXT | | |
| status | TEXT | | running, done, failed |
| stats | TEXT | | JSON stats |

### action_progress (migration 003)

User progress on mental health action card recommendations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Action identifier |
| gene_symbol | TEXT | NOT NULL | Associated gene |
| action_type | TEXT | NOT NULL, CHECK | consider, monitor, discuss, try |
| title | TEXT | NOT NULL | Action description |
| done | BOOLEAN | NOT NULL DEFAULT 0 | User marked complete |
| done_at | TEXT | | Completion timestamp |
| notes | TEXT | | User notes |
| profile_id | TEXT | NOT NULL DEFAULT 'default' | |
| created_at | TEXT | DEFAULT datetime('now') | |

**Indexes:**
- `idx_action_progress_gene` on (gene_symbol)
- `idx_action_progress_profile` on (profile_id)

### clinical_annotations (migration 003)

Clinical significance from ClinVar, PharmGKB, CPIC, DPWG.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| rsid | TEXT | NOT NULL, PK(1) | |
| source | TEXT | NOT NULL, PK(2) | clinvar, pharmgkb, cpic, dpwg |
| clinical_significance | TEXT | | pathogenic, likely_pathogenic, benign, etc. |
| condition | TEXT | PK(3) | Disease/trait name |
| gene_symbol | TEXT | | |
| review_status | TEXT | | ClinVar review stars |
| last_updated | TEXT | | |
| data | TEXT | | Full JSON payload |

**Indexes:**
- `idx_clinical_gene` on (gene_symbol)
- `idx_clinical_significance` on (clinical_significance)

### gene_snp_map (migration 003)

Gene-to-SNP relationships for fast gene-based queries.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| rsid | TEXT | NOT NULL, PK(1) | |
| gene_symbol | TEXT | NOT NULL, PK(2) | |
| relationship | TEXT | DEFAULT 'associated' | associated, causal, regulatory |

**Indexes:**
- `idx_gene_snp_gene` on (gene_symbol)

### biomarkers (migration 003)

Lab results from blood work.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| profile_id | TEXT | NOT NULL DEFAULT 'default' | |
| name | TEXT | NOT NULL | Biomarker name (e.g., homocysteine) |
| value | REAL | NOT NULL | Measured value |
| unit | TEXT | NOT NULL | Unit (umol/L, ng/mL, etc.) |
| reference_low | REAL | | Normal range low |
| reference_high | REAL | | Normal range high |
| tested_at | TEXT | NOT NULL | Test date |
| source | TEXT | | Lab name or "manual" |
| notes | TEXT | | |
| created_at | TEXT | DEFAULT datetime('now') | |

**Indexes:**
- `idx_biomarkers_profile` on (profile_id)
- `idx_biomarkers_name` on (name)
- `idx_biomarkers_date` on (tested_at)

### substance_log (migration 003)

User substance use self-report for harm reduction. Private, local-only.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| profile_id | TEXT | NOT NULL DEFAULT 'default' | |
| substance | TEXT | NOT NULL | Substance name |
| frequency | TEXT | | daily, weekly, monthly, occasionally, past |
| notes | TEXT | | |
| updated_at | TEXT | DEFAULT datetime('now') | |

**Indexes:**
- `idx_substance_profile` on (profile_id)

### schema_migrations (auto-created)

Migration tracking. Created automatically by `scripts/lib/db.py`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| version | TEXT | PRIMARY KEY | Migration filename stem (e.g., "001_initial_schema") |
| applied_at | TEXT | DEFAULT datetime('now') | |

---

## users.db

Stores chat sessions. Path: `$GENOME_DATA_DIR/users.db`. Schema managed by `UsersDB.init_schema()`.

### sessions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID session identifier |
| created_at | TEXT | NOT NULL | |
| last_active | TEXT | NOT NULL | |
| agent_session_id | TEXT | | Claude Agent SDK session ID |

### chat_messages

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| session_id | TEXT | NOT NULL, FK → sessions.id | |
| role | TEXT | NOT NULL | user or assistant |
| content | TEXT | NOT NULL | Message text (markdown) |
| timestamp | TEXT | NOT NULL | |

### imports

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| session_id | TEXT | NOT NULL, FK → sessions.id | |
| file_path | TEXT | NOT NULL | |
| provider | TEXT | NOT NULL | |
| variant_count | INTEGER | | |
| imported_at | TEXT | | |
| status | TEXT | NOT NULL DEFAULT 'pending' | pending, running, done, failed |
