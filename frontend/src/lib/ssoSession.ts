/**
 * Merkt, ob die laufende Sitzung ueber das Verzeichnis entstanden ist.
 *
 * Davon haengt ab, ob das Abmelden die Wahl anbietet, auch die Sitzung bei
 * Microsoft zu beenden. Nach einer Passwort-Anmeldung waere die Frage sinnlos.
 */
const KEY = 'sso_session'

export function markSsoSession(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Privater Modus oder gesperrter Speicher: dann eben ohne Markierung.
  }
}

export function isSsoSession(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function clearSsoSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // siehe oben
  }
}
