import { test, expect, type Page } from '@playwright/test'
import { DESKTOP_MIN_WIDTH, expectNoOverflow, screenshot, settle } from './layout-helpers'

// Interaktionstests Paket C: Dashboard, Todos, Prognosen, Audit-Log, Einstellungen.
// Keine Datenaenderung ausser im Todo-Test, der die Verschiebung wieder zuruecknimmt.

const TOUCH_PROJECTS = ['phone-small', 'iphone-se', 'iphone-15', 'phone-landscape', 'tablet-portrait', 'tablet-landscape']
const isTouch = (projectName: string) => projectName !== 'desktop'
const isPhone = (page: Page) => page.viewportSize()!.width < 768

test.describe('Paket C', () => {
  // Der Stack ist waehrend der Laeufe stark ausgelastet (drei Pakete parallel)
  test.describe.configure({ timeout: 90_000 })

  test('Dashboard: KPI-Erklaerung oeffnet per Antippen', async ({ page }, testInfo) => {
    await page.goto('/')
    await settle(page)
    const info = page.getByTestId('kpi-info').first()
    await expect(info).toBeVisible()
    if (isTouch(testInfo.project.name)) {
      await info.tap()
      // Auf Touch rendert ui/tooltip ein Popover (role=dialog)
      const pop = page.locator('[data-radix-popper-content-wrapper]').first()
      await expect(pop).toBeVisible()
      await screenshot(page, testInfo, 'c-dashboard-kpi-info')
      const box = (await pop.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
      // Antippen der Info darf nicht wegnavigieren
      await expect(page).toHaveURL(/\/$/)
      await page.mouse.click(5, page.viewportSize()!.height - 5)
      await expect(pop).toBeHidden()
    } else {
      await info.hover()
      await expect(page.getByRole('tooltip').first()).toBeVisible()
    }
    await expectNoOverflow(page)
  })

  test('Dashboard: KPI-Karten auf dem Telefon zweispaltig', async ({ page }) => {
    test.skip(!isPhone(page), 'nur Telefon hoch')
    await page.goto('/')
    await settle(page)
    const boxes = await page.getByTestId('kpi-info').evaluateAll((els) =>
      els.slice(0, 2).map((el) => el.closest('.rounded-lg')!.getBoundingClientRect().top)
    )
    expect(boxes.length).toBe(2)
    // Erste zwei Karten stehen in einer Zeile
    expect(Math.abs(boxes[0] - boxes[1])).toBeLessThan(2)
  })

  test('Todos: Spalte wechseln ohne Ziehen und zurueck', async ({ page }, testInfo) => {
    test.skip(!isTouch(testInfo.project.name), 'Menue nur auf Touch-Geraeten')
    test.setTimeout(180_000)
    await page.goto('/todos')
    await settle(page)

    const columns = page.locator('[data-testid^="todo-column-"]')
    // Board laedt unter Last gelegentlich erst nach settle()
    await expect(columns.first()).toBeVisible({ timeout: 30_000 })
    test.skip((await columns.count()) < 2, 'mindestens zwei Spalten noetig')

    // Karte, die der angemeldete Benutzer angelegt hat (Bearbeiten-Knopf sichtbar) -
    // die darf er sicher umhaengen. Die Formate laufen parallel: jedes nimmt eine
    // andere Karte, sonst verschieben sich die Tests gegenseitig die Daten.
    // Auswahl nach ID statt nach Position - die Reihenfolge aendert sich mit jedem Verschieben.
    const slot = TOUCH_PROJECTS.indexOf(testInfo.project.name)
    await expect(page.locator('[data-testid^="todo-card-edit-"]').first()).toBeVisible({ timeout: 20_000 })
    const ownIds = (
      await page.locator('[data-testid^="todo-card-edit-"]').evaluateAll((els) =>
        els.map((el) => Number(el.getAttribute('data-testid')!.replace('todo-card-edit-', '')))
      )
    ).sort((a, b) => a - b)
    test.skip(ownIds.length <= slot, 'zu wenige eigene Aufgaben')
    const todoId = String(ownIds[slot])
    const card = page.getByTestId(`todo-card-${todoId}`)
    // Waehrend des Neuzeichnens haengt die Karte kurz in keiner Spalte - dann
    // null liefern, damit expect.poll weiter wartet statt abzubrechen
    const columnOf = async () =>
      card
        .evaluate((el) => el.closest('[data-testid^="todo-column-"]')?.getAttribute('data-testid')?.replace('todo-column-', '') ?? null)
        .catch(() => null)
    await expect.poll(columnOf, { timeout: 30_000 }).not.toBeNull()
    const original = (await columnOf())!

    // Spaltenleiste scrollt waagerecht mit Einrasten (nur Telefon)
    if (isPhone(page)) {
      const snap = await columns.first().evaluate((el) => getComputedStyle(el.parentElement!.parentElement!).scrollSnapType)
      expect(snap).toContain('x')
    }

    await card.scrollIntoViewIfNeeded()
    const moveBtn = page.getByTestId(`todo-card-move-${todoId}`)
    await expect(moveBtn).toBeVisible()
    const btnBox = (await moveBtn.boundingBox())!
    expect(btnBox.width).toBeGreaterThanOrEqual(36)
    await moveBtn.tap()
    const menu = page.getByTestId(`todo-card-move-menu-${todoId}`)
    await expect(menu).toBeVisible()
    await screenshot(page, testInfo, 'c-todos-move-menu')
    const target = menu.locator('[data-testid^="todo-card-move-to-"]').first()
    const targetId = (await target.getAttribute('data-testid'))!.replace('todo-card-move-to-', '')
    expect(targetId).not.toBe(original)
    const moveBack = async () => {
      await card.scrollIntoViewIfNeeded()
      await page.getByTestId(`todo-card-move-${todoId}`).tap()
      await page.getByTestId(`todo-card-move-menu-${todoId}`).getByTestId(`todo-card-move-to-${original}`).tap()
      await expect.poll(columnOf, { timeout: 30_000 }).toBe(original)
    }

    await target.tap()
    try {
      await expect.poll(columnOf, { timeout: 30_000 }).toBe(targetId)
    } catch (e) {
      // Daten nicht verschoben zuruecklassen - Serverstand per Neuladen holen
      await page.reload()
      await settle(page)
      if ((await columnOf()) !== original) await moveBack()
      throw e
    }

    // Zurueck in die Ausgangsspalte
    await moveBack()
    await expectNoOverflow(page)
  })

  test('Todos: Kopfzeile bleibt im Bild', async ({ page }, testInfo) => {
    await page.goto('/todos')
    await settle(page)
    const label = page.locator('main label').filter({ has: page.locator('button[role=checkbox]') }).first()
    await expect(label).toBeVisible({ timeout: 20_000 })
    const box = (await label.boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    await screenshot(page, testInfo, 'c-todos-header')
  })

  test('Prognosen: Tab-Leiste scrollt, Liquiditaet per Tab erreichbar', async ({ page }, testInfo) => {
    await page.goto('/forecasts')
    await settle(page)
    const tab = page.locator('main nav button[aria-current="page"]')
    await expect(tab).toHaveCount(1)
    const liquidity = page.locator('main nav button').nth(1)
    await liquidity.click()
    await expect(page).toHaveURL(/tab=liquidity/)
    await settle(page)
    await expect(page.locator('main nav button[aria-current="page"]')).toHaveCount(1)
    await screenshot(page, testInfo, 'c-forecasts-liquidity-tab')
    await expectNoOverflow(page)
  })

  test('Audit-Log: Karten auf dem Telefon klappen Aenderungen auf', async ({ page }, testInfo) => {
    await page.goto('/audit-log')
    await settle(page)
    if (!isPhone(page)) {
      await expect(page.getByTestId('audit-log-cards')).toBeHidden()
      await expect(page.getByTestId('audit-log-table-body')).toBeVisible({ timeout: 20_000 })
      return
    }
    await expect(page.getByTestId('audit-log-table-body')).toBeHidden()
    const cards = page.locator('[data-testid^="audit-log-card-"]')
    test.skip((await cards.count()) === 0, 'keine Eintraege')
    // Erste Karte mit Aenderungen (aufklappbar = Knopf)
    const card = cards.filter({ has: page.locator('button') }).first()
    const arrows = card.getByText('→')
    await expect(arrows).toHaveCount(0)
    await card.locator('button').first().click()
    await expect(arrows.first()).toBeVisible()
    await screenshot(page, testInfo, 'c-audit-card-expanded')
    await expectNoOverflow(page)
  })

  test('Einstellungen: Rolle-anlegen-Dialog passt in den Bildschirm', async ({ page }, testInfo) => {
    await page.goto('/settings/team/roles')
    await settle(page)
    await page.locator('main button').filter({ hasText: /Rolle erstellen|Create Role|Neue Rolle|New Role/i }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await page.waitForTimeout(300)
    await screenshot(page, testInfo, 'c-settings-role-dialog')
    const box = (await dialog.boundingBox())!
    const vp = page.viewportSize()!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width)
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height)
    await expectNoOverflow(page)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('Einstellungen: Benutzertabelle scrollt in sich', async ({ page }, testInfo) => {
    test.skip(page.viewportSize()!.width >= DESKTOP_MIN_WIDTH, 'Desktop hat Platz')
    await page.goto('/settings/team')
    await settle(page)
    const scroller = page.getByTestId('users-table-scroll')
    await expect(scroller).toBeVisible()
    const { scrollWidth, clientWidth } = await scroller.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
    expect(clientWidth).toBeLessThanOrEqual(page.viewportSize()!.width)
    expect(scrollWidth).toBeGreaterThanOrEqual(clientWidth)
    await screenshot(page, testInfo, 'c-settings-users')
    await expectNoOverflow(page)
  })
})
