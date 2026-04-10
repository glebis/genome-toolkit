import { useState, useCallback, useRef } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type ColumnDef,
} from '@tanstack/react-table'
import type { SNP, SNPResult } from '../hooks/useSNPs'

const col = createColumnHelper<SNP>()

// Standard nucleotide colors (Shapely/RasMol convention adapted for light bg)
const NUCLEOTIDE_COLORS: Record<string, string> = {
  A: '#2a9d3e', // green
  T: '#c4424e', // red
  G: '#c49a1e', // amber
  C: '#3a6fa8', // blue
}

function ColoredGenotype({ genotype }: { genotype: string }) {
  if (!genotype || genotype === '--') {
    return <span style={{ color: 'var(--text-tertiary)' }}>--</span>
  }
  return (
    <span style={{ fontWeight: 600, letterSpacing: '0.1em', fontSize: 'var(--font-size-md)' }}>
      {genotype.split('').map((base, i) => (
        <span key={i} style={{ color: NUCLEOTIDE_COLORS[base] || 'var(--text)' }}>
          {base}
        </span>
      ))}
    </span>
  )
}

function SignificanceBadge({ value }: { value: string | null }) {
  if (!value) return <span style={{ color: 'var(--text-tertiary)' }}>--</span>
  const lower = value.toLowerCase()
  let cls = 'badge badge--neutral'
  if (lower.includes('pathogenic')) cls = 'badge badge--risk'
  else if (lower.includes('benign')) cls = 'badge badge--benefit'
  else if (lower.includes('drug response')) cls = 'badge badge--reduced'
  return <span className={cls}>{value.length > 20 ? value.slice(0, 18) + '..' : value}</span>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const columns: ColumnDef<SNP, any>[] = [
  col.accessor('rsid', {
    header: 'RSID',
    cell: info => (
      <span style={{ color: 'var(--primary)', cursor: 'pointer' }}>
        {info.getValue()}
      </span>
    ),
  }),
  col.accessor('gene_symbol', {
    header: 'GENE',
    cell: info => {
      const gene = info.getValue() as string | null
      if (!gene) return <span style={{ color: 'var(--text-tertiary)' }}>--</span>
      return <span style={{ color: 'var(--accent)', fontWeight: 500, fontSize: 'var(--font-size-xs)' }}>{gene}</span>
    },
  }),
  col.accessor('chromosome', { header: 'CHR' }),
  col.accessor('position', {
    header: 'POSITION',
    cell: info => info.getValue().toLocaleString(),
  }),
  col.accessor('genotype', {
    header: 'GENOTYPE',
    cell: info => <ColoredGenotype genotype={info.getValue() as string} />,
  }),
  col.accessor('significance', {
    header: 'CLINICAL',
    cell: info => <SignificanceBadge value={info.getValue()} />,
  }),
  col.accessor('disease', {
    header: 'CONDITION',
    cell: info => {
      const val = info.getValue() as string | null
      if (!val) return <span style={{ color: 'var(--text-tertiary)' }}>--</span>
      const short = val.split(';')[0].trim()
      return (
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}
              title={val}>
          {short.length > 30 ? short.slice(0, 28) + '..' : short}
        </span>
      )
    },
  }),
  col.accessor('source', {
    header: 'SRC',
    cell: info => {
      const src = info.getValue() as string
      const cls = src === 'imputed' ? 'badge badge--reduced' : 'badge badge--neutral'
      return <span className={cls}>{src === 'genotyped' ? 'GEN' : 'IMP'}</span>
    },
  }),
]

interface Props {
  data: SNPResult
  loading: boolean
  totalVariants?: number
  onRowClick?: (snp: SNP) => void
  onPageChange?: (page: number) => void
  onResetFilters?: () => void
  onAskAboutSelected?: (snps: SNP[]) => void
}

