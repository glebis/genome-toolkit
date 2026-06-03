I read VALIDATION_BRIEF.md first. The short verdict: the vault is genuinely useful, but it has a dangerous habit of turning “plausible, provisional, consumer-SNP-derived” into “CPIC Level A, print it on a wallet card, frighten the anesthesiologist.” Humanity survives another YAML file, barely.

I focused on the requested high-stakes PGx/report/code path, not every lifestyle/candidate-gene idea in all 788 notes. The main problems are evidence-tier inflation, CYP2D6 overcalling, imputation handling, and report-generation code that can make wrong calls look tidy.

Calls that largely check out

These are not findings against the vault; they are the parts I would keep, with small wording fixes.

CYP2C19 normal metabolizer, common-allele screen: brain/Genes/CYP2C19.md:54-59 supports *1/*1 from absence of *2, *3, *17, and *4 markers. This is reasonable for sertraline/clopidogrel/PPI context. The caveat at brain/Genes/CYP2C19.md:112-114 is good. Replace “definitive” at line 110 with “common-allele screen consistent with.” CPIC 2023 supports CYP2C19 use for several serotonin reuptake inhibitors, while not supporting SLC6A4/HTR2A prescribing use. 
PubMed
+1

**CYP2C9 1/2, AS=1.5, intermediate metabolizer: brain/Genes/CYP2C9.md:52-56 is correct. The correction from a prior *2/*3 poor-metabolizer call is explicitly noted and scientifically sound. CPIC NSAID guidance is CYP2C9-based, not CYP2C8-based. 
PMC
+1

TPMT normal metabolizer common-variant call: brain/Genes/TPMT.md:48-55 is reasonable and well-caveated. The NUDT15 caveat at brain/Genes/TPMT.md:66-68 and 93-97 is exactly the kind of humility this vault needs more of. The FDA table also treats TPMT/NUDT15 together for thiopurines because apparently drugs like to punish monogenic oversimplification. 
U.S. Food and Drug Administration

SLCO1B1 statin phenotype from rs4149056 T/T: the clinical conclusion “normal SLCO1B1 function for statin myopathy risk” is correct in the reports. CPIC/NCBI summaries treat normal-function SLCO1B1 haplotypes as not increasing simvastatin adverse-effect risk above baseline. 
NCBI
+1

VKORC1 directionality: brain/Genes/VKORC1.md:49-62 is directionally correct: rs9923231 C/C corresponds to normal/high VKORC1 expression and lower warfarin sensitivity than T/T. The reports are right to say warfarin should use a PGx algorithm, not a genotype-only rule. CPIC warfarin guidance uses CYP2C9/VKORC1/CYP4F2 plus clinical factors. 
DIVA Portal
+1

Several consumer-test caveats are good: brain/Reports/Prescriber Summary.md:15, 23-25, 42-50, 162; brain/Reports/SSRI Response Profile.md:181; and brain/Reports/Acute Care Medication Card.md:82 correctly warn that this is not clinical-grade PGx and that CYP2D6 needs confirmation.

Findings
1. Imputed VCF importer can silently import unqualified or misparsed genotypes

Severity: Critical
Category: code / imputation
Location: code/scripts/post_imputation_import.py, sections process_vcf() and import_to_db(), especially 151-168, 173-181, 233-239, 267-272.

Why it is wrong or risky:
The importer checks imputation R² only if an R²-like value exists. If extract_r2() returns None, it increments r2_not_available at 166-168 but still imports the variant. That defeats the stated --min-r2 safety filter. Then 173-174 uses the first FORMAT field as genotype if GT is absent, which can misparse dosage/probability-only VCFs as hard genotypes. Finally, 233-239 writes imputed variants without profile_id and marks positional IDs as is_rsid=1; 267-272 deduplicates globally by rsID, not profile/import. A single elegant way to corrupt a genome database, because apparently one bug was too modest.

Recommendation:
Do not import variants with missing quality unless an explicit --allow-missing-r2 flag is set and the report labels them unusable for clinical calls. Require GT, or parse DS/GP with explicit posterior thresholds. Add profile_id, import_id, true is_rsid, source panel, genome build, R²/DR2/AR2, and hard-call method to every imported row. Re-import all imputed calls from the fixed REF/ALT exporter and treat prior imputed report claims as needing re-derivation.

2. CYP2D6 *4/*10 is not consistently supported, and the activity score is likely wrong if true

Severity: High
Category: accuracy / inconsistency
Location: brain/Genes/CYP2D6.md:8-12, 45-51, 97-103; brain/Reports/Prescriber Summary.md:23-24, 35, 42-48; brain/Reports/SSRI Response Profile.md:34; brain/Reports/CPIC Pharmacogenomics Coverage.md:33, 46; brain/Reports/Integrative Health Assessment.md:61.

Why it is wrong or risky:
The CYP2D6 gene note documents only rs1065852 as a *10 carrier and says “likely *1/*10 or similar” at brain/Genes/CYP2D6.md:49. The reports then upgrade this to “likely *4/10” using rs3892097, but rs3892097 is not in the CYP2D6 note’s personal_variants block. That is a report-note contradiction. Also, CPIC/ClinPGx notes that CYP2D610 was downgraded from activity value 0.5 to 0.25; if *4/*10 were confirmed, *4 is no-function and *10 is 0.25, so the AS would be about 0.25, not ~0.5-1.0. 
ClinPGx
+1

CYP2D6 star calls are especially fragile from consumer arrays because deletions, duplications, hybrids, and copy number can flip phenotype. The reports know this, but then still use the call downstream as if it has a lab coat and a pension plan. CPIC opioid materials also emphasize CYP2D6 allele function/CNV complexity. 
files.cpicpgx.org

Recommendation:
Replace all report text with: “CYP2D6 reduced-function signal; possible *10 carrier and possible *4 carrier from consumer SNPs; diplotype and CNV unconfirmed.” Do not print *4/*10 as the main status until a clinical CYP2D6 assay with CNV/hybrid detection confirms it. If *4/*10 is confirmed, update AS to current CPIC mapping.

3. CYP2D6 drug recommendations over-apply CPIC and sometimes use the wrong phenotype

Severity: High
Category: accuracy / evidence-misattribution
Location: brain/Reports/Prescriber Summary.md:44-48, 111-118; brain/Reports/CPIC Pharmacogenomics Coverage.md:115-117, 137-148; brain/Reports/Wallet Card.md:25; brain/Genes/CYP2D6.md:69-82.

Why it is wrong or risky:
For codeine/tramadol, CPIC recommends avoidance for CYP2D6 poor and ultrarapid metabolizers; for intermediate metabolizers, the practical recommendation is standard starting dose with monitoring and alternative if analgesia is inadequate. The vault mostly gets codeine right, but it turns tramadol into a genotype-level CPIC “contraindication” because sertraline is present. That is a drug-drug safety warning, not a CPIC CYP2D6 genotype rule. 
PMC
+1

For ondansetron, CPIC recommends an alternative for CYP2D6 ultrarapid metabolizers; sources note no observed vomiting difference for CYP2D6 intermediate or poor metabolizers versus normal metabolizers. So CPIC Pharmacogenomics Coverage.md:115 saying “consider increased dose or alternative” for CYP2D6 IM is unsupported. 
ClinPGx
+1

For aripiprazole, the FDA label/NCBI summary reduces dose for CYP2D6 poor metabolizers, not intermediate metabolizers. Prescriber Summary.md:48, 117 and CPIC Pharmacogenomics Coverage.md:146 claim 75% starting dose for likely IM “per CPIC,” which is not supported. 
NCBI

Recommendation:
Split CYP2D6 genotype actions from drug-drug interaction actions. Use:

Codeine: trial standard dose, monitor; alternative if inadequate, provisional until CYP2D6 confirmed.

Tramadol: avoid with sertraline due serotonergic interaction; do not label as CPIC Level A genotype contraindication.

Hydrocodone: monitor for reduced response; do not “avoid” by genotype alone.

Ondansetron: standard dosing for IM.

Aripiprazole: no genotype-based dose reduction for IM; PM-specific label/DPWG guidance only.

4. Tramadol + sertraline “ROR 41.95” is real, but used too strongly

Severity: High
Category: evidence-misattribution / overclaim
Location: brain/Reports/Prescriber Summary.md:46, 56, 111; brain/Reports/Pharmacogenomics Card.md:59; brain/Reports/CPIC Pharmacogenomics Coverage.md:122; brain/Reports/Wallet Card.md:23; brain/Genes/CYP2D6.md:59, 77.

Why it is wrong or risky:
The ROR 41.95 appears to be a real 2025 FAERS pharmacovigilance signal for SSRI-opioid combinations, especially high-risk opioids such as tramadol and fentanyl. It is not a patient-level incidence, not a randomized risk estimate, not specifically “sertraline + tramadol in CYP2D6 IM,” and not a CPIC Level A recommendation. FAERS RORs are signal-detection tools, not causal effect sizes. 
PMC

Recommendation:
Keep the clinical warning, because avoiding tramadol with sertraline is prudent. Reword: “FAERS signal reported for SSRI + high-risk opioid combinations, including tramadol/fentanyl; avoid or use only with explicit prescriber review.” Remove the naked ROR from wallet/emergency cards unless a footnote says what it actually means.

5. Evidence tiers are systematically inflated beyond the vault’s own definitions

Severity: High
Category: evidence-misattribution / inconsistency
Location: code/config/evidence_tiers.yaml:4-32; brain/Reports/Prescriber Summary.md:111-118; brain/Reports/CPIC Pharmacogenomics Coverage.md:28-63, 101, 137-148, 154-156; brain/Reports/Pharmacogenomics Card.md:43-52, 77, 89.

Why it is wrong or risky:
The config defines E1 as “CPIC/DPWG guideline, multiple studies, used in clinical PGx panels” at code/config/evidence_tiers.yaml:5-8. But the reports assign CPIC Level A/E1-style authority to ABCB1 antidepressant selection, SLC6A4/HTR2A-like psychiatric markers, CYP1A2 caffeine, CYP2C8 NSAID compounding, buspirone CYP3A4*22 pre-testing, and several antipsychotic actions. CPIC 2023 explicitly says SLC6A4 and HTR2A do not support clinical use in antidepressant prescribing, and CPIC NSAID guidance says CYP2C8 is not recommended for NSAID dosing. 
PubMed
+2
ClinPGx
+2

Recommendation:
Create a machine-readable evidence registry keyed by gene_drug, guideline_body, recommendation, phenotype, and source_url/pubmed. Reports should be generated only from that registry. Anything without a guideline-backed action should render as “context only,” not “Level A.” Boring? Yes. Safer? Tragically, also yes.

6. CBD/cannabis “triples sertraline exposure” is an overclaim

Severity: High
Category: overclaim / accuracy
Location: brain/Reports/Integrative Health Assessment.md:59, 78, 101, 131, 181; brain/Reports/CPIC Pharmacogenomics Coverage.md:101, 172; brain/Reports/Pharmacogenomics Card.md:89; better wording appears in brain/Reports/Prescriber Summary.md:102 and brain/Reports/SSRI Response Profile.md:39.

Why it is wrong or risky:
CBD inhibition of CYP2C19 can be clinically relevant, and a published case report describes CBD increasing sertraline exposure with hyponatremia/cognitive dysfunction. CPIC also recognizes CYP2C19 effects on sertraline exposure in non-normal metabolizers. 
PMC
+2
ClinPGx
+2

But the vault jumps from “CBD may inhibit CYP2C19” to “daily cannabis is likely tripling sertraline levels” and “50 mg behaves like 100-200 mg.” That depends on CBD dose, formulation, THC/CBD ratio, route, frequency, adherence, liver function, other inhibitors, and actual serum levels. Smoked cannabis is not a standardized CBD capsule. Tiny detail, apparently.

Recommendation:
Use: “CBD-containing cannabis may increase sertraline exposure via CYP2C19 inhibition; magnitude is unknown without serum level/TDM and product composition.” Suggest prescriber disclosure, adverse-effect monitoring, and sodium check if symptoms suggest SIADH/hyponatremia. Do not claim tripling or dose equivalence.

7. DPYD “cleared for standard-dose fluoropyrimidines” is too strong

Severity: Critical
Category: overclaim / imputation / accuracy
Location: brain/Genes/DPYD.md:47-54, 60-62, 83; brain/Reports/Pharmacogenomics Card.md:35; brain/Reports/CPIC Pharmacogenomics Coverage.md:61, 128.

Why it is wrong or risky:
The gene note correctly shows three normal DPYD markers and explicitly says rs75017182/HapB3 is missing at brain/Genes/DPYD.md:50, 54. But then it says “cleared for standard-dose fluoropyrimidines” at 52, and reports compress the call into “DPYD normal / standard dosing.” That is dangerous compression for a high-stakes chemotherapy toxicity gene. CPIC DPYD guidance is specifically intended for interpreting clinical DPYD genotype tests, and intermediate metabolizers require major dose reduction; normal-metabolizer standard dosing assumes adequate clinical testing, not an incomplete consumer screen. 
ClinPGx
+1

Recommendation:
Replace with: “No *2A, *13, or D949V detected; HapB3 not tested. This consumer result does not clear fluoropyrimidine therapy. If 5-FU/capecitabine/tegafur is ever considered, order clinical DPYD testing including HapB3 and/or DPD phenotype/uracil testing.” This one deserves less poetry and more caution.

8. UGT1A1 mixes *80 proxy and *28, and misattributes irinotecan guidance to CPIC

Severity: High
Category: accuracy / evidence-misattribution / inconsistency
Location: brain/Genes/UGT1A1.md:43-45, 51-55, 67-72, 102-105; brain/Reports/Pharmacogenomics Card.md:37; brain/Reports/CPIC Pharmacogenomics Coverage.md:63, 131, 197.

Why it is wrong or risky:
The gene note says rs887829 C/T is a proxy for *1/*28, while the reports call it likely *1/*80. Those are related but not interchangeable in a clinical report. rs887829 is a proxy/LD marker, not direct measurement of the TA repeat. The note also says “CPIC Level A for irinotecan,” but CPIC’s established UGT1A1 guideline is for atazanavir; irinotecan dosing recommendations are handled by FDA/DPWG/other oncology guidance, and CPIC had treated UGT1A1-irinotecan as a future/considered guideline topic. 
PMC
+2
ClinPGx
+2

Recommendation:
Use one normalized statement: “UGT1A1 rs887829 C/T, likely tags one reduced-function promoter haplotype in Europeans; not a direct TA-repeat call. If irinotecan or unexplained bilirubin issues arise, confirm UGT1A1 TA repeat clinically.” Cite FDA/DPWG for irinotecan, not CPIC.

9. NSAID guidance expands CYP2C9/CYP2C8 beyond CPIC

Severity: High
Category: evidence-misattribution / overclaim
Location: brain/Genes/CYP2C9.md:56, 61-63; brain/Genes/CYP2C8.md:51-60, 69-71; brain/Reports/Prescriber Summary.md:59, 112; brain/Reports/CPIC Pharmacogenomics Coverage.md:109-110, 154-157; brain/Reports/Wallet Card.md:24.

Why it is wrong or risky:
The CYP2C9 *1/*2 intermediate call is correct. The problem is that reports turn a moderate CYP2C9 issue plus a poorly documented CYP2C8 *3 claim into broad “oral NSAIDs: CPIC Level A elevated GI bleeding risk.” CPIC says NSAID recommendations are based on CYP2C9, while CYP2C8 evidence is insufficient for NSAID dosing recommendations. CPIC/Genomics Education also notes no CYP2C9-based recommendations for several NSAIDs, including naproxen and diclofenac. 
PMC
+2
ClinPGx
+2

Recommendation:
Keep: “CYP2C9 *1/*2: use lowest effective dose, shortest duration; gastroprotection depending on clinical GI risk.” Downgrade CYP2C8 compounding to E2/context. Do not label naproxen/diclofenac or topical NSAIDs as CPIC Level A genotype actions. Reword topical NSAIDs from “SAFE; CYP irrelevant” to “lower systemic exposure; preferred when clinically appropriate.”

10. CYP2C8 *3 is not documented with rsID-level evidence

Severity: Medium
Category: accuracy / consistency
Location: brain/Genes/CYP2C8.md:9-12, 43-47, 89-91; brain/Reports/Prescriber Summary.md:34; brain/Reports/Pharmacogenomics Card.md:22.

Why it is wrong or risky:
The CYP2C8 gene note lists rsid: CYP2C8 and genotype “*3 carrier” instead of the actual defining variant calls. That prevents validation of strand, zygosity, direct-vs-imputed status, and build. The reports then mark it “High (genotyped)” and use it to amplify NSAID warnings. This is exactly how a report becomes persuasive without being auditable, the bureaucratic cousin of a magic trick.

Recommendation:
Add the specific CYP2C83-defining rsIDs, genotype, source, strand/build, and direct/imputed status. Until then, render as “reported CYP2C83 carrier, source unresolved” and remove it from high-confidence clinical summaries.

11. NAT2 slow acetylator is likely correct, but some action language is too broad

Severity: Medium
Category: overclaim / evidence-misattribution
Location: brain/Genes/NAT2.md:71-83, 87-104, 159-164; brain/Reports/Wallet Card.md:31; brain/Reports/Acute Care Medication Card.md:42.

Why it is wrong or risky:
The NAT2 slow phenotype is well supported internally: rs1801280 C/T, rs1799930 A/G, and rs1495741 A/A all support slow acetylation, and the note says no imputation is needed. That part is solid. But the note claims “CPIC and DPWG have published guidelines for isoniazid dosing” at brain/Genes/NAT2.md:161, while the current CPIC guideline I found is NAT2-hydralazine. Isoniazid NAT2 evidence exists, including genotype-guided dosing studies and toxicity associations, but it should not be bundled as if every NAT2 substrate has the same CPIC-grade action. 
Nature
+3
files.cpicpgx.org
+3
ClinPGx
+3

Recommendation:
Keep “NAT2 slow acetylator” as high confidence. For hydralazine, cite current CPIC. For isoniazid/sulfasalazine/procainamide/sulfonamides, specify the evidence source and downgrade to drug-specific guidance rather than blanket E1. Avoid wallet-card commands like “reduce dose” unless tied to a specific guideline/drug.

12. SLCO1B1 clinical phenotype is right, but *1B annotation is confusing or wrong

Severity: Medium
Category: accuracy / inconsistency
Location: brain/Genes/SLCO1B1.md:13-15, 48-52, 58-60, 94-98; brain/Reports/Pharmacogenomics Card.md:33; brain/Reports/CPIC Pharmacogenomics Coverage.md:59, 114.

Why it is wrong or risky:
The report-level conclusion from rs4149056 T/T is correct: normal statin myopathy PGx risk. But the gene note says rs2306283 A/A is a “decreased function variant (*1B haplotype)” and then calls likely *1B/*1B at brain/Genes/SLCO1B1.md:52. The reports call *1a/*1a. That is an internal haplotype contradiction. CPIC-oriented statin interpretation mainly hinges on rs4149056 for clinically important decreased function; normal-function haplotypes do not require avoiding statins. 
NCBI
+1

Recommendation:
Keep the report phenotype as “SLCO1B1 normal function based on rs4149056 T/T.” Remove “decreased function” from rs2306283 A/A unless revalidated against PharmVar/CPIC haplotype definitions. Do not mention *1B unless the haplotype is phased and correctly assigned.

13. Warfarin genotype direction is correct, but dose ranges are too specific

Severity: Medium
Category: overclaim
Location: brain/Genes/VKORC1.md:54, 60-62; brain/Genes/CYP2C9.md:67-68; brain/Reports/CPIC Pharmacogenomics Coverage.md:107; brain/Reports/Wallet Card.md:30.

Why it is wrong or risky:
The vault correctly says warfarin should use CPIC/IWPC/Gage-style algorithms. Then it also says “near-standard dosing likely (~4-5 mg/day)” and VKORC1 note says “typically 5-7 mg/day.” Warfarin has a narrow therapeutic index, and CPIC uses genetic plus nongenetic factors such as age, body size, ancestry, interacting drugs, indication, and INR target. 
DIVA Portal
+1

Recommendation:
Remove standalone mg/day estimates from reports and wallet cards. Use: “Requires genotype-guided warfarin algorithm using CYP2C9, VKORC1, CYP4F2, age, weight, interacting drugs, ancestry, and INR target.”

14. Pharmacodynamic psychiatric markers are repeatedly upgraded into prescribing rules

Severity: Medium
Category: overclaim / evidence-misattribution
Location: brain/Reports/Pharmacogenomics Card.md:43-52, 77; brain/Reports/SSRI Response Profile.md:47-55, 88, 130-140; brain/Genes/ABCB1.md:52-65, 105-109; brain/Genes/BDNF.md:76-77; brain/Genes/HTR1A.md:51-65; brain/Genes/IL1B.md:55-58, 96.

Why it is wrong or risky:
The vault often contains the correct caveat somewhere, then forgets it later like a committee with amnesia. Examples:

ABCB1 note says no guideline body recommends ABCB1 for antidepressant selection, but reports use ABCB1 to “avoid P-gp antidepressants” and inflate nortriptyline action.

BDNF Val/Val is called a ketamine responder at brain/Genes/BDNF.md:76-77 and Pharmacogenomics Card.md:44, while SSRI Response Profile.md:137-140 correctly says it does not predict ketamine response.

HTR1A note downgrades SSRI response evidence at brain/Genes/HTR1A.md:51-59, but line 65 still says C/C predicts better SSRI response.

FKBP5 taper “6–8 weeks per step required” is not a validated genotype-driven taper protocol.

IL1B/CRP is useful context, but not a validated genotype-specific antidepressant switching rule.

CPIC 2023 supports pharmacokinetic genes for SRI prescribing and explicitly says SLC6A4/HTR2A do not support clinical prescribing use; by analogy, these other candidate markers should not be presented as dosing rules without guideline support. 
PubMed
+1

Recommendation:
Move ABCB1, BDNF, HTR1A, IL1B, FKBP5, CRHR1, DAT1 into a “research/context” section. Use E3-E5 labels consistently. Replace “avoid,” “required,” “predicts,” and “best genetic fit” with “may inform monitoring/discussion; not prescribing-grade.”

15. Strand/orientation is not auditably enforced in the outputs

Severity: Medium
Category: strand / code / consistency
Location: brain/Genes/CYP2D6.md:47; brain/Genes/ABCB1.md:42, 48-50; brain/Genes/BDNF.md:45, 51; brain/Genes/HTR1A.md:45; brain/Genes/PNPLA3.md:9-10, 40; code/scripts/prepare_for_imputation.py:232-235; code/backend/app/routes/gwas.py:26-75; code/backend/app/routes/gwas_analytics.py:21-29; code/scripts/analytics/prs_calculator.py:66-78.

Why it is wrong or risky:
Many strand notes are probably right for non-palindromic SNPs, but the outputs are not auditable because they do not include a normalized table with genome build, REF/ALT, plus-strand genotype, literature/effect allele, source, and imputation quality. PNPLA3 is a visible example: frontmatter says C;C (= G;G on + strand) at brain/Genes/PNPLA3.md:9-10, while the table says rs738409 G;G at line 40. That may be a plus-vs-source-strand artifact, but the report reader cannot verify it.

The code has one good implementation: code/backend/app/routes/gwas.py:26-75 validates complements and refuses palindromic ambiguity. But gwas_analytics.py and prs_calculator.py still do naive allele counting.

Recommendation:
Generate a canonical variant_calls.tsv for every report: rsid, build, chrom, pos, REF, ALT, source_genotype, plus_genotype, effect_allele, other_allele, strand_status, palindromic, direct/imputed, R2, call_confidence. For palindromic A/T and C/G SNPs, require direct same-strand confirmation or exclude from effect-allele counting.

16. PRS/GWAS analytics can still count the wrong allele

Severity: High
Category: code / strand
Location: code/backend/app/routes/gwas_analytics.py:21-29, 94, 198; code/scripts/analytics/prs_calculator.py:66-78, 117-145, 161-169, 204-215, 245-250.

Why it is wrong or risky:
gwas_analytics.py and prs_calculator.py count effect alleles by string matching only. They do not validate the other allele, complement strand, palindromic ambiguity, build, or allele frequency. The PRS script then estimates percentiles using p=0.5 assumptions and assigns hard labels like HIGH/LOW. It does include caveats at 245-250, which is good, but the generated numbers can still look more calibrated than they are. Very sleek, very wrong, very “dashboard happened.”

Recommendation:
Use the safer _count_effect_alleles() implementation from code/backend/app/routes/gwas.py:26-75 everywhere. Require effect_allele, other_allele, genome build, ancestry-specific effect allele frequency, and imputation quality. Disable PRS percentile labels unless calibrated to an external reference panel.

17. Cannabis cessation PK model hard-codes an unsupported clinical magnitude

Severity: High
Category: code / overclaim
Location: code/scripts/analytics/cessation_pk_model.py:9-14, 48-54; report echoes in brain/Reports/Integrative Health Assessment.md:101, 181.

Why it is wrong or risky:
The model states CBD phenoconverts CYP2C19 normal to poor and sets CYP2C19_INHIBITED = 0.35. The docstring says it is illustrative and not clinical-grade at line 14, which is good. But reports later convert that model into claims like “sertraline exposure likely equivalent to 100-200 mg” and “daily cannabis is likely tripling your sertraline levels.” That is a generator-to-report failure: a toy model escaped containment and started practicing medicine without a license. 
PMC

Recommendation:
Keep the model as sensitivity analysis only. Do not let it write clinical report language. Require CBD dose/formulation, timing, route, sertraline adverse effects, sodium, and ideally drug levels before making magnitude claims.

18. Multi-profile/sample mixing remains possible in code paths

Severity: High
Category: code
Location: code/scripts/prepare_for_imputation.py:50-62; code/scripts/post_imputation_import.py:233-239, 267-272; code/backend/app/db/genome.py:199-206; code/backend/app/routes/gwas_analytics.py:81, 193; code/scripts/analytics/prs_calculator.py:117-120.

Why it is wrong or risky:
prepare_for_imputation.py accepts profile_id but does not use it in SQL. post_imputation_import.py imports without profile_id. genome.py explicitly says at 204-206 that list/query/count/stats remain profile-blind. Analytics routes hard-code profile_id="default". In a personal-health app, mixing samples is not a small bug; it is a tiny lab-switching scandal with better syntax.

Recommendation:
Thread profile_id through every query/import/export/report. Enforce database uniqueness by (profile_id, rsid, source_priority) and include sample_id, source_file_hash, and generated_from_import_id in every report header.

19. CPIC coverage report is stale and contradicts the vault

Severity: Medium
Category: inconsistency
Location: brain/Reports/CPIC Pharmacogenomics Coverage.md:50-63, 188-203, 212-219.

Why it is wrong or risky:
The report says VKORC1, SLCO1B1, DPYD, TPMT, CYP4F2, and UGT1A1 are “available in 23andMe data but NOT in vault” and tells the user to create those notes. But the notes exist. The same report also documents those genes in its table. That is stale report generation, not science.

Recommendation:
Regenerate CPIC coverage from the actual current vault index. Add a report timestamp plus “generated from commit/hash/database import X.” Fail generation if a report claims a missing note that exists.

20. Integrative Health Assessment is stale and internally inconsistent

Severity: Medium
Category: inconsistency / overclaim
Location: brain/Reports/Integrative Health Assessment.md:17-23, 59-62, 70-78, 101, 119, 181, 211.

Why it is wrong or risky:
This report lists the patient as “~38” at 17, while other documents reflect later age/status. It says daily cannabis is active at 22, while Prescriber Summary.md:101 refers to no current smoke exposure/cannabis cessation. It says CYP2D6 is likely *1/*10 at 61, while other reports call likely *4/*10. It has a good caveat at 211, but earlier says “Do not taper sertraline” and “daily cannabis is likely tripling sertraline levels.” That is not a caveat; that is a caveat stapled to a megaphone.

Recommendation:
Mark this report as stale or research-only until regenerated. Split “current self-reported exposures” from genotype. Never allow old lifestyle assumptions to populate prescriber-facing PGx outputs without a freshness date.

21. Buspirone and CYP3A4*22 language is too restrictive

Severity: Medium
Category: overclaim / evidence-misattribution
Location: brain/Reports/SSRI Response Profile.md:36, 130-132; brain/Reports/CPIC Pharmacogenomics Coverage.md:145, 201-202.

Why it is wrong or risky:
The reports say not to start buspirone without CYP3A422 confirmation or to use TDM. CYP3A422 absence/presence can matter for some CYP3A substrates, but buspirone is not a CPIC Level B-style genotype-required drug in the way the report implies. TDM for buspirone is also not normal clinical practice.

Recommendation:
Change to: “CYP3A4*22 not genotyped; buspirone exposure can be affected by CYP3A inhibitors such as grapefruit/azole antifungals/macrolides. Start per clinical standards; consider lower starting dose if interacting inhibitors or sensitivity.” Remove TDM language.

22. Wallet card contains over-absolute emergency instructions

Severity: Medium
Category: overclaim / clinical-risk communication
Location: brain/Reports/Wallet Card.md:22-40, especially 23-25, 31, 36, 40.

Why it is wrong or risky:
Wallet cards need to be conservative, but they also need to avoid false precision. “Hydrocodone avoid,” “morphine or hydromorphone only,” “melatonin max 1 mg,” and broad “NAT2 drugs: reduce dose” are too absolute. Emergency clinicians need short, accurate risk flags, not an anxious rules engine in bullet form.

Recommendation:
Rewrite wallet card as:

Confirmed/high-confidence: CYP2C19 NM, CYP2C9 *1/*2 IM, TPMT common-variant normal, SLCO1B1 rs4149056 TT normal, NAT2 slow likely.

Provisional: CYP2D6 reduced-function signal; clinical PGx needed.

Avoid: tramadol with sertraline unless prescriber explicitly accepts serotonergic risk.

Prefer: non-CYP2D6 opioids if opioid needed, but not “only.”

Add: “All PGx from consumer data; verify for consequential prescribing.”

Priority summary table
Priority	Finding	Severity	Main action
1	Imputed importer can import missing-R² and misparsed genotypes	Critical	Re-import imputed data with strict R²/GT/profile handling; rederive imputed claims
2	DPYD “cleared for standard fluoropyrimidines” overclaim	Critical	Replace with incomplete consumer screen; clinical DPYD/phenotype before chemo
3	CYP2D6 *4/*10 not consistently supported and AS likely wrong	High	Downgrade to provisional reduced-function signal; clinical CYP2D6 CNV/sequencing
4	CYP2D6 drug actions over-apply CPIC	High	Correct codeine/tramadol/hydrocodone/ondansetron/aripiprazole wording
5	Evidence tiers inflated beyond config definitions	High	Build source-backed evidence registry and block unsupported Level A labels
6	CBD/cannabis sertraline “tripling” claim	High	Replace magnitude claims with “may increase exposure; monitor/TDM if needed”
7	NSAID CYP2C9/CYP2C8 guidance over-expanded	High	Restrict CPIC claims to CYP2C9-supported NSAID pairs; downgrade CYP2C8
8	PRS/GWAS code can count wrong allele	High	Use strand-aware allele counter everywhere; exclude ambiguous palindromes
9	Multi-profile/sample mixing possible	High	Thread profile_id and import IDs through all code/report paths
10	UGT1A1 *80/*28 and irinotecan CPIC misattribution	High	Normalize proxy notation; cite FDA/DPWG, not CPIC, for irinotecan
11	Tramadol ROR 41.95 misrepresented	High	Keep warning but label as FAERS signal, not genotype-specific clinical effect
12	Cessation PK model drives clinical overclaim	High	Prevent toy model constants from generating prescriber-facing magnitude claims
13	NAT2 slow correct but action language broad	Medium	Keep phenotype; drug-specific evidence and wording
14	SLCO1B1 rs2306283/*1B inconsistency	Medium	Base statin report on rs4149056; fix haplotype annotation
15	Warfarin dose ranges too specific	Medium	Use algorithm-only language
16	Psychiatric candidate markers upgraded to rules	Medium	Move to research/context; remove “required/predicts/avoid” language
17	Strand/orientation not auditable in outputs	Medium	Add canonical normalized variant table with strand/build/source/R²
18	CPIC coverage report stale	Medium	Regenerate from current vault index and fail on contradictions
19	Integrative report stale/current-exposure contradictions	Medium	Mark stale or regenerate with dated exposure state
20	Wallet card too absolute	Medium	Rewrite as concise confirmed/provisional PGx safety card