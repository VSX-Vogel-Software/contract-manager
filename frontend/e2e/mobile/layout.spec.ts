import { test, expect } from '@playwright/test'
import { routes, publicRoutes, bareRoutes } from './routes'
import { expectNoOverflow, screenshot, settle } from './layout-helpers'

// Sieben Formate x ~40 Routen gegen den Vite-Dev-Server: 30 s reichen unter Last nicht
test.describe.configure({ timeout: 90_000 })

test.describe('Mobil: kein waagerechter Ueberlauf', () => {
  for (const route of routes) {
    test(route.name, async ({ page }, testInfo) => {
      await page.goto(route.path)
      await settle(page)
      await screenshot(page, testInfo, route.name)
      await expectNoOverflow(page)
    })
  }
})

test.describe('Mobil: oeffentliche Seiten', () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  for (const route of publicRoutes) {
    test(route.name, async ({ page }, testInfo) => {
      await page.goto(route.path)
      await settle(page, { requireMain: false })
      await screenshot(page, testInfo, route.name)
      await expectNoOverflow(page)
    })
  }
})

test.describe('Mobil: angemeldet ohne App-Rahmen', () => {
  for (const route of bareRoutes) {
    test(route.name, async ({ page }, testInfo) => {
      await page.goto(route.path)
      await settle(page, { requireMain: false })
      await screenshot(page, testInfo, route.name)
      await expectNoOverflow(page)
    })
  }
})

test('Touch-Emulation loest die Touch-Media-Query aus', async ({ page }, testInfo) => {
  await page.goto('/about')
  const coarse = await page.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches)
  expect(coarse).toBe(testInfo.project.name !== 'desktop')
})
