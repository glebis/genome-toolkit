I audited the snapshot as a logic/config/code review, not as a clinical/genomic interpretation of a real person. The main pattern: the app often has decent disclaimers, then immediately undermines them with UI language, bars, defaults, and “normal/optimal” labels that imply far more certainty than the method supports. Very human. Very avoidable.

I used CPIC, FDA, NHGRI, and ONS as external baselines for the risky areas: CPIC frames PGx guidance as clinician-facing help for using available genetic results, not direct self-treatment guidance; FDA explicitly says PGx tables are limited and patients should not adjust medications without prescribers; NHGRI describes PRS as relative/correlative, not an absolute prediction, with ancestry-portability limits; ONS defines period life expectancy as an average under mortality-rate assumptions, not an individual prediction. 
Office for National Statistics
+3
ClinPGx
+3
U.S. Food and Drug Administration
+3

What is defensible

The Life-Map modifier design is better than expected. config/life-modifiers.yaml:1-18 explicitly says modifiers do not mutate the life-expectancy number, and LifeModifiers.tsx:16-20 only exposes numeric ranges for evidence: strong. Mental-health modifiers are weak-evidence and qualitative. That is the right instinct.

The Life-Map UI also has useful caveats in LifeMap.tsx and MigrationContextMarker.tsx. The problem is not the intent. The problem is a few math and labeling choices that make the output look more precise than it is. Naturally, the machine is honest in the comments and theatrical in the UI. Classic.

Findings
1. PGx phenotype is inferred from generic vault status and defaults missing data to “normal”

Severity: Critical
Category: safety / misalignment / error-prone conclusion
Location: frontend/src/hooks/usePGxData.ts:37-45, 116-123; frontend/src/types/pgx.ts:1-16; frontend/src/components/pgx/MetabolizerBar.tsx:8-43

