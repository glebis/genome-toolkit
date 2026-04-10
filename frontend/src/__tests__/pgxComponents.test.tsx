import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MetabolizerBar } from '../components/pgx/MetabolizerBar'
import { DrugCard } from '../components/pgx/DrugCard'
import type { EnzymeData } from '../types/pgx'
import type { DrugCardData } from '../types/pgx'

// ── MetabolizerBar ──────────────────────────────────────────────────────────

const enzymeData: EnzymeData = {
  symbol: 'CYP2D6', alleles: '*1/*4', status: 'intermediate',
  position: 30, description: 'Reduced metabolism.',
  guideline: 'CPIC', geneType: 'enzyme',
}

describe('MetabolizerBar', () => {
  it('renders enzyme metabolizer labels for enzyme type', () => {
    render(<MetabolizerBar enzyme={enzymeData} />)
    expect(screen.getByText('Poor')).toBeInTheDocument()
    expect(screen.getByText('Intermediate')).toBeInTheDocument()
    expect(screen.getByText('Normal')).toBeInTheDocument()
    expect(screen.getByText('Ultrarapid')).toBeInTheDocument()
  })

  it('renders transporter labels for transporter type', () => {
    const transporter: EnzymeData = { ...enzymeData, geneType: 'transporter' }
    render(<MetabolizerBar enzyme={transporter} />)
    expect(screen.getByText('Poor')).toBeInTheDocument()
    expect(screen.getByText('Decreased')).toBeInTheDocument()
    expect(screen.getByText('Normal')).toBeInTheDocument()
    expect(screen.getByText('Increased')).toBeInTheDocument()
  })

  it('renders status label text', () => {
    render(<MetabolizerBar enzyme={enzymeData} />)
    expect(screen.getByText('Intermediate Metabolizer')).toBeInTheDocument()
  })
})

// ── DrugCard ────────────────────────────────────────────────────────────────

const baseDrug: DrugCardData = {
  drugClass: 'SSRIs', impact: 'adjust',
  statusText: 'May need dose adjustment',
  description: 'Lower starting dose recommended.',
  drugList: 'fluoxetine, paroxetine',
  category: 'prescription',
}

describe('DrugCard', () => {
  it('renders drug class and status text', () => {
    render(<DrugCard drug={baseDrug} />)
    expect(screen.getByText('SSRIs')).toBeInTheDocument()
    expect(screen.getByText('May need dose adjustment')).toBeInTheDocument()
  })

  it('renders drug list with prescription prefix', () => {
    render(<DrugCard drug={baseDrug} />)
    expect(screen.getByText(/Drugs affected:.*fluoxetine/)).toBeInTheDocument()
  })

  it('renders substance prefix for substance category', () => {
    const substance: DrugCardData = { ...baseDrug, category: 'substance' }
    render(<DrugCard drug={substance} />)
    expect(screen.getByText(/Affects:.*fluoxetine/)).toBeInTheDocument()
  })

  it('renders danger note when present', () => {
    const dangerDrug: DrugCardData = {
      ...baseDrug, impact: 'danger',
      dangerNote: 'Avoid codeine — may cause respiratory depression.',
    }
    render(<DrugCard drug={dangerDrug} />)
    expect(screen.getByText('Discuss with prescriber')).toBeInTheDocument()
    expect(screen.getByText(/Avoid codeine/)).toBeInTheDocument()
  })

  it('shows interaction warning label for substances', () => {
    const substanceDanger: DrugCardData = {
      ...baseDrug, impact: 'danger', category: 'substance',
      dangerNote: 'High risk interaction.',
    }
    render(<DrugCard drug={substanceDanger} />)
    expect(screen.getByText('Interaction warning')).toBeInTheDocument()
  })

  it('hides danger note when not present', () => {
    render(<DrugCard drug={baseDrug} />)
    expect(screen.queryByText('Discuss with prescriber')).not.toBeInTheDocument()
  })

  it('calls onAddToChecklist with truncated note', () => {
    const onAdd = vi.fn()
    const dangerDrug: DrugCardData = {
      ...baseDrug, impact: 'danger',
      dangerNote: 'Short note.',
    }
    render(<DrugCard drug={dangerDrug} onAddToChecklist={onAdd} />)
    fireEvent.click(screen.getByText('+'))
    expect(onAdd).toHaveBeenCalledWith('SSRIs: Short note.')
  })

  it('disables add button when already added', () => {
    const dangerDrug: DrugCardData = { ...baseDrug, impact: 'danger', dangerNote: 'Note.' }
    render(<DrugCard drug={dangerDrug} onAddToChecklist={vi.fn()} added={true} />)
    expect(screen.getByText('ADDED')).toBeInTheDocument()
    expect(screen.getByText('ADDED').closest('button')).toBeDisabled()
  })
})
