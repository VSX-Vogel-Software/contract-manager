import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MockedProvider, type MockedResponse } from '@apollo/client/testing'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { GlobalSearch } from './Sidebar'
import { InMemoryCache } from '@apollo/client'
import { typePolicies } from '@/lib/apollo'
import { GLOBAL_SEARCH, type SearchGroup } from './SearchResultParts'

const auth = vi.hoisted(() => ({ permissions: [] as string[] }))

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    hasPermission: (resource: string, action: string) => auth.permissions.includes(`${resource}.${action}`),
  }),
}))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function searchMock(query: string, groups: SearchGroup[], delay = 0): MockedResponse {
  return {
    request: { query: GLOBAL_SEARCH, variables: { query, limit: 10 } },
    result: { data: { globalSearch: { totalCount: groups.reduce((n, g) => n + g.items.length, 0), groups } } },
    delay,
  }
}

const muellerGroups: SearchGroup[] = [
  {
    type: 'customer',
    label: 'Customers',
    hasMore: true,
    items: [
      { id: '7', title: 'Gebrüder Müller-Lüdenscheidt GmbH', subtitle: 'K-1007', url: '/customers/7', fuzzy: false },
      { id: '9', title: 'Möller Maschinenbau', subtitle: null, url: '/customers/9', fuzzy: true },
    ],
  },
  {
    type: 'incoming_invoice',
    label: 'Incoming invoices',
    hasMore: false,
    items: [{ id: 'ii-3', title: 'ER-2026-0003', subtitle: 'Mueller Bürobedarf', url: '/incoming-invoices?id=3', fuzzy: false }],
  },
]

function renderSearch(mocks: MockedResponse[], variant: 'dropdown' | 'inline' = 'dropdown') {
  return render(
    <MockedProvider mocks={mocks} addTypename={false}>
      <MemoryRouter initialEntries={['/']}>
        <GlobalSearch variant={variant} />
        <LocationProbe />
      </MemoryRouter>
    </MockedProvider>
  )
}

async function typeAndWait(text: string) {
  const user = userEvent.setup()
  await user.type(screen.getByTestId('global-search-input'), text)
  await screen.findByTestId('global-search-item-customer-7', {}, { timeout: 2000 })
  return user
}

