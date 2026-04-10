import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VariantDrawer } from '../components/VariantDrawer'
import type { SNP } from '../hooks/useSNPs'

const mockSNP: SNP = {
  rsid: 'rs1801133',
  chromosome: '1',
  position: 11856378,
  genotype: 'T/T',
  source: 'genotyped',
  significance: 'Pathogenic',
  disease: 'MTHFR deficiency; Neural tube defects',
  gene: 'MTHFR',
  gene_symbol: 'MTHFR',
  r2_quality: null,
}

const mockGuidance = {
  severity: 'moderate',
  what_it_means: 'Your MTHFR variant reduces folate conversion efficiency.',
  suggested_actions: ['Consider methylfolate supplementation', 'Test homocysteine levels'],
  discuss_with_clinician: true,
  external_links: [
    { label: 'ClinVar', url: 'https://clinvar.example.com/rs1801133' },
  ],
}

beforeEach(() => {
  vi.restoreAllMocks()
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/guidance')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockGuidance) })
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ...mockSNP, review_status: '2 stars', gene_name: 'MTHFR full name' }),
    })
  }) as any
})

describe('VariantDrawer', () => {
  it('renders nothing when snp is null', () => {
    const { container } = render(<VariantDrawer snp={null} onClose={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders rsid in header', async () => {
    render(<VariantDrawer snp={mockSNP} onClose={vi.fn()} />)
    expect(screen.getByText('rs1801133')).toBeInTheDocument()
  })

  it('renders core data table', async () => {
    render(<VariantDrawer snp={mockSNP} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('CHROMOSOME')).toBeInTheDocument()
    })
    expect(screen.getByText('GENOTYPE')).toBeInTheDocument()
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(<VariantDrawer snp={mockSNP} onClose={onClose} />)
    fireEvent.click(screen.getByText('CLOSE'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders guidance when loaded', async () => {
    render(<VariantDrawer snp={mockSNP} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText(/reduces folate conversion/)).toBeInTheDocument()
    })
  })

  it('renders discuss with clinician callout', async () => {
    render(<VariantDrawer snp={mockSNP} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('DISCUSS_WITH_CLINICIAN')).toBeInTheDocument()
    })
  })

  it('renders suggested actions', async () => {
    render(<VariantDrawer snp={mockSNP} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Consider methylfolate supplementation')).toBeInTheDocument()
      expect(screen.getByText('Test homocysteine levels')).toBeInTheDocument()
    })
  })

  it('renders external links', async () => {
    render(<VariantDrawer snp={mockSNP} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('ClinVar')).toBeInTheDocument()
    })
  })

  it('calls onAskAI when ask button clicked', async () => {
    const onAskAI = vi.fn()
    render(<VariantDrawer snp={mockSNP} onClose={vi.fn()} onAskAI={onAskAI} />)
    await waitFor(() => {
      expect(screen.getByText(/ASK_AI/)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText(/ASK_AI/))
    expect(onAskAI).toHaveBeenCalledWith('What can you tell me about rs1801133?')
  })

  it('closes on Escape key', () => {
    const onClose = vi.fn()
    render(<VariantDrawer snp={mockSNP} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders disease conditions split by semicolon', async () => {
    render(<VariantDrawer snp={mockSNP} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('MTHFR deficiency')).toBeInTheDocument()
      expect(screen.getByText('Neural tube defects')).toBeInTheDocument()
    })
  })
})
