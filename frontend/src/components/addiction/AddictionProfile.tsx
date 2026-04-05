import { NarrativeBlock } from '../mental-health/NarrativeBlock'
import { GeneCard } from '../mental-health/GeneCard'
import type { PathwaySection, GeneData } from '../../types/genomics'

// ─── Mock data ──────────────────────────────────────────────────────────────

const PATHWAYS: PathwaySection[] = [
  {
    narrative: {
      pathway: 'Dopamine & Reward Sensitivity',
      status: 'actionable',
      body: `Your dopamine system shows a pattern of <strong style="color:var(--sig-risk);">higher reward sensitivity</strong>. Your DRD2 variant is associated with fewer dopamine receptors, which can mean stronger responses to rewarding stimuli — but also a quicker return to baseline, which can drive seeking behavior. Combined with your slow COMT (dopamine lingers longer), you likely experience intense initial reward followed by a sharper drop.`,
      priority: 'Pattern: high sensitivity, sharp reward cycle',
      hint: 'Understanding this pattern helps with intentional choices',
      geneCount: 3,
      actionCount: 2,
    },
    genes: [
      {
        symbol: 'DRD2',
        variant: 'TaqIA',
        rsid: 'rs1800497',
        genotype: 'A/G',
        status: 'actionable',
        evidenceTier: 'E2',
        studyCount: 42,
        description: 'A1 allele present — associated with ~30% fewer D2 dopamine receptors. Higher reward-seeking, stronger response to novelty and substances.',
        actionCount: 1,
        categories: [],
        pathway: 'Dopamine & Reward',
      },
      {
        symbol: 'COMT',
        variant: 'Val158Met',
        rsid: 'rs4680',
        genotype: 'A/A',
        status: 'monitor',
        evidenceTier: 'E2',
        studyCount: 89,
        description: 'Slow dopamine clearance (A/A). Dopamine stays active longer — amplifies both reward and stress responses.',
        actionCount: 0,
        categories: [],
        pathway: 'Dopamine & Reward',
      },
      {
        symbol: 'SLC6A3 / DAT1',
        variant: 'VNTR',
        rsid: '10R/10R',
        genotype: '10R/10R',
        status: 'monitor',
        evidenceTier: 'E3',
        studyCount: 21,
        description: 'Standard dopamine transporter activity. Normal dopamine reuptake speed.',
        actionCount: 0,
        categories: [],
        pathway: 'Dopamine & Reward',
      },
    ],
  },
  {
    narrative: {
      pathway: 'Opioid Receptor Sensitivity',
      status: 'monitor',
      body: `Your OPRM1 variant shows <strong style="color:var(--sig-reduced);">increased opioid receptor binding</strong>. This means opioids (prescription or otherwise) may produce stronger effects at lower doses. This can be relevant for pain management and also means higher awareness is warranted around opioid-based substances.`,
      priority: 'Status: higher opioid sensitivity',
      hint: 'Relevant for pain management + harm reduction',
      geneCount: 1,
      actionCount: 1,
    },
    genes: [
      {
        symbol: 'OPRM1',
        variant: 'A118G',
        rsid: 'rs1799971',
        genotype: 'A/G',
        status: 'monitor',
        evidenceTier: 'E2',
        studyCount: 55,
        description: 'G allele carrier — increased mu-opioid receptor binding. Stronger response to opioids, potentially higher tolerance development.',
        actionCount: 1,
        categories: [],
        pathway: 'Opioid Sensitivity',
      },
      {
        symbol: 'CYP2D6',
        variant: '*1/*4',
        rsid: 'Intermediate',
        genotype: '*1/*4',
        status: 'neutral',
        evidenceTier: 'E1',
        studyCount: 120,
        description: 'Slower opioid prodrug conversion (codeine, tramadol). Less effective pain relief from these specific drugs.',
        actionCount: 0,
        categories: [],
        pathway: 'Opioid Sensitivity',
      },
    ],
  },
  {
    narrative: {
      pathway: 'Alcohol Metabolism',
      status: 'optimal',
      body: `Your alcohol metabolism genes are in the <strong style="color:var(--sig-benefit);">typical range</strong> for European ancestry. You don't carry the protective ALDH2 flush variant (common in East Asian populations) or the fast ADH1B variant. This means you metabolize alcohol at a standard rate — no built-in deterrent, but no unusual accumulation either.`,
      priority: 'Status: standard metabolism',
      hint: 'No genetic protection or unusual risk — standard moderation applies',
      geneCount: 2,
      actionCount: 0,
    },
    genes: [
      {
        symbol: 'ALDH2',
        variant: 'rs671',
        rsid: 'rs671',
        genotype: 'G/G',
        status: 'optimal',
        evidenceTier: 'E1',
        studyCount: 200,
        description: 'Normal ALDH2 activity. No acetaldehyde flush reaction. Standard alcohol clearance.',
        actionCount: 0,
        categories: [],
        pathway: 'Alcohol Metabolism',
      },
      {
        symbol: 'ADH1B',
        variant: 'rs1229984',
        rsid: 'rs1229984',
        genotype: 'A/G',
        status: 'optimal',
        evidenceTier: 'E1',
        studyCount: 150,
        description: 'Standard alcohol dehydrogenase. Typical ethanol-to-acetaldehyde conversion rate.',
        actionCount: 0,
        categories: [],
        pathway: 'Alcohol Metabolism',
      },
    ],
  },
  {
    narrative: {
      pathway: 'GABA & Sedative Sensitivity',
      status: 'monitor',
      body: `Your GABRA2 variant is associated with <strong style="color:var(--sig-reduced);">altered GABA-A receptor function</strong>. Combined with your GAD1 variant (slightly lower GABA synthesis, see Mental Health tab), you may be more sensitive to GABA-enhancing substances — alcohol, benzodiazepines (Xanax), GHB, and barbiturates may produce stronger effects.`,
      priority: 'Status: higher sedative sensitivity',
      hint: 'Start low with any GABA-ergic substance',
      geneCount: 2,
      actionCount: 1,
    },
    genes: [
      {
        symbol: 'GABRA2',
        variant: 'rs279858',
        rsid: 'rs279858',
        genotype: 'G/A',
        status: 'monitor',
        evidenceTier: 'E2',
        studyCount: 38,
        description: 'Altered GABA-A receptor subunit. Associated with higher sensitivity to alcohol and sedatives, and higher dependence risk for these substance classes.',
        actionCount: 1,
        categories: [],
        pathway: 'GABA & Sedative Sensitivity',
      },
      {
        symbol: 'GAD1',
        variant: 'rs3749034',
        rsid: 'rs3749034',
        genotype: 'C/T',
        status: 'monitor',
        evidenceTier: 'E3',
        studyCount: 18,
        description: 'Slightly reduced GABA synthesis. Lower baseline GABA may increase appeal of GABA-enhancing substances.',
        actionCount: 0,
        categories: [],
        pathway: 'GABA & Sedative Sensitivity',
      },
    ],
  },
  {
    narrative: {
      pathway: 'Nicotine Metabolism',
      status: 'optimal',
      body: `You are a <strong style="color:var(--sig-benefit);">normal nicotine metabolizer</strong>. You clear nicotine at an average rate. Slow metabolizers tend to smoke less (nicotine lasts longer); fast metabolizers smoke more (nicotine depletes quickly). Your normal status means standard patterns apply.`,
      priority: 'Status: normal metabolism',
      hint: 'If using NRT for cessation, standard dosing applies',
      geneCount: 1,
      actionCount: 0,
    },
    genes: [
      {
        symbol: 'CYP2A6',
        variant: '*1/*1',
        rsid: '*1/*1',
        genotype: '*1/*1',
        status: 'optimal',
        evidenceTier: 'E2',
        studyCount: 67,
        description: 'Normal nicotine metabolism. Standard clearance rate. If quitting, standard NRT (patch, gum) dosing is appropriate.',
        actionCount: 0,
        categories: [],
        pathway: 'Nicotine Metabolism',
      },
    ],
  },
]

