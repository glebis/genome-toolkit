import { ExportButton } from './ExportButton'

interface ExportBarProps {
  onExport: (format: string) => void
  items?: { format: string; label: string; accent?: boolean }[]
}

const DEFAULT_ITEMS = [
  { format: 'pdf', label: 'Export PDF', accent: false },
  { format: 'md', label: 'Export MD', accent: false },
  { format: 'doctor', label: 'Print for doctor', accent: true },
]

export function ExportBar({ onExport, items = DEFAULT_ITEMS }: ExportBarProps) {
  return (
    <div
      className="export-buttons"
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 6,
        paddingTop: 12,
        borderTop: '1px dashed var(--border-dashed)',
      }}
    >
      {items.map(({ format, label, accent }) => (
        <ExportButton
          key={format}
          label={label}
          accent={accent}
          onClick={() => onExport(format)}
        />
      ))}
    </div>
  )
}
