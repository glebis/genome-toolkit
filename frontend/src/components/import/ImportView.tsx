import { useEffect, useRef, useState } from 'react'
import { useImport, type DetectResult, type ImportStats, type ImportHistoryEntry } from '../../hooks/useImport'
import { DropZone } from './DropZone'
import './import.css'

type Phase = 'idle' | 'detecting' | 'detected' | 'importing' | 'done' | 'error'

interface ImportViewProps {
  /** Called after a successful (non-dry-run) import — e.g. to refresh global stats. */
  onImported?: (stats: ImportStats) => void
  /** Navigate to the SNP browser after import. */
  onGoToBrowser?: () => void
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function ImportView({ onImported, onGoToBrowser }: ImportViewProps) {
  const { detect, upload, fetchHistory } = useImport()
  const [phase, setPhase] = useState<Phase>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [detection, setDetection] = useState<DetectResult | null>(null)
  const [result, setResult] = useState<ImportStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState('')
  const [minR2, setMinR2] = useState(0.3)
  const [dryRun, setDryRun] = useState(false)
  const [history, setHistory] = useState<ImportHistoryEntry[]>([])
  const statusRef = useRef<HTMLHeadingElement>(null)

  const loadHistory = () => { fetchHistory().then(setHistory).catch(() => {}) }
  useEffect(() => { loadHistory() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Move focus to the result/error heading so screen-reader users land on the outcome.
  useEffect(() => {
    if ((phase === 'done' || phase === 'error') && statusRef.current) statusRef.current.focus()
  }, [phase])

  const isVcf = detection?.provider === 'vcf' || detection?.provider === 'nebula'

  async function handleFile(f: File) {
    setFile(f)
    setError(null)
    setResult(null)
    setDetection(null)
    setProfile('')
    setPhase('detecting')
    try {
      const info = await detect(f)
      setDetection(info)
      setPhase('detected')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not detect the file format.')
      setPhase('error')
    }
  }

  async function handleImport() {
    if (!file) return
    setPhase('importing')
    setError(null)
    try {
      const stats = await upload(file, { profile: profile.trim() || undefined, minR2, dryRun })
      setResult(stats)
      setPhase('done')
      if (!stats.dry_run) {
        loadHistory()
        onImported?.(stats)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
      setPhase('error')
    }
  }

  function reset() {
    setFile(null)
    setDetection(null)
    setResult(null)
    setError(null)
    setProfile('')
    setPhase('idle')
  }

  const showDropzone = phase === 'idle' || phase === 'detecting' || phase === 'error'

  return (
    <main className="import-view">
      <div className="hero-header import-hero">
        <div className="import-hero-glyph" aria-hidden="true">↥</div>
        <div>
          <h1 className="import-hero-title">Import</h1>
          <p className="import-hero-sub">
            Add genome data from 23andMe, AncestryDNA, MyHeritage, Genotek, Nebula, or a VCF file.
            Your file is processed locally and never leaves this machine.
          </p>
        </div>
      </div>

      <div className="info-callout import-callout">
        <span aria-hidden="true">ℹ</span>
        <span>
          Supported: <strong>23andMe</strong> / <strong>AncestryDNA</strong> raw <code>.txt</code>,{' '}
          <strong>MyHeritage</strong> / <strong>Genotek</strong> <code>.csv</code>, and{' '}
          <strong>VCF</strong> <code>.vcf</code> / <code>.vcf.gz</code> (including imputed). The
          format is detected automatically — you'll see a preview before anything is imported.
        </span>
      </div>

      {showDropzone && (
        <DropZone onFile={handleFile} disabled={phase === 'detecting'} />
      )}

      {phase === 'detecting' && (
        <p className="import-status" aria-live="polite">Detecting format<span className="import-blink">…</span></p>
      )}

      {phase === 'error' && error && (
        <div className="import-danger" role="alert">
          <h2 ref={statusRef} tabIndex={-1} className="import-danger-title">Import couldn’t continue</h2>
          {error}
        </div>
      )}

      {phase === 'detected' && detection && file && (
        <section className="import-card" aria-label="Detected format and options">
          <div className="import-card-head">
            <span className="label label--accent">Detected format</span>
            <span className="badge badge--benefit">✓ Recognized</span>
          </div>
          <dl className="import-kv">
            <dt>File</dt><dd>{file.name} · {formatBytes(file.size)}</dd>
            <dt>Provider</dt><dd>{detection.provider}</dd>
            <dt>Version</dt><dd>{detection.provider_version}</dd>
            <dt>Assembly</dt><dd>{detection.assembly}</dd>
            <dt>Confidence</dt><dd>{Math.round(detection.confidence * 100)}%</dd>
            <dt>Est. variants</dt><dd>~{detection.estimated_variants.toLocaleString()}</dd>
          </dl>

          <hr className="separator separator--dashed" />

          <div className="import-field">
            <label className="label" htmlFor="import-profile">Profile name (optional)</label>
            <input
              id="import-profile"
              className="input"
              placeholder={`${detection.provider}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')} (auto)`}
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
            />
          </div>

          {isVcf && (
            <div className="import-field">
              <label className="label" htmlFor="import-r2">Minimum r² (imputed VCF only)</label>
              <div className="import-range-row">
                <input
                  id="import-r2"
                  type="range" min={0} max={1} step={0.05} value={minR2}
                  aria-describedby="import-r2-help"
                  onChange={(e) => setMinR2(Number(e.target.value))}
                />
                <span className="import-range-val">{minR2.toFixed(2)}</span>
                <span id="import-r2-help" className="import-muted">
                  variants below this imputation quality are skipped
                </span>
              </div>
            </div>
          )}

          <label className="import-check">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            Dry run — validate &amp; preview only, import nothing
          </label>

          <div className="import-actions">
            <button className="btn btn--accent" onClick={handleImport}>Import variants</button>
            <button className="btn" onClick={reset}>Choose another file</button>
          </div>
        </section>
      )}

      {phase === 'importing' && (
        <section className="import-card" aria-live="polite">
          <span className="label label--primary">Importing</span>
          <p className="import-status">
            Parsing and writing variants<span className="import-blink">…</span><br />
            <span className="import-muted">Large files can take up to a minute. You can keep this tab open.</span>
          </p>
        </section>
      )}

      {phase === 'done' && result && (
        <section className="import-card" aria-live="polite">
          <div className="import-card-head">
            <span className="label label--accent">Summary</span>
            <span className="badge badge--benefit">✓ {result.profile_id}</span>
          </div>
          <h2 ref={statusRef} tabIndex={-1} className="import-result-title">
            {result.dry_run ? 'Dry run complete' : 'Import complete'}
          </h2>
          <div className="import-result-grid">
            <div className="import-stat"><div className="v ok">{result.imported.toLocaleString()}</div><div className="k">Imported</div></div>
            <div className="import-stat"><div className="v dim">{result.skipped_dup.toLocaleString()}</div><div className="k">Duplicates skipped</div></div>
            <div className="import-stat"><div className="v dim">{result.skipped_r2.toLocaleString()}</div><div className="k">Low r² skipped</div></div>
            <div className="import-stat"><div className="v">{result.total_input.toLocaleString()}</div><div className="k">Total in file</div></div>
          </div>
          <div className="import-actions">
            {onGoToBrowser && !result.dry_run && (
              <button className="btn btn--accent" onClick={onGoToBrowser}>Go to SNP Browser</button>
            )}
            <button className="btn" onClick={reset}>Import another file</button>
          </div>
        </section>
      )}

      <h2 className="label import-history-label">Import history</h2>
      {history.length === 0 ? (
        <p className="import-muted">No imports yet.</p>
      ) : (
        <table className="import-history">
          <caption className="import-muted import-history-caption">Previously imported profiles</caption>
          <thead>
            <tr><th>Profile</th><th>Provider</th><th>Assembly</th><th>Variants</th><th>Imported</th></tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.profile_id}>
                <td>{h.profile_id}</td>
                <td>{h.provider}{h.provider_version ? ` ${h.provider_version}` : ''}</td>
                <td>{h.assembly}</td>
                <td>{(h.variants ?? 0).toLocaleString()}</td>
                <td>{h.created_at ? String(h.created_at).slice(0, 10) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
