import { useState, useRef, useEffect } from 'react'
import { normalizeDrugName } from '../../hooks/useMyMedications'
import './medications.css'

interface MedicationInputProps {
  allDrugNames: string[]
  selected: string[]
  onAdd: (name: string) => void
  onRemove: (name: string) => void
  onClear: () => void
}

export function MedicationInput({ allDrugNames, selected, onAdd, onRemove, onClear }: MedicationInputProps) {
  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selectedNormalized = new Set(selected.map(normalizeDrugName))

  const suggestions = query.length >= 2
    ? allDrugNames.filter(name =>
        name.toLowerCase().includes(query.toLowerCase()) &&
        !selectedNormalized.has(normalizeDrugName(name))
      ).slice(0, 8)
    : []

  useEffect(() => { setHighlightIndex(-1) }, [query])

  const selectDrug = (name: string) => {
    onAdd(name)
    setQuery('')
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && highlightIndex >= 0 && suggestions[highlightIndex]) {
      e.preventDefault()
      selectDrug(suggestions[highlightIndex])
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="med-input-wrapper">
      <div className="med-input-row">
        <div className="med-input-container">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setShowSuggestions(true) }}
            onFocus={() => query.length >= 2 && setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            placeholder="Add your current medications..."
            className="med-input"
          />

          {showSuggestions && suggestions.length > 0 && (
            <div ref={listRef} className="med-suggestions">
              {suggestions.map((name, i) => (
                <div
                  key={name}
                  role="option"
                  aria-selected={i === highlightIndex}
                  onClick={() => selectDrug(name)}
                  onMouseEnter={() => setHighlightIndex(i)}
                  className="med-suggestion"
                >
                  {name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="med-pills">
          <span className="med-pills-label">My medications:</span>
          {selected.map(name => (
            <span key={name} className="med-pill">
              {name}
              <button
                onClick={() => onRemove(name)}
                className="med-pill-remove"
                aria-label={`Remove ${name}`}
              >
                ×
              </button>
            </span>
          ))}
          <button onClick={onClear} className="btn med-clear-btn">
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