export function SNPTable({ data, loading, totalVariants, onRowClick, onPageChange, onResetFilters, onAskAboutSelected }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const lastClickedIndex = useRef<number | null>(null)

  const handleRowClick = useCallback((snp: SNP, index: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedIndex.current !== null) {
      // Shift+click: range select
      const start = Math.min(lastClickedIndex.current, index)
      const end = Math.max(lastClickedIndex.current, index)
      setSelected(prev => {
        const next = new Set(prev)
        for (let i = start; i <= end; i++) {
          next.add(data.items[i].rsid)
        }
        return next
      })
    } else if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl+click: toggle individual
      setSelected(prev => {
        const next = new Set(prev)
        if (next.has(snp.rsid)) {
          next.delete(snp.rsid)
        } else {
          next.add(snp.rsid)
        }
        return next
      })
      lastClickedIndex.current = index
    } else {
      // Normal click: open drawer (existing behavior), clear selection
      if (selected.size > 0) {
        setSelected(new Set())
      }
      onRowClick?.(snp)
      lastClickedIndex.current = index
    }
  }, [data.items, onRowClick, selected.size])

  const selectedSNPs = data.items.filter(s => selected.has(s.rsid))

  const table = useReactTable({
    data: data.items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(data.total / data.limit),
  })

  const totalPages = Math.ceil(data.total / data.limit)

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    className="label"
                    style={{
                      textAlign: 'left',
                      padding: 'var(--space-sm) var(--space-md)',
                      borderBottom: '1px solid var(--border-strong)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>
                  <span className="label">LOADING // SCANNING_VARIANTS...</span>
                </td>
              </tr>
            ) : data.items.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-sm)' }}>
                    <span className="label">0 variants match current filters.</span>
                    {totalVariants != null && totalVariants > 0 && (
                      <span className="label" style={{ color: 'var(--text-tertiary)' }}>
                        {totalVariants.toLocaleString()} variants hidden by filters.
                      </span>
                    )}
                    {onResetFilters && (
                      <button
                        className="btn"
                        style={{ marginTop: 'var(--space-xs)', fontSize: 'var(--font-size-xs)' }}
                        onClick={onResetFilters}
                      >
                        RESET_FILTERS
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, i) => {
                const isSelected = selected.has(row.original.rsid)
                const baseBg = isSelected
                  ? 'color-mix(in srgb, var(--primary) 12%, var(--bg))'
                  : i % 2 === 0 ? 'transparent' : 'var(--bg-raised)'
                return (
                <tr
                  key={row.id}
                  tabIndex={0}
                  role="button"
                  onClick={(e) => handleRowClick(row.original, i, e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onRowClick?.(row.original)
                    }
                  }}
                  style={{
                    cursor: 'pointer',
                    background: baseBg,
                    borderBottom: `1px solid ${isSelected ? 'var(--primary-dim)' : 'var(--border)'}`,
                    borderLeft: isSelected ? '3px solid var(--primary)' : '3px solid transparent',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-inset)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = baseBg }}
                >
                  {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      style={{
                        padding: 'var(--space-sm) var(--space-md)',
                        fontSize: 'var(--font-size-sm)',
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 'var(--space-sm) var(--space-md)',
          background: 'color-mix(in srgb, var(--primary) 8%, var(--bg-raised))',
          borderTop: '1px solid var(--primary-dim)',
          borderBottom: '1px solid var(--primary-dim)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <span className="label" style={{ color: 'var(--primary)' }}>
              {selected.size} SELECTED
            </span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
              {selectedSNPs.map(s => s.gene_symbol || s.rsid).filter(Boolean).join(', ')}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            {onAskAboutSelected && (
              <button
                className="btn btn--accent"
                style={{ fontSize: 'var(--font-size-xs)' }}
                onClick={() => onAskAboutSelected(selectedSNPs)}
              >
                ASK AI ABOUT COMBO
              </button>
            )}
            <button
              className="btn"
              style={{ fontSize: 'var(--font-size-xs)' }}
              onClick={() => setSelected(new Set())}
            >
              CLEAR
            </button>
          </div>
        </div>
      )}

      {/* Pagination */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 'var(--space-md)',
        borderTop: '1px dashed var(--border-dashed)',
      }}>
        <span className="label">
          SHOWING {((data.page - 1) * data.limit) + 1}--{Math.min(data.page * data.limit, data.total)} OF {data.total.toLocaleString()} VARIANTS
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
          <button className="btn" disabled={data.page <= 1} onClick={() => onPageChange?.(data.page - 1)}>
            PREV
          </button>
          <span className="label" style={{ padding: 'var(--space-sm)', lineHeight: '24px' }}>
            {data.page} // {totalPages.toLocaleString()}
          </span>
          <button className="btn" disabled={data.page >= totalPages} onClick={() => onPageChange?.(data.page + 1)}>
            NEXT
          </button>
        </div>
      </div>
    </div>
  )
}
