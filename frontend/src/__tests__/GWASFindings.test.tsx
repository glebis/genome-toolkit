import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GWASFindings, interpretTally } from '../components/mental-health/GWASFindings'
import type { GWASTraitData, GWASMatch } from '../hooks/useGWASData'

const mockMatch: GWASMatch = {
  rsid: 'rs123456', chr: 1, pos: 12345, gene_symbol: 'MTHFR',
  effect_allele: 'T', other_allele: 'C', user_genotype: 'T/C',
  effect_allele_count: 1, effect: 0.05, p_value: 1e-10,
  direction: 'risk', source_type: 'genotyped',
}

const mockData: GWASTraitData = {
  trait: 'anxiety', display_name: 'Anxiety',
  source: 'PGC3', config: 'pgc3_anxiety_2023',
  publication: 'PGC Anxiety GWAS 2023',
  citation: 'Doe et al. 2023', license: 'CC BY 4.0',
  threshold: 5e-8, total_hits: 100, matched_hits: 50,
  risk_allele_total: 35, risk_allele_max: 50,
  matches: [mockMatch],
}

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockFetchWithData(data: GWASTraitData | null, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(ok ? data : { detail: 'Not found' }),
  }) as any
}

describe('GWASFindings', () => {
  it('shows loading state initially', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})) as any
    render(<GWASFindings trait="anxiety" />)
    expect(screen.getByText('LOADING_GWAS_DATA...')).toBeInTheDocument()
  })

  it('renders header with trait name and hit counts', async () => {
    mockFetchWithData(mockData)
    render(<GWASFindings trait="anxiety" />)
    await waitFor(() => {
      expect(screen.getByText(/Polygenic findings — Anxiety/)).toBeInTheDocument()
    })
    expect(screen.getByText(/50 of 100 genome-wide significant SNPs/)).toBeInTheDocument()
  })

  it('renders PGC / GWAS badge', async () => {
    mockFetchWithData(mockData)
    render(<GWASFindings trait="anxiety" />)
    await waitFor(() => {
      expect(screen.getByText('PGC / GWAS')).toBeInTheDocument()
    })
  })

  it('renders tally bar with risk allele count', async () => {
    mockFetchWithData(mockData)
    render(<GWASFindings trait="anxiety" />)
    await waitFor(() => {
      expect(screen.getByText('35/50')).toBeInTheDocument()
    })
  })

  it('shows "higher" interpretation when risk alleles > 60%', async () => {
    const highRisk = { ...mockData, risk_allele_total: 40, risk_allele_max: 50 }
    mockFetchWithData(highRisk)
    render(<GWASFindings trait="anxiety" />)
    await waitFor(() => {
      expect(screen.getByText(/Higher uncalibrated risk-direction tally/)).toBeInTheDocument()
    })
  })

  it('shows "lower" interpretation when risk alleles < 40%', async () => {
    const lowRisk = { ...mockData, risk_allele_total: 10, risk_allele_max: 50 }
    mockFetchWithData(lowRisk)
    render(<GWASFindings trait="anxiety" />)
    await waitFor(() => {
      expect(screen.getByText(/Lower uncalibrated risk-direction tally/)).toBeInTheDocument()
    })
  })

  it('renders SNP row with rsid and genotype', async () => {
    mockFetchWithData(mockData)
    render(<GWASFindings trait="anxiety" />)
    await waitFor(() => {
      expect(screen.getByText('rs123456')).toBeInTheDocument()
      expect(screen.getByText('T/C')).toBeInTheDocument()
    })
  })

  it('shows error state on API failure', async () => {
    mockFetchWithData(null, false)
    render(<GWASFindings trait="anxiety" />)
    await waitFor(() => {
      expect(screen.getByText('GWAS data not yet available')).toBeInTheDocument()
    })
  })

  it('shows empty state when no matches', async () => {
    const noMatches = { ...mockData, matches: [] }
    mockFetchWithData(noMatches)
    render(<GWASFindings trait="anxiety" />)
    await waitFor(() => {
      expect(screen.getByText(/No matching SNPs found/)).toBeInTheDocument()
    })
  })

  it('toggles methodology section', async () => {
    mockFetchWithData(mockData)
    const onDiscuss = vi.fn()
    render(<GWASFindings trait="anxiety" onDiscuss={onDiscuss} />)
    await waitFor(() => {
      expect(screen.getByText('Methodology & caveats')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Methodology & caveats'))
    expect(screen.getByText('What you\'re looking at')).toBeInTheDocument()
  })

  it('headline never frames the tally as an average/distribution/percentile (#10)', async () => {
    for (const total of [5, 25, 45]) {
      const data = { ...mockData, risk_allele_total: total, risk_allele_max: 50 }
      const headline = interpretTally(data).headline.toLowerCase()
      expect(headline).not.toContain('average')
      expect(headline).not.toContain('distribution')
      expect(headline).not.toContain('percentile')
      expect(headline).not.toMatch(/lower than|higher than/)
    }
  })

  it('meaning makes no positive "portion of the distribution" claim (#10)', () => {
    const { meaning } = interpretTally(mockData).meaning ? interpretTally(mockData) : { meaning: '' }
    const text = meaning.toLowerCase()
    expect(text).not.toContain('portion of the distribution')
    // "average"/"percentile" only appear inside explicit negations
    expect(text).not.toMatch(/places you in the/)
  })

  it('interpretation explicitly disclaims percentile/PRS/population average (#10)', () => {
    const { meaning } = interpretTally(mockData)
    expect(meaning.toLowerCase()).toContain('not a percentile')
    expect(meaning.toLowerCase()).toContain('population average')
    expect(meaning.toLowerCase()).toContain('calibrated prs')
  })

  it('bar legend does not label the midpoint as a population average (#10)', async () => {
    mockFetchWithData(mockData)
    render(<GWASFindings trait="anxiety" />)
    await waitFor(() => {
      expect(screen.getByText('35/50')).toBeInTheDocument()
    })
    expect(screen.queryByText('average')).not.toBeInTheDocument()
    expect(screen.getByText('50% possible')).toBeInTheDocument()
  })

  it('methodology copy does not claim the midpoint is an average person (#10)', async () => {
    mockFetchWithData(mockData)
    const onDiscuss = vi.fn()
    render(<GWASFindings trait="anxiety" onDiscuss={onDiscuss} />)
    await waitFor(() => {
      expect(screen.getByText('Methodology & caveats')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Methodology & caveats'))
    expect(screen.queryByText(/what an average person would carry/i)).not.toBeInTheDocument()
    expect(screen.getByText(/50% of possible counted allele copies/i)).toBeInTheDocument()
  })

  it('calls onDiscuss when Ask AI button clicked', async () => {
    mockFetchWithData(mockData)
    const onDiscuss = vi.fn()
    render(<GWASFindings trait="anxiety" onDiscuss={onDiscuss} />)
    await waitFor(() => {
      expect(screen.getByText(/Ask AI about my findings/)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText(/Ask AI about my findings/))
    expect(onDiscuss).toHaveBeenCalledOnce()
    expect(onDiscuss.mock.calls[0][0]).toContain('polygenic findings')
  })
})
