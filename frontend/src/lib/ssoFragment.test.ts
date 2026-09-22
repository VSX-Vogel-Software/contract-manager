import { describe, it, expect } from 'vitest'
import { readSsoFragment } from './ssoFragment'

describe('readSsoFragment', () => {
  it('reads the tokens of a successful sign-in', () => {
    const result = readSsoFragment('#access_token=abc&refresh_token=def')

    expect(result).toEqual({ kind: 'tokens', accessToken: 'abc', refreshToken: 'def' })
  })

  it('ignores a half-filled token pair', () => {
    // Ohne beide Token liesse sich keine Sitzung aufbauen - lieber nichts tun,
    // als mit halbem Zustand weiterzumachen.
    expect(readSsoFragment('#access_token=abc').kind).toBe('none')
  })

  it('reads a pending two-factor challenge', () => {
    const result = readSsoFragment('#two_factor=chal&method=email')

    expect(result).toEqual({ kind: 'twoFactor', challengeToken: 'chal', method: 'email' })
  })

  it('falls back to an authenticator app when no method is named', () => {
    const result = readSsoFragment('#two_factor=chal')

    expect(result).toMatchObject({ kind: 'twoFactor', method: 'totp' })
  })

  it('distinguishes an outage from a rejection', () => {
    // Daran haengt, ob die Maske den Notweg anbieten darf.
    expect(readSsoFragment('#sso_error=unavailable').kind).toBe('unavailable')
    expect(readSsoFragment('#sso_error=denied').kind).toBe('denied')
  })

  it('keeps the reason of a rejection', () => {
    const result = readSsoFragment('#sso_error=denied&detail=Account+is+blocked')

    expect(result).toEqual({ kind: 'denied', detail: 'Account is blocked' })
  })

  it('treats an unknown error code as a rejection, not an outage', () => {
    // Im Zweifel keinen Notweg anbieten.
    expect(readSsoFragment('#sso_error=something_new').kind).toBe('denied')
  })

  it('says nothing happened for an empty or unrelated fragment', () => {
    expect(readSsoFragment('').kind).toBe('none')
    expect(readSsoFragment('#').kind).toBe('none')
    expect(readSsoFragment('#section-3').kind).toBe('none')
  })

  it('works whether or not the hash sign is included', () => {
    expect(readSsoFragment('access_token=a&refresh_token=b').kind).toBe('tokens')
  })
})
