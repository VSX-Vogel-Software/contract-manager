import { test, expect } from '@playwright/test'
import { expectNoOverflow, screenshot, settle } from './layout-helpers'

// Interaktionen fuer Paket A: Vertraege, Kunden, Projekte, Produkte.
// Nur lesend - Dialoge werden mit Abbrechen/Escape geschlossen.

const CONTRACT_ID = process.env.E2E_CONTRACT_ID ?? '2'
const CUSTOMER_ID = process.env.E2E_CUSTOMER_ID ?? '2'

/** Unterhalb von `md` zeigen die Hauptlisten Karten statt Tabelle. */
const isCardLayout = (width: number) => width < 768

test.describe('Paket A', () => {
  // Der Stack wird parallel von mehreren Laeufen genutzt - settle() kann dauern
  test.describe.configure({ timeout: 120_000 })

  test('Vertragsliste: Karte bzw. Zeile fuehrt zum Vertragsdetail', async ({ page }, testInfo) => {
    await page.goto('/contracts')
    await settle(page)
    const width = page.viewportSize()!.width

    if (isCardLayout(width)) {
      await expect(page.getByTestId('contracts-table-body')).toBeHidden()
      const card = page.locator('[data-testid^="contract-card-"]').first()
      await expect(card).toBeVisible()
      await screenshot(page, testInfo, 'a-contracts-cards')
      await expectNoOverflow(page)
      // Karte antippen (Titelbereich ist der Link)
      await card.locator('a').first().tap()
    } else {
      await expect(page.getByTestId('contracts-cards')).toBeHidden()
      await page.locator('[data-testid^="contract-link-"]').first().click()
    }
    await expect(page).toHaveURL(/\/contracts\/\d+$/)
    await settle(page)
    await expect(page.getByTestId('contract-detail-tabs')).toBeVisible({ timeout: 30_000 })
    await expectNoOverflow(page)
  })

  test('Vertragsdetail: alle Tabs ohne Ueberlauf durchschalten', async ({ page }, testInfo) => {
    await page.goto(`/contracts/${CONTRACT_ID}`)
    await settle(page)
    const tabs = page.getByTestId('contract-detail-tabs')
    await expect(tabs).toBeVisible({ timeout: 30_000 })

    const ids = await tabs
      .locator('[data-testid^="contract-tab-"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!))
    expect(ids.length).toBeGreaterThanOrEqual(8)

    for (const id of ids) {
      const tab = page.getByTestId(id)
      await tab.click()
      await expect(tab).toHaveAttribute('aria-current', 'page')
      await settle(page)
      // Aktiver Tab wird ins Bild gerollt
      const tabBox = (await tab.boundingBox())!
      const navBox = (await tabs.boundingBox())!
      expect(tabBox.x).toBeGreaterThanOrEqual(navBox.x - 1)
      expect(tabBox.x + tabBox.width).toBeLessThanOrEqual(navBox.x + navBox.width + 1)
      await screenshot(page, testInfo, `a-${id}`)
      await expectNoOverflow(page)
    }
  })

  test('Vertragsdetail: Dialog "Position hinzufuegen" passt in den Bildschirm', async ({ page }, testInfo) => {
    // Erster aktiver Vertrag aus der Liste (Standardfilter "Aktiv") - der ist bearbeitbar
    await page.goto('/contracts')
    await settle(page)
    const firstLink = page.locator('[data-testid^="contract-link-"]').first()
    const href = await firstLink.getAttribute('href')
    expect(href).toBeTruthy()
    await page.goto(href!)
    await settle(page)
    await page.getByTestId('contract-tab-items').click()
    const addButton = page.locator('main button').filter({ hasText: /Position hinzufügen|Add Item/ }).first()
    test.skip((await addButton.count()) === 0, 'Vertrag nicht bearbeitbar')
    await addButton.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await page.waitForTimeout(300)
    await screenshot(page, testInfo, 'a-add-item-dialog')
    const box = (await dialog.boundingBox())!
    const vp = page.viewportSize()!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width)
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height)
    await expectNoOverflow(page)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('Kundendetail: Tabs durchschalten und Rechnungskontakte umbrechen', async ({ page }, testInfo) => {
    await page.goto(`/customers/${CUSTOMER_ID}`)
    await settle(page)
    await expect(page.getByTestId('customer-name')).toBeVisible({ timeout: 30_000 })

    // Lange E-Mail-Badges bleiben innerhalb ihres Abschnitts
    const section = page.getByTestId('customer-billing-emails-section')
    const sectionBox = (await section.boundingBox())!
    for (const badge of await section.locator('span.rounded-full').all()) {
      const b = (await badge.boundingBox())!
      expect(b.x + b.width).toBeLessThanOrEqual(sectionBox.x + sectionBox.width + 1)
    }

    const tabs = page.locator('[data-testid="customer-detail-page"] nav').first()
    const count = await tabs.locator('button').count()
    expect(count).toBeGreaterThanOrEqual(5)
    for (let i = 0; i < count; i++) {
      const tab = tabs.locator('button').nth(i)
      await tab.click()
      await expect(tab).toHaveAttribute('aria-current', 'page')
      await settle(page)
      await screenshot(page, testInfo, `a-customer-tab-${i}`)
      await expectNoOverflow(page)
    }
  })

  test('Kundenliste: Karte fuehrt zum Kundendetail', async ({ page }) => {
    await page.goto('/customers')
    await settle(page)
    const width = page.viewportSize()!.width
    if (isCardLayout(width)) {
      await page.locator('[data-testid^="customer-card-"] a').first().tap()
    } else {
      await page.locator('[data-testid^="customer-link-"]').first().click()
    }
    await expect(page).toHaveURL(/\/customers\/\d+$/)
    await settle(page)
    await expect(page.getByTestId('customer-name')).toBeVisible({ timeout: 30_000 })
  })
})
