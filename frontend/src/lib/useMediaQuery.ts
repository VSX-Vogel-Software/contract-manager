import { useSyncExternalStore } from 'react'

/** Ab dieser Breite steht die feste Seitenleiste (Tailwind `lg`). */
export const DESKTOP_QUERY = '(min-width: 1024px)'
/** Geraete ohne Mauszeiger: Telefon, Tablet. */
export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}

export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY)
export const useIsTouch = () => useMediaQuery(TOUCH_QUERY)
