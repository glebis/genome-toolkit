-- 003: Mental health action tracking and clinical annotations
--
-- Non-destructive: adds new tables + columns, does not modify existing data.
-- Safe to run on any database version >= 001.

-- Track user progress on action card recommendations
CREATE TABLE IF NOT EXISTS action_progress (
    id            TEXT PRIMARY KEY,
    gene_symbol   TEXT NOT NULL,
    action_type   TEXT NOT NULL CHECK(action_type IN ('consider', 'monitor', 'discuss', 'try')),
    title         TEXT NOT NULL,
    done          BOOLEAN NOT NULL DEFAULT 0,
    done_at       TEXT,
    notes         TEXT,
    profile_id    TEXT NOT NULL DEFAULT 'default',
    created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_action_progress_gene ON action_progress(gene_symbol);
CREATE INDEX IF NOT EXISTS idx_action_progress_profile ON action_progress(profile_id);

-- Clinical significance annotations for SNPs (from ClinVar, PharmGKB)
-- Separate table to avoid altering the large snps table
CREATE TABLE IF NOT EXISTS clinical_annotations (
    rsid              TEXT NOT NULL,
    source            TEXT NOT NULL,  -- 'clinvar', 'pharmgkb', 'cpic', 'dpwg'
    clinical_significance TEXT,       -- 'pathogenic', 'likely_pathogenic', 'benign', etc.
    condition         TEXT,           -- disease/trait name
    gene_symbol       TEXT,
    review_status     TEXT,           -- ClinVar review stars
    last_updated      TEXT,
    data              TEXT,           -- full JSON payload for source-specific fields
    PRIMARY KEY (rsid, source, condition)
);

CREATE INDEX IF NOT EXISTS idx_clinical_gene ON clinical_annotations(gene_symbol);
CREATE INDEX IF NOT EXISTS idx_clinical_significance ON clinical_annotations(clinical_significance);

-- Gene-to-SNP mapping for fast gene-based queries
-- Supplements the genes table with per-SNP relationships
CREATE TABLE IF NOT EXISTS gene_snp_map (
    rsid         TEXT NOT NULL,
    gene_symbol  TEXT NOT NULL,
    relationship TEXT DEFAULT 'associated',  -- 'associated', 'causal', 'regulatory'
    PRIMARY KEY (rsid, gene_symbol)
);

CREATE INDEX IF NOT EXISTS idx_gene_snp_gene ON gene_snp_map(gene_symbol);

-- Biomarker lab results
CREATE TABLE IF NOT EXISTS biomarkers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id      TEXT NOT NULL DEFAULT 'default',
    name            TEXT NOT NULL,
    value           REAL NOT NULL,
    unit            TEXT NOT NULL,
    reference_low   REAL,
    reference_high  REAL,
    tested_at       TEXT NOT NULL,
    source          TEXT,  -- lab name or 'manual'
    notes           TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_biomarkers_profile ON biomarkers(profile_id);
CREATE INDEX IF NOT EXISTS idx_biomarkers_name ON biomarkers(name);
CREATE INDEX IF NOT EXISTS idx_biomarkers_date ON biomarkers(tested_at);

-- User substance use self-report (for harm reduction features)
-- Private, local-only, never synced
CREATE TABLE IF NOT EXISTS substance_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id    TEXT NOT NULL DEFAULT 'default',
    substance     TEXT NOT NULL,
    frequency     TEXT,  -- 'daily', 'weekly', 'monthly', 'occasionally', 'past'
    notes         TEXT,
    updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_substance_profile ON substance_log(profile_id);
