import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ApolloError } from '@apollo/client'
import { GraphQLError } from 'graphql'

const query = vi.fn()
// Stabiles Objekt wie der echte Apollo-Client - sonst laeuft der Effekt bei
// jedem Render erneut
const client = { query, resetStore: vi.fn(), clearStore: vi.fn() }
vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual<typeof import('@apollo/client')>('@apollo/client')
  return { ...actual, useApolloClient: () => client }
})

import { AuthProvider, useAuth } from './auth'

function Probe() {
  const { isLoading, isAuthenticated, connectionError } = useAuth()
  return <div data-testid="state">{`${isLoading}|${isAuthenticated}|${connectionError}`}</div>
}

const state = () => screen.getByTestId('state').textContent

describe('Anmeldepruefung beim Start', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    query.mockReset()
    localStorage.setItem('auth_token', 'gespeichert')
    localStorage.setItem('refresh_token', 'refresh')
  })
  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it('behaelt die Anmeldung bei Netzwerkfehlern und meldet "nicht erreichbar"', async () => {
    query.mockRejectedValue(new ApolloError({ networkError: new Error('Failed to fetch') }))
    render(<AuthProvider><Probe /></AuthProvider>)

    // drei Versuche mit Pause dazwischen
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })

    expect(query).toHaveBeenCalledTimes(3)
    expect(state()).toBe('false|false|true')
    expect(localStorage.getItem('auth_token')).toBe('gespeichert')
  })

  it('kommt nach einem kurzen Aussetzer ohne Fehlermeldung durch', async () => {
    query
      .mockRejectedValueOnce(new ApolloError({ networkError: new Error('Failed to fetch') }))
      .mockResolvedValueOnce({ data: { me: { id: 1, email: 'a@b.c', permissions: [] } } })
    render(<AuthProvider><Probe /></AuthProvider>)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })

    expect(state()).toBe('false|true|false')
  })

  it('meldet bei einem GraphQL-Fehler wie bisher ab', async () => {
    query.mockRejectedValue(new ApolloError({ graphQLErrors: [new GraphQLError('Not authenticated')] }))
    render(<AuthProvider><Probe /></AuthProvider>)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(query).toHaveBeenCalledTimes(1)
    expect(state()).toBe('false|false|false')
    expect(localStorage.getItem('auth_token')).toBeNull()
  })
})
