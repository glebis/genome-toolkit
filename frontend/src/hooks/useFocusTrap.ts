import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  opts?: {
    onEscape?: () => void
    autoFocus?: boolean
    returnFocus?: boolean
  },
): void {
  const previousFocus = useRef<Element | null>(null)
  const autoFocus = opts?.autoFocus ?? true
  const returnFocus = opts?.returnFocus ?? true

  useEffect(() => {
    if (!isOpen) return
    previousFocus.current = document.activeElement
    if (autoFocus) {
      const first = containerRef.current?.querySelector<HTMLElement>(FOCUSABLE)
      first?.focus()
    }
  }, [isOpen, autoFocus, containerRef])

  useEffect(() => {
    if (isOpen) return
    if (returnFocus && previousFocus.current instanceof HTMLElement) {
      previousFocus.current.focus()
      previousFocus.current = null
    }
  }, [isOpen, returnFocus])

  useEffect(() => {
    if (!isOpen) return
    const container = containerRef.current
    if (!container) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') opts?.onEscape?.()
    }

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first || !container.contains(document.activeElement)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last || !container.contains(document.activeElement)) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    window.addEventListener('keydown', handleEscape)
    container.addEventListener('keydown', handleTab)
    return () => {
      window.removeEventListener('keydown', handleEscape)
      container.removeEventListener('keydown', handleTab)
    }
  }, [isOpen, containerRef, opts?.onEscape])
}
