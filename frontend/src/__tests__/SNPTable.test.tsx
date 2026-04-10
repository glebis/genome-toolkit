import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SNPTable } from '../components/SNPTable'
import type { SNP, SNPResult } from '../hooks/useSNPs'

const makeSNP = (overrides: Partial<SNP> = {}): SNP => ({
  rsid: 'rs1801133',
  chromosome: '1',
  position: 11856378,
  genotype: 'T/T',
  is_rsid: true,
  source: 'genotyped',
  r2_quality: null,
  significance: 'Pathogenic',
  disease: 'MTHFR deficiency',
  gene_symbol: 'MTHFR',
  ...overrides,
})

const mockData: SNPResult = {
  items: [
    makeSNP(),
    makeSNP({ rsid: 'rs4680', chromosome: '22', position: 19963748, genotype: 'A/G', gene_symbol: 'COMT', significance: null, disease: null, source: 'imputed' }),
  ],
  total: 2,
  page: 1,
  limit: 100,
}

describe('SNPTable', () => {
  it('renders column headers', () => {
    render(<SNPTable data={mockData} loading={false} />)
    expect(screen.getByText('RSID')).toBeInTheDocument()
    expect(screen.getByText('GENE')).toBeInTheDocument()
    expect(screen.getByText('CHR')).toBeInTheDocument()
    expect(screen.getByText('GENOTYPE')).toBeInTheDocument()
    expect(screen.getByText('CLINICAL')).toBeInTheDocument()
  })

  it('renders SNP rows with rsid', () => {
    render(<SNPTable data={mockData} loading={false} />)
    expect(screen.getByText('rs1801133')).toBeInTheDocument()
    expect(screen.getByText('rs4680')).toBeInTheDocument()
  })

  it('renders gene symbols', () => {
    render(<SNPTable data={mockData} loading={false} />)
    expect(screen.getByText('MTHFR')).toBeInTheDocument()
    expect(screen.getByText('COMT')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    render(<SNPTable data={{ items: [], total: 0, page: 1, limit: 100 }} loading={true} />)
    expect(screen.getByText(/LOADING.*SCANNING_VARIANTS/)).toBeInTheDocument()
  })

  it('shows empty state with no results', () => {
    render(<SNPTable data={{ items: [], total: 0, page: 1, limit: 100 }} loading={false} />)
    expect(screen.getByText('0 variants match current filters.')).toBeInTheDocument()
  })

  it('shows hidden variants count', () => {
    render(<SNPTable data={{ items: [], total: 0, page: 1, limit: 100 }} loading={false} totalVariants={5000} />)
    expect(screen.getByText(/5,000 variants hidden by filters/)).toBeInTheDocument()
  })

  it('renders reset filters button when handler provided', () => {
    const onReset = vi.fn()
    render(<SNPTable data={{ items: [], total: 0, page: 1, limit: 100 }} loading={false} onResetFilters={onReset} />)
    fireEvent.click(screen.getByText('RESET_FILTERS'))
    expect(onReset).toHaveBeenCalledOnce()
  })

  it('calls onRowClick on normal click', () => {
    const onRowClick = vi.fn()
    render(<SNPTable data={mockData} loading={false} onRowClick={onRowClick} />)
    fireEvent.click(screen.getByText('rs1801133'))
    expect(onRowClick).toHaveBeenCalledWith(mockData.items[0])
  })

  it('renders pagination info', () => {
    render(<SNPTable data={mockData} loading={false} />)
    expect(screen.getByText(/SHOWING 1--2 OF 2 VARIANTS/)).toBeInTheDocument()
  })

  it('calls onPageChange on next/prev', () => {
    const onPage = vi.fn()
    const pagedData: SNPResult = { items: [makeSNP()], total: 500, page: 2, limit: 100 }
    render(<SNPTable data={pagedData} loading={false} onPageChange={onPage} />)
    fireEvent.click(screen.getByText('PREV'))
    expect(onPage).toHaveBeenLastCalledWith(1)
    fireEvent.click(screen.getByText('NEXT'))
    expect(onPage).toHaveBeenLastCalledWith(3)
  })

  it('disables prev on first page', () => {
    render(<SNPTable data={mockData} loading={false} />)
    expect(screen.getByText('PREV')).toBeDisabled()
  })

  it('renders source badge (GEN vs IMP)', () => {
    render(<SNPTable data={mockData} loading={false} />)
    expect(screen.getByText('GEN')).toBeInTheDocument()
    expect(screen.getByText('IMP')).toBeInTheDocument()
  })

  it('renders significance badge for pathogenic', () => {
    render(<SNPTable data={mockData} loading={false} />)
    expect(screen.getByText('Pathogenic')).toBeInTheDocument()
  })
})
