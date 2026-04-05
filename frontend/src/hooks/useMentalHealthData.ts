import { useState, useEffect } from 'react'
import type { PathwaySection, ActionData } from '../types/genomics'

const MOCK_SECTIONS: PathwaySection[] = [
  {
    narrative: {
      pathway: 'Methylation Pathway',
      status: 'actionable',
      body: 'Your methylation cycle runs at <strong>reduced capacity</strong>. MTHFR C677T limits folate conversion, and with slower COMT dopamine clearance, methyl donors accumulate unevenly. This is a common pattern — <strong>about 25% of people</strong> carry this combination.',
      priority: 'Priority: methylation support',
      hint: 'Consider methylfolate + monitor homocysteine',
      geneCount: 2,
      actionCount: 3,
    },
    genes: [
      {
        symbol: 'MTHFR', variant: 'C677T', rsid: 'rs1801133', genotype: 'T/T',
        status: 'actionable', evidenceTier: 'E2', studyCount: 12,
        description: 'Reduced folate conversion. T/T homozygous — ~30% enzyme activity.',
        actionCount: 2, categories: ['mood', 'stress'], pathway: 'Methylation Pathway',
      },
      {
        symbol: 'COMT', variant: 'Val158Met', rsid: 'rs4680', genotype: 'A/A',
        status: 'monitor', evidenceTier: 'E2', studyCount: 15,
        description: 'Slow dopamine clearance. A/A — more stress-sensitive, better focus in calm settings.',
        actionCount: 1, categories: ['mood', 'stress', 'focus'], pathway: 'Methylation Pathway',
      },
    ],
  },
  {
    narrative: {
      pathway: 'Serotonin & Neuroplasticity',
      status: 'optimal',
      body: 'Good news here. Your serotonin transporter and BDNF variants are both in the <strong>optimal range</strong>. This means normal serotonin reuptake and healthy neuroplasticity signaling — both are protective factors for mood resilience.',
      priority: 'Status: protective',
      hint: 'Exercise amplifies BDNF benefits with your genotype',
      geneCount: 2,
      actionCount: 0,
    },
    genes: [
      {
        symbol: 'SLC6A4', variant: '5-HTTLPR', rsid: 'rs25531', genotype: 'L/L',
        status: 'optimal', evidenceTier: 'E2', studyCount: 20,
        description: 'Normal serotonin transporter activity. L/L genotype.',
        actionCount: 0, categories: ['mood'], pathway: 'Serotonin & Neuroplasticity',
      },
      {
        symbol: 'BDNF', variant: 'Val66Met', rsid: 'rs6265', genotype: 'Val/Val',
        status: 'optimal', evidenceTier: 'E2', studyCount: 18,
        description: 'Normal neuroplasticity. Val/Val — exercise strongly boosts BDNF expression.',
        actionCount: 0, categories: ['mood', 'stress'], pathway: 'Serotonin & Neuroplasticity',
      },
    ],
  },
  {
    narrative: {
      pathway: 'Monoamine Regulation',
      status: 'monitor',
      body: 'Your MAO-A variant shows <strong>moderately reduced</strong> monoamine oxidase activity. Combined with your slow COMT, this creates a pattern of slower neurotransmitter clearance overall — worth knowing but not a concern on its own.',
      priority: 'Status: monitor',
      hint: 'Interacts with COMT — see gene interaction map',
      geneCount: 1,
      actionCount: 0,
    },
    genes: [
      {
        symbol: 'MAO-A', variant: 'VNTR', rsid: '3R', genotype: '3R',
        status: 'monitor', evidenceTier: 'E3', studyCount: 8,
        description: 'Moderately lower MAO-A activity. 3R variant — common in ~35% of population.',
        actionCount: 0, categories: ['mood', 'stress'], pathway: 'Monoamine Regulation',
      },
    ],
  },
  {
    narrative: {
      pathway: 'GABA & Sleep',
      status: 'monitor',
      body: 'Your GAD1 variant is associated with <strong>slightly lower GABA synthesis</strong>. GABA is the brain\'s main calming neurotransmitter — lower levels can contribute to difficulty winding down and lighter sleep.',
      priority: 'Status: consider lifestyle adjustments',
      hint: 'Magnesium glycinate and sleep hygiene may help',
      geneCount: 1,
      actionCount: 2,
    },
    genes: [
      {
        symbol: 'GAD1', variant: 'rs3749034', rsid: 'rs3749034', genotype: 'A/G',
        status: 'monitor', evidenceTier: 'E3', studyCount: 5,
        description: 'Slightly reduced GABA synthesis. May affect anxiety threshold and sleep quality.',
        actionCount: 2, categories: ['sleep', 'stress'], pathway: 'GABA & Sleep',
      },
    ],
  },
]

