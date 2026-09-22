/**
 * Prueft die echte Link-Kette, nicht nur die Handler.
 *
 * Die Einzeltests zeigen, dass handleApolloError und handleMutationResult das
 * Richtige tun. Hier geht es um die Frage davor: Bekommen sie ueberhaupt etwas
 * zu sehen? Dafuer werden die exportierten Links aus apollo.ts mit einem
 * Abschluss-Link kombiniert, der eine Antwort vortaeuscht — der Client ist also
 * echt, nur der Server nicht.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ApolloClient, ApolloLink, InMemoryCache, Observable, gql } from '@apollo/client'
import type { FetchResult } from '@apollo/client'

import { errorLink, resultErrorLink } from './apollo'
import { getToasts, resetToasts } from './toastStore'

const SAVE = gql`
  mutation SaveThing {
    saveThing {
      success
      error
    }
  }
`

const LOAD = gql`
  query LoadThing {
    thing {
      id
    }
  }
`

/** Abschluss-Link, der eine feste Antwort liefert, statt zu netzwerken. */
function stubLink(result: FetchResult) {
  return new ApolloLink(
    () =>
      new Observable<FetchResult>((observer) => {
        observer.next(result)
        observer.complete()
      })
  )
}

function clientReturning(result: FetchResult) {
  return new ApolloClient({
    link: ApolloLink.from([errorLink, resultErrorLink, stubLink(result)]),
    cache: new InMemoryCache(),
    defaultOptions: { mutate: { errorPolicy: 'all' }, query: { errorPolicy: 'all' } },
  })
}

describe('Apollo-Kette', () => {
  beforeEach(() => {
    resetToasts()
    localStorage.clear()
  })

  it('macht einen verschluckten Nutzdaten-Fehler sichtbar', async () => {
    const client = clientReturning({
      data: { saveThing: { success: false, error: 'No recipients configured' } },
    })

    await client.mutate({ mutation: SAVE })

    expect(getToasts()).toHaveLength(1)
    expect(getToasts()[0].description).toContain('No recipients configured')
  })

  it('schweigt, wenn die Mutation erfolgreich war', async () => {
    const client = clientReturning({ data: { saveThing: { success: true, error: null } } })

    await client.mutate({ mutation: SAVE })

    expect(getToasts()).toHaveLength(0)
  })

  it('schweigt, wenn der Aufrufer den Fehler selbst anzeigt', async () => {
    const client = clientReturning({
      data: { saveThing: { success: false, error: 'No recipients configured' } },
    })

    await client.mutate({ mutation: SAVE, context: { suppressErrorToast: true } })

    expect(getToasts()).toHaveLength(0)
  })

  it('zeigt einen geworfenen GraphQL-Fehler', async () => {
    const client = clientReturning({
      data: null,
      errors: [{ message: 'Permission denied: settings.read' } as never],
    })

    await client.mutate({ mutation: SAVE })

    expect(getToasts()).toHaveLength(1)
    expect(getToasts()[0].description).toContain('Permission denied: settings.read')
  })

  it('prueft Nutzdaten nur bei Mutationen, nicht bei Abfragen', async () => {
    // Eine Abfrage kann ein Feld "success" fuehren, ohne dass das ein
    // Fehlschlag waere. Der Link darf dort nicht hineinreden.
    const client = clientReturning({ data: { thing: { success: false, error: 'egal' } } })

    await client.query({ query: LOAD, fetchPolicy: 'no-cache' })

    expect(getToasts()).toHaveLength(0)
  })
})
