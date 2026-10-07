import { test, expect, type Page } from '@playwright/test'
import { DESKTOP_MIN_WIDTH, expectNoOverflow, screenshot, settle } from './layout-helpers'

// Globale Suche: Schnellsuche (Dropdown bzw. Vollbild) und Ergebnisseite.
// Die Antworten von `globalSearch` kommen aus page.route - so sind Treffer,
// Hervorhebung, aehnliche Treffer und Nachladen unabhaengig vom Datenbestand.
// E2E_SEARCH_LIVE=1 laesst die echten Antworten des Backends durch.

const QUERY = 'Supportvertrag'
const CONTRACT_TOTAL = 40
const LIVE = !!process.env.E2E_SEARCH_LIVE

interface MockItem {
  __typename: 'SearchResultItem'
  id: string
  title: string
  subtitle: string | null
  url: string
  fuzzy: boolean
}

const item = (id: string, title: string, subtitle: string | null, url: string, fuzzy = false): MockItem => ({
  __typename: 'SearchResultItem',
  id,
  title,
  subtitle,
  url,
  fuzzy,
})

// Lange Titel absichtlich: duerfen auf dem Telefon nicht ueberlaufen
const contracts = Array.from({ length: CONTRACT_TOTAL }, (_, i) =>
  item(
    String(i + 1),
    `Supportvertrag Gebrüder Müller-Lüdenscheidt Maschinenbau ${i + 1}`,
    `SO-2026-${String(i + 1).padStart(4, '0')} · Gebrüder Müller-Lüdenscheidt GmbH & Co. KG`,
    `/contracts/${(i % 5) + 1}`
  )
)
const customers = [
  item('2', 'Support Systems AG', 'K-10002', '/customers/2'),
  item('3', 'Suportwerk Hamburg', null, '/customers/3', true),
]
const incoming = [item('9', 'ER-2026-0009', 'Supportvertrag Druckerwartung', '/incoming-invoices')]

function groupsFor(variables: { limit?: number; types?: string[] | null; offset?: number }) {
  const limit = variables.limit ?? 10
  const offset = variables.offset ?? 0
  const all = [
    { type: 'contract', label: 'Contracts', items: contracts },
    { type: 'customer', label: 'Customers', items: customers },
    { type: 'incoming_invoice', label: 'Incoming invoices', items: incoming },
  ]
  return all
    .filter((g) => !variables.types || variables.types.includes(g.type))
    .map((g) => ({
      __typename: 'SearchResultGroup',
      type: g.type,
      label: g.label,
      hasMore: offset + limit < g.items.length,
      items: g.items.slice(offset, offset + limit),
    }))
    .filter((g) => g.items.length > 0)
}

async function mockSearch(page: Page) {
  if (LIVE) return
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() as { operationName?: string; variables?: Record<string, unknown> } | null
    if (!body || Array.isArray(body) || body.operationName !== 'GlobalSearch') return route.fallback()
    const groups = groupsFor(body.variables ?? {})
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          globalSearch: {
            __typename: 'GlobalSearchResult',
            totalCount: groups.reduce((n, g) => n + g.items.length, 0),
            groups,
          },
        },
      }),
    })
  })
}

/** Suchfeld der Schnellsuche: Seitenleiste ab lg, sonst Vollbild-Suche. */
async function openQuickSearch(page: Page) {
  if (page.viewportSize()!.width >= DESKTOP_MIN_WIDTH) {
    return { input: page.getByTestId('sidebar').getByTestId('global-search-input'), layer: null }
  }
  await page.getByTestId('mobile-search-button').click()
  const layer = page.getByTestId('mobile-search')
  const input = layer.getByTestId('global-search-input')
  await expect(input).toBeFocused()
  return { input, layer }
}

/** Unterhalb von md Karten, darueber Liste. */
const itemPrefix = (page: Page, type: string) =>
  page.viewportSize()!.width < 768 ? `search-card-${type}-` : `search-row-${type}-`

