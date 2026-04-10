interface DashedDividerProps {
  spacing?: string
}

export function DashedDivider({ spacing = '4px 0 24px' }: DashedDividerProps) {
  return (
    <hr style={{
      border: 'none',
      borderTop: '1px dashed var(--border-dashed)',
      margin: spacing,
    }} />
  )
}