Why risky:
personal_status is a generic health-dashboard field, but PGx needs a specific phenotype or diplotype, such as CYP2D6 poor metabolizer, CYP2C19 rapid metabolizer, SLCO1B1 decreased function, etc. Mapping risk → poor, monitor → intermediate, and missing gene data to normal creates fake PGx conclusions. Worse, vaultGene?.personal_variants?.[0]?.genotype is displayed as if it were a star-allele diplotype. An rsID genotype like AG is not *1/*4.

This is the single highest-risk bug because it affects medication/substance advice. CPIC and FDA both frame PGx interpretation as phenotype/genotype-specific and prescriber-mediated, not “generic risk status = dosing phenotype.” 
ClinPGx
+1

Recommendation:
Add an explicit unknown PGx state. Only show a PGx phenotype when the vault/config provides PGx-specific fields. Never default missing PGx data to normal or *1/*1.

Codex-ready patch:

Diff
diff --git a/frontend/src/types/pgx.ts b/frontend/src/types/pgx.ts
--- a/frontend/src/types/pgx.ts
+++ b/frontend/src/types/pgx.ts
@@
-export type MetabolizerStatus = 'poor' | 'intermediate' | 'normal' | 'ultrarapid'
+export type MetabolizerStatus = 'unknown' | 'poor' | 'intermediate' | 'normal' | 'ultrarapid'
@@
 export const METABOLIZER_COLORS: Record<MetabolizerStatus, string> = {
+  unknown: 'var(--text-tertiary)',
   poor: 'var(--sig-risk)',
@@
 export const METABOLIZER_LABELS: Record<MetabolizerStatus, string> = {
+  unknown: 'Unknown phenotype',
   poor: 'Poor Metabolizer',
@@
 export const TRANSPORTER_LABELS: Record<MetabolizerStatus, string> = {
+  unknown: 'Unknown function',
   poor: 'Poor Function',
Diff
diff --git a/frontend/src/hooks/usePGxData.ts b/frontend/src/hooks/usePGxData.ts
--- a/frontend/src/hooks/usePGxData.ts
+++ b/frontend/src/hooks/usePGxData.ts
@@
-function mapMetabolizerStatus(ps: string): MetabolizerStatus {
-  const s = ps.toLowerCase().replace(/[_-]/g, '')
-  if (s === 'risk' || s === 'poor' || s === 'poormetabolizer') return 'poor'
-  if (s === 'intermediate' || s === 'monitor' || s === 'intermediatemetabolizer' || s === 'caution') return 'intermediate'
+type PGxVaultGene = VaultGene & {
+  pgx_phenotype?: string
+  metabolizer_status?: string
+  pgx_diplotype?: string
+  pharmacogenomics?: { phenotype?: string; diplotype?: string }
+}
+
+function parseMetabolizerStatus(value?: string): MetabolizerStatus {
+  if (!value) return 'unknown'
+  const s = value.toLowerCase().replace(/[_\s-]/g, '')
+  if (s === 'poor' || s === 'poormetabolizer' || s === 'poorfunction') return 'poor'
+  if (s === 'intermediate' || s === 'intermediatemetabolizer' || s === 'decreasedfunction') return 'intermediate'
   if (s === 'ultrarapid' || s === 'ultrarapidmetabolizer' || s === 'highactivity') return 'ultrarapid'
   if (s === 'normal' || s === 'reference' || s === 'normalmetabolizer' || s === 'extensivemetabolizer') return 'normal'
-  if (s === 'needsreview' || s === 'indeterminate') return 'intermediate'
-  return 'normal'
+  return 'unknown'
+}
+
+function getPGxStatus(g?: VaultGene, fallback?: MetabolizerStatus): MetabolizerStatus {
+  const pgx = g as PGxVaultGene | undefined
+  return parseMetabolizerStatus(
+    pgx?.pgx_phenotype ??
+    pgx?.metabolizer_status ??
+    pgx?.pharmacogenomics?.phenotype ??
+    fallback
+  )
+}
+
+function getPGxDiplotype(g?: VaultGene, fallback?: string): string {
+  const pgx = g as PGxVaultGene | undefined
+  return pgx?.pgx_diplotype ?? pgx?.pharmacogenomics?.diplotype ?? fallback ?? 'unknown'
 }
@@
 function statusPosition(s: MetabolizerStatus): number {
   switch (s) {
+    case 'unknown': return 50
@@
-      const metStatus: MetabolizerStatus = vaultGene
-        ? mapMetabolizerStatus(vaultGene.personal_status)
-        : ce.default_status ?? 'normal'
+      const metStatus: MetabolizerStatus = getPGxStatus(vaultGene, ce.default_status)
 
-      const alleles = vaultGene?.personal_variants?.[0]?.genotype ?? ce.default_alleles ?? '*1/*1'
+      const alleles = getPGxDiplotype(vaultGene, ce.default_alleles)
@@
-          vaultGene?.description ?? ce.description ?? `${ce.symbol} — ${metStatus} metabolizer.`,
+          vaultGene?.description ?? ce.description ?? `${ce.symbol} — PGx phenotype ${metStatus}.`,
Diff
diff --git a/frontend/src/components/pgx/MetabolizerBar.tsx b/frontend/src/components/pgx/MetabolizerBar.tsx
--- a/frontend/src/components/pgx/MetabolizerBar.tsx
+++ b/frontend/src/components/pgx/MetabolizerBar.tsx
@@
 export function MetabolizerBar({ enzyme }: MetabolizerBarProps) {
+  if (enzyme.status === 'unknown') {
+    return (
+      <div style={{ marginBottom: 14, fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
+        PGx phenotype unknown. No metabolizer-speed marker shown.
+      </div>
+    )
+  }
2. PGx footer falsely says every enzyme is based on CPIC guidelines

Severity: High
Category: safety / misalignment
Location: frontend/src/components/pgx/PGxPanel.tsx:325-331; config/pgx-drugs.yaml

Why risky:
The footer says Based on {guideline || 'CPIC'} guidelines (2025). That means enzymes with no configured guideline still display as CPIC-backed. This is especially problematic for entries like CYP3A4 and CYP2E1, where the config contains broad drug/substance statements that are not equivalent to CPIC genotype-based dosing recommendations.

Recommendation:
Only show guideline-backed wording if section.enzyme.guideline is present. Otherwise label the section exploratory. Remove the hardcoded year.

Codex-ready patch:

Diff
diff --git a/frontend/src/components/pgx/PGxPanel.tsx b/frontend/src/components/pgx/PGxPanel.tsx
--- a/frontend/src/components/pgx/PGxPanel.tsx
+++ b/frontend/src/components/pgx/PGxPanel.tsx
@@
-                <span>Based on {section.enzyme.guideline || 'CPIC'} guidelines (2025)</span>
+                <span>
+                  {section.enzyme.guideline
+                    ? `Guideline-backed: ${section.enzyme.guideline}. Verify current prescribing guidance with a clinician.`
+                    : 'Exploratory metabolism note. Not guideline-backed for dosing.'}
+                </span>
3. PGx config gives specific dosing-style advice in non-clinical and substance contexts

Severity: High
Category: safety / overgeneralization
Location: config/pgx-drugs.yaml:12-23, 49-60, 177-203, 207-229; config/substances.yaml:7-36

Why risky:
Examples include explicit dose suggestions and prescriber-like instructions, such as bupropion starting-dose text in config/pgx-drugs.yaml:183, ketamine recreational guidance in 199-203, acetaminophen thresholds in 216-217, and MDMA/psychedelic lower-dose guidance in config/substances.yaml:7-21. Some statements may be reasonable harm-reduction ideas, but they are presented as if the user’s genotype reliably supports them. That is far stronger than the app’s actual PGx inference.

Recommendation:
Separate guideline-backed prescription recommendations, FDA label biomarker notes, pharmacokinetic-only notes, and harm-reduction notes. Do not export substance/drug “cards for prescriber” unless they are guideline-backed or label-backed.

Codex-ready patch:

Diff
diff --git a/frontend/src/hooks/usePGxData.ts b/frontend/src/hooks/usePGxData.ts
--- a/frontend/src/hooks/usePGxData.ts
+++ b/frontend/src/hooks/usePGxData.ts
@@
 interface ConfigDrug {
@@
   category: string
+  evidence_scope?: 'guideline' | 'label' | 'pk_only' | 'harm_reduction' | 'exploratory'
@@
 }
@@
         return {
@@
           category: (cd.category === 'drug' ? 'prescription' : cd.category) as 'prescription' | 'substance',
+          evidenceScope: cd.evidence_scope ?? (ce.guideline ? 'guideline' : 'exploratory'),
         }

Then soften the config entries. Start with the worst offenders:

Diff
diff --git a/config/pgx-drugs.yaml b/config/pgx-drugs.yaml
--- a/config/pgx-drugs.yaml
+++ b/config/pgx-drugs.yaml
@@
-          poor: { impact: warn, text: "Elevated levels — seizure risk", description: "Bupropion has a dose-dependent seizure risk. Poor metabolizers accumulate higher plasma levels, increasing risk.", danger_note: "If prescribed Wellbutrin for depression or Zyban for smoking cessation, start at the lowest dose (100mg SR, not XL 150). Watch for signs of overstimulation — insomnia, agitation, tremor — these mean levels are too high." }
+          poor: { impact: warn, text: "Discuss lower starting dose / closer monitoring", description: "Bupropion exposure may vary with CYP2B6 phenotype. Treat this as a prescriber discussion point, not a self-adjustment instruction.", danger_note: "Do not change dose without the prescribing clinician. Ask about seizure-risk factors, interactions, and monitoring." }
@@
-          poor: { impact: warn, text: "Longer and deeper effects", description: "CYP2B6 is a major ketamine pathway. Poor metabolizers experience longer dissociative effects and slower return to baseline.", danger_note: "Whether therapeutic (for depression) or recreational, expect longer trips than peers report. Space doses further apart. Never combine with alcohol, GHB, or benzos — respiratory depression risk compounds. Stay hydrated; ketamine is hard on the bladder for frequent users." }
+          poor: { impact: warn, text: "Potentially slower clearance — avoid risky combinations", description: "CYP2B6 may affect ketamine metabolism, but this is not a dosing guide.", danger_note: "Do not combine with alcohol, GHB, benzodiazepines, or opioids. Therapeutic use should be supervised by a clinician." }
4. Risk Landscape config is missing fields the TypeScript requires

Severity: High
Category: code / error-prone conclusion
Location: config/risk-landscape.yaml:6-112; frontend/src/hooks/useRiskData.ts:187-195, 307-312; RiskLandscape.tsx:479, 505, 513, 684

Why risky:
ConfigCause requires rank and populationBarPct, but the YAML only provides cause and pct. Static check showed all 10 causes are missing both fields. Result: rank becomes undefined, React keys collide, animation delays become NaN, populationBarPct becomes undefined, and the bar width becomes undefined%. The app’s flagship mortality display can silently break or render nonsense.

Recommendation:
Make config fields optional and derive safe defaults from array order and pct.

Codex-ready patch:

Diff
diff --git a/frontend/src/hooks/useRiskData.ts b/frontend/src/hooks/useRiskData.ts
--- a/frontend/src/hooks/useRiskData.ts
+++ b/frontend/src/hooks/useRiskData.ts
@@
 interface ConfigCause {
-  rank: number
+  rank?: number
   cause: string
   pct: number
-  populationBarPct: number
+  populationBarPct?: number
@@
       for (const c of config) {
+        const rank = Number.isFinite(c.rank) ? Number(c.rank) : built.length + 1
+        const populationBarPct = Math.max(
+          0,
+          Math.min(100, Number.isFinite(c.populationBarPct) ? Number(c.populationBarPct) : Number(c.pct ?? 0)),
+        )
@@
-        const personalBarPct = computePersonalBarPct(matchedGenes, c.populationBarPct)
+        const personalBarPct = computePersonalBarPct(matchedGenes, populationBarPct)
@@
-          rank: c.rank,
+          rank,
@@
-          populationBarPct: c.populationBarPct,
+          populationBarPct,
5. Risk Landscape fabricates a personal risk bar from gene counts

Severity: High
Category: misalignment / error-prone conclusion / safety
Location: frontend/src/hooks/useRiskData.ts:91-100; RiskLandscape.tsx:309-324, 563-569, 668-674

Why risky:
computePersonalBarPct() scales mortality bars using 1 + actionableCount * 0.3 + monitorCount * 0.1. That is not a risk model. It is a made-up number that visually behaves like a risk estimate. The UI caveat says it is qualitative, but the bar length still screams “quantified personal mortality.” Apparently a disclaimer is expected to defeat geometry. It will not.

NHGRI’s PRS guidance is a useful benchmark here: even actual PRS is relative/correlative and requires calibration; this is not even PRS. 
Genome.gov

Recommendation:
Do not scale by population mortality or gene count. Use a small categorical marker only, or remove the personal bar entirely.

Codex-ready patch:

Diff
diff --git a/frontend/src/hooks/useRiskData.ts b/frontend/src/hooks/useRiskData.ts
--- a/frontend/src/hooks/useRiskData.ts
+++ b/frontend/src/hooks/useRiskData.ts
@@
 function computePersonalBarPct(matchedGenes: VaultGene[], populationBarPct: number): number {
-  if (matchedGenes.length === 0) return Math.round(populationBarPct * 0.3)
-  const actionableCount = matchedGenes.filter(
-    (g) => g.personal_status === 'risk' || g.personal_status === 'actionable',
-  ).length
-  const monitorCount = matchedGenes.filter(
-    (g) => g.personal_status === 'intermediate' || g.personal_status === 'monitor',
-  ).length
-  const factor = 1 + actionableCount * 0.3 + monitorCount * 0.1
-  return Math.min(Math.round(populationBarPct * factor), 100)
+  // Marker only. This is not calibrated risk and must not scale with mortality share.
+  void populationBarPct
+  return matchedGenes.length === 0 ? 0 : 10
 }
Diff
diff --git a/frontend/src/components/risk/RiskLandscape.tsx b/frontend/src/components/risk/RiskLandscape.tsx
--- a/frontend/src/components/risk/RiskLandscape.tsx
+++ b/frontend/src/components/risk/RiskLandscape.tsx
@@
-    { label: 'Population prevalence', height: 8, color: 'var(--border)', opacity: 1 },
-    { label: 'Actionable genetic factors', height: 14, color: 'var(--sig-risk)', opacity: 0.75 },
+    { label: 'Population share of deaths', height: 8, color: 'var(--border)', opacity: 1 },
+    { label: 'Configured genetic flag present', height: 14, color: 'var(--sig-risk)', opacity: 0.75 },
@@
-    { label: 'Optimal / protective', height: 14, color: 'var(--sig-benefit)', opacity: 0.75 },
+    { label: 'No configured risk flag', height: 14, color: 'var(--sig-benefit)', opacity: 0.75 },
@@
-          Your personal bar reflects the number and severity of relevant genetic variants found
-          — <strong>it is a qualitative assessment, not a calibrated risk score or PRS</strong>.
+          The genetic marker shows whether configured genes have flags. It is not a calibrated
+          risk score, PRS, mortality estimate, or severity scale.
6. “Optimal / no risk” and “No relevant variants detected” create false reassurance

Severity: High
Category: misalignment / safety
Location: frontend/src/hooks/useRiskData.ts:71-80, 286-301; RiskLandscape.tsx:658-661; RiskLandscape.tsx:563-569

Why risky:
No matched configured gene is not the same as no variant. No flagged configured variant is not “no elevated risk.” The app only sees a small curated set, not whole-disease risk. This is absence-of-evidence cosplay, and it can falsely reassure users about cardiovascular disease, cancer, suicide risk, dementia, etc.

Recommendation:
Replace “optimal/no risk” language with “no configured risk flag” and “not assessed.”

Codex-ready patch:

Diff
diff --git a/frontend/src/hooks/useRiskData.ts b/frontend/src/hooks/useRiskData.ts
--- a/frontend/src/hooks/useRiskData.ts
+++ b/frontend/src/hooks/useRiskData.ts
@@
-        ? `${names} shows no elevated risk.`
-        : `${names} show no elevated risk.`,
+        ? `${names} has no configured risk flag.`
+        : `${names} have no configured risk flags.`,
@@
-    parts.push('No elevated risk variants detected across all analyzed genes.')
+    parts.push('No configured elevated-risk flags detected in this limited gene set.')
@@
-            : 'No relevant variants detected'
+            : 'No configured gene match / not assessed'
@@
-                ? 'Optimal — no elevated risk variants'
-                : 'No genetic data available'
+                ? 'No configured risk flag'
+                : 'No configured genetic assessment'
Diff
diff --git a/frontend/src/components/risk/RiskLandscape.tsx b/frontend/src/components/risk/RiskLandscape.tsx
--- a/frontend/src/components/risk/RiskLandscape.tsx
+++ b/frontend/src/components/risk/RiskLandscape.tsx
@@
-          <StatBox value={stats.optimal} label="Optimal / no risk" color="var(--sig-benefit)" />
+          <StatBox value={stats.optimal} label="No configured flags" color="var(--sig-benefit)" />
7. Mortality demographic is hardcoded but presented as “your demographic”

Severity: High
Category: misalignment / overgeneralization
Location: config/risk-landscape.yaml:1-4; RiskLandscape.tsx:651-653, 668-674

Why risky:
The config hardcodes male, 30-44, european, then the UI says “your demographic.” There is no user demographic input wired into Risk Landscape. This can mislead anyone outside that reference profile.

Recommendation:
Call it a configured reference profile unless actual user demographics are supplied and validated.

Codex-ready patch:

Diff
diff --git a/config/risk-landscape.yaml b/config/risk-landscape.yaml
--- a/config/risk-landscape.yaml
+++ b/config/risk-landscape.yaml
@@
 demographic:
+  label: "Reference profile"
+  is_default: true
   sex: male
   age_range: "30-44"
   ancestry: european
Diff
diff --git a/frontend/src/components/risk/RiskLandscape.tsx b/frontend/src/components/risk/RiskLandscape.tsx
--- a/frontend/src/components/risk/RiskLandscape.tsx
+++ b/frontend/src/components/risk/RiskLandscape.tsx
@@
-        description="The top causes of mortality for your demographic, overlaid with your personal genetic factors. Knowledge is power — knowing where to focus attention lets you take informed action."
+        description="Reference cause-of-death landscape overlaid with configured genetic annotations. This is prioritization context, not personal mortality prediction."
@@
-          Population bars show how common each cause of death is for{' '}
+          Population bars show the configured reference share of deaths for{' '}
@@
-          <strong>{demographic ? formatDemographic(demographic) : 'your demographic profile'}</strong>.
+          <strong>{demographic ? formatDemographic(demographic) : 'the reference profile'}</strong>.
8. Screening timeline recommends medical actions unconditionally

Severity: High
Category: safety / overgeneralization
Location: config/risk-landscape.yaml:11-20, 45-54, 59-76, 81-96; frontend/src/hooks/useRiskData.ts:143-177, 305

Why risky:
The config includes screening items like CAC, homocysteine, insulin sensitivity assessment, cognitive baseline, pulmonary function test, etc. buildTimeline() includes them for every cause regardless of actual gene flags, family history, symptoms, age, guideline indication, or clinician context.

Recommendation:
Gate screening items. Default to hiding them unless they are general population advice or the cause has actionable/monitor status. Make every screening a “discuss” item unless explicitly guideline-backed.

Codex-ready patch:

Diff
diff --git a/frontend/src/hooks/useRiskData.ts b/frontend/src/hooks/useRiskData.ts
--- a/frontend/src/hooks/useRiskData.ts
+++ b/frontend/src/hooks/useRiskData.ts
@@
 interface ConfigScreening {
   name: string
   frequency: string
   type: string
   gene?: string
+  applies_when?: 'always' | 'genetic_flag' | 'actionable' | 'monitor'
 }
@@
 function buildTimeline(
   configScreenings: ConfigScreening[],
   vaultActions: { type: string; text: string }[],
+  status: RiskStatus,
 ): TimelineGroup[] {
@@
   for (const s of configScreenings) {
+    const gate = s.applies_when ?? 'genetic_flag'
+    if (gate === 'actionable' && status !== 'actionable') continue
+    if (gate === 'monitor' && status !== 'monitor' && status !== 'actionable') continue
+    if (gate === 'genetic_flag' && (status === 'nodata' || status === 'optimal')) continue
     items.push({
@@
-      type: s.type === 'consider' || s.type === 'monitor' || s.type === 'discuss' ? s.type : 'consider',
+      type: s.type === 'consider' || s.type === 'monitor' || s.type === 'discuss' ? s.type : 'discuss',
@@
-        const timeline = buildTimeline(c.screenings ?? [], actionMinis)
+        const timeline = buildTimeline(c.screenings ?? [], actionMinis, status)

Example config edit:

Diff
diff --git a/config/risk-landscape.yaml b/config/risk-landscape.yaml
@@
       - name: Coronary calcium score (CAC)
         frequency: once
         type: discuss
+        applies_when: actionable
9. GWAS tally is presented as “average” and “distribution” without a reference distribution

Severity: High
Category: error-prone conclusion / misalignment
Location: frontend/src/components/mental-health/GWASFindings.tsx:10-38, 181-184, 248-265

Why risky:
The component calls risk_allele_total / risk_allele_max an average/distribution position. That is invalid. The denominator is “possible allele copies in matched SNPs,” not a population reference distribution. Population average depends on allele frequencies, ancestry, LD, missingness, effect sizes, and calibration. The component even admits “this is NOT a PRS” at 190, then immediately draws an “average” marker at 50%. The UI is arguing with itself, and both sides are losing.

NHGRI’s PRS explanation distinguishes relative risk, baseline/timing, correlations, and ancestry portability; this app’s tally does not meet that bar. 
Genome.gov

Recommendation:
Remove “average,” “distribution,” “lower/higher than average,” and the 50% average marker. Label it an uncalibrated tally.

Codex-ready patch:

Diff
diff --git a/frontend/src/components/mental-health/GWASFindings.tsx b/frontend/src/components/mental-health/GWASFindings.tsx
--- a/frontend/src/components/mental-health/GWASFindings.tsx
+++ b/frontend/src/components/mental-health/GWASFindings.tsx
@@
-/** Build a plain-language interpretation of the user's risk allele tally. */
+/** Build a plain-language interpretation of an uncalibrated risk-direction allele tally. */
 function interpretTally(data: GWASTraitData): { headline: string; meaning: string; band: 'lower' | 'middle' | 'higher' } {
@@
   if (pct < 40) {
     band = 'lower'
-    headline = 'You carry fewer risk-associated variants than average'
+    headline = 'Lower uncalibrated risk-direction tally'
   } else if (pct > 60) {
     band = 'higher'
-    headline = 'You carry more risk-associated variants than average'
+    headline = 'Higher uncalibrated risk-direction tally'
   } else {
     band = 'middle'
-    headline = 'You carry an average number of risk-associated variants'
+    headline = 'Mid-range uncalibrated risk-direction tally'
   }
@@
-    `That places you in the ${band} portion of the distribution. ` +
+    `This is not a percentile, population average, clinical risk estimate, or calibrated PRS. ` +
@@
-            your tally. The midpoint marker on the bar above represents what an average person would carry by chance.
+            your tally. The midpoint on the bar is only 50% of possible counted allele copies, not a population average.
@@
-                {/* Average marker at 50% */}
+                {/* 50% possible-copy marker, not a population average */}
@@
-              <span>average</span>
+              <span>50% possible</span>
10. GWAS hook defaults to unclumped data despite clumped files existing

Severity: Medium
Category: error-prone conclusion
Location: frontend/src/hooks/useGWASData.ts:50; backend/app/routes/gwas.py:421-431; config/gwas/*-hits-clumped.json

Why risky:
The backend supports ?clumped=true, and the repo contains clumped files for several traits, but the frontend fetches /api/gwas/${trait} without using it. The UI caveat says LD clumping would shrink the count, but the app often could use clumped data already and simply does not. Tiny detail. Only affects the entire interpretation, no big deal.

Recommendation:
Fetch clumped data by default and show when the backend fell back to unclumped data.

Codex-ready patch:

Diff
diff --git a/frontend/src/hooks/useGWASData.ts b/frontend/src/hooks/useGWASData.ts
--- a/frontend/src/hooks/useGWASData.ts
+++ b/frontend/src/hooks/useGWASData.ts
@@
 export interface GWASTraitData {
@@
   matches: GWASMatch[]
+  clumped?: boolean
+  clumping_window_kb?: number
+  n_hits_before_clump?: number
+  n_hits_after_clump?: number
 }
@@
-    fetch(`/api/gwas/${trait}`)
+    fetch(`/api/gwas/${encodeURIComponent(trait)}?clumped=true`)
11. GWAS allele counting ignores strand/orientation and ambiguous SNPs

Severity: High
Category: error-prone conclusion
Location: backend/app/routes/gwas.py:22-37, 463; raw parsers in scripts/lib/providers/*.py

Why risky:
_count_effect_alleles() simply counts letters in genotype. It does not verify that the genotype alleles match the GWAS effect_allele/other_allele, does not detect complement strand, and does not handle palindromic A/T or C/G SNPs safely. This can flip risk/protective counts.

Recommendation:
Require effect and other allele context. Skip ambiguous or unorientable SNPs.

Codex-ready patch:

Diff
diff --git a/backend/app/routes/gwas.py b/backend/app/routes/gwas.py
--- a/backend/app/routes/gwas.py
+++ b/backend/app/routes/gwas.py
@@
-def _count_effect_alleles(genotype: str | None, effect_allele: str | None) -> int | None:
+_COMPLEMENT = str.maketrans("ACGT", "TGCA")
+_PALINDROMIC = {frozenset(("A", "T")), frozenset(("C", "G"))}
+
+
+def _count_effect_alleles(
+    genotype: str | None,
+    effect_allele: str | None,
+    other_allele: str | None = None,
+) -> int | None:
@@
     g = genotype.replace("/", "").replace("|", "").upper()
     ea = effect_allele.upper()
@@
     if len(ea) != 1:
         return None
-    return sum(1 for base in g if base == ea)
+    oa = other_allele.upper() if other_allele else None
+    if oa and len(oa) != 1:
+        return None
+
+    if oa:
+        expected = {ea, oa}
+        if set(g) <= expected:
+            return sum(1 for base in g if base == ea)
+
+        comp = g.translate(_COMPLEMENT)
+        if set(comp) <= expected:
+            if frozenset(expected) in _PALINDROMIC:
+                return None
+            return sum(1 for base in comp if base == ea)
+
+        return None
+
+    return sum(1 for base in g if base == ea)
@@
-        ea_count = _count_effect_alleles(snp.get("genotype"), hit.get("effect_allele"))
+        ea_count = _count_effect_alleles(
+            snp.get("genotype"),
+            hit.get("effect_allele"),
+            hit.get("other_allele"),
+        )
12. GWAS overlap counts the first trait’s effect allele for all traits

Severity: Medium
Category: error-prone conclusion
Location: backend/app/routes/gwas.py:110-130

Why risky:
The code says: Use the first trait's effect allele for counting (they may differ across studies). Yes. They may differ. That is exactly why reusing the first one is wrong. A pleiotropic SNP can have different effect alleles/directions across traits.

Recommendation:
Count effect allele per trait entry, not once at top level.

Codex-ready patch:

Diff
diff --git a/backend/app/routes/gwas.py b/backend/app/routes/gwas.py
--- a/backend/app/routes/gwas.py
+++ b/backend/app/routes/gwas.py
@@
     for rsid, traits_list in pleiotropic.items():
         snp = await genome_db.get_snp(rsid)
-        # Use the first trait's effect allele for counting (they may differ across studies)
-        ea = traits_list[0].get("effect_allele")
-        ea_count = _count_effect_alleles(
-            snp.get("genotype") if snp else None, ea
-        )
+        user_genotype = snp.get("genotype") if snp else None
+        traits_with_counts = []
+        for t in traits_list:
+            traits_with_counts.append({
+                **t,
+                "effect_allele_count": _count_effect_alleles(
+                    user_genotype,
+                    t.get("effect_allele"),
+                    t.get("other_allele"),
+                ),
+            })
@@
-            "user_genotype": snp.get("genotype") if snp else None,
-            "effect_allele_count": ea_count,
-            "traits": traits_list,
+            "user_genotype": user_genotype,
+            "traits": traits_with_counts,
13. Life-Map maps sparse WHO Russia data for age 38 to the age-60 bracket

Severity: High
Category: error-prone conclusion / misalignment
Location: frontend/src/lib/lifeBlend.ts:38-60, 74-92; frontend/src/lib/__tests__/lifeBlend.test.ts:35-43; config/life_tables.json

Why risky:
The current resolver picks the nearest age bracket. For Russia, the committed table only has male ages 0 and 60. A 38-year-old maps to age 60 because 60 is “nearest,” then targetAge = 60 + ex_at_60. That uses a conditional expectation after surviving to 60 for someone aged 38. The test at lifeBlend.test.ts:35-43 explicitly codifies this.

ONS defines period eₓ as average additional years for someone at exact age x under mortality assumptions. Age 60 eₓ is not interchangeable with age 38 eₓ. 
Office for National Statistics

Recommendation:
Use exact-age values, or interpolate only between nearby bracketing ages. Do not use a future bracket when the gap is huge. For sparse WHO age 0/60, mark the country unavailable for current-age anchoring.

Codex-ready patch:

Diff
diff --git a/frontend/src/lib/lifeBlend.ts b/frontend/src/lib/lifeBlend.ts
--- a/frontend/src/lib/lifeBlend.ts
+++ b/frontend/src/lib/lifeBlend.ts
@@
-/** Resolve the best age bracket for `age`, returning the bracket's age and its
- *  remaining life expectancy. Maps to the nearest bracket when the exact age is
- *  absent (e.g. WHO Russia exposes only at-birth and age-60). null if no data. */
+const MAX_INTERPOLATION_GAP_YEARS = 5
+
+/** Resolve remaining life expectancy for `age`.
+ *  Exact age is preferred. Missing ages are interpolated only between nearby
+ *  brackets. Sparse age-0/age-60 tables are not valid for current-age anchoring. */
 function resolveBracket(
@@
-  const keys = Object.keys(ages).map(Number)
+  const keys = Object.keys(ages).map(Number).sort((a, b) => a - b)
   if (keys.length === 0) return null
-  const nearest = keys.reduce(
-    (best, k) => (Math.abs(k - age) < Math.abs(best - age) ? k : best),
-    keys[0],
-  )
-  return { bracketAge: nearest, ex: ages[String(nearest)] }
+  const lower = [...keys].reverse().find((k) => k < age)
+  const upper = keys.find((k) => k > age)
+  if (lower == null || upper == null) return null
+  if (upper - lower > MAX_INTERPOLATION_GAP_YEARS) return null
+
+  const lowerEx = ages[String(lower)]
+  const upperEx = ages[String(upper)]
+  const t = (age - lower) / (upper - lower)
+  return { bracketAge: age, ex: round1(lowerEx + (upperEx - lowerEx) * t) }
 }

And update the bad test:

Diff
diff --git a/frontend/src/lib/__tests__/lifeBlend.test.ts b/frontend/src/lib/__tests__/lifeBlend.test.ts
@@
-  it('uses the matched bracket age (not current age) for sparse data like WHO Russia', () => {
-    // Only at-birth and age-60 brackets; a 38yo maps to nearest (60), target = 60 + 14 = 74
+  it('skips sparse age-0/age-60 data for current-age anchors', () => {
@@
-    expect(a).toEqual([{ country: 'RU', name: 'Russia', exAtAge: 14.0, targetAge: 74.0 }])
+    expect(a).toEqual([])
   })
14. Life-Map anchor label says “expected age”

Severity: Medium
Category: misalignment / framing
Location: frontend/src/components/lifemap/CountryAnchors.tsx:40-42

Why risky:
“Expected age” sounds like an individual prediction. The number is a period life-table anchor for a sex/country/age cell. The app already knows this, then chooses a label that makes it sound personal. Because apparently UX copy saw nuance and chose violence.

Recommendation:
Rename to “period table anchor” and explicitly say it is population-level.

Codex-ready patch:

Diff
diff --git a/frontend/src/components/lifemap/CountryAnchors.tsx b/frontend/src/components/lifemap/CountryAnchors.tsx
--- a/frontend/src/components/lifemap/CountryAnchors.tsx
+++ b/frontend/src/components/lifemap/CountryAnchors.tsx
@@
-            expected age &middot; {a.exAtAge.toFixed(1)} yrs remaining
+            period table anchor &middot; {a.exAtAge.toFixed(1)} population yrs remaining
15. Residence history accepts invalid values from localStorage and numeric inputs

Severity: Medium
Category: code / error-prone conclusion
Location: frontend/src/hooks/useResidenceHistory.ts:20-30, 51-75; ResidenceHistoryInput.tsx:47-52, 67-72

Why risky:
The UI sets min/max, but localStorage can contain negative years, absurd ages, or invalid country codes. blendMarker() then uses years as weights. Negative or huge weights can distort the life map. This is low-drama but easy to fix.

Recommendation:
Sanitize on load and mutation. Clamp age and years. Drop invalid residences.

Codex-ready patch:

Diff
diff --git a/frontend/src/hooks/useResidenceHistory.ts b/frontend/src/hooks/useResidenceHistory.ts
--- a/frontend/src/hooks/useResidenceHistory.ts
+++ b/frontend/src/hooks/useResidenceHistory.ts
@@
 const DEFAULT_STATE: ResidenceState = {
@@
 }
+
+function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
+  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
+  return Math.max(min, Math.min(max, n))
+}
+
+function sanitizeResidence(r: unknown): Residence | null {
+  if (!r || typeof r !== 'object') return null
+  const x = r as Partial<Residence>
+  if (typeof x.country !== 'string' || !x.country) return null
+  return { country: x.country, years: clampNumber(x.years, 0, 0, 110) }
+}
+
+function sanitizeState(state: ResidenceState): ResidenceState {
+  return {
+    residences: state.residences.map(sanitizeResidence).filter(Boolean) as Residence[],
+    currentCountry: state.currentCountry,
+    sex: state.sex === 'female' ? 'female' : 'male',
+    age: clampNumber(state.age, DEFAULT_STATE.age, 0, 110),
+  }
+}
@@
-      residences: Array.isArray(parsed.residences) ? parsed.residences : [],
+      residences: Array.isArray(parsed.residences)
+        ? parsed.residences.map(sanitizeResidence).filter(Boolean)
+        : [],
@@
-      age: typeof parsed.age === 'number' ? parsed.age : DEFAULT_STATE.age,
+      age: clampNumber(parsed.age, DEFAULT_STATE.age, 0, 110),
@@
-      const next = fn(prev)
+      const next = sanitizeState(fn(prev))
16. Imputation VCF export invents REF/ALT from observed genotype

Severity: Critical
Category: code / error-prone conclusion
Location: scripts/prepare_for_imputation.py:92-117, 121-165

Why risky:
VCF REF must be the reference genome allele at that position. This script sets REF to the first observed allele and ALT to the second observed allele. For homozygous calls it writes ALT=. and GT=0/0. That is not a valid way to prepare data for imputation. It can corrupt downstream imputation and everything based on it.

Recommendation:
Disable this exporter unless reference-aligned REF/ALT is available from a reference FASTA/dbSNP/normalization pipeline. Do not silently write fake VCF.

Codex-ready patch:

Diff
diff --git a/scripts/prepare_for_imputation.py b/scripts/prepare_for_imputation.py
--- a/scripts/prepare_for_imputation.py
+++ b/scripts/prepare_for_imputation.py
@@
 def genotype_to_vcf_fields(genotype):
@@
-    if len(genotype) == 1:
-        # Haploid call (X chromosome in males)
-        ref = genotype
-        return ref, ".", "0"
-
-    if len(genotype) == 2:
-        a1, a2 = genotype[0], genotype[1]
-
-        if a1 == a2:
-            # Homozygous — still include, imputation servers handle these
-            # REF = the observed allele, ALT = .
-            return a1, ".", "0/0"
-        else:
-            # Heterozygous
-            # By convention, use first allele as REF
-            return a1, a2, "0/1"
-
-    return None
+    raise RuntimeError(
+        "Unsafe VCF export: REF/ALT cannot be inferred from observed genotype. "
+        "Use a reference-normalized conversion pipeline with GRCh37/GRCh38 REF alleles."
+    )

A better longer-term route is: export CHR/POS/rsID/genotype, join against a reference panel or dbSNP VCF, normalize with bcftools norm, then write REF/ALT/GT.

17. GenomeDB.get_snp() ignores profile ID

Severity: High
Category: code / privacy / correctness
Location: backend/app/db/genome.py:183-209; tests expect multi-profile schema in tests/test_db_migrations.py

Why risky:
The schema/tests imply multi-profile support, but get_snp(rsid) selects only by rsID. In a multi-profile database, the API can return the wrong person’s genotype. That is both correctness failure and privacy hazard.

Recommendation:
Require a profile ID, default to default only for single-user local mode, and thread it through GWAS/PGx/risk routes.

Codex-ready patch:

Diff
diff --git a/backend/app/db/genome.py b/backend/app/db/genome.py
--- a/backend/app/db/genome.py
+++ b/backend/app/db/genome.py
@@
-    async def get_snp(self, rsid: str) -> dict | None:
+    async def get_snp(self, rsid: str, profile_id: str = "default") -> dict | None:
@@
-            WHERE s.rsid = ?
+            WHERE s.rsid = ? AND COALESCE(s.profile_id, 'default') = ?
         """
-        async with self._conn.execute(sql, [rsid]) as cursor:
+        async with self._conn.execute(sql, [rsid, profile_id]) as cursor:

Then update callers progressively:

Diff
- snp = await genome_db.get_snp(rsid)
+ snp = await genome_db.get_snp(rsid, profile_id="default")
18. Database migrations are missing from the archive, and migration init fails silently

Severity: High
Category: code / reliability
Location: scripts/lib/config.py:51; scripts/lib/db.py:39-42; backend/app/main.py:53-57; missing scripts/data/migrations/*.sql

Why risky:
apply_migrations() returns [] when the migration directory is absent. That means app startup can proceed with no schema. I ran:

Bash
python3 -m pytest tests/test_db_migrations.py -q

Result: 8 failed, 2 passed. Failures include missing schema_migrations, profiles, snps, and pipeline_runs.

Recommendation:
Do not fail open. Raise if migrations are missing. Restore migrations to the snapshot/repo.

Codex-ready patch:

Diff
diff --git a/scripts/lib/db.py b/scripts/lib/db.py
--- a/scripts/lib/db.py
+++ b/scripts/lib/db.py
@@
 def apply_migrations(conn: sqlite3.Connection, migrations_dir: Path = MIGRATIONS_DIR) -> list[str]:
     """Apply all pending SQL migrations in order. Returns list of applied versions."""
     if not migrations_dir.is_dir():
-        return []
+        raise RuntimeError(f"Migration directory not found: {migrations_dir}")
+    if not any(migrations_dir.glob("*.sql")):
+        raise RuntimeError(f"No SQL migrations found in: {migrations_dir}")
19. Biomarker analyzer uses hardcoded “clinical decision thresholds” without unit validation

Severity: High
Category: safety / error-prone conclusion
Location: scripts/analytics/biomarker_analyzer.py:20-52, 145-156, 204-217

Why risky:
The script says thresholds are “derived from genetic profile,” then compares raw values without unit normalization. CRP, vitamin D, ferritin, ALT/AST, GGT, and homocysteine thresholds depend on units, lab reference ranges, clinical context, age/sex, symptoms, and repeat testing. The script turns a markdown value into “SSRI augmentation consideration” or “hepatology referral” with no guardrails. Tiny clinical landmine, nicely formatted.

Recommendation:
Add required units, source, and action framing. If units do not match, do not trigger. Use “discuss” wording.

Codex-ready patch:

Diff
diff --git a/scripts/analytics/biomarker_analyzer.py b/scripts/analytics/biomarker_analyzer.py
--- a/scripts/analytics/biomarker_analyzer.py
+++ b/scripts/analytics/biomarker_analyzer.py
@@
-# Clinical decision thresholds derived from genetic profile.
-# Format: marker_name_lower -> list of (operator, threshold, action)
+# Screening prompts. Not clinical decisions.
+# Format: marker_name_lower -> list of {op, threshold, unit, action}
 THRESHOLDS = {
     "crp": [
-        (">", 3.0, "SSRI augmentation consideration (IL1B)"),
-        (">", 1.0, "Anti-inflammatory intervention escalation (IL1B)"),
+        {"op": ">", "threshold": 3.0, "unit": "mg/L", "action": "Discuss elevated CRP with clinician; do not infer medication changes from genetics alone."},
+        {"op": ">", "threshold": 1.0, "unit": "mg/L", "action": "Discuss inflammation context and repeat testing if clinically relevant."},
@@
-def check_thresholds(name: str, value: float) -> list[str]:
+def check_thresholds(name: str, value: float, unit: str = "") -> list[str]:
@@
-            for op, threshold, action in rules:
+            for rule in rules:
+                op, threshold, expected_unit, action = rule["op"], rule["threshold"], rule["unit"], rule["action"]
+                if unit and unit.strip().lower() != expected_unit.lower():
+                    alerts.append(f"  ?? {name}: unit '{unit}' does not match expected '{expected_unit}' — threshold not applied")
+                    continue
                 if op == ">" and value > threshold:
@@
-            file_alerts.extend(check_thresholds(m["name"], m["value"]))
+            file_alerts.extend(check_thresholds(m["name"], m["value"], m.get("unit", "")))
20. Evidence tiers contain unsupported numeric “confidence” percentages

Severity: Medium
Category: overgeneralization / framing
Location: config/evidence_tiers.yaml:4-32

Why risky:
E1 is “85-95%,” E2 is “60-80%,” etc. These percentages look statistical, but they are not tied to a validation model, confidence interval, PPV/NPV, odds ratio distribution, ancestry, phenotype, or endpoint. They will be copied into UI/reporting eventually because numbers are shiny and humans keep touching them.

Recommendation:
Make confidence qualitative unless a specific method computes it.

Codex-ready patch:

Diff
diff --git a/config/evidence_tiers.yaml b/config/evidence_tiers.yaml
--- a/config/evidence_tiers.yaml
+++ b/config/evidence_tiers.yaml
@@
-    confidence: "85-95%"
+    confidence: "high"
@@
-    confidence: "60-80%"
+    confidence: "moderate-high"
@@
-    confidence: "30-50%"
+    confidence: "moderate"
@@
-    confidence: "15-25%"
+    confidence: "low"
@@
-    confidence: "5-15%"
+    confidence: "speculative"
Prioritized summary table
Priority	Finding	Severity	Effort	First fix
1	PGx uses generic personal_status and defaults missing to normal	Critical	Medium	Add unknown; require PGx phenotype/diplotype fields
2	Imputation VCF invents REF/ALT	Critical	Small	Disable unsafe exporter until reference-normalized
3	PGx footer falsely says CPIC for all enzymes	High	Small	Conditional guideline footer
4	PGx config gives dose-like substance/drug advice	High	Medium	Add evidence_scope; soften config
5	Risk Landscape config missing rank / populationBarPct	High	Small	Derive safe defaults
6	Risk Landscape personal bar fabricates quantitative risk	High	Small	Replace with categorical marker
7	“Optimal / no risk” false reassurance	High	Small	Rename to “no configured flag”
8	Hardcoded demographic presented as “your demographic”	High	Small	Rename to reference profile
9	Screening timeline is unconditional	High	Medium	Add applies_when gating
10	GWAS “average/distribution” interpretation invalid	High	Small	Remove average/percentile language
11	GWAS allele orientation not validated	High	Medium	Use effect + other allele; skip ambiguous
12	Life-Map sparse WHO bracket maps age 38 to 60	High	Small	Exact/nearby interpolation only
13	get_snp() ignores profile ID	High	Medium	Add profile_id parameter and route threading
14	Missing migrations fail silently	High	Small	Raise on missing migrations; restore SQL files
15	Biomarker thresholds lack unit/context validation	High	Medium	Require units and “discuss” framing
16	GWAS frontend does not use clumped data by default	Medium	Small	Fetch ?clumped=true
17	GWAS overlap uses first trait allele for all traits	Medium	Small	Count per trait
18	Life-Map “expected age” copy sounds personal	Medium	Small	Rename to “period table anchor”
19	Residence history accepts invalid weights	Medium	Small	Sanitize localStorage and input
20	Evidence tiers use fake-looking numeric confidence	Medium	Small	Replace with qualitative labels

The biggest theme: keep the tool, but stop letting categorical annotations masquerade as calibrated personal medicine. The repo is close to being a useful personal research dashboard. It is not close to being a clinical decision engine, and several UI surfaces currently flirt with that line like it owes them money.