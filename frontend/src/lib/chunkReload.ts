/**
 * Nachladefehler von Code-Chunks abfangen.
 *
 * Nach einem Deploy verweist eine noch offene Seite auf Chunk-Dateien mit
 * alten Hashes, die der Server nicht mehr hat. Statt einer weissen Seite
 * laedt die App dann einmal neu und holt sich so die aktuelle index.html.
 * Eine Sperre in sessionStorage verhindert eine Endlosschleife, falls der
 * Chunk auch nach dem Neuladen fehlt (z. B. Server weg) - dann zeigt die
 * ErrorBoundary einen Knopf zum Neuladen.
 */

const RELOAD_KEY = 'chunkReloadAt'
/** Innerhalb dieses Fensters nach einem automatischen Neuladen nicht noch einmal */
const RELOAD_GUARD_MS = 30_000

const CHUNK_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module', // Chromium
  'error loading dynamically imported module', // Firefox
  'Importing a module script failed', // Safari
  'Unable to preload CSS', // Vite
  'ChunkLoadError',
]

let reloading = false

/** Laeuft schon ein automatisches Neuladen? Dann keinen Fehlerhinweis zeigen. */
export function isReloading(): boolean {
  return reloading
}

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false
  const name = (error as { name?: string }).name ?? ''
  const message = (error as { message?: string }).message ?? String(error)
  return CHUNK_ERROR_PATTERNS.some((p) => message.includes(p) || name.includes(p))
}

/**
 * Laedt die Seite neu, sofern das nicht gerade erst passiert ist.
 * Gibt `true` zurueck, wenn neu geladen wird.
 */
export function reloadOnceForChunkError(): boolean {
  let last = 0
  try {
    last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
  } catch {
    // sessionStorage gesperrt: lieber nicht automatisch neu laden
    return false
  }
  if (Date.now() - last < RELOAD_GUARD_MS) return false
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    return false
  }
  reloading = true
  window.location.reload()
  return true
}
