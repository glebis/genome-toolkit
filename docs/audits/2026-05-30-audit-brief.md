# Genome Toolkit — Audit Brief for ChatGPT Pro

## What this is
Genome Toolkit turns raw DTC genetic data (23andMe, AncestryDNA, VCF, etc.) into an
Obsidian health vault + a FastAPI/React web app. It generates **health conclusions**
from genetic + demographic data: drug-safety (PGx) cards, GWAS risk readouts, biomarker
comparisons, a "Risk Landscape" (cause-of-death screening map), and a new "Life-Map"
that estimates life expectancy from country residence history and applies qualitative
"life modifiers."

This is a **personal, non-clinical** tool. The actual genome databases and the user's
private data have been **excluded** from this archive — you are auditing **logic, configs,
and code**, not data.

## What I want audited (in priority order)

1. **Misalignments** — places where the code/UI claims or implies more than the
   underlying data or method supports. e.g. presenting a population-average GWAS odds
   ratio as a personal risk; treating a country life-expectancy blend as an individual
   prediction; implying clinical validity where there is none.

2. **Overgeneralizations** — single SNPs or small panels extrapolated to whole-trait
   conclusions; ancestry/population assumptions (defaults to EUR) applied to non-EUR
   users; "evidence-gated qualitative life modifiers" that may not be evidence-gated in
   practice; collapsing uncertainty/confidence intervals into point estimates.

3. **Error-prone conclusions** — methodological or statistical mistakes: additive vs.
   multiplicative risk combination, double-counting correlated SNPs, ignoring linkage
   disequilibrium, confusing relative vs. absolute risk, mishandling missing genotypes,
   strand/allele-orientation bugs, life-table interpolation errors (note the commit
   "use matched bracket age for target age (honest WHO sparse data)").

4. **Safety / framing** — PGx drug guidance and the cause-of-death "Risk Landscape"
   are the highest-stakes surfaces. Flag anything that could be read as medical advice
   without adequate hedging, or that could cause harm if acted on.

## Where to focus
- `backend/app/routes/life_map.py`, `backend/app/routes/gwas*.py`, PGx + biomarker routes
- `frontend/src/lib/lifeBlend.ts` (life-expectancy blend math)
- `frontend/src/hooks/useRiskData.ts`, `useLifeMap.ts`, `useResidenceHistory.ts`
- `frontend/src/components/risk/RiskLandscape.tsx`, `components/lifemap/*`
- Configs that encode the conclusions: `config/risk-landscape.yaml`,
  `config/life-modifiers.yaml`, `config/life_tables.json`, `config/evidence_tiers.yaml`,
  `config/pgx-drugs.yaml`, `config/gwas/*`
- `genome_toolkit/` core library + `scripts/` import/analysis pipeline

## Output format requested
For **each finding**, give:
- **Title** + **severity** (Critical / High / Medium / Low)
- **Category** (misalignment / overgeneralization / error-prone conclusion / safety / code)
- **Location** — file path and, where possible, the function or line/section
- **Why it's wrong / risky** — the scientific or statistical reasoning, concise
- **Recommendation** — what to change
- **Codex-ready patch** — a concrete code or config diff/snippet small enough for an
  automated agent (OpenAI Codex) to apply directly. Prefer minimal, surgical edits.

End with a **prioritized summary table** (severity × effort) so the most valuable,
lowest-effort fixes are obvious.

Be skeptical and specific. Prefer "here's the exact line and the exact fix" over general
advice. Where the method is defensible, say so — don't manufacture findings.
