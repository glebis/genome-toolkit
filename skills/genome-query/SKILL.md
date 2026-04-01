---
name: genome-query
description: |
  Query Obsidian vault frontmatter with SQL-like syntax. Filter, sort, group,
  and aggregate notes by any frontmatter field. Replaces Dataview for CLI use.
  Triggers on: /genome-query, "query vault", "find notes", "list genes",
  "show protocols", "vault stats", "vault schema", "filter by".
---

# Genome Query

SQL-like queries over Obsidian vault frontmatter from the command line.

## Vault Configuration
- Script: `scripts/vault_query.py`
- Parser: `scripts/lib/vault_parser.py` (shared with other toolkit scripts)
- Config: `scripts/lib/config.py` (uses `GENOME_VAULT_ROOT` env var)

## Quick Start

```bash
# Set vault location (or rely on CWD)
export GENOME_VAULT_ROOT=~/my-genome-vault

# Basic query
python3 scripts/vault_query.py "type=gene"

# With field selection and sorting
python3 scripts/vault_query.py "type=gene" --fields gene_symbol,evidence_tier --sort evidence_tier

# Vault overview
python3 scripts/vault_query.py --stats
```

## Query Syntax

### Conditions

| Operator | Meaning              | Example                         |
|----------|----------------------|---------------------------------|
| `=`      | Equals (or in list)  | `type=gene`                     |
| `!=`     | Not equals           | `type!=gene`                    |
| `~`      | Contains / substring | `evidence_tier~E1`              |
| `>`      | Greater than         | `_words>500`                    |
| `<`      | Less than            | `_words<100`                    |
| `>=`     | Greater or equal     | `coverage>=80`                  |
| `<=`     | Less or equal        | `coverage<=50`                  |

Bare field names test for existence/truthiness: `sensitivity` matches notes where the field is present and non-empty.

### Logic

- **AND**: `type=gene AND sensitivity` — both conditions must match
- **OR**: `type=gene OR type=system` — either condition matches
- **NOT**: `NOT sensitivity` — negates a condition
- **Combined**: `type=gene AND NOT sensitivity` — AND/OR/NOT compose freely

OR binds loosely, AND binds tightly: `A AND B OR C AND D` means `(A AND B) OR (C AND D)`.

### Special Fields

| Field      | Alias for  | Description                        |
|------------|------------|------------------------------------|
| `file`     | `_file`    | Relative path from vault root      |
| `name`     | `_name`    | Filename without .md extension     |
| `folder`   | `_folder`  | Parent directory relative to root  |
| `words`    | `_words`   | Word count of note body            |
| `links`    | `_links_out` | Count of outgoing wikilinks      |

### CLI Flags

| Flag               | Short | Description                              |
|--------------------|-------|------------------------------------------|
| `--fields F1,F2`   | `-f`  | Comma-separated fields to display        |
| `--sort FIELD`     | `-s`  | Sort results by field                    |
| `--desc`           |       | Sort descending                          |
| `--limit N`        | `-l`  | Limit to N results                       |
| `--count`          | `-c`  | Print count only                         |
| `--json`           | `-j`  | Output as JSON                           |
| `--group FIELD`    | `-g`  | Group by field and count                 |
| `--stats`          |       | Print vault-wide statistics              |
| `--schema`         |       | Print all frontmatter keys and frequency |

## Common Queries for Genome Vault

### Gene notes
```bash
# All gene notes
python3 scripts/vault_query.py "type=gene" --fields gene_symbol,evidence_tier,relevance

# High-evidence genes only
python3 scripts/vault_query.py "type=gene AND evidence_tier=E1" --fields gene_symbol,full_name

# Genes with sensitivity flags
python3 scripts/vault_query.py "type=gene AND sensitivity" --fields gene_symbol,sensitivity

# Genes by system
python3 scripts/vault_query.py "type=gene AND systems~Dopamine" --fields gene_symbol,systems
```

### Systems and phenotypes
```bash
# All systems with coverage
python3 scripts/vault_query.py "type=system" --fields system_name,coverage --sort coverage --desc

# Phenotypes by heritability
python3 scripts/vault_query.py "type=phenotype" --fields trait,heritability_estimate --sort heritability_estimate --desc

# Low-coverage systems (gaps)
python3 scripts/vault_query.py "type=system AND coverage<50" --fields system_name,coverage
```

### Research and protocols
```bash
# Actionable research findings
python3 scripts/vault_query.py "type=research AND actionable_findings=true" --fields name,genes

# All protocols
python3 scripts/vault_query.py "type=protocol" --fields name,evidence_tier

# Research in a folder
python3 scripts/vault_query.py "folder=Research" --fields name,actionable_findings --sort name
```

### Vault health
```bash
# Notes by type
python3 scripts/vault_query.py --stats

# All frontmatter keys
python3 scripts/vault_query.py --schema

# Group by evidence tier
python3 scripts/vault_query.py "type=gene" --group evidence_tier

# Longest notes
python3 scripts/vault_query.py "_words>1000" --fields name,_words --sort _words --desc --limit 10

# Notes with most outgoing links
python3 scripts/vault_query.py "_links_out>20" --fields name,_links_out --sort _links_out --desc
```

### Biomarkers
```bash
# All lab results
python3 scripts/vault_query.py "type=biomarker" --fields name,test_date,lab --sort test_date --desc

# JSON export for scripting
python3 scripts/vault_query.py "type=gene AND evidence_tier=E1" --json
```

## Output Formats

- **Table** (default): Aligned columns with headers
- **JSON** (`--json`): Full frontmatter as JSON array
- **Count** (`--count`): Single integer
- **Group** (`--group`): Field value + count pairs
- **Stats** (`--stats`): Vault-wide summary (types, tiers, folders, word counts)
- **Schema** (`--schema`): All frontmatter keys with frequency, types, examples

## Integration

The script uses `scripts/lib/vault_parser.py` for parsing (shared across all toolkit scripts) and `scripts/lib/config.py` for vault root resolution. Set `GENOME_VAULT_ROOT` to point at any Obsidian vault.
