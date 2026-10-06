import { test, expect, type Page } from '@playwright/test'
import { routes } from './routes'
import { expectNoOverflow, screenshot, settle } from './layout-helpers'

// Paket B: Rechnungen, Angebote, Eingangsrechnungen, Banking.
// Nur lesen bzw. Dialoge oeffnen und abbrechen - nichts versenden, nichts finalisieren.

const MD = 768

/**
 * Wie settle(), wartet aber zusaetzlich, bis die Anmeldepruefung
 * (ProtectedRoute: "Loading...") durch ist und der Seiteninhalt steht. Bei
 * traegem Backend fotografiert settle() sonst nur den Ladebildschirm.
 */
async function ready(page: Page) {
  await expect(page.locator('main')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('main h1, main h2').first()).toBeVisible({ timeout: 60_000 })
  await settle(page)
  // Seiten-Ladeanzeige weg (Statusspinner in Tabellenzeilen duerfen bleiben)
  await expect(page.getByText(/^(Loading|Laden)\.\.\.$/)).toHaveCount(0, { timeout: 30_000 })
}

const isTouchProject = (name: string) => name !== 'desktop'

test.describe.configure({ timeout: 180_000 })

test.describe('Paket B: Routen nach vollstaendigem Laden', () => {
  const mine = [
    'invoices',
    'invoice-detail',
    'invoice-export',
    'offers',
    'offer-detail',
    'incoming-invoices',
    'banking',
    'banking-cost-center-report',
    'counterparty-detail',
  ]
  for (const route of routes.filter((r) => mine.includes(r.name))) {
    test(route.name, async ({ page }, testInfo) => {
      await page.goto(route.path)
      await ready(page)
      await screenshot(page, testInfo, `b-${route.name}`)
      await expectNoOverflow(page)
    })
  }
})

test('Rechnungsliste: Karte bzw. Zeile antippen fuehrt zum Detail', async ({ page }, testInfo) => {
  await page.goto('/invoices')
  await ready(page)
  const width = page.viewportSize()!.width
  let link
  if (width < MD) {
    const cards = page.getByTestId('invoice-cards')
    await expect(cards).toBeVisible()
    await expect(page.locator('main table')).toHaveCount(0)
    const card = cards.locator('[data-testid^="invoice-card-"]').first()
    await expect(card).toBeVisible()
    // Zeilenaktionen (PDF-Ansicht) sind in der Karte erreichbar
    await expect(card.locator('a[title], button[title]').first()).toBeVisible()
    await screenshot(page, testInfo, 'b-invoice-cards')
    link = card.locator('a').first()
  } else {
    await expect(page.getByTestId('invoice-cards')).toHaveCount(0)
    link = page.locator('main table tbody a[href^="/invoices/"]').first()
  }
  await link.click()
  await expect(page).toHaveURL(/\/invoices\/\d+/)
  await ready(page)
  await expect(page.locator('main h1').first()).toBeVisible()
  await expectNoOverflow(page)
})

test('Rechnungsliste: Upload-Dialog oeffnen und abbrechen', async ({ page }, testInfo) => {
  await page.goto('/invoices')
  await ready(page)
  await page.locator('main button').filter({ hasText: /Upload Invoice|Rechnung hochladen|hochladen/i }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await page.waitForTimeout(300)
  await screenshot(page, testInfo, 'b-invoice-upload-dialog')
  const box = (await dialog.boundingBox())!
  const vp = page.viewportSize()!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width)
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height)
  await dialog.getByRole('button', { name: /Cancel|Abbrechen/ }).click()
  await expect(dialog).toBeHidden()
})

