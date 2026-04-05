import { useState, useEffect } from 'react'
import type { PathwaySection } from '../types/genomics'

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

interface UseMentalHealthDataReturn {
  sections: PathwaySection[]
  loading: boolean
  totalGenes: number
  totalActions: number
}

export function useMentalHealthData(): UseMentalHealthDataReturn {
  const [sections, setSections] = useState<PathwaySection[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Attempt to fetch from backend; fall back to mock data
    fetch('/api/mental-health/genes')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && Array.isArray(data)) {
          setSections(data)
        } else {
          setSections(MOCK_SECTIONS)
        }
      })
      .catch(() => {
        setSections(MOCK_SECTIONS)
      })
      .finally(() => setLoading(false))
  }, [])

  const totalGenes = sections.reduce((sum, s) => sum + s.genes.length, 0)
  const totalActions = sections.reduce((sum, s) => sum + s.narrative.actionCount, 0)

  return { sections, loading, totalGenes, totalActions }
}
