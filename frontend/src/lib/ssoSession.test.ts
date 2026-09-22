import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { clearSsoSession, isSsoSession, markSsoSession } from './ssoSession'

describe('ssoSession', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('remembers a session that came from the directory', () => {
    markSsoSession()

    expect(isSsoSession()).toBe(true)
  })

  it('says no without a mark', () => {
    expect(isSsoSession()).toBe(false)
  })

  it('forgets on sign-out', () => {
    markSsoSession()

    clearSsoSession()

    expect(isSsoSession()).toBe(false)
  })

  describe('gesperrter Speicher', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('does not throw when storage is unavailable', () => {
      // Privater Modus, geblockte Cookies: der Zugriff wirft.
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('denied')
      })
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('denied')
      })

      expect(() => markSsoSession()).not.toThrow()
      expect(isSsoSession()).toBe(false)
    })
  })
})
