/**
 * Auswertung des URL-Fragments, mit dem der Rueckkanal zurueckkommt.
 *
 * Das Backend haengt sein Ergebnis an `/login#...`. Das Fragment schickt der
 * Browser weder an Server noch in Zugriffsprotokolle - anders als ein
 * Query-Parameter, der in jedem Zugriffslog stuende.
 */

export type SsoOutcome =
  | { kind: 'none' }
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'twoFactor'; challengeToken: string; method: string }
  /** Verzeichnis technisch nicht erreichbar - nur hier den Notweg anbieten. */
  | { kind: 'unavailable' }
  /** Abgelehnt: gesperrtes Konto, unbekannter Benutzer, kaputtes Token. */
  | { kind: 'denied'; detail?: string }

export function readSsoFragment(hash: string): SsoOutcome {
  const params = new URLSearchParams(hash.replace(/^#/, ''))

  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (accessToken && refreshToken) {
    return { kind: 'tokens', accessToken, refreshToken }
  }

  const challengeToken = params.get('two_factor')
  if (challengeToken) {
    return { kind: 'twoFactor', challengeToken, method: params.get('method') || 'totp' }
  }

  const error = params.get('sso_error')
  if (error === 'unavailable') return { kind: 'unavailable' }
  if (error) return { kind: 'denied', detail: params.get('detail') || undefined }

  return { kind: 'none' }
}

/** Entfernt das Fragment aus der Adresszeile, ohne die Seite neu zu laden. */
export function clearFragment(): void {
  if (typeof window === 'undefined' || !window.location.hash) return
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}
