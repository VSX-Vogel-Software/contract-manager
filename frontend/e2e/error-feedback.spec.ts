import { test, expect } from '@playwright/test'

/**
 * Prueft im echten Browser, dass ein Fehler beim Benutzer ankommt statt nur
 * im Log oder in der Console zu landen.
 *
 * Voraussetzung: `python manage.py setup_test_data` im Backend. Der Benutzer
 * viewer@test.local mit der Viewer-Rolle wird von diesem Test selbst nicht
 * angelegt — siehe README-Abschnitt zu den E2E-Tests.
 */
test.describe('Fehlerrueckmeldung', () => {
  test('zeigt einen Rechtefehler als Toast statt einer leeren Seite', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', 'viewer@test.local')
    await page.fill('input[type="password"]', 'viewer123')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/')

    // Die Abteilungsanalyse darf die Viewer-Rolle sehen. Die Seite fragt
    // nebenbei die Report-Zeitplaene ab, und die verlangen settings.read -
    // genau der Fehler, der in Produktion nur im Log stand.
    await page.goto('/department-analysis')

    const toast = page.locator('[data-testid="toast-error"]')
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('settings.read')
  })

  test('zeigt einen Netzwerkfehler, der sonst wie nichts aussieht', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', 'admin@test.local')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/')

    // Ab jetzt scheitert jede GraphQL-Anfrage auf Transportebene.
    await page.route('**/graphql', (route) => route.abort())
    await page.goto('/customers')

    await expect(page.locator('[data-testid="toast-error"]')).toBeVisible()
  })

  test('meldet einen Fehler nicht doppelt, wenn die Maske ihn selbst anzeigt', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', 'admin@test.local')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/')

    await page.goto('/settings/general/reports')

    // Der Knopf ist gesperrt, solange kein Empfaenger dasteht. Gespeichert wird
    // nicht - der Server kennt also weiterhin keine Empfaenger und lehnt ab.
    await page.getByTestId('report-schedule-recipients-absence').fill('hr@example.com')
    await page.getByTestId('report-schedule-send-absence').click()

    // Grosszuegig: der Server versucht dabei eine M365-Verbindung, und beim
    // ersten Zugriff nach einem Neustart kompiliert der Dev-Server noch.
    await expect(page.getByTestId('report-schedule-message-absence')).toBeVisible({
      timeout: 20000,
    })
    await expect(page.locator('[data-testid="toast-error"]')).toHaveCount(0)
  })

  test('erklaert eine Seite ohne Berechtigung, statt sie leer zu lassen', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', 'viewer@test.local')
    await page.fill('input[type="password"]', 'viewer123')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/')

    // Direktlink in einen Bereich, fuer den die Viewer-Rolle keine Rechte hat.
    await page.goto('/settings/general/reports')

    await expect(page.getByTestId('no-permission-notice')).toBeVisible()
  })

  test('laesst sich schliessen', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', 'admin@test.local')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/')

    await page.route('**/graphql', (route) => route.abort())
    await page.goto('/customers')

    const toast = page.locator('[data-testid="toast-error"]')
    await expect(toast).toBeVisible()
    await page.locator('[data-testid="toast-close"]').first().click()
    await expect(toast).toBeHidden()
  })
})
