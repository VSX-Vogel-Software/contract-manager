import { useCallback, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

interface UrlTabOptions {
  /**
   * Letzte Wahl je Browser merken (localStorage, gleiches Format wie
   * usePersistedState). Mit Schluessel steht der Tab immer in der Adresse -
   * auch der Standard -, damit ein geteilter Link beim Empfaenger nicht auf
   * dessen gemerkten Tab faellt.
   */
  storageKey?: string
  /** Parameter abhaengiger Unter-Tabs, die beim Wechsel entfallen. */
  resets?: string[]
  /** Alte Links der Form `#<tab>` (vor ?tab=) weiter annehmen. */
  legacyHash?: boolean
}

function readStored(key: string | undefined): string | null {
  if (!key) return null
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as string)
  } catch {
    return null
  }
}

function writeStored(key: string | undefined, value: string) {
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Speicher voll oder gesperrt - der Tab steht ja in der Adresse
  }
}

function toSearch(params: URLSearchParams) {
  const s = params.toString()
  return s ? `?${s}` : ''
}

/**
 * Aktiven Tab in einem Query-Parameter halten, damit jede Ansicht - auch
 * verschachtelte Tabs - per Adresse verlinkbar ist und Zurueck funktioniert.
 *
 * `values` sind die Tabs, die der Nutzer gerade sehen darf; ein unbekannter
 * oder nicht erlaubter Wert in der Adresse faellt auf `fallback` zurueck.
 */
export function useUrlTab<T extends string>(
  param: string,
  values: readonly T[],
  fallback: T,
  options: UrlTabOptions = {},
): [T, (value: T) => void] {
  const { storageKey, resets, legacyHash } = options
  const location = useLocation()
  const navigate = useNavigate()

  const isValid = (v: string | null): v is T => v !== null && (values as readonly string[]).includes(v)

  const params = new URLSearchParams(location.search)
  const fromUrl = params.get(param)
  const hashValue = legacyHash ? decodeURIComponent(location.hash.slice(1)) : null
  const fromHash = !isValid(fromUrl) && isValid(hashValue) ? hashValue : null
  const stored = readStored(storageKey)

  const active: T = isValid(fromUrl) ? fromUrl : fromHash ?? (isValid(stored) ? stored : fallback)
  const wanted = active === fallback && !storageKey ? null : active

  // Adresse an den sichtbaren Stand angleichen (gemerkter Tab, alter #-Link),
  // ohne History-Eintrag. Einen unbekannten Wert laesst sie stehen: Tabs, die
  // von nachgeladenen Daten abhaengen, waeren sonst beim ersten Rendern weg.
  useEffect(() => {
    if (!fromHash && !(fromUrl === null && wanted !== null)) return
    const next = new URLSearchParams(location.search)
    if (wanted === null) next.delete(param)
    else next.set(param, wanted)
    navigate(
      { pathname: location.pathname, search: toSearch(next), hash: fromHash ? '' : location.hash },
      { replace: true, state: location.state },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUrl, wanted, fromHash])

  const setActive = useCallback(
    (value: T) => {
      writeStored(storageKey, value)
      const next = new URLSearchParams(location.search)
      if (value === fallback && !storageKey) next.delete(param)
      else next.set(param, value)
      resets?.forEach((p) => next.delete(p))
      if (next.toString() === new URLSearchParams(location.search).toString()) return
      // Sprungziel (#...) gehoerte zur alten Ansicht
      navigate({ pathname: location.pathname, search: toSearch(next) })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [location.pathname, location.search, param, fallback, storageKey, resets?.join(',')],
  )

  return [active, setActive]
}
