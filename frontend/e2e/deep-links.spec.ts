import { test, expect, type Page } from '@playwright/test'

/**
 * Verlinkbare Ansichten: Tabs (auch verschachtelte) stehen in der Adresse,
 * `#<id>` rollt zum Ziel und hebt es kurz hervor (lib/linkTarget.ts).
 * Braucht `setup_test_data` (Vertraege mit Todos und Kommentaren).
 */

async function login(page: Page) {
  await page.goto('/login/local')
  await page.fill('input[type="email"]', 'admin@test.local')
  await page.fill('input[type="password"]', 'admin123')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/')
}

/** Erster offener Todo an einem Vertrag (Abfrage der Todo-Seite). */
async function contractWithTodo(page: Page): Promise<{ contractId: string; todoId: string }> {
  const token = await page.evaluate(() => localStorage.getItem('auth_token'))
  const res = await page.request.post('/graphql', {
    data: { query: '{ todosByAssignee(includeCompleted: false) { todos { id contractId } } }' },
    headers: { Authorization: `Bearer ${token}` },
  })
  const groups: { todos: { id: string; contractId: string | null }[] }[] =
    (await res.json()).data?.todosByAssignee ?? []
  const todos = groups.flatMap((g) => g.todos)
  const todo = todos.find((t) => t.contractId)
  test.skip(!todo, 'keine Todo-Daten an Vertraegen')
  return { contractId: String(todo!.contractId), todoId: String(todo!.id) }
}

test.describe('Deep Links', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('Vertrags-Tab steht in der Adresse und ueberlebt das Neuladen', async ({ page }) => {
    const { contractId } = await contractWithTodo(page)
    await page.goto(`/contracts/${contractId}`)
    await expect(page.getByTestId('contract-detail-tabs')).toBeVisible()

    await page.getByTestId('contract-tab-amendments').click()
    await expect(page).toHaveURL(/\?tab=amendments$/)

    await page.reload()
    await expect(page.getByTestId('contract-tab-amendments')).toHaveAttribute('aria-current', 'page')

    // Zurueck fuehrt zum vorigen Tab
    await page.getByTestId('contract-tab-invoices').click()
    await page.goBack()
    await expect(page).toHaveURL(/\?tab=amendments$/)
  })

  test('alter #<tab>-Link wird zu ?tab=', async ({ page }) => {
    const { contractId } = await contractWithTodo(page)
    await page.goto(`/contracts/${contractId}#attachments`)
    await expect(page).toHaveURL(/\?tab=attachments$/)
    await expect(page.getByTestId('contract-tab-attachments')).toHaveAttribute('aria-current', 'page')
  })

  test('Link auf ein Todo oeffnet den Tab, rollt hin und hebt es hervor', async ({ page }) => {
    const { contractId, todoId } = await contractWithTodo(page)
    await page.goto(`/contracts/${contractId}?tab=todos#todo-${todoId}`)

    const todo = page.locator(`#todo-${todoId}`)
    await expect(todo).toBeInViewport()
    await expect(todo).toHaveClass(/link-target-flash/)
    // Animation laeuft aus, die Klasse verschwindet wieder
    await expect(todo).not.toHaveClass(/link-target-flash/, { timeout: 5_000 })
  })

  test('Link kopieren liefert die Adresse mit Tab und Sprungziel', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const { contractId, todoId } = await contractWithTodo(page)
    await page.goto(`/contracts/${contractId}?tab=todos`)

    await page.locator(`#todo-${todoId}`).hover()
    await page.getByTestId(`copy-link-todo-${todoId}`).click()
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toMatch(new RegExp(`/contracts/${contractId}\\?tab=todos#todo-${todoId}$`))
  })

  test('verschachtelter Tab in den Einstellungen ist verlinkbar', async ({ page }) => {
    await page.goto('/settings/integrations/time-tracking?sub=projects')
    await expect(page).toHaveURL(/sub=projects/)
    // Ohne eingerichtete Zeiterfassung sind die Unter-Tabs gesperrt - dann
    // bleibt es bei "Verbindung", nie ein gesperrter Tab mit leerem Inhalt
    const projects = page.getByTestId('tt-subtab-projects')
    await expect(projects).toBeVisible()
    const active = (await projects.isDisabled()) ? 'tt-subtab-connection' : 'tt-subtab-projects'
    await expect(page.getByTestId(active)).toHaveAttribute('aria-current', 'page')
  })

  test('nach der Anmeldung geht es zum urspruenglichen Link', async ({ page }) => {
    const { contractId, todoId } = await contractWithTodo(page)
    // abmelden, ohne den Browser-Tab zu verlassen (sessionStorage bleibt)
    await page.evaluate(() => localStorage.clear())

    const target = `/contracts/${contractId}?tab=todos#todo-${todoId}`
    await page.goto(target)
    await expect(page).toHaveURL(/\/login/)

    // ueber den Notweg anmelden - Router-State geht dabei verloren, das Ziel nicht
    await page.goto('/login/local')
    await page.fill('input[type="email"]', 'admin@test.local')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')

    await expect(page).toHaveURL((url) => `${url.pathname}${url.search}${url.hash}` === target)
    await expect(page.locator(`#todo-${todoId}`)).toBeInViewport()
  })
})
