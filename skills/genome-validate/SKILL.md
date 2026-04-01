---
name: genome-validate
description: |
  Multi-agent validation pipeline for fact-checking claims, verifying evidence tiers,
  and ensuring prescriber document accuracy. Uses Codex CLI, NotebookLM, PubMed
  subagents, and Tavily search.
  Supports: audit (full vault), gene SYMBOL (single gene fact-check),
  protocol NAME (protocol/report fact-check).
  Triggers on: /genome-validate, "validate this note", "fact-check", "cross-check claims",
  "verify evidence", "audit this report", "fact-check gene X", "check protocol X".
---

# Genome Validate

Multi-agent validation for genome vault claims and reports.

## Vault Configuration
- Agent config: `config/agents.yaml`
- Validation logic: `scripts/lib/multi_agent.py`
- Evidence tiers: `config/evidence_tiers.yaml`

## Validation Modes

### Mode 1: Single Note Validation
Validate a specific gene note or research finding.

1. Read the note content
2. Dispatch to configured agents in parallel:
   - **Codex CLI**: Review evidence tiers, effect sizes, drug interactions
   - **Claude subagent (PubMed)**: Search for recent publications on this gene
   - **Tavily**: Check for retractions of cited papers
3. Aggregate results using consensus logic
4. Report: pass/warn/block with specific flags

**Gate**: `gene_note` — requires 1 agent pass, blocks on effect_size_mismatch, wrong_evidence_tier

### Mode 2: Report Validation (Gated)
Validate prescriber-facing documents (Wallet Card, PGx Card, Prescriber Summary).

1. Read the report content
2. Dispatch to agents:
   - **Codex CLI**: Check drug contraindications against CPIC guidelines
   - **NotebookLM**: Verify claims against uploaded source papers
   - **Claude subagent**: Cross-reference drug interactions
3. Apply strict consensus gate
4. **BLOCK publication** if safety-critical errors found

**Gate**: `prescriber_report` — requires 2 agents agree, zero tolerance on drug safety

### Mode 3: Full Vault Audit
Comprehensive multi-agent audit of the entire vault.

1. Run Python audit scripts (graph, consistency, staleness, evidence, claims)
2. Dispatch to agents:
   - **Codex CLI**: Review top 10 highest-PageRank notes
   - **NotebookLM**: Check prescriber docs vs research notes for contradictions
   - **Tavily**: Scan for retractions and safety alerts
   - **Claude subagent**: PubMed scan for new publications
3. Generate unified audit report

**Gate**: `vault_audit` — advisory only, no blocking

## Agent Integration

### Codex CLI
```bash
echo "PROMPT" | codex exec --skip-git-repo-check -m gpt-5-codex --config model_reasoning_effort="high" --sandbox read-only --full-auto -C $GENOME_VAULT_ROOT 2>/dev/null
```

### NotebookLM
Use the `notebooklm` skill to upload source papers and query.
Requires manual source upload for new validations.

### PubMed Subagent
Launch Claude Explore agent with PubMed search focus.

### Tavily
Use the `tavily-search` skill for web-based verification.

## Consensus Logic

From `config/agents.yaml`:
- `effect_size_tolerance`: 20% — flag if agents disagree by more
- `evidence_tier_tolerance`: 1 tier — flag if agents disagree by more
- `drug_interaction_strict`: true — zero tolerance on safety claims
- `require_human_for_blocks`: true — human must override blocks

## Mode 4: Single Gene Fact-Check

Fact-check a single gene note against primary data and literature.

```
/genome-validate gene COMT
```

### Steps
1. **Verify genotypes vs SQLite**
   - Query `data/genome.db` for all variants in the gene note
   - Compare stated genotypes, rsIDs, and allele calls against database
   - Flag mismatches, missing variants, or stale r2_quality values
2. **Check clinical claims via web search**
   - Use Tavily to verify effect sizes, drug interaction claims, phenotype associations
   - Cross-reference CPIC/DPWG guidelines for pharmacogenes
   - Flag retracted or superseded studies
3. **Validate evidence tiers**
   - Compare assigned tiers (E1-E5) against current literature strength
   - Flag tier inflation (e.g., E2 claim supported by single study)
   - Check gene-gene interaction claims for formal testing evidence
4. **Identify gaps**
   - Missing "What Changes This" section
   - Missing drug interactions for known pharmacogenes
   - Absent cross-references to existing vault genes/systems

**Output**: Per-claim validation with pass/warn/flag status and suggested corrections.

## Mode 5: Protocol/Report Fact-Check

Fact-check a protocol, report, or phenotype note.

```
/genome-validate protocol "Sertraline Optimization"
/genome-validate report "Prescriber Summary"
```

### Steps
1. **Verify gene-recommendation links**
   - For each recommendation, confirm the referenced gene note exists and genotype supports the claim
   - Check that cited evidence tiers match the source gene notes
   - Flag recommendations that reference genes not in the vault
2. **Supplement safety check**
   - Cross-reference supplements against current medications (from vault context)
   - Use Tavily to check for recent safety alerts or contraindication updates
   - Flag drug-supplement and supplement-supplement interactions
3. **Evidence tier validation**
   - Verify protocol-level evidence tier is not higher than its weakest supporting gene claim
   - Flag speculative recommendations (E4-E5) presented without caveats
4. **Completeness check**
   - Monitoring schedule present and realistic
   - Dosage ranges match published guidelines
   - Missing contraindications or precautions

**Gate**: `prescriber_report` gate applies if the note is in Reports/. Protocol notes use advisory mode (no blocking).

## Output
- Validation report (markdown) with per-agent results
- Pass/warn/block status
- Specific flags with suggestions for correction
- Recommendations for follow-up
