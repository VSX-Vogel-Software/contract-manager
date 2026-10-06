import { defineConfig, devices } from '@playwright/test'

// Gegen den laufenden Docker-Stack: E2E_BASE_URL=http://localhost:4000
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const authFile = 'playwright/.auth/user.json'

// Bildschirmformate fuer die Mobil-Suite (e2e/mobile/). Alle in Chromium mit
// Geraeteemulation, damit kein WebKit-Download noetig ist.
const touch = { isMobile: true, hasTouch: true, browserName: 'chromium' as const }
const mobileProjects = [
  { name: 'phone-small', use: { ...touch, viewport: { width: 360, height: 740 }, deviceScaleFactor: 3 } },
  { name: 'iphone-se', use: { ...touch, viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 } },
  { name: 'iphone-15', use: { ...touch, viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 } },
  { name: 'phone-landscape', use: { ...touch, viewport: { width: 852, height: 393 }, deviceScaleFactor: 3 } },
  { name: 'tablet-portrait', use: { ...touch, viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2 } },
  { name: 'tablet-landscape', use: { ...touch, viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 } },
  { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
].map((p) => ({
  ...p,
  testMatch: /mobile[\\/].*\.spec\.ts/,
  dependencies: ['setup'],
  use: { ...p.use, storageState: authFile },
}))

export default defineConfig({
  testDir: './e2e',
  // Parallele Laeufe brauchen getrennte Verzeichnisse - Playwright leert das
  // outputDir bei jedem Start.
  outputDir: process.env.E2E_OUTPUT ?? 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    // E2E_CHANNEL=msedge (oder chrome) nimmt einen installierten Browser statt des
    // Playwright-Downloads
    channel: process.env.E2E_CHANNEL,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      testIgnore: /mobile[\\/]/,
      use: { ...devices['Desktop Chrome'] },
    },
    ...mobileProjects,
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
      },
})
