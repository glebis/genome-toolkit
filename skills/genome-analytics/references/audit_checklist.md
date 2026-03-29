# Genome Vault Audit Checklist

## Schema Compliance
- [ ] All notes have required frontmatter fields per CLAUDE.md
- [ ] Gene notes: gene_symbol, full_name, chromosome, systems, personal_variants, evidence_tier, last_reviewed
- [ ] System notes: system_name, coverage, genes, phenotypes, protocols
- [ ] Phenotype notes: trait, contributing_genes, contributing_systems, evidence_tier, protocols
- [ ] Research notes: genes, systems, actionable_findings
- [ ] All created_date in ISO format (YYYY-MM-DD), not wikilinks
- [ ] All notes have tags array

## Link Integrity
- [ ] Run vault_graph_analysis.py for orphan detection
- [ ] Zero orphan notes (all notes have at least 1 incoming link)
- [ ] Broken links identified and categorized (vault vs brain vault)
- [ ] MoC files link to all notes of their type
- [ ] Dashboard links to all MoCs, key reports, action items

## Evidence Quality
- [ ] No overclaims (effect sizes match published data)
- [ ] Candidate gene limitations noted where applicable
- [ ] Evidence tiers consistent across notes referencing same data
- [ ] DRD2 binding: 5-14% (not 30-40%)
- [ ] CYP2C9: poor metabolizer (not intermediate)
- [ ] LD-redundant variants not counted as independent

## Content Completeness
- [ ] All genes in system gene lists have dedicated gene notes
- [ ] All protocols referenced in frontmatter exist
- [ ] Phenotypes have non-empty protocols arrays
- [ ] Coverage gaps documented in each system note

## Staleness
- [ ] Run staleness_checker.py
- [ ] All notes have last_reviewed dates
- [ ] No notes with last_reviewed > 6 months old
- [ ] Run PubMed monitor for new publications

## Data Pipeline
- [ ] genome.db accessible and not corrupted
- [ ] Enrichment scripts functional
- [ ] Biomarker analyzer functional

## Scripts Available
- vault_graph_analysis.py — orphans, PageRank, broken links
- gap_audit.py — schema compliance
- staleness_checker.py — review dates
- research_update_checker.py — research freshness
- pubmed_monitor.py — new publications
- biomarker_analyzer.py — biomarker trends
- pathway_enrichment.py — pathway analysis
- prs_calculator.py — polygenic risk scores
- effect_size_aggregator.py — quantitative claims audit
