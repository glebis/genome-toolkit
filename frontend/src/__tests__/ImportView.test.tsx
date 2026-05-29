import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ImportView } from '../components/import/ImportView'

function routeFetch(map: Record<string, () => any>) {
  globalThis.fetch = vi.fn((url: string) => {
    const key = Object.keys(map).find((k) => String(url).includes(k))!
    return Promise.resolve(map[key]())
  }) as any
}

const detectOk = () => ({
  ok: true,
  json: () => Promise.resolve({ provider: '23andme', provider_version: 'v5', assembly: 'GRCh37', confidence: 0.98, estimated_variants: 638000 }),
})
const uploadOk = () => ({
  ok: true,
  json: () => Promise.resolve({ provider: '23andme', version: 'v5', assembly: 'GRCh37', profile_id: '23andme_20260529', imported: 631204, skipped_dup: 6803, skipped_r2: 0, total_input: 638007, dry_run: false }),
})
const historyEmpty = () => ({ ok: true, json: () => Promise.resolve({ imports: [] }) })

function selectFile(name = 'genome.txt') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['rsid\tchrom\tpos\tgenotype\n'], name, { type: 'text/plain' })
  fireEvent.change(input, { target: { files: [file] } })
}

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.restoreAllMocks())

describe('ImportView', () => {
  it('renders the heading and an accessible upload control', async () => {
    routeFetch({ '/api/import/history': historyEmpty })
    render(<ImportView />)
    expect(screen.getByRole('heading', { name: 'Import' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upload genome file/i })).toBeInTheDocument()
  })

  it('shows the detected format after a file is selected', async () => {
    routeFetch({ '/api/import/detect': detectOk, '/api/import/history': historyEmpty })
    render(<ImportView />)
    selectFile()
    await waitFor(() => expect(screen.getByText(/detected format/i)).toBeInTheDocument())
    expect(screen.getByText('23andme')).toBeInTheDocument()
    expect(screen.getByText('GRCh37')).toBeInTheDocument()
  })

  it('imports the file and shows result stats', async () => {
    routeFetch({ '/api/import/detect': detectOk, '/api/import/upload': uploadOk, '/api/import/history': historyEmpty })
    render(<ImportView />)
    selectFile()
    await waitFor(() => expect(screen.getByText(/detected format/i)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /import variants/i }))
    await waitFor(() => expect(screen.getByText(/import complete/i)).toBeInTheDocument())
    expect(screen.getByText('631,204')).toBeInTheDocument()
  })

  it('surfaces a detection error', async () => {
    routeFetch({
      '/api/import/detect': () => ({ ok: false, status: 400, json: () => Promise.resolve({ detail: 'Could not detect a supported genome format.' }) }),
      '/api/import/history': historyEmpty,
    })
    render(<ImportView />)
    selectFile('notes.pdf')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not detect/i))
  })
})
