import { describe, it, expect, beforeEach } from 'vitest'
import { clearReturnTo, peekReturnTo, rememberReturnTo, safeReturnTo } from './returnTo'

describe('returnTo', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('behaelt Tab und Sprungziel', () => {
    rememberReturnTo('/contracts/5?tab=todos#todo-4')
    expect(peekReturnTo()).toBe('/contracts/5?tab=todos#todo-4')
  })

  it('Router-State hat Vorrang vor dem Speicher', () => {
    rememberReturnTo('/customers/1')
    expect(peekReturnTo('/contracts/2?tab=items')).toBe('/contracts/2?tab=items')
  })

  it('verbraucht das Ziel erst mit clearReturnTo', () => {
    rememberReturnTo('/invoices/3')
    expect(peekReturnTo()).toBe('/invoices/3')
    expect(peekReturnTo()).toBe('/invoices/3')
    clearReturnTo()
    expect(peekReturnTo()).toBe('/')
  })

  it('laesst keine fremden Adressen durch', () => {
    expect(safeReturnTo('https://evil.example/')).toBeNull()
    expect(safeReturnTo('//evil.example/x')).toBeNull()
    expect(safeReturnTo('/\\evil.example')).toBeNull()
    expect(safeReturnTo('javascript:alert(1)')).toBeNull()
  })

  it('kehrt nie auf Anmeldeseiten zurueck', () => {
    expect(safeReturnTo('/login')).toBeNull()
    expect(safeReturnTo('/login/local?x=1')).toBeNull()
    expect(safeReturnTo('/setup-2fa')).toBeNull()
    expect(safeReturnTo('/reset-password/abc')).toBeNull()
    // aehnlich klingende App-Seiten bleiben erlaubt
    expect(safeReturnTo('/logins-report')).toBe('/logins-report')
    rememberReturnTo('/login#sso')
    expect(peekReturnTo()).toBe('/')
  })
})
