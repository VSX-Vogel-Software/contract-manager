/**
 * Ursprungs-Link ueber die Anmeldung retten.
 *
 * Wer einen Link oeffnet und erst angemeldet werden muss, landet danach genau
 * dort - mit Tab (`?tab=`) und Sprungziel (`#...`). Der Router-State allein
 * reicht nicht: Die Anmeldung ueber Microsoft verlaesst die Anwendung, und
 * eine abgelaufene Sitzung leitet per Seitenwechsel um. Daher zusaetzlich im
 * sessionStorage (je Browser-Tab, ueberlebt den Umweg ueber Microsoft).
 */
const KEY = 'cm:returnTo'

// Keine Rueckkehr auf Seiten ohne Anmeldung (App.tsx publicRoutes) - sonst Schleife
const PUBLIC_PATHS = ['/login', '/invite', '/reset-password', '/forgot-password', '/setup-2fa', '/signup', '/verify-signup', '/auth']

function isPublicPath(target: string): boolean {
  const path = target.split(/[?#]/)[0]
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))
}

/** Nur relative Pfade innerhalb der Anwendung; alles andere waere eine offene Weiterleitung. */
export function safeReturnTo(target: string | null | undefined): string | null {
  if (!target || !target.startsWith('/')) return null
  // "//host" und "/\host" deuten Browser als fremde Adresse
  if (target.startsWith('//') || target.startsWith('/\\')) return null
  if (isPublicPath(target)) return null
  return target
}

export function rememberReturnTo(target: string): void {
  const safe = safeReturnTo(target)
  if (!safe || safe === '/') return
  try {
    sessionStorage.setItem(KEY, safe)
  } catch {
    // gesperrter Speicher: bleibt der Router-State
  }
}

/** Ziel nach der Anmeldung, ohne es zu verbrauchen (darf im Rendern laufen). */
export function peekReturnTo(fromState?: string | null): string {
  let stored: string | null = null
  try {
    stored = sessionStorage.getItem(KEY)
  } catch {
    // siehe oben
  }
  return safeReturnTo(fromState) ?? safeReturnTo(stored) ?? '/'
}

export function clearReturnTo(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // siehe oben
  }
}

/** `location` -> vollstaendiger Pfad mit Query und Fragment. */
export function locationToPath(loc: { pathname: string; search?: string; hash?: string }): string {
  return `${loc.pathname}${loc.search ?? ''}${loc.hash ?? ''}`
}
