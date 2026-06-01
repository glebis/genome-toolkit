# Audit Remediation Plan — ChatGPT Pro (2026-05-30)

Source: `docs/audits/2026-05-30-chatgpt-pro-audit.md` (20 findings).
Workflow: each task on its own branch `fix/audit-NN-slug`, TDD, browser-verified where it touches UI.

Legend — **Area**: FE=frontend, BE=backend, CFG=config, SCR=script.
**Browser**: ✓ = verify in the running web app via /real-browser. **Flag**: ⚠ needs a decision.

| # | Title | Sev | Area | Browser | Status | Notes / deps |
|---|-------|-----|------|---------|--------|--------------|
| 1 | PGx phenotype faked from generic `personal_status`; rsID shown as diplotype | Critical | FE | ✓ | todo | adds `unknown` state; cluster with 3,4 (PGx view) |
| 2 | Imputation VCF invents REF/ALT | Critical | SCR | — | **done** | branch `fix/audit-02-imputation-vcf-refalt` |
| 3 | PGx config gives dose-like substance/drug advice | High | CFG/FE | ✓ | ⚠ blocked | **conflicts with project harm-reduction value** — needs user call |
| 4 | PGx footer falsely claims CPIC for all enzymes | High | FE | ✓ | todo | cluster w/ 1 |
| 5 | Risk Landscape config missing `rank`/`populationBarPct` | High | FE/CFG | ✓ | todo | **precedes 6,7,8,9** (same view; prevents NaN/undefined) |
| 6 | Risk personal bar fabricates quantitative risk | High | FE | ✓ | todo | after 5 |
| 7 | "Optimal / no risk" false reassurance | High | FE | ✓ | todo | after 5 |
| 8 | Hardcoded demographic shown as "your demographic" | High | FE/CFG | ✓ | todo | after 5 |
| 9 | Screening timeline recommends actions unconditionally | High | FE/CFG | ✓ | todo | after 5 |
| 10 | GWAS tally labeled "average/distribution" w/ 50% marker | High | FE | ✓ | todo | mental-health view |
| 11 | GWAS allele counting ignores strand/palindromic | High | BE | — | todo | **precedes 12**; unit (pytest) |
| 12 | GWAS overlap reuses first trait's effect allele | Medium | BE | — | todo | after 11 |
| 13 | Life-Map maps age 38 → age-60 WHO bracket | High | FE | ✓ | todo | unit (vitest) + view; updates a bad test |
| 14 | Life-Map "expected age" copy sounds personal | Medium | FE | ✓ | todo | copy-only |
| 15 | Residence history accepts invalid localStorage/inputs | Medium | FE | ✓ | todo | unit + view |
| 16 | GWAS frontend ignores existing clumped data | Medium | FE/BE | ✓ | todo | fetch `?clumped=true` |
| 17 | `get_snp()` ignores `profile_id` | High | BE | — | ⚠ | **`genome.py` already has uncommitted WIP — reconcile first** |
| 18 | Migrations fail open (silent empty schema) | High | SCR | — | todo | `test_db_migrations.py` already red (8 fail) per audit |
| 19 | Biomarker thresholds lack unit/context validation | High | SCR | — | todo | unit |
| 20 | Evidence tiers use fake numeric confidence | Medium | CFG | — | todo | trivial yaml |

## Open decisions (need user input)
- **#3 (harm-reduction conflict):** project memory states a core value — "drug-friendly, non-judgmental, full substance coverage." The audit wants to strip dose-like substance guidance. These are in tension. Options: (a) keep substance content but relabel as harm-reduction/PK-only (not genotype-backed dosing), (b) full softening as audit suggests, (c) skip. Recommend (a).
- **#17 (`genome.py` WIP):** the working tree already modifies `backend/app/db/genome.py`. Need to know if that WIP already addresses profile scoping before branching.

## Suggested execution order (low-risk → high-value)
1. **Backend/script units first** (no browser, fast TDD): 18, 11→12, 19, 20, 17*.
2. **Risk Landscape cluster**: 5 → 6,7,8,9 (one view, browser-verify once at end).
3. **PGx cluster**: 1 → 4 (→ 3 if approved).
4. **Mental-health/GWAS FE**: 10, 16.
5. **Life-Map**: 13 → 14, 15.