test('Rechnungsdetail: Hinweis am E-Mail-Knopf ist per Antippen erreichbar', async ({ page }, testInfo) => {
  test.skip(!isTouchProject(testInfo.project.name), 'nur Touch')
  await page.goto(`/invoices/${process.env.E2E_INVOICE_ID ?? '2'}`)
  await ready(page)
  const trigger = page.getByTestId('invoice-send-email-trigger')
  await expect(trigger).toBeVisible()
  // Der Knopf selbst ist evtl. gesperrt - getippt wird auf den Wrapper
  await trigger.tap()
  const content = page.locator('[data-radix-popper-content-wrapper]').last()
  await expect(content).toBeVisible()
  await expect(content).not.toBeEmpty()
  await screenshot(page, testInfo, 'b-invoice-send-hint')
  const box = (await content.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await page.keyboard.press('Escape')
})

test('Eingangsrechnung: PDF-Knopf auf Touch, eingebettete Vorschau auf dem Desktop', async ({ page }, testInfo) => {
  await page.goto('/incoming-invoices')
  await ready(page)
  const width = page.viewportSize()!.width
  if (width < MD) {
    await page.getByTestId('incoming-invoice-cards').locator('[data-testid^="incoming-invoice-card-"] button').first().click()
  } else {
    await page.locator('main table tbody tr').first().locator('td').first().click()
  }
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  if (isTouchProject(testInfo.project.name)) {
    const preview = sheet.getByTestId('pdf-preview-touch')
    await expect(preview).toBeVisible({ timeout: 30_000 })
    const open = preview.getByRole('link', { name: /PDF öffnen|Open PDF/i })
    await expect(open).toBeVisible()
    await expect(open).toHaveAttribute('href', /.+/)
    await expect(open).toHaveAttribute('target', '_blank')
    await expect(sheet.locator('iframe')).toHaveCount(0)
  } else {
    await expect(sheet.locator('iframe[title="PDF Preview"]')).toBeVisible({ timeout: 30_000 })
  }
  await page.waitForTimeout(300)
  await screenshot(page, testInfo, 'b-incoming-invoice-sheet')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
})

test('Banking: Tabs wechseln, Ansicht bleibt im Bild', async ({ page }, testInfo) => {
  await page.goto('/banking')
  await ready(page)
  const tabs = page.getByTestId('banking-tabs')
  await expect(tabs).toBeVisible()
  const cpTab = tabs.getByRole('button', { name: /Counterparties|Gegenparteien|Geschäftspartner/i })
  const txTab = tabs.getByRole('button', { name: /Transactions|Transaktionen|Umsätze/i })
  await cpTab.click()
  await expect(cpTab).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('main table').first()).toBeVisible()
  await settle(page)
  await screenshot(page, testInfo, 'b-banking-counterparties')
  await expectNoOverflow(page)

  await txTab.click()
  await expect(txTab).toHaveAttribute('aria-current', 'page')
  if (page.viewportSize()!.width < MD) {
    const card = page.getByTestId('transaction-cards').locator('[data-testid^="transaction-card-"]').first()
    await expect(card).toBeVisible()
    // Antippen klappt die Details auf, ein zweites Antippen wieder zu
    await card.locator('button').first().click()
    await expect(card).toHaveClass(/bg-blue-50/)
    await screenshot(page, testInfo, 'b-banking-tx-expanded')
    await expectNoOverflow(page)
    await card.locator('button').first().click()
    await expect(card).not.toHaveClass(/bg-blue-50/)
  } else {
    await expect(page.locator('main table').first()).toBeVisible()
  }
  await expectNoOverflow(page)
})

test('Banking: Zuordnungs-Sheet oeffnen und schliessen', async ({ page }, testInfo) => {
  await page.goto('/banking')
  await ready(page)
  // Tab-Wahl ist persistiert; sicherheitshalber auf Transaktionen
  await page.getByTestId('banking-tabs').getByRole('button').first().click()
  if (page.viewportSize()!.width < MD) {
    await page.locator('[data-testid^="transaction-card-match-"]').first().click()
  } else {
    // Betragsspalte: erster Knopf ist "Zuordnen"
    await page.locator('main table tbody tr').first().locator('td').nth(3).locator('button').first().click()
  }
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('.animate-spin')).toHaveCount(0, { timeout: 60_000 })
  await page.waitForTimeout(400)
  await screenshot(page, testInfo, 'b-banking-match-sheet')
  await expectNoOverflow(page)
  const box = (await sheet.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(-1)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
})

test('Angebote: Karte antippen, Detail ohne Ueberlauf', async ({ page }, testInfo) => {
  await page.goto('/offers')
  await ready(page)
  if (page.viewportSize()!.width < MD) {
    const card = page.getByTestId('offer-cards').locator('[data-testid^="offer-card-"]').first()
    await expect(card).toBeVisible()
    await card.locator('a').first().click()
  } else {
    await page.locator('[data-testid^="offer-row-"]').first().click()
  }
  await expect(page).toHaveURL(/\/offers\/\d+/)
  await ready(page)
  await screenshot(page, testInfo, 'b-offer-detail-from-list')
  await expectNoOverflow(page)
})
