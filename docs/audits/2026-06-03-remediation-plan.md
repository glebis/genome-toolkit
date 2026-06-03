# GPT-5.5 Pro Validation — Remediation Plan (2026-06-03)

Source: `docs/audits/2026-06-03-gpt55pro-report-validation.md` (22 findings).
Two streams. Each task its own branch; TDD for code (pytest), faithful wording application for reports (not unit-testable).

## Stream A — CODE (`genome-toolkit`, TDD, push to origin)
| Branch | Findings | Sev | Scope |
|--------|----------|-----|-------|
| `fix/audit2-imputation-import-safety` | #1 | Critical | `post_imputation_import.py`: do NOT import on missing R² (require `--allow-missing-r2`); require real GT or parse DS/GP with posterior thresholds (no blind first-FORMAT-field); write `profile_id`, import metadata, true `is_rsid`; dedupe per-profile not global |
| `fix/audit2-strand-safe-analytics` | #16 | High | `prs_calculator.py` + `gwas_analytics.py`: replace naive `count_effect_alleles` with the strand/palindrome-safe counter from `gwas.py` (audit #11); require `other_allele`; exclude/await-confirmation for palindromic A/T & C/G; gate PRS percentile labels |
| `fix/audit2-profile-threading` | #18 | High | thread `profile_id` through `prepare_for_imputation.py`, `post_imputation_import.py`, `genome.py` (list/query/count/stats), `gwas_analytics.py`, `prs_calculator.py`; DB uniqueness `(profile_id, rsid, source)` |
| `fix/audit2-pk-model-containment` | #17 | High | `cessation_pk_model.py`: keep as sensitivity-analysis only; ensure it cannot emit prescriber-facing magnitude language (label/guard) |

**Deferred (tracked, not this pass):** #5 machine-readable evidence registry (architectural — `evidence_tiers.yaml` is already qualitative from audit #20; report-side wording fixes below remove the immediate Level-A inflation risk). #15 canonical `variant_calls.tsv` per report (new feature).

## Stream B — VAULT REPORTS (`~/Brains/genome` repo, content edits, push to origin)
Branch `fix/report-honesty-2026-06`. Apply GPT's recommended wording verbatim. Priority:
- **#2 DPYD [Critical]** — "does NOT clear fluoropyrimidines; clinical DPYD + HapB3 needed"
- **#2/#3 CYP2D6 [High]** — downgrade `*4/*10` → "reduced-function signal, unconfirmed"; split genotype actions from drug–drug (tramadol); fix ondansetron/aripiprazole/hydrocodone IM claims
- **#4 tramadol ROR 41.95** — relabel as FAERS signal, strip naked ROR from wallet/emergency cards
- **#5 evidence tiers in reports** — stop assigning CPIC Level A to ABCB1/SLC6A4/HTR2A/CYP1A2/CYP2C8/buspirone
- **#6 CBD/sertraline "tripling"** — replace magnitude claim with "may increase exposure; monitor/TDM"
- **#8 UGT1A1**, **#9 NSAID**, **#10 CYP2C8**, **#11 NAT2**, **#12 SLCO1B1**, **#13 warfarin**, **#14 psychiatric markers**, **#19/#20 stale reports**, **#21 buspirone**, **#22 wallet card** — per validation doc recommendations.

These change a real personal medical record → faithful application of the validation's wording, no independent clinical judgment.