test.describe('Globale Suche', () => {
  test.describe.configure({ timeout: 120_000 })

  test.beforeEach(async ({ page }) => {
    await mockSearch(page)
  })

  test('Schnellsuche hebt hervor, Enter oeffnet die Ergebnisseite', async ({ page }, testInfo) => {
    await page.goto('/')
    await settle(page)
    const { input, layer } = await openQuickSearch(page)
    await input.fill(QUERY)

    const results = page.getByTestId('global-search-results')
    const first = results.locator('[data-testid^="global-search-item-contract-"]').first()
    await expect(first).toBeVisible({ timeout: 15_000 })
    await expect(first.getByTestId('search-highlight').first()).toBeVisible()
    if (!LIVE) {
      await expect(first.getByTestId('search-highlight').first()).toHaveText('Supportvertrag')
      // Aehnlicher Treffer: Hinweis, keine Hervorhebung
      const fuzzy = results.getByTestId('global-search-item-customer-3')
      await fuzzy.scrollIntoViewIfNeeded()
      await expect(fuzzy.getByTestId('search-similar-hint')).toBeVisible()
      await expect(fuzzy.getByTestId('search-highlight')).toHaveCount(0)
    }
    await results.evaluate((el) => el.scrollTo(0, 0))
    // Fett gesetzte Fundstelle ist wirklich fetter als der Rest
    const weight = await first.getByTestId('search-highlight').first().evaluate((el) => Number(getComputedStyle(el).fontWeight))
    expect(weight).toBeGreaterThanOrEqual(700)
    await screenshot(page, testInfo, 'search-quick')
    await expectNoOverflow(page)

    await input.press('Enter')
    await expect(page).toHaveURL(/\/search\?q=Supportvertrag$/)
    if (layer) await expect(layer).toBeHidden()
    await settle(page)
    await expect(page.getByTestId('search-page-input')).toHaveValue(QUERY)
    await expect(page.getByTestId('search-group-contract')).toBeVisible()
  })

  test('"weitere Ergebnisse" fuehrt gefiltert zur Ergebnisseite', async ({ page }) => {
    await page.goto('/')
    await settle(page)
    const { input } = await openQuickSearch(page)
    await input.fill(QUERY)
    const more = page.getByTestId('global-search-more-contract')
    await more.scrollIntoViewIfNeeded({ timeout: 15_000 })
    await more.click()
    await expect(page).toHaveURL(/\/search\?q=Supportvertrag&type=contract$/)
    await settle(page)
    await expect(page.getByTestId('search-group-contract')).toBeVisible()
    await expect(page.getByTestId('search-filter-contract')).toHaveAttribute('aria-pressed', 'true')
  })

  test('Ergebnisseite: Mehr laden, Filter, kein Ueberlauf', async ({ page }, testInfo) => {
    await page.goto(`/search?q=${QUERY}`)
    await settle(page)
    const group = page.getByTestId('search-group-contract')
    await expect(group).toBeVisible()
    const visibleItems = group.locator(`[data-testid^="${itemPrefix(page, 'contract')}"]`)
    await expect(visibleItems).toHaveCount(25)
    await expect(visibleItems.first()).toBeVisible()
    await screenshot(page, testInfo, 'search-results')
    await expectNoOverflow(page)

    const loadMore = page.getByTestId('search-load-more-contract')
    await loadMore.scrollIntoViewIfNeeded()
    await loadMore.click()
    if (!LIVE) {
      await expect(visibleItems).toHaveCount(CONTRACT_TOTAL)
      await expect(loadMore).toHaveCount(0)
    } else {
      await expect.poll(() => visibleItems.count()).toBeGreaterThan(25)
    }
    await expectNoOverflow(page)

    // Filter-Chip: nur noch ein Bereich
    await page.getByTestId('search-filter-customer').click()
    await expect(page).toHaveURL(/type=customer/)
    await expect(group).toHaveCount(0)
    await expect(page.getByTestId('search-group-customer')).toBeVisible()
    await expect(page.getByTestId('search-filter-customer')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('search-filter-all')).toHaveAttribute('aria-pressed', 'false')
    await screenshot(page, testInfo, 'search-results-filtered')
    await expectNoOverflow(page)
  })
})
