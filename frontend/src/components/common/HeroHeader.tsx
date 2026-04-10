import { GenomeGlyph } from '../GenomeGlyph'

interface HeroHeaderProps {
  title: string
  description: React.ReactNode
  genotypes: string[]
  glyphLabel: string
  children?: React.ReactNode
}

export function HeroHeader({ title, description, genotypes, glyphLabel, children }: HeroHeaderProps) {
  return (
    <div className="hero-header" style={{
      padding: '40px 24px 32px',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      gap: 24,
      alignItems: 'flex-start',
    }}>
      <GenomeGlyph genotypes={genotypes} size={100} label={glyphLabel} />
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: '0.08em',
          fontFamily: 'var(--font-mono)',
          marginBottom: 10,
        }}>
          {title}
        </div>
        <div style={{
          fontSize: 'var(--font-size-md)',
          color: 'var(--text-secondary)',
          lineHeight: 1.7,
          maxWidth: 760,
          fontFamily: 'var(--font-mono)',
        }}>
          {description}
        </div>
        {children}
      </div>
    </div>
  )
}
