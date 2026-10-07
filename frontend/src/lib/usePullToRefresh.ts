import { useEffect, useRef, useState, type RefObject } from 'react'

/** Zugweg (nach Daempfung), ab dem Loslassen neu laedt. */
export const PULL_THRESHOLD = 64
const PULL_MAX = 96
/** Fingerweg wird halbiert - fuehlt sich wie die Browser-Geste an. */
const DAMPING = 0.5
/** Kreisel mindestens so lange zeigen, sonst wirkt es wie ein Flackern. */
const MIN_SPIN_MS = 500

export interface PullState {
  /** Aktueller Zugweg in px (0 = nichts zu sehen) */
  distance: number
  refreshing: boolean
}

/** Ein Element zwischen Ziel und Container scrollt selbst und steht nicht oben. */
function scrolledAncestor(target: EventTarget | null, container: HTMLElement): boolean {
  let el = target instanceof Element ? target : null
  while (el && el !== container) {
    if (el instanceof HTMLElement && el.scrollTop > 0 && el.scrollHeight > el.clientHeight) return true
    el = el.parentElement
  }
  return false
}

function isEditable(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable="true"]')
}

/**
 * Runterziehen zum Neuladen fuer einen eigenen Scroll-Container.
 *
 * Die Browser-Geste greift nur, wenn das ganze Dokument scrollt. Im Layout
 * scrollt aber nur <main> (Kopfleiste und Seitenleiste stehen), deshalb hier
 * selbst: am Seitenanfang senkrecht nach unten ziehen, loslassen ueber der
 * Schwelle -> `onRefresh`. Waagerechte Wischer (Tabellen) und Container, die
 * selbst gescrollt sind, loesen nichts aus.
 */
export function usePullToRefresh(
  containerRef: RefObject<HTMLElement>,
  onRefresh: () => Promise<unknown>,
  enabled = true
): PullState {
  const [state, setState] = useState<PullState>({ distance: 0, refreshing: false })
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    const container = containerRef.current
    if (!container || !enabled) return

    let startX = 0
    let startY = 0
    // null = noch unentschieden, true = zieht, false = verworfen
    let pulling: boolean | null = false
    let distance = 0
    let refreshing = false

    const reset = () => {
      pulling = false
      distance = 0
      setState((s) => (s.distance === 0 ? s : { ...s, distance: 0 }))
    }

    const onStart = (e: TouchEvent) => {
      if (refreshing || e.touches.length !== 1) return
      if (container.scrollTop > 0 || scrolledAncestor(e.target, container) || isEditable(e.target)) {
        pulling = false
        return
      }
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      pulling = null
      distance = 0
    }

    const onMove = (e: TouchEvent) => {
      if (pulling === false) return
      if (e.touches.length !== 1) return reset()
      const dx = e.touches[0].clientX - startX
      const dy = e.touches[0].clientY - startY
      if (pulling === null) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          pulling = false
          return
        }
        if (dy < -8) {
          pulling = false
          return
        }
        if (dy <= 8) return
        pulling = true
      }
      if (container.scrollTop > 0) return reset()
      // Seite steht oben und der Finger zieht nach unten: kein Scrollen/Federn
      if (e.cancelable) e.preventDefault()
      distance = Math.max(0, Math.min(PULL_MAX, (dy - 8) * DAMPING))
      setState((s) => ({ ...s, distance }))
    }

    const onEnd = () => {
      if (!pulling) {
        pulling = false
        return
      }
      if (distance < PULL_THRESHOLD) return reset()
      pulling = false
      refreshing = true
      setState({ distance: PULL_THRESHOLD, refreshing: true })
      const started = Date.now()
      onRefreshRef
        .current()
        .catch(() => {})
        .then(() => new Promise((r) => setTimeout(r, Math.max(0, MIN_SPIN_MS - (Date.now() - started)))))
        .then(() => {
          refreshing = false
          distance = 0
          setState({ distance: 0, refreshing: false })
        })
    }

    container.addEventListener('touchstart', onStart, { passive: true })
    container.addEventListener('touchmove', onMove, { passive: false })
    container.addEventListener('touchend', onEnd)
    container.addEventListener('touchcancel', reset)
    return () => {
      container.removeEventListener('touchstart', onStart)
      container.removeEventListener('touchmove', onMove)
      container.removeEventListener('touchend', onEnd)
      container.removeEventListener('touchcancel', reset)
    }
  }, [containerRef, enabled])

  return state
}
