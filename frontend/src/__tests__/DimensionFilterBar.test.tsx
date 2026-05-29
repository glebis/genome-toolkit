import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DimensionFilterBar } from '../components/common/DimensionFilterBar'

const dimensions = [
  {
    key: 'evidence',
    label: 'Evidence',
    options: [
      { value: 'E1', label: 'E1' },
      { value: 'E2', label: 'E2' },
    ],
  },
  {
    key: 'action',
    label: 'Action',
    options: [
      { value: 'discuss', label: 'Discuss' },
      { value: 'try', label: 'Try' },
    ],
  },
]

describe('DimensionFilterBar', () => {
  it('renders a labelled group per dimension with an All chip and options', () => {
    render(<DimensionFilterBar dimensions={dimensions} active={{}} onChange={() => {}} />)
    expect(screen.getByText('Evidence')).toBeInTheDocument()
    expect(screen.getByText('Action')).toBeInTheDocument()
    expect(screen.getByText('E1')).toBeInTheDocument()
    expect(screen.getByText('Discuss')).toBeInTheDocument()
    // one "All" per dimension
    expect(screen.getAllByText('All')).toHaveLength(2)
  })

  it('calls onChange with the value when an option is clicked', () => {
    const onChange = vi.fn()
    render(<DimensionFilterBar dimensions={dimensions} active={{}} onChange={onChange} />)
    fireEvent.click(screen.getByText('E2'))
    expect(onChange).toHaveBeenCalledWith('evidence', 'E2')
  })

  it('calls onChange with null when All is clicked', () => {
    const onChange = vi.fn()
    render(<DimensionFilterBar dimensions={dimensions} active={{ action: 'try' }} onChange={onChange} />)
    const actionGroup = screen.getByTestId('filter-group-action')
    fireEvent.click(within(actionGroup).getByText('All'))
    expect(onChange).toHaveBeenCalledWith('action', null)
  })
})
