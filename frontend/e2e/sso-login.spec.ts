import { test, expect } from '@playwright/test'

/**
 * Der vollstaendige Anmeldeweg gegen die OIDC-Attrappe.
 *
 * Voraussetzung:
 *   docker compose --profile sso up -d mock-oidc
 *   docker compose exec backend python manage.py use_mock_sso
 *
 * Die Attrappe ist so eingestellt, dass sie ohne Anmeldemaske sofort
 * zurueckleitet und ein Token mit Entra-typischen Claims ausstellt.
 */
test.describe('Anmeldung ueber einen OIDC-Anbieter', () => {
  test('fuehrt vom Knopf bis in die angemeldete Anwendung', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByTestId('sso-button')).toBeVisible()
    await page.getByTestId('sso-button').click()

    // Attrappe leitet sofort zurueck, das Backend stellt den eigenen Token aus.
    await expect(page).toHaveURL('/', { timeout: 20000 })
    await expect(page.locator('[data-testid="chat-toggle"], nav')).toBeTruthy()
  })

  test('laesst den festen Notweg trotz aktivem SSO zu', async ({ page }) => {
    await page.goto('/login/local')

    await expect(page.getByTestId('local-login-form')).toBeVisible()
    await expect(page.getByTestId('sso-button')).toHaveCount(0)
  })

  test('bietet nach einem Ausfall die Passwort-Anmeldung an', async ({ page }) => {
    // Der Rueckkanal meldet einen technischen Ausfall.
    await page.goto('/login#sso_error=unavailable')

    await expect(page.getByTestId('local-login-form')).toBeVisible()
    await expect(page.getByTestId('login-error')).toBeVisible()
  })

  test('bietet nach einer Ablehnung keine Passwort-Anmeldung an', async ({ page }) => {
    await page.goto('/login#sso_error=denied&detail=Account+is+blocked')

    await expect(page.getByTestId('login-error')).toContainText('Account is blocked')
    await expect(page.getByTestId('local-login-form')).toHaveCount(0)
  })
})
