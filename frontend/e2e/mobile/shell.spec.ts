import { test, expect } from '@playwright/test'
import { DESKTOP_MIN_WIDTH, expectNoOverflow, screenshot, settle } from './layout-helpers'

test.describe('App-Rahmen', () => {
  test('Navigation ist erreichbar und fuehrt zur Kundenliste', async ({ page }, testInfo) => {
    await page.goto('/')
    await settle(page)
    const width = page.viewportSize()!.width

    if (width >= DESKTOP_MIN_WIDTH) {
      await expect(page.getByTestId('sidebar')).toBeVisible()
      await expect(page.getByTestId('mobile-header')).toHaveCount(0)
      await page.getByTestId('sidebar').getByRole('link', { name: /Kunden|Customers/ }).click()
      await expect(page).toHaveURL(/\/customers$/)
      return
    }

    await expect(page.getByTestId('sidebar')).toHaveCount(0)
    await page.getByTestId('mobile-menu-button').click()
    const drawer = page.getByTestId('nav-drawer')
    await expect(drawer).toBeVisible()
    // Einfahr-Animation abwarten
    await expect.poll(async () => (await drawer.boundingBox())?.x).toBeGreaterThanOrEqual(0)
    await page.waitForTimeout(200)
    await screenshot(page, testInfo, 'shell-drawer-open')
    await expectNoOverflow(page)

    await drawer.getByRole('link', { name: /Kunden|Customers/ }).click()
    await expect(page).toHaveURL(/\/customers$/)
    await expect(drawer).toBeHidden()
  })

  test('Tippziele der Kopfleiste sind mindestens 44 px gross', async ({ page }) => {
    test.skip(page.viewportSize()!.width >= DESKTOP_MIN_WIDTH, 'nur mit Kopfleiste')
    await page.goto('/')
    for (const id of ['mobile-menu-button', 'mobile-search-button']) {
      const box = await page.getByTestId(id).boundingBox()
      expect(box, id).not.toBeNull()
      expect(box!.width, id).toBeGreaterThanOrEqual(44)
      expect(box!.height, id).toBeGreaterThanOrEqual(44)
    }
  })

  test('Suche oeffnet als eigene Ebene und navigiert', async ({ page }, testInfo) => {
    test.skip(page.viewportSize()!.width >= DESKTOP_MIN_WIDTH, 'nur mit Kopfleiste')
    await page.goto('/')
    await settle(page)
    await page.getByTestId('mobile-search-button').click()
    const input = page.getByTestId('mobile-search').getByTestId('global-search-input')
    await expect(input).toBeFocused()
    await input.fill('Kunden')
    const results = page.getByTestId('global-search-results')
    await expect(results).toBeVisible()
    await screenshot(page, testInfo, 'shell-search')
    await expectNoOverflow(page)
    await results.getByRole('button').first().click()
    await expect(page.getByTestId('mobile-search')).toBeHidden()
  })

  test('Eingabefelder haben auf Touch-Geraeten mindestens 16 px Schrift', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', 'nur Touch')
    await page.goto('/customers')
    await settle(page)
    const sizes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main input:not([type=checkbox]):not([type=radio]), main select, main textarea'))
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => parseFloat(getComputedStyle(el).fontSize))
    )
    expect(sizes.length).toBeGreaterThan(0)
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16)
  })

  test('Dialog passt in den Bildschirm', async ({ page }, testInfo) => {
    await page.goto('/settings/team')
    await settle(page)
    await page.locator('main button').filter({ hasText: /Benutzer einladen|Invite User/ }).first().click()
    const dialog = page.locator('[role=dialog], [data-testid=invite-dialog]').first()
    await expect(dialog).toBeVisible()
    await page.waitForTimeout(300)
    await screenshot(page, testInfo, 'shell-dialog')
    const box = (await dialog.boundingBox())!
    const vp = page.viewportSize()!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width)
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height)
    await expectNoOverflow(page)
  })
})
