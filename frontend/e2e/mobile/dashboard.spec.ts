import { test, expect, type Page } from '@playwright/test'
import { expectNoOverflow, settle } from './layout-helpers'

// Dashboard-Kacheln: Link, Info-Knopf, Verlauf (Change dashboard-kpi-trends).
// Keine Datenaenderung. Der Verlauf wird per Netzwerk-Mock geliefert, damit die
// Tests nicht davon abhaengen, ob das Backend schon Snapshots hat.

const isTouch = (projectName: string) => projectName !== 'desktop'

const year = new Date().getFullYear()
const series = (n: number, base: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(year, new Date().getMonth() - (n - 1) + i, 1)
    return {
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      // leicht schwankend steigend, damit man die Form sieht
      value: Math.round(base * (1 + i * 0.03 + (i % 3 === 0 ? 0.02 : 0))),
    }
  })

const TRENDS = {
  data: {
    dashboardKpiTrends: {
      activeContracts: series(12, 25),
      annualRecurringRevenue: series(12, 180_000_000),
      totalContractValue: series(4, 550_000_000),
      // Prognose ohne Historie: keine Linie
      currentYearForecast: series(2, 200_000_000),
      nextYearForecast: series(3, 140_000_000),
      revenueStreamForecast: [
        { stream: 'recurring', points: series(6, 190_000_000) },
        { stream: 'advanced_development', points: series(6, 2_000_000) },
        { stream: 'training_implementation', points: [] },
      ],
      yearToDateRevenue: series(10, 20_000_000),
      wonNewArr: series(10, 10_000),
      backToBaseArr: series(10, 10_000),
      wonDevelopmentRevenue: series(10, 10_000),
      wonDealCount: series(10, 1),
      priceIncreaseTotal: series(10, 1_000),
      priceIncreaseInflation: series(10, 1_000),
      priceIncreaseNegotiated: series(10, 1_000),
    },
  },
}

/** Liefert den Verlauf aus dem Mock, alle anderen Abfragen gehen ans Backend. */
async function mockTrends(page: Page) {
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() as { operationName?: string } | null
    if (body?.operationName === 'DashboardKpiTrends') {
      await route.fulfill({ json: TRENDS })
      return
    }
    await route.continue()
  })
}

async function fullScreenshot(page: Page, projectName: string, name: string) {
  const dir = process.env.E2E_SCREENS ?? 'mobile-screens'
  // main ist der Scroll-Container: fuer ein Gesamtbild kurz aufziehen
  await page.addStyleTag({ content: 'main { overflow: visible !important; height: auto !important; }' }).catch(() => {})
  await page.screenshot({ path: `${dir}/${projectName}/${name}.png`, fullPage: true })
}

