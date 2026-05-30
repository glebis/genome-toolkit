import { useRef, useState } from 'react'

interface DropZoneProps {
  onFile: (file: File) => void
  accept?: string
  disabled?: boolean
}

const DEFAULT_ACCEPT = '.txt,.csv,.tsv,.vcf,.gz'

/**
 * Accessible upload control: a real <button> (keyboard + screen-reader friendly)
 * that opens a hidden file input, plus native drag-and-drop.
 */
export function DropZone({ onFile, accept = DEFAULT_ACCEPT, disabled }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)

  return (
    <>
      <button
        type="button"
        className={`import-dropzone${drag ? ' import-dropzone--drag' : ''}`}
        aria-label="Upload genome file. Accepts 23andMe, AncestryDNA, MyHeritage, Genotek, or VCF. Drag a file here or activate to browse."
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          const f = e.dataTransfer.files?.[0]
          if (f) onFile(f)
        }}
      >
        <span className="import-dropzone-glyph" aria-hidden="true">⊕</span>
        <span className="import-dropzone-main">Drag a raw data file here, or click to browse</span>
        <span className="import-dropzone-hint">.txt · .csv · .vcf · .vcf.gz · up to 200 MB</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = '' // allow re-selecting the same file name
        }}
      />
    </>
  )
}
