import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  PillButton, FilterChip, ExportButton, ExportBar,
  Toolbar, HeroHeader, StatBox, InfoCallout,
  SectionLabel, LoadingLabel, EmptyState, ReportFooter,
  DashedDivider,
} from '../components/common'

// ── PillButton ──────────────────────────────────────────────────────────────

describe('PillButton', () => {
  it('renders children and calls onClick', () => {
    const onClick = vi.fn()
    render(<PillButton onClick={onClick}>Click me</PillButton>)
    fireEvent.click(screen.getByText('Click me'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

// ── FilterChip ──────────────────────────────────────────────────────────────

describe('FilterChip', () => {
  it('renders label', () => {
    render(<FilterChip label="Mood" isActive={false} onClick={vi.fn()} />)
    expect(screen.getByText('Mood')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<FilterChip label="Mood" isActive={false} onClick={onClick} />)
    fireEvent.click(screen.getByText('Mood'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

// ── StatBox ─────────────────────────────────────────────────────────────────

describe('StatBox', () => {
  it('renders value and label', () => {
    render(<StatBox value={42} label="Genes" />)
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Genes')).toBeInTheDocument()
  })
})

// ── SectionLabel ────────────────────────────────────────────────────────────

describe('SectionLabel', () => {
  it('renders text content', () => {
    render(<SectionLabel>Pathway Overview</SectionLabel>)
    expect(screen.getByText('Pathway Overview')).toBeInTheDocument()
  })
})

// ── LoadingLabel ────────────────────────────────────────────────────────────

describe('LoadingLabel', () => {
  it('renders default message', () => {
    render(<LoadingLabel />)
    expect(screen.getByText('LOADING_DATA...')).toBeInTheDocument()
  })

  it('renders custom message', () => {
    render(<LoadingLabel message="Fetching genes..." />)
    expect(screen.getByText('Fetching genes...')).toBeInTheDocument()
  })
})

// ── EmptyState ──────────────────────────────────────────────────────────────

describe('EmptyState', () => {
  it('renders message', () => {
    render(<EmptyState message="No data found" />)
    expect(screen.getByText('No data found')).toBeInTheDocument()
  })

  it('renders hint when provided', () => {
    render(<EmptyState message="No data" hint="Try adjusting filters" />)
    expect(screen.getByText('Try adjusting filters')).toBeInTheDocument()
  })

  it('hides hint when not provided', () => {
    const { container } = render(<EmptyState message="No data" />)
    // Only the message div, no hint
    expect(container.querySelectorAll('div > div').length).toBeLessThanOrEqual(1)
  })
})

// ── InfoCallout ─────────────────────────────────────────────────────────────

describe('InfoCallout', () => {
  it('renders children', () => {
    render(<InfoCallout>Important note here</InfoCallout>)
    expect(screen.getByText('Important note here')).toBeInTheDocument()
  })
})

// ── HeroHeader ──────────────────────────────────────────────────────────────

describe('HeroHeader', () => {
  it('renders title and description', () => {
    render(
      <HeroHeader
        title="Mental Health"
        description="Your genetic mental health profile"
        genotypes={['T/T', 'A/G']}
        glyphLabel="MH"
      />,
    )
    expect(screen.getByText('Mental Health')).toBeInTheDocument()
    expect(screen.getByText('Your genetic mental health profile')).toBeInTheDocument()
  })
})

// ── ExportButton ────────────────────────────────────────────────────────────

describe('ExportButton', () => {
  it('renders label and triggers onClick', () => {
    const onClick = vi.fn()
    render(<ExportButton label="PDF" onClick={onClick} />)
    fireEvent.click(screen.getByText('PDF'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

// ── ExportBar ───────────────────────────────────────────────────────────────

describe('ExportBar', () => {
  it('renders default export buttons', () => {
    render(<ExportBar onExport={vi.fn()} />)
    expect(screen.getByText('Export PDF')).toBeInTheDocument()
    expect(screen.getByText('Export MD')).toBeInTheDocument()
    expect(screen.getByText('Print for doctor')).toBeInTheDocument()
  })

  it('calls onExport with format when clicked', () => {
    const onExport = vi.fn()
    render(<ExportBar onExport={onExport} />)
    fireEvent.click(screen.getByText('Export PDF'))
    expect(onExport).toHaveBeenCalledWith('pdf')
  })
})

// ── Toolbar ─────────────────────────────────────────────────────────────────

describe('Toolbar', () => {
  it('renders left and right content', () => {
    render(<Toolbar left={<span>Left</span>} right={<span>Right</span>} />)
    expect(screen.getByText('Left')).toBeInTheDocument()
    expect(screen.getByText('Right')).toBeInTheDocument()
  })
})

// ── ReportFooter ────────────────────────────────────────────────────────────

describe('ReportFooter', () => {
  it('renders left and right slots', () => {
    render(<ReportFooter left="v1.0" right="Genome Toolkit" />)
    expect(screen.getByText('v1.0')).toBeInTheDocument()
    expect(screen.getByText('Genome Toolkit')).toBeInTheDocument()
  })
})

// ── DashedDivider ───────────────────────────────────────────────────────────

describe('DashedDivider', () => {
  it('renders an hr element', () => {
    const { container } = render(<DashedDivider />)
    expect(container.querySelector('hr')).toBeInTheDocument()
  })
})