interface SubstanceCard {
  name: string
  status: string
  statusColor: string
  borderColor: string
  description: string
  genes: string
  harmTitle: string
  harmText: string
}

const SUBSTANCES: SubstanceCard[] = [
  {
    name: 'Alcohol',
    status: 'Be aware of GABA sensitivity',
    statusColor: 'var(--sig-reduced)',
    borderColor: 'var(--border)',
    description:
      'Standard metabolism (ALDH2/ADH1B normal), but your GABRA2 variant means you may be more sensitive to alcohol\'s sedative effects. You might feel effects at lower amounts than peers. This also means binge drinking carries proportionally higher risk for you.',
    genes: 'Genes involved: ALDH2, ADH1B, GABRA2, GAD1',
    harmTitle: 'Harm reduction',
    harmText:
      'Track your drinks — your subjective threshold may be lower than peers\'. Avoid combining with benzodiazepines or GHB (compounding GABA effects). Your GABA sensitivity is also relevant if you experience hangover anxiety ("hangxiety") — it may be more pronounced.',
  },
  {
    name: 'MDMA / Ecstasy',
    status: 'Higher sensitivity — caution with dosing',
    statusColor: 'var(--sig-risk)',
    borderColor: 'var(--sig-risk)',
    description:
      'CYP2D6 intermediate metabolizer means MDMA clears more slowly. Effects last longer and redosing is riskier due to accumulation. Your high dopamine sensitivity (DRD2) may also mean stronger euphoric response but harder comedowns.',
    genes: 'Genes involved: CYP2D6 (metabolism), DRD2 (reward), COMT (dopamine clearance), SLC6A4 (serotonin)',
    harmTitle: 'Harm reduction',
    harmText:
      'Start with lower doses than typical recommendations (your metabolism is slower). Wait at least 3 hours before considering redose. Avoid if on SSRIs — serotonin syndrome risk is elevated with your CYP2D6 status. Avoid combining with cocaine (further CYP2D6 inhibition). Supplement with magnesium, stay hydrated but don\'t overhydrate.',
  },
  {
    name: 'Cocaine',
    status: 'Watch for cross-interactions',
    statusColor: 'var(--sig-reduced)',
    borderColor: 'var(--border)',
    description:
      'CYP3A4 normal — standard cocaine metabolism. However, cocaine inhibits CYP2D6, which is already intermediate for you. During cocaine use, any CYP2D6 substrate (SSRIs, MDMA) will be even more poorly metabolized. Your high DRD2 reward sensitivity may also mean stronger reinforcement patterns.',
    genes: 'Genes involved: CYP3A4 (metabolism), CYP2D6 (inhibition target), DRD2 (reward), COMT (dopamine)',
    harmTitle: 'Harm reduction',
    harmText:
      'Do not combine with MDMA or use while on SSRIs — cocaine\'s CYP2D6 inhibition stacks with your already intermediate status. Be aware of your reward sensitivity (DRD2) — the dopamine surge + slow COMT clearance creates a strong reinforcement cycle. Set limits before using, not during.',
  },
  {
    name: 'Psychedelics (Psilocybin, LSD)',
    status: 'Generally standard metabolism',
    statusColor: 'var(--sig-benefit)',
    borderColor: 'var(--border)',
    description:
      'LSD is mainly CYP3A4 (normal for you). Psilocybin has partial CYP2D6 involvement — effects may last slightly longer. Your MAO-A 3R variant (moderately lower activity) could slightly affect psychedelic metabolism. Note: if considering ayahuasca/DMT, your MAO-A status is directly relevant.',
    genes: 'Genes involved: CYP3A4, CYP2D6 (psilocybin), MAO-A (DMT/ayahuasca)',
    harmTitle: 'Harm reduction',
    harmText:
      'For psilocybin: start with lower doses given your slightly slower CYP2D6 metabolism. For LSD: standard precautions apply. For DMT/ayahuasca: your MAO-A 3R variant means monoamine clearance is already reduced — traditional ayahuasca (which contains MAO inhibitors) may produce more intense and prolonged effects. Use extreme caution with MAOIs.',
  },
  {
    name: 'Ketamine',
    status: 'Standard metabolism',
    statusColor: 'var(--sig-benefit)',
    borderColor: 'var(--border)',
    description:
      'CYP3A4 and CYP2B6 are the primary enzymes. Both are normal for you. If exploring therapeutic ketamine for depression (your BDNF Val/Val is favorable for ketamine response), standard clinical dosing applies.',
    genes: 'Genes involved: CYP3A4, CYP2B6, BDNF (therapeutic response)',
    harmTitle: 'Harm reduction',
    harmText:
      'Standard metabolism means predictable clearance. Do not combine with alcohol or benzodiazepines (compounding CNS depression + your GABA sensitivity). Your BDNF Val/Val may mean better response to therapeutic ketamine if exploring clinical treatment.',
  },
  {
    name: 'Cannabis',
    status: 'Standard THC metabolism',
    statusColor: 'var(--sig-benefit)',
    borderColor: 'var(--border)',
    description:
      'THC metabolized by CYP2C9 and CYP3A4, both normal. Note: CBD inhibits CYP3A4, which could affect clearance of other substances/medications you take alongside. Your COMT slow status may mean THC-induced anxiety is more pronounced at higher doses.',
    genes: 'Genes involved: CYP2C9, CYP3A4, COMT (anxiety sensitivity)',
    harmTitle: 'Harm reduction',
    harmText:
      'With slow COMT, high-THC strains may increase anxiety. Consider balanced THC:CBD ratios or CBD-dominant products. If taking benzodiazepines, be aware that CBD can slow their metabolism. Edibles: standard onset timing applies, but your COMT may amplify anxious responses — start very low.',
  },
  {
    name: 'Benzodiazepines (Xanax, Klonopin)',
    status: 'Higher GABA sensitivity',
    statusColor: 'var(--sig-reduced)',
    borderColor: 'var(--sig-reduced)',
    description:
      'CYP3A4 normal — standard benzo metabolism. But your GABRA2 variant and lower GAD1 GABA synthesis mean you may be more responsive to benzodiazepines at lower doses. This also means dependence may develop faster — the relief from baseline low GABA feels especially rewarding.',
    genes: 'Genes involved: CYP3A4 (metabolism), GABRA2 (receptor sensitivity), GAD1 (GABA synthesis)',
    harmTitle: 'Harm reduction',
    harmText:
      'Your genetic profile suggests higher-than-average benzodiazepine sensitivity and faster dependence development. If prescribed: discuss your GABRA2 status with your prescriber. If using recreationally: be aware that what feels like a "normal" dose to peers may be stronger for you. Never combine with alcohol or opioids. Taper slowly if stopping — your GABA system is more sensitive to withdrawal.',
  },
]