const MOCK_ACTIONS: Record<string, ActionData[]> = {
  'MTHFR': [
    {
      id: 'mthfr-methylfolate', type: 'consider',
      title: 'Methylfolate supplementation',
      description: 'L-methylfolate (5-MTHF) bypasses the MTHFR conversion step. Start low and increase gradually.',
      detail: 'Form: L-methylfolate (Metafolin / Quatrefolic) or folinic acid. Starting dose: 400-800 mcg/day. Note: If you experience irritability or anxiety, switch to folinic acid — some slow COMT carriers do better with non-methyl forms. Interaction: Works synergistically with B12 (methylcobalamin).',
      evidenceTier: 'E2', studyCount: 12, tags: ['supplement', 'COMT interaction'],
      geneSymbol: 'MTHFR', done: false,
    },
    {
      id: 'mthfr-homocysteine', type: 'monitor',
      title: 'Test homocysteine levels',
      description: 'Homocysteine is the best biomarker for methylation function. Elevated levels confirm the MTHFR variant is having a functional impact.',
      detail: 'Target: below 10 umol/L (optimal: 6-8). Frequency: baseline, then 3 months after starting folate. Doctor note: "I have MTHFR C677T T/T and would like to check my homocysteine level"',
      evidenceTier: 'E1', studyCount: 20, tags: ['bloodwork', 'doctor talking point'],
      geneSymbol: 'MTHFR', done: false,
    },
  ],
  'COMT': [
    {
      id: 'comt-stress', type: 'try',
      title: 'Structured stress management',
      description: 'With slow COMT, stress neurotransmitters linger longer. Regular stress reduction practice has outsized benefits for your genotype.',
      detail: 'Meditation, breathwork, or yoga — even 10 minutes daily shows measurable cortisol changes. Your nervous system takes longer to return to baseline; building a regular practice shortens recovery time.',
      evidenceTier: 'E2', studyCount: 8, tags: ['lifestyle'],
      geneSymbol: 'COMT', done: false,
    },
  ],
  'GAD1': [
    {
      id: 'gad1-magnesium', type: 'consider',
      title: 'Magnesium glycinate supplementation',
      description: 'Magnesium supports GABA receptor function, which may partially compensate for your GAD1 variant.',
      detail: 'Glycinate form preferred for calming effects. 200-400mg before bed. Also supports sleep quality.',
      evidenceTier: 'E3', studyCount: 5, tags: ['supplement', 'sleep'],
      geneSymbol: 'GAD1', done: false,
    },
    {
      id: 'gad1-theanine', type: 'consider',
      title: 'L-theanine for acute stress',
      description: 'L-theanine increases GABA and alpha brain waves. May help during acute stress without sedation.',
      detail: '100-200mg as needed. Works synergistically with caffeine (take together to smooth out stimulant effect).',
      evidenceTier: 'E3', studyCount: 4, tags: ['supplement'],
      geneSymbol: 'GAD1', done: false,
    },
  ],
}

interface UseMentalHealthDataReturn {
  sections: PathwaySection[]
  loading: boolean
  totalGenes: number
  totalActions: number
  actions: Record<string, ActionData[]>
  getActionsForGene: (symbol: string) => ActionData[]
}

export function useMentalHealthData(): UseMentalHealthDataReturn {
  const [sections, setSections] = useState<PathwaySection[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const healthChecks = async () => {
      // Check backend health
      try {
        const healthRes = await fetch('/api/health')
        if (healthRes.ok) {
          const health = await healthRes.json()
          console.log('[genome-toolkit] Backend: OK | Variants:', health.variants)
        } else {
          console.warn('[genome-toolkit] Backend: responded with', healthRes.status)
        }
      } catch {
        console.error('[genome-toolkit] Backend: unreachable at /api/health')
      }

      // Check mental health API
      try {
        const mhRes = await fetch('/api/mental-health/genes')
        if (mhRes.ok) {
          const mhData = await mhRes.json()
          const genes = mhData?.genes || []
          const withNotes = genes.filter((g: { has_vault_note: boolean }) => g.has_vault_note).length
          console.log(`[genome-toolkit] Mental Health API: OK | ${genes.length} genes, ${withNotes} with vault notes`)

          if (withNotes === 0) {
            console.info('[genome-toolkit] No vault notes found — using mock data. Set GENOME_VAULT_PATH to your Obsidian vault.')
          }
        } else {
          console.warn('[genome-toolkit] Mental Health API: responded with', mhRes.status)
        }
      } catch {
        console.error('[genome-toolkit] Mental Health API: unreachable')
      }

      // Check TTS
      try {
        const ttsRes = await fetch('/api/tts/voices')
        if (ttsRes.ok) {
          console.log('[genome-toolkit] TTS (Orpheus): OK')
        } else {
          console.info('[genome-toolkit] TTS: not configured (browser fallback active)')
        }
      } catch {
        console.info('[genome-toolkit] TTS: endpoint unreachable (browser fallback active)')
      }
    }

    healthChecks()

    // Load dashboard data — use mock for now since API returns gene list, not structured sections
    console.log('[genome-toolkit] Dashboard: loading mock data (4 pathways, 6 genes, 5 actions)')
    setSections(MOCK_SECTIONS)
    setLoading(false)
  }, [])

  const totalGenes = sections.reduce((sum, s) => sum + s.genes.length, 0)
  const totalActions = sections.reduce((sum, s) => sum + s.narrative.actionCount, 0)

  return {
    sections,
    loading,
    totalGenes,
    totalActions,
    actions: MOCK_ACTIONS,
    getActionsForGene: (symbol: string) => MOCK_ACTIONS[symbol] || [],
  }
}
