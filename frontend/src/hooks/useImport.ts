import { useCallback } from 'react'

export interface DetectResult {
  provider: string
  provider_version: string
  assembly: string
  confidence: number
  estimated_variants: number
}

export interface ImportStats {
  provider: string
  version: string
  assembly: string
  imported: number
  skipped_dup: number
  skipped_r2: number
  total_input: number
  passed_qc?: number
  profile_id: string
  dry_run: boolean
  import_id?: string | null
}

export interface ImportHistoryEntry {
  profile_id: string
  display_name?: string
  provider: string
  provider_version?: string
  assembly: string
  variants: number
  created_at: string
}

export interface UploadOptions {
  profile?: string
  minR2?: number
  dryRun?: boolean
}

/** Throw an Error carrying the server's `detail` message (FastAPI HTTPException). */
async function raiseDetail(resp: Response): Promise<never> {
  let detail = `Request failed (${resp.status})`
  try {
    const body = await resp.json()
    if (body?.detail) detail = body.detail
  } catch {
    /* non-JSON body — keep the generic message */
  }
  throw new Error(detail)
}

/**
 * Thin client for the import endpoints. Returns promise-based helpers; the
 * component owns the UI state so the hook stays trivially testable.
 */
export function useImport() {
  const detect = useCallback(async (file: File): Promise<DetectResult> => {
    const fd = new FormData()
    fd.append('file', file)
    const resp = await fetch('/api/import/detect', { method: 'POST', body: fd })
    if (!resp.ok) return raiseDetail(resp)
    return resp.json()
  }, [])

  const upload = useCallback(async (file: File, opts: UploadOptions = {}): Promise<ImportStats> => {
    const fd = new FormData()
    fd.append('file', file)
    if (opts.profile) fd.append('profile', opts.profile)
    if (opts.minR2 !== undefined) fd.append('min_r2', String(opts.minR2))
    if (opts.dryRun !== undefined) fd.append('dry_run', String(opts.dryRun))
    const resp = await fetch('/api/import/upload', { method: 'POST', body: fd })
    if (!resp.ok) return raiseDetail(resp)
    return resp.json()
  }, [])

  const fetchHistory = useCallback(async (): Promise<ImportHistoryEntry[]> => {
    const resp = await fetch('/api/import/history')
    if (!resp.ok) return []
    const data = await resp.json()
    return data.imports || []
  }, [])

  return { detect, upload, fetchHistory }
}
