import { test, expect, type Page } from '@playwright/test'
import { screenshot, settle } from './layout-helpers'

// Runterziehen zum Neuladen im Inhaltsbereich (<main> scrollt selbst, die
// Browser-Geste greift dort nicht). Wischen per CDP-Touch, weil Playwright
// nur Tippen kennt.

async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, hold?: () => Promise<void>) {
  const cdp = await page.context().newCDPSession(page)
  const point = (x: number, y: number) => [{ x, y, id: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x, from.y) })
  const steps = 12
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps
    const y = from.y + ((to.y - from.y) * i) / steps
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x, y) })
  }
  if (hold) await hold()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

/** Zaehlt GraphQL-Anfragen ab jetzt. */
function countGraphql(page: Page) {
  const counter = { n: 0 }
  page.on('request', (r) => {
    if (r.url().includes('/graphql')) counter.n++
  })
  return counter
}

test.describe('Runterziehen zum Neuladen', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', 'nur mit Touch')
  })

  test('laedt die Daten der Seite neu', async ({ page }, testInfo) => {
    await page.goto('/contracts')
    await settle(page)
    const main = page.getByTestId('main')
    const box = (await main.boundingBox())!
    const x = box.x + box.width / 2
    const requests = countGraphql(page)
    const indicator = page.getByTestId('pull-to-refresh')
    await swipe(page, { x, y: box.y + 20 }, { x, y: box.y + 260 }, async () => {
      await expect(indicator).toHaveAttribute('data-state', 'armed')
      await screenshot(page, testInfo, 'pull-to-refresh-armed')
    })
    await expect(indicator).toHaveAttribute('data-state', 'refreshing')
    await expect(indicator).toBeHidden({ timeout: 10_000 })
    expect(requests.n).toBeGreaterThan(0)
  })

  test('kurzer Zug laedt nichts', async ({ page }) => {
    await page.goto('/contracts')
    await settle(page)
    const box = (await page.getByTestId('main').boundingBox())!
    const x = box.x + box.width / 2
    const requests = countGraphql(page)
    await swipe(page, { x, y: box.y + 20 }, { x, y: box.y + 80 })
    await expect(page.getByTestId('pull-to-refresh')).toBeHidden()
    await page.waitForTimeout(700)
    expect(requests.n).toBe(0)
  })

  test('nicht, wenn die Seite gescrollt ist', async ({ page }) => {
    await page.goto('/contracts')
    await settle(page)
    const main = page.getByTestId('main')
    await main.evaluate((el) => el.scrollTo(0, 200))
    test.skip((await main.evaluate((el) => el.scrollTop)) === 0, 'Seite zu kurz zum Scrollen')
    const box = (await main.boundingBox())!
    const x = box.x + box.width / 2
    await swipe(page, { x, y: box.y + 20 }, { x, y: box.y + 260 }, async () => {
      await expect(page.getByTestId('pull-to-refresh')).toBeHidden()
    })
  })

  test('waagerechtes Wischen loest nichts aus', async ({ page }) => {
    await page.goto('/contracts')
    await settle(page)
    const box = (await page.getByTestId('main').boundingBox())!
    const y = box.y + 60
    await swipe(page, { x: box.x + box.width - 20, y }, { x: box.x + 20, y: y + 60 }, async () => {
      await expect(page.getByTestId('pull-to-refresh')).toBeHidden()
    })
  })
})
