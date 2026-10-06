import { test as setup, expect } from '@playwright/test'

const authFile = 'playwright/.auth/user.json'

setup('authenticate', async ({ page }) => {
  // /login blendet das Formular aus, sobald SSO aktiv ist; der Notweg nicht
  await page.goto('/login/local')

  await page.fill('input[type="email"]', 'admin@test.local')
  await page.fill('input[type="password"]', 'admin123')
  await page.click('button[type="submit"]')

  // Wait for redirect to dashboard
  await expect(page).toHaveURL('/', { timeout: 30_000 })

  // Save authentication state
  await page.context().storageState({ path: authFile })
})
