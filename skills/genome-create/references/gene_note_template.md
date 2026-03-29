# Gene Note Template Reference

## Required Frontmatter
type: gene
gene_symbol: SYMBOL
full_name: Full Gene Name
chromosome: "N"
systems:
  - "[[System Name]]"
personal_variants:
  - rsid: rsNNNNNN
    genotype: "X;Y"
    significance: "Description"
evidence_tier: EX
description: "One-line description"
personal_status: status
relevance: high/medium/low
last_reviewed: "YYYY-MM-DD"
brain_vault_link: ""
created_date: 'YYYY-MM-DD'
tags:
  - gene
  - relevant-tag

## Required Sections (in order)
1. What This Gene Does — biology, function, mechanism
2. Personal Genotype — table of variants with evidence tiers
3. Health Relevance — subsections by health domain
4. Drug Interactions — table if applicable
5. Gene-Gene Interactions — cross-references to other vault genes
6. What Changes This — modifiable factors (exercise, diet, supplements)
7. Confidence & Caveats — evidence tier, limitations, link to Genetic Determinism note
8. Sources — real published citations

## Evidence Tiers
- E1: Clinical-grade (CPIC/DPWG guideline, multiple studies, clinical PGx panels)
- E2: Well-replicated (multiple GWAS, meta-analyses, OR > 1.5)
- E3: Supported (2-5 studies, plausible mechanism, OR 1.2-1.5)
- E4: Suggestive (single well-powered study OR multiple underpowered)
- E5: Speculative/N=1 (preliminary, animal models, personal observation)

## SQLite Queries
Query genotype: sqlite3 data/genome.db "SELECT rsid, chromosome, position, genotype, r2_quality, source FROM snps WHERE rsid IN ('rsXXXX')"
Query enrichment: sqlite3 data/genome.db "SELECT rsid, source, json_extract(data, '$.summary') FROM enrichments WHERE rsid='rsXXXX'"
Query by region: sqlite3 data/genome.db "SELECT rsid, genotype, r2_quality, source FROM snps WHERE chromosome='N' AND position BETWEEN X AND Y AND (source='genotyped' OR r2_quality > 0.8)"

## Cross-Reference Rules
- Link to relevant System notes in frontmatter
- Add gene-gene interactions with genes already in vault
- End vulnerability notes with "What Changes This" (BDNF exit ramp philosophy)
- Include > [!brain] callouts for brain vault cross-references
- Link to [[Genetic Determinism - Limits and Caveats]]