test.describe('Dashboard-Kacheln', () => {
  test.describe.configure({ timeout: 90_000 })

  test('Verlauf erscheint, sobald Daten da sind; kein Ueberlauf', async ({ page }, testInfo) => {
    await mockTrends(page)
    await page.goto('/')
    await settle(page)
    const spark = page.getByTestId('kpi-sparkline-active-contracts')
    await expect(spark).toBeVisible()
    await expect(spark.locator('.recharts-area-curve')).toHaveCount(1)
    // Linie liegt innerhalb der Karte
    const card = (await page.getByTestId('kpi-card-active-contracts').boundingBox())!
    const box = (await spark.boundingBox())!
    expect(box.height).toBeGreaterThan(20)
    expect(box.x).toBeGreaterThanOrEqual(card.x)
    expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width + 1)
    // unter 3 Punkten keine Linie
    await expect(page.getByTestId('kpi-card-current-year-forecast')).toBeVisible()
    await expect(page.getByTestId('kpi-sparkline-current-year-forecast')).toHaveCount(0)
    await expectNoOverflow(page)
    await fullScreenshot(page, testInfo.project.name, 'dashboard-trends')
  })

  test('alle 16 Kacheln mit Ziel und Verlauf ohne Ueberlauf', async ({ page }, testInfo) => {
    // Die Demo-Daten haben kein New Business und keine Preiserhoehungen - die
    // Antwort des Backends wird darum um diese Bloecke ergaenzt.
    await page.route('**/graphql', async (route) => {
      const body = route.request().postDataJSON() as { operationName?: string } | null
      if (body?.operationName === 'DashboardKpiTrends') {
        await route.fulfill({ json: TRENDS })
        return
      }
      if (body?.operationName === 'DashboardKPIs') {
        const response = await route.fetch()
        const json = await response.json()
        json.data.newBusinessMetrics = { wonNewArr: '184250.5', backToBaseArr: '42000', wonDevelopmentRevenue: '96500', wonDealCount: 7 }
        json.data.newBusinessGoals = [
          { id: 1, year, goalType: 'new_arr', targetAmount: '250000' },
          { id: 2, year, goalType: 'new_deal_count', targetAmount: '6' },
        ]
        json.data.priceIncreaseImpact = {
          year, totalArrImpact: '1234567.89', inflationArrImpact: '987654.32', negotiatedArrImpact: '246913.57', untaggedArrImpact: '0', itemCount: 48,
        }
        json.data.revenueGoals = [{ id: 1, year, revenueType: 'recurring', targetAmount: '210000000' }]
        json.data.dashboardPreferences = { showContracts: true, showRevenueGoals: true, showNewBusiness: true, showPriceIncreaseImpact: true }
        await route.fulfill({ response, json })
        return
      }
      await route.continue()
    })
    await page.goto('/')
    await settle(page)
    await expect(page.locator('[data-testid^="kpi-card-link-"]')).toHaveCount(16)
    await expect(page.getByTestId('kpi-sparkline-new_arr')).toBeVisible()
    await expect(page.getByTestId('kpi-card-link-new_arr')).toHaveAttribute('href', `/dashboard/new-business/new_arr?year=${year}`)
    await expect(page.getByTestId('kpi-card-link-price-increase-inflation')).toHaveAttribute('href', `/contracts?priceIncrease=true&year=${year}`)
    await expectNoOverflow(page)
    await fullScreenshot(page, testInfo.project.name, 'dashboard-all-tiles')
  })

  test('ohne Verlauf vom Backend kein Fehler-Toast', async ({ page }) => {
    await page.route('**/graphql', async (route) => {
      const body = route.request().postDataJSON() as { operationName?: string } | null
      if (body?.operationName === 'DashboardKpiTrends') {
        await route.fulfill({ json: { data: null, errors: [{ message: 'Cannot query field "dashboardKpiTrends"' }] } })
        return
      }
      await route.continue()
    })
    await page.goto('/')
    await settle(page)
    await expect(page.getByTestId('kpi-card-active-contracts')).toBeVisible()
    await page.waitForTimeout(500)
    await expect(page.getByTestId('toast-error')).toHaveCount(0)
    await expect(page.locator('[data-testid^="kpi-sparkline-"]')).toHaveCount(0)
  })

  test('Kachel antippen fuehrt zur Zielseite', async ({ page }, testInfo) => {
    await mockTrends(page)
    await page.goto('/')
    await settle(page)
    // Mitte der Karte antippen (Wert, nicht Titel): prueft die Klickflaeche
    // des Overlay-Links ueber die ganze Karte
    await expect(page.getByTestId('kpi-card-link-active-contracts')).toHaveAttribute('href', '/contracts')
    const card = page.getByTestId('kpi-card-active-contracts')
    if (isTouch(testInfo.project.name)) await card.tap()
    else await card.click()
    await expect(page).toHaveURL(/\/contracts$/)

    await page.goto('/')
    await settle(page)
    const goal = page.getByTestId('kpi-card-goal-recurring')
    if (await goal.count()) {
      if (isTouch(testInfo.project.name)) await goal.tap()
      else await goal.click()
      await expect(page).toHaveURL(/\/forecasts\?tab=goals$/)
    }
  })

  test('Info antippen navigiert nicht', async ({ page }, testInfo) => {
    await mockTrends(page)
    await page.goto('/')
    await settle(page)
    const info = page.getByTestId('kpi-card-arr').getByTestId('kpi-info')
    if (isTouch(testInfo.project.name)) {
      await info.tap()
      await expect(page.locator('[data-radix-popper-content-wrapper]').first()).toBeVisible()
      // auch das Antippen der Erklaerung selbst fuehrt nicht weg
      await page.locator('[data-radix-popper-content-wrapper]').first().tap()
    } else {
      await info.hover()
      await expect(page.getByRole('tooltip').first()).toBeVisible()
      await info.click()
    }
    await page.waitForTimeout(300)
    await expect(page).toHaveURL(/\/$/)
  })

  test('Verlauf zeigt mit der Maus Monat und Wert, Klick fuehrt zur Seite', async ({ page }, testInfo) => {
    test.skip(isTouch(testInfo.project.name), 'Tooltip nur mit Maus - auf Touch fuehrt Antippen zur Seite')
    await mockTrends(page)
    await page.goto('/')
    await settle(page)
    const spark = page.getByTestId('kpi-sparkline-arr')
    await expect(spark).toBeVisible()
    const box = (await spark.boundingBox())!
    // ganz rechts = letzter Punkt
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2)
    const tip = page.getByTestId('sparkline-tooltip')
    await expect(tip).toBeVisible()
    await expect(tip).toContainText(/20\d\d/)
    await expect(tip).toContainText('€')
    // am rechten Rand der Kachel darf der Tooltip nicht aus dem Bild laufen
    const tipBox = (await tip.boundingBox())!
    expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    await page.screenshot({ path: `${process.env.E2E_SCREENS ?? 'mobile-screens'}/${testInfo.project.name}/dashboard-sparkline-tooltip.png` })
    // weiter links: anderer Monat
    const first = await tip.textContent()
    await page.mouse.move(box.x + 4, box.y + box.height / 2)
    await expect(tip).not.toHaveText(first ?? '')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page).toHaveURL(/\/forecasts$/)
  })

  test('Kacheln: Fokus sichtbar per Tastatur', async ({ page }, testInfo) => {
    test.skip(isTouch(testInfo.project.name), 'nur mit Tastatur')
    await mockTrends(page)
    await page.goto('/')
    await settle(page)
    const card = page.getByTestId('kpi-card-active-contracts')
    await page.getByTestId('kpi-card-link-active-contracts').focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('kpi-card-link-active-contracts')).toBeFocused()
    const shadow = await card.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(shadow).not.toBe('none')
  })
})