// ─── Computed stats ──────────────────────────────────────────────────────────

const TOTAL_GENES = PATHWAYS.reduce((sum, p) => sum + p.genes.length, 0)
const ACTIONABLE_COUNT = PATHWAYS.reduce(
  (sum, p) => sum + p.genes.filter(g => g.status === 'actionable').length,
  0,
)

// ─── Sub-components ──────────────────────────────────────────────────────────

function SubstanceCardItem({ substance }: { substance: SubstanceCard }) {
  return (
    <div style={{
      background: 'var(--bg-raised)',
      borderLeft: `4px solid ${substance.borderColor}`,
      border: `1.5px solid ${substance.borderColor}`,
      borderRadius: 6,
      padding: '14px 16px',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
          {substance.name}
        </span>
        <span style={{ fontSize: 9, fontWeight: 500, color: substance.statusColor, fontFamily: 'var(--font-mono)' }}>
          {substance.status}
        </span>
      </div>
      <div style={{ fontSize: 10, lineHeight: 1.6, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
        {substance.description}
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
        {substance.genes}
      </div>
      <div style={{
        marginTop: 10,
        padding: '10px 14px',
        background: 'var(--bg-inset)',
        borderRadius: 4,
      }}>
        <div style={{
          fontSize: 9,
          fontWeight: 600,
          color: 'var(--text)',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontFamily: 'var(--font-mono)',
        }}>
          {substance.harmTitle}
        </div>
        <div style={{ fontSize: 10, lineHeight: 1.6, fontFamily: 'var(--font-mono)' }}>
          {substance.harmText}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AddictionProfile() {
  const handleGeneClick = (_gene: GeneData) => {
    // no-op for now — could open a drawer in a future iteration
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* Hero header */}
      <div style={{
        padding: '48px 24px 36px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: '0.08em',
          fontFamily: 'var(--font-mono)',
          marginBottom: 10,
        }}>
          Addiction &amp; Reward Profile
        </div>
        <div style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          lineHeight: 1.7,
          maxWidth: 680,
          fontFamily: 'var(--font-mono)',
        }}>
          How your genetics relate to reward sensitivity, substance metabolism, and dependence patterns.
          This is context for self-understanding and harm reduction, not diagnosis.
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--sig-risk)', fontFamily: 'var(--font-mono)' }}>
              {TOTAL_GENES}
            </span>
            <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
              Genes analyzed
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--sig-reduced)', fontFamily: 'var(--font-mono)' }}>
              {ACTIONABLE_COUNT}
            </span>
            <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
              Actionable findings
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
              {SUBSTANCES.length}
            </span>
            <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
              Substances profiled
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--sig-benefit)', fontFamily: 'var(--font-mono)' }}>
              {PATHWAYS.length}
            </span>
            <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
              Pathways mapped
            </span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ padding: '24px 24px 0' }}>

        {/* Context block */}
        <div style={{
          background: 'var(--bg-raised)',
          border: '1.5px solid var(--primary)',
          borderRadius: 6,
          padding: '16px 18px',
          marginBottom: 24,
        }}>
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--primary)',
            marginBottom: 8,
            fontFamily: 'var(--font-mono)',
          }}>
            About this profile
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.7, fontFamily: 'var(--font-mono)' }}>
            This profile shows how your genetics relate to reward sensitivity, substance metabolism, and dependence patterns.
            Having variants associated with higher sensitivity does <strong>not</strong> mean you will develop
            dependence — genetics is one factor among many, including environment, mental health, social context, and personal
            history. This information is provided for <strong>self-understanding and harm reduction</strong>, not diagnosis.
          </div>
        </div>

        {/* Pathway sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 24 }}>
          {PATHWAYS.map(section => (
            <div key={section.narrative.pathway} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <NarrativeBlock narrative={section.narrative} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {section.genes.map(gene => (
                  <GeneCard key={`${gene.symbol}-${gene.rsid}`} gene={gene} onClick={handleGeneClick} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <hr style={{ border: 'none', borderTop: '1px dashed var(--border-dashed)', margin: '4px 0 24px' }} />

        {/* Substance harm reduction section */}
        <div style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          marginBottom: 12,
          color: 'var(--text)',
          fontFamily: 'var(--font-mono)',
        }}>
          Your substance-specific harm reduction notes
        </div>
        <p style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6, fontFamily: 'var(--font-mono)' }}>
          Based on your genetic profile across all pathways. These are summaries — see PGx panel for full metabolism details.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {SUBSTANCES.map(substance => (
            <SubstanceCardItem key={substance.name} substance={substance} />
          ))}
        </div>

      </div>

      {/* Footer */}
      <footer style={{
        padding: 'var(--space-xs) var(--space-lg)',
        borderTop: '1px dashed var(--border-dashed)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span className="label">
          {TOTAL_GENES} GENES &middot; {SUBSTANCES.length} SUBSTANCES &middot; HARM REDUCTION MODE
        </span>
        <span className="label">GENOME_TOOLKIT // ADDICTION &amp; REWARD PROFILE</span>
      </footer>

    </div>
  )
}