describe('GlobalSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.permissions = ['incoming_invoices.read', 'invoices.read']
  })

  it('hebt die Fundstelle hervor, auch wenn erst die Faltung passt', async () => {
    renderSearch([searchMock('Mueller', muellerGroups)])
    await typeAndWait('Mueller')

    const item = screen.getByTestId('global-search-item-customer-7')
    const marks = within(item).getAllByTestId('search-highlight').map((m) => m.textContent)
    expect(marks).toEqual(['Müller'])
    // Untertitel einer Eingangsrechnung ebenso
    const incoming = screen.getByTestId('global-search-item-incoming_invoice-ii-3')
    expect(within(incoming).getAllByTestId('search-highlight').map((m) => m.textContent)).toEqual(['Mueller'])
  })

  it('hebt aehnliche Treffer nicht hervor und kennzeichnet sie', async () => {
    renderSearch([searchMock('Mueller', muellerGroups)])
    await typeAndWait('Mueller')

    const fuzzy = screen.getByTestId('global-search-item-customer-9')
    expect(fuzzy).toHaveAttribute('data-fuzzy', 'true')
    expect(within(fuzzy).queryByTestId('search-highlight')).not.toBeInTheDocument()
    expect(within(fuzzy).getByTestId('search-similar-hint')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('global-search-item-customer-7')).queryByTestId('search-similar-hint')
    ).not.toBeInTheDocument()
  })

  it('zeigt neue Bereiche mit eigener Ueberschrift', async () => {
    renderSearch([searchMock('Mueller', muellerGroups)])
    await typeAndWait('Mueller')
    expect(screen.getByTestId('global-search-group-incoming_invoice')).toHaveTextContent('Incoming invoices')
  })

  it('oeffnet mit Enter ohne markierten Treffer die Ergebnisseite', async () => {
    renderSearch([searchMock('Mueller', muellerGroups)])
    const user = await typeAndWait('Mueller')

    await user.keyboard('{Enter}')
    expect(screen.getByTestId('location')).toHaveTextContent('/search?q=Mueller')
    expect(screen.getByTestId('global-search-input')).toHaveValue('')
  })

  it('oeffnet die Ergebnisseite mit Enter auch vor den ersten Treffern', async () => {
    renderSearch([searchMock('Supportvertrag', muellerGroups, 5000)])
    const user = userEvent.setup()
    await user.type(screen.getByTestId('global-search-input'), 'Supportvertrag{Enter}')
    expect(screen.getByTestId('location')).toHaveTextContent('/search?q=Supportvertrag')
  })

  it('navigiert mit Pfeiltaste und Enter zum markierten Treffer', async () => {
    renderSearch([searchMock('Mueller', muellerGroups)])
    const user = await typeAndWait('Mueller')

    await user.keyboard('{ArrowDown}{Enter}')
    expect(screen.getByTestId('location')).toHaveTextContent('/customers/7')
  })

  it('"weitere Ergebnisse" ist klickbar und filtert auf den Bereich', async () => {
    renderSearch([searchMock('Mueller', muellerGroups)])
    const user = await typeAndWait('Mueller')

    expect(screen.queryByTestId('global-search-more-incoming_invoice')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('global-search-more-customer'))
    expect(screen.getByTestId('location')).toHaveTextContent('/search?q=Mueller&type=customer')
  })

  it('"Alle Ergebnisse anzeigen" fuehrt zur Ergebnisseite', async () => {
    renderSearch([searchMock('Mueller', muellerGroups)], 'inline')
    const user = await typeAndWait('Mueller')

    await user.click(screen.getByTestId('global-search-show-all'))
    expect(screen.getByTestId('location')).toHaveTextContent('/search?q=Mueller')
  })

  it('blendet alte Treffer ab, waehrend die neue Anfrage laeuft', async () => {
    const narrowed: SearchGroup[] = [{ ...muellerGroups[0], items: [muellerGroups[0].items[0]], hasMore: false }]
    renderSearch([searchMock('Mueller', muellerGroups), searchMock('Mueller Geb', narrowed, 1500)])
    const user = await typeAndWait('Mueller')
    expect(screen.getByTestId('global-search-data')).not.toHaveAttribute('data-stale')

    await user.type(screen.getByTestId('global-search-input'), ' Geb')
    // Alte Treffer bleiben sichtbar, aber als veraltet markiert
    expect(screen.getByTestId('global-search-data')).toHaveAttribute('data-stale', 'true')
    expect(screen.getByTestId('global-search-item-customer-9')).toBeInTheDocument()

    // Neue Treffer da: nicht mehr abgeblendet
    await vi.waitFor(
      () => expect(screen.queryByTestId('global-search-item-customer-9')).not.toBeInTheDocument(),
      { timeout: 4000 }
    )
    expect(screen.getByTestId('global-search-data')).not.toHaveAttribute('data-stale')
  })

  it('findet Seiten mit Faltung und kennt Eingangsrechnungen und Info', async () => {
    renderSearch([
      searchMock('ueber', []),
      searchMock('eingangsrech', []),
    ])
    const user = userEvent.setup()
    const input = screen.getByTestId('global-search-input')

    await user.type(input, 'ueber')
    expect(within(screen.getByTestId('global-search-results')).getByText('nav.about')).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, 'eingangsrech')
    expect(within(screen.getByTestId('global-search-results')).getByText('nav.incomingInvoices')).toBeInTheDocument()
  })

  it('unterscheidet die beiden Mahn-Seiten', async () => {
    // Im Englischen hiessen beide "Dunning" - jetzt eigene Namen
    auth.permissions = ['reminders.settings']
    renderSearch([searchMock('mahnung', [])])
    const user = userEvent.setup()
    await user.type(screen.getByTestId('global-search-input'), 'mahnung')
    const results = screen.getByTestId('global-search-results')
    expect(within(results).getByText('search.pageDunningTemplate')).toBeInTheDocument()
    expect(within(results).getByText('search.pageDunningSettings')).toBeInTheDocument()
  })

  it('verwechselt Treffer mit gleicher id aus verschiedenen Bereichen nicht (App-Cache)', async () => {
    const item = (title: string, url: string) => ({ __typename: 'SearchResultItem', id: '7', title, subtitle: null, url, fuzzy: false })
    const groups = [
      { __typename: 'SearchResultGroup', type: 'customer', label: 'Customers', hasMore: false, items: [item('Müller Kunde', '/customers/7')] },
      { __typename: 'SearchResultGroup', type: 'contract', label: 'Contracts', hasMore: false, items: [item('Müller Vertrag', '/contracts/7')] },
    ]
    render(
      <MockedProvider
        cache={new InMemoryCache({ typePolicies })}
        mocks={[
          {
            request: { query: GLOBAL_SEARCH, variables: { query: 'Müller', limit: 10 } },
            result: { data: { globalSearch: { __typename: 'GlobalSearchResult', totalCount: 2, groups } } },
          },
        ]}
      >
        <MemoryRouter>
          <GlobalSearch />
        </MemoryRouter>
      </MockedProvider>
    )
    const user = userEvent.setup()
    await user.type(screen.getByTestId('global-search-input'), 'Müller')
    expect(await screen.findByTestId('global-search-item-customer-7', {}, { timeout: 2000 })).toHaveTextContent('Müller Kunde')
    expect(screen.getByTestId('global-search-item-contract-7')).toHaveTextContent('Müller Vertrag')
  })
})
