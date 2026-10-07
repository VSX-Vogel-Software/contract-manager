import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MockedProvider, type MockedResponse } from '@apollo/client/testing'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { GraphQLError } from 'graphql'
import { SearchPage } from './SearchPage'
import { GLOBAL_SEARCH, type SearchGroup, type SearchItem } from '@/components/SearchResultParts'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

const contract = (n: number, fuzzy = false): SearchItem => ({
  id: String(n),
  title: `Supportvertrag ${n}`,
  subtitle: 'Müller GmbH',
  url: `/contracts/${n}`,
  fuzzy,
})

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

function mock(variables: Record<string, unknown>, groups: SearchGroup[]): MockedResponse {
  return {
    request: { query: GLOBAL_SEARCH, variables },
    result: { data: { globalSearch: { totalCount: groups.reduce((n, g) => n + g.items.length, 0), groups } } },
  }
}

const firstPage: SearchGroup[] = [
  { type: 'contract', label: 'Contracts', hasMore: true, items: range(1, 25).map((n) => contract(n)) },
  {
    type: 'customer',
    label: 'Customers',
    hasMore: false,
    items: [{ id: '4', title: 'Supportkunde AG', subtitle: null, url: '/customers/4', fuzzy: true }],
  },
]

function renderPage(url: string, mocks: MockedResponse[]) {
  return render(
    <MockedProvider mocks={mocks} addTypename={false}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/search" element={<SearchPage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </MockedProvider>
  )
}

const rows = (type: string) =>
  within(screen.getByTestId(`search-group-${type}`))
    .queryAllByTestId(new RegExp(`^search-row-${type}-`))

describe('SearchPage', () => {
  it('uebernimmt die Anfrage aus der URL und zeigt alle Bereiche', async () => {
    renderPage('/search?q=Supportvertrag', [mock({ query: 'Supportvertrag', limit: 25 }, firstPage)])

    expect(screen.getByTestId('search-page-input')).toHaveValue('Supportvertrag')
    await screen.findByTestId('search-group-contract')
    expect(rows('contract')).toHaveLength(25)
    expect(rows('customer')).toHaveLength(1)
    // Telefon-Karten gibt es parallel (unter md sichtbar)
    expect(screen.getByTestId('search-card-contract-1')).toBeInTheDocument()
    // Hervorhebung, aehnliche Treffer ohne
    expect(within(screen.getByTestId('search-row-contract-1')).getAllByTestId('search-highlight')[0]).toHaveTextContent(
      'Supportvertrag'
    )
    expect(within(screen.getByTestId('search-row-customer-4')).queryByTestId('search-highlight')).toBeNull()
    expect(within(screen.getByTestId('search-row-customer-4')).getByTestId('search-similar-hint')).toBeInTheDocument()
  })

  it('laedt je Bereich mit types und offset nach', async () => {
    const user = userEvent.setup()
    renderPage('/search?q=Supportvertrag', [
      mock({ query: 'Supportvertrag', limit: 25 }, firstPage),
      mock({ query: 'Supportvertrag', limit: 25, types: ['contract'], offset: 25 }, [
        { type: 'contract', label: 'Contracts', hasMore: true, items: range(26, 50).map((n) => contract(n)) },
      ]),
      mock({ query: 'Supportvertrag', limit: 25, types: ['contract'], offset: 50 }, [
        { type: 'contract', label: 'Contracts', hasMore: false, items: range(51, 53).map((n) => contract(n)) },
      ]),
    ])
    await screen.findByTestId('search-group-contract')
    expect(screen.queryByTestId('search-load-more-customer')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('search-load-more-contract'))
    await screen.findByTestId('search-row-contract-50')
    expect(rows('contract')).toHaveLength(50)

    await user.click(screen.getByTestId('search-load-more-contract'))
    await screen.findByTestId('search-row-contract-53')
    expect(rows('contract')).toHaveLength(53)
    expect(screen.queryByTestId('search-load-more-contract')).not.toBeInTheDocument()
  })

  it('filtert per Chip auf einen Bereich und schreibt ihn in die URL', async () => {
    const user = userEvent.setup()
    renderPage('/search?q=Supportvertrag', [mock({ query: 'Supportvertrag', limit: 25 }, firstPage)])
    await screen.findByTestId('search-group-contract')
    expect(screen.getByTestId('search-filter-contract')).toHaveTextContent('25+')

    await user.click(screen.getByTestId('search-filter-customer'))
    expect(screen.getByTestId('location')).toHaveTextContent('/search?q=Supportvertrag&type=customer')
    expect(screen.queryByTestId('search-group-contract')).not.toBeInTheDocument()
    expect(screen.getByTestId('search-group-customer')).toBeInTheDocument()
    expect(screen.getByTestId('search-filter-customer')).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByTestId('search-filter-all'))
    expect(screen.getByTestId('location')).toHaveTextContent('/search?q=Supportvertrag')
    expect(screen.getByTestId('location')).not.toHaveTextContent('type=')
    expect(screen.getByTestId('search-group-contract')).toBeInTheDocument()
  })

  it('oeffnet direkt gefiltert, wenn type in der URL steht', async () => {
    renderPage('/search?q=Supportvertrag&type=contract', [mock({ query: 'Supportvertrag', limit: 25 }, firstPage)])
    await screen.findByTestId('search-group-contract')
    expect(screen.queryByTestId('search-group-customer')).not.toBeInTheDocument()
  })

  it('zeigt einen leeren Zustand', async () => {
    renderPage('/search?q=gibtsnicht', [mock({ query: 'gibtsnicht', limit: 25 }, [])])
    expect(await screen.findByTestId('search-empty')).toBeInTheDocument()
  })

  it('zeigt einen Fehlerzustand', async () => {
    renderPage('/search?q=kaputt', [
      { request: { query: GLOBAL_SEARCH, variables: { query: 'kaputt', limit: 25 } }, result: { errors: [new GraphQLError('boom')] } },
    ])
    expect(await screen.findByTestId('search-error')).toBeInTheDocument()
  })

  it('verlangt mindestens zwei Zeichen', () => {
    renderPage('/search?q=a', [])
    expect(screen.getByTestId('search-min-chars')).toBeInTheDocument()
  })

  it('sucht nach Enter mit der neuen Anfrage', async () => {
    const user = userEvent.setup()
    renderPage('/search?q=Supportvertrag', [
      mock({ query: 'Supportvertrag', limit: 25 }, firstPage),
      mock({ query: 'Mueller', limit: 25 }, []),
    ])
    await screen.findByTestId('search-group-contract')
    const input = screen.getByTestId('search-page-input')
    await user.clear(input)
    await user.type(input, 'Mueller{Enter}')
    expect(screen.getByTestId('location')).toHaveTextContent('/search?q=Mueller')
    expect(await screen.findByTestId('search-empty')).toBeInTheDocument()
  })
})
