import { describe, it, expect, beforeEach, vi } from 'vitest'
import { handleApolloError } from './apolloErrors'
import { getToasts, resetToasts } from './toastStore'

function operation(context: Record<string, unknown> = {}) {
  return { operationName: 'TestOp', getContext: () => context }
}

describe('handleApolloError', () => {
  beforeEach(() => {
    resetToasts()
    localStorage.clear()
  })

  it('shows a GraphQL error the user would otherwise never see', () => {
    handleApolloError({
      graphQLErrors: [{ message: 'Failed to send email: 403 Forbidden' }],
      operation: operation(),
    })

    expect(getToasts()).toHaveLength(1)
    expect(getToasts()[0].description).toContain('Failed to send email: 403 Forbidden')
    expect(getToasts()[0].variant).toBe('error')
  })

  it('shows a network error, which today looks like nothing happened', () => {
    handleApolloError({
      networkError: new Error('Failed to fetch'),
      operation: operation(),
    })

    expect(getToasts()).toHaveLength(1)
  })

  it('stays silent when the caller handles the error itself', () => {
    // Formularfehler gehoeren ans Feld. Wer sie dort anzeigt, setzt das Flag,
    // sonst steht dieselbe Meldung zweimal auf dem Schirm.
    handleApolloError({
      graphQLErrors: [{ message: 'Invoice number already exists' }],
      operation: operation({ suppressErrorToast: true }),
    })

    expect(getToasts()).toHaveLength(0)
  })

  it('redirects on an auth error instead of toasting', () => {
    localStorage.setItem('auth_token', 'abc')
    const redirect = vi.fn()

    handleApolloError({
      graphQLErrors: [{ message: 'Authentication required' }],
      operation: operation(),
      redirectToLogin: redirect,
    })

    expect(redirect).toHaveBeenCalledOnce()
    expect(getToasts()).toHaveLength(0)
    expect(localStorage.getItem('auth_token')).toBeNull()
  })

  it('does not redirect when there is no token to begin with', () => {
    const redirect = vi.fn()

    handleApolloError({
      graphQLErrors: [{ message: 'Authentication required' }],
      operation: operation(),
      redirectToLogin: redirect,
    })

    expect(redirect).not.toHaveBeenCalled()
  })

  it('joins several messages into one toast', () => {
    handleApolloError({
      graphQLErrors: [{ message: 'Erster Fehler' }, { message: 'Zweiter Fehler' }],
      operation: operation(),
    })

    expect(getToasts()).toHaveLength(1)
    expect(getToasts()[0].description).toContain('Erster Fehler')
    expect(getToasts()[0].description).toContain('Zweiter Fehler')
  })

  it('does nothing when there is no error at all', () => {
    handleApolloError({ operation: operation() })

    expect(getToasts()).toHaveLength(0)
  })
})
