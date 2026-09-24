import { useCallback, useEffect, useRef, useState } from 'react'

/** Wartezeit, bevor am Listenende von selbst nachgeladen wird. */
export const AUTO_LOAD_DELAY_MS = 2000

/**
 * Nach so vielen automatischen Runden ist Schluss. Ohne diese Grenze zieht
 * ein liegengelassener Tab die ganze Tabelle in den Browser.
 */
export const AUTO_LOAD_MAX_ROUNDS = 5

export type AutoLoadStatus =
  /** Nichts zu tun: nichts mehr da, lädt gerade, oder Listenende ausser Sicht. */
  | 'idle'
  /** Listenende im Blick, die Wartezeit läuft. */
  | 'armed'
  /** Angehalten - vom Benutzer oder weil die Grenze erreicht ist. */
  | 'paused'

interface UseAutoLoadMoreOptions {
  /** Ob überhaupt nachgeladen werden kann (weitere Seite da, gerade kein Ladevorgang). */
  enabled: boolean
  /** Lädt die nächste Seite. */
  onLoadMore: () => void
  /**
   * Ändert sich dieser Wert, beginnt die Zählung von vorn - etwa wenn ein
   * Filter wechselt und die Liste wieder kurz ist. Eine vom Benutzer
   * angehaltene Automatik bleibt angehalten; das war seine Entscheidung.
   */
  resetKey?: unknown
  delayMs?: number
  maxRounds?: number
}

/**
 * Lädt am Listenende nach einer Wartezeit von selbst nach.
 *
 * Angehalten wird über den Knopf, der die Wartezeit anzeigt: das Bedienelement,
 * das stört, ist genau das, auf das man klickt.
 */
export function useAutoLoadMore({
  enabled,
  onLoadMore,
  resetKey,
  delayMs = AUTO_LOAD_DELAY_MS,
  maxRounds = AUTO_LOAD_MAX_ROUNDS,
}: UseAutoLoadMoreOptions) {
  const [pausiert, setPausiert] = useState(false)
  const [runden, setRunden] = useState(0)
  const [endeSichtbar, setEndeSichtbar] = useState(false)

  // Callback-Ref statt fester Referenz: das Listenende wird erst gerendert,
  // wenn Daten da sind. Eine Referenz, die einmalig beim Einhaengen gelesen
  // wird, waere zu diesem Zeitpunkt noch leer.
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null)
  const sentinelRef = useCallback((knoten: HTMLElement | null) => {
    setSentinel(knoten)
  }, [])

  // Der Aufrufer baut die Funktion bei jedem Rendern neu; über die Referenz
  // bleibt der Wartelauf davon unberührt.
  const onLoadMoreRef = useRef(onLoadMore)
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore
  })

  useEffect(() => {
    if (!sentinel || typeof IntersectionObserver === 'undefined') {
      setEndeSichtbar(false)
      return
    }

    const beobachter = new IntersectionObserver(
      (eintraege) => setEndeSichtbar(eintraege.some((e) => e.isIntersecting)),
      { rootMargin: '0px' }
    )
    beobachter.observe(sentinel)
    return () => beobachter.disconnect()
  }, [sentinel])

  // Neuer Filter, neue Liste: die Zählung beginnt von vorn.
  useEffect(() => {
    setRunden(0)
  }, [resetKey])

  const erschoepft = runden >= maxRounds
  const laeuft = enabled && !pausiert && !erschoepft && endeSichtbar

  useEffect(() => {
    if (!laeuft) return
    const uhr = setTimeout(() => {
      setRunden((r) => r + 1)
      onLoadMoreRef.current()
    }, delayMs)
    return () => clearTimeout(uhr)
  }, [laeuft, delayMs, runden])

  const pause = useCallback(() => setPausiert(true), [])

  const resume = useCallback(() => {
    setPausiert(false)
    setRunden(0)
  }, [])

  const status: AutoLoadStatus =
    pausiert || erschoepft ? 'paused' : laeuft ? 'armed' : 'idle'

  return { sentinelRef, status, pause, resume }
}
