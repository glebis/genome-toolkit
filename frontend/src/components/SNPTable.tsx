import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type ColumnDef,
} from '@tanstack/react-table'
import type { SNP, SNPResult } from '../hooks/useSNPs'

const col = createColumnHelper<SNP>()

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
  col.accessor('chromosome', { header: 'CHR' }),
  col.accessor('position', {
    header: 'POSITION',
    cell: info => info.getValue().toLocaleString(),
  }),
  col.accessor('genotype', {
    header: 'GENOTYPE',
    cell: info => <span style={{ fontWeight: 500 }}>{info.getValue()}</span>,
  }),
  col.accessor('source', {
    header: 'SOURCE',
    cell: info => {
      const src = info.getValue() as string
      const cls = src === 'imputed' ? 'badge badge--reduced' : 'badge badge--neutral'
      return <span className={cls}>{src.toUpperCase()}</span>
    },
  }),
]

interface Props {
  data: SNPResult
  loading: boolean
  onRowClick?: (snp: SNP) => void
  onPageChange?: (page: number) => void
}

export function SNPTable({ data, loading, onRowClick, onPageChange }: Props) {
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
                  <span className="label">NO_SIGNAL // NO_VARIANTS_FOUND</span>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, i) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  style={{
                    cursor: onRowClick ? 'pointer' : 'default',
                    background: i % 2 === 0 ? 'transparent' : 'var(--bg-raised)',
                    borderBottom: '1px solid var(--border)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-inset)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--bg-raised)' }}
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
              ))
            )}
          </tbody>
        </table>
      </div>

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
