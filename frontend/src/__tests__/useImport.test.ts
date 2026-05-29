import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useImport } from '../hooks/useImport'

function mockFetchByUrl(handlers: Record<string, any>) {
  globalThis.fetch = vi.fn((url: string) => {
    const key = Object.keys(handlers).find((k) => String(url).includes(k))
    const h = handlers[key as string]
    return Promise.resolve(h)
  }) as any
}

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.restoreAllMocks())

describe('useImport', () => {
  it('detect() POSTs the file and returns the detection result', async () => {
    mockFetchByUrl({
      '/api/import/detect': {
        ok: true,
        json: () => Promise.resolve({ provider: '23andme', provider_version: 'v5', assembly: 'GRCh37', confidence: 0.98, estimated_variants: 638000 }),
      },
    })
    const { result } = renderHook(() => useImport())
    const file = new File(['rsid\tchr\tpos\tgt\n'], 'g.txt', { type: 'text/plain' })
    const info = await result.current.detect(file)

    expect(info.provider).toBe('23andme')
    expect(info.estimated_variants).toBe(638000)
    const [url, opts] = (globalThis.fetch as any).mock.calls[0]
    expect(String(url)).toContain('/api/import/detect')
    expect(opts.method).toBe('POST')
    expect(opts.body).toBeInstanceOf(FormData)
  })

  it('detect() throws with the server message on error', async () => {
    mockFetchByUrl({
      '/api/import/detect': { ok: false, status: 400, json: () => Promise.resolve({ detail: 'Could not detect a supported genome format.' }) },
    })
    const { result } = renderHook(() => useImport())
    const file = new File(['nope'], 'x.pdf', { type: 'application/pdf' })
    await expect(result.current.detect(file)).rejects.toThrow(/Could not detect/)
  })

  it('upload() sends profile, min_r2 and dry_run as form fields', async () => {
    mockFetchByUrl({
      '/api/import/upload': {
        ok: true,
        json: () => Promise.resolve({ profile_id: 'alice', imported: 631204, skipped_dup: 0, skipped_r2: 0, dry_run: false }),
      },
    })
    const { result } = renderHook(() => useImport())
    const file = new File(['data'], 'g.txt', { type: 'text/plain' })
    const stats = await result.current.upload(file, { profile: 'alice', minR2: 0.5, dryRun: true })

    expect(stats.profile_id).toBe('alice')
    const [, opts] = (globalThis.fetch as any).mock.calls[0]
    const body = opts.body as FormData
    expect(body.get('profile')).toBe('alice')
    expect(body.get('min_r2')).toBe('0.5')
    expect(body.get('dry_run')).toBe('true')
  })

  it('upload() throws the server detail on 409', async () => {
    mockFetchByUrl({
      '/api/import/upload': { ok: false, status: 409, json: () => Promise.resolve({ detail: "A profile named 'alice' already exists." }) },
    })
    const { result } = renderHook(() => useImport())
    const file = new File(['data'], 'g.txt', { type: 'text/plain' })
    await expect(result.current.upload(file, { profile: 'alice' })).rejects.toThrow(/already exists/)
  })

  it('fetchHistory() returns the imports array', async () => {
    mockFetchByUrl({
      '/api/import/history': {
        ok: true,
        json: () => Promise.resolve({ imports: [{ profile_id: 'alice', provider: '23andme', variants: 631204, assembly: 'GRCh37', created_at: '2026-05-29' }] }),
      },
    })
    const { result } = renderHook(() => useImport())
    const list = await result.current.fetchHistory()
    expect(list).toHaveLength(1)
    expect(list[0].profile_id).toBe('alice')
  })
})
