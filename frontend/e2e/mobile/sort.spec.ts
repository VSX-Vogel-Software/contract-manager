import { test, expect } from '@playwright/test'
import { settle, screenshot } from './layout-helpers'

test.describe.configure({ timeout: 60_000 })

// Kartenlisten haben keine Tabellenkoepfe - sortiert wird ueber MobileSortControl
for (const list of [
  { path: '/customers', cards: 'customers-cards', field: 'name' },
  { path: '/contracts', cards: 'contracts-cards', field: 'name' },
]) {
  test(`Sortierung der Karten auf ${list.path}`, async ({ page }, testInfo) => {
    test.skip(page.viewportSize()!.width >= 768, 'Karten nur unterhalb von md')
    await page.goto(list.path)
    await settle(page)

    const sort = page.getByTestId('mobile-sort')
    await expect(sort).toBeVisible()
    await sort.locator('select').selectOption(list.field)
    await settle(page)

    const order = page.getByTestId('mobile-sort-order')
    const titles = async () =>
      (await page.getByTestId(list.cards).locator(':scope > div').allInnerTexts()).map((t) => t.split('\n')[0])

    // auf aufsteigend bringen
    if ((await order.getAttribute('aria-label'))?.match(/Absteigend|descending/i)) await order.click()
    await settle(page)
    const asc = await titles()
    expect(asc.length).toBeGreaterThan(1)

    await order.click()
    await settle(page)
    const desc = await titles()
    expect(desc[0]).not.toBe(asc[0])
    expect(desc[0].localeCompare(desc[desc.length - 1], 'de')).toBeGreaterThanOrEqual(0)
    await screenshot(page, testInfo, `sort${list.path.replace('/', '-')}`)
  })
}
