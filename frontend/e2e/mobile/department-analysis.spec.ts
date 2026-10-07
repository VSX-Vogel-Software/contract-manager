import { test } from '@playwright/test'

// Abteilungsanalyse mit Inhalt: Die Demo-Daten haben keine Abteilungen, daher
// kommen Abteilungen und Auswertung als vorgetaeuschte GraphQL-Antworten.
// Kopfzeilen mit Umschaltern und Export liefen auf 360/375 px ueber den Rand.
import { expectNoOverflow, screenshot, settle } from './layout-helpers'

const depts = ['Entwicklung', 'Support & Betrieb', 'Vertrieb', 'Verwaltung']
const dist = depts.map((d, i) => ({ departmentName: d, hours: 100 + i * 40, percentage: 25 }))
const row = (u: string) => ({
  userName: u, totalHours: 160, absenceDays: 2, sickDays: 1, sickCertificateDays: 0, sickChildDays: 0,
  departments: dist.map((d) => ({ ...d, hours: 40 })),
})
const analysis = {
  totalHours: 640, totalHoursFilled: 700, distribution: dist, distributionFilled: dist,
  userMatrix: ['Maximilian Mustermann-Schneider', 'Erika Beispiel'].map(row),
  userMatrixFilled: ['Maximilian Mustermann-Schneider', 'Erika Beispiel'].map(row),
  costDistribution: depts.map((d) => ({ departmentName: d, cost: 10000, percentage: 25, ftes: 1.5 })),
  totalCost: 40000,
}

for (const tab of ['allocation', 'absences']) {
  test(`Abteilungsanalyse ${tab}`, async ({ page }, testInfo) => {
    await page.route('**/graphql', async (route) => {
      const body = route.request().postDataJSON()
      if (body?.operationName === 'DepartmentsCheck')
        return route.fulfill({ json: { data: { departments: depts.map((name, i) => ({ id: String(i + 1), name, __typename: 'DepartmentType' })) } } })
      if (body?.operationName === 'DepartmentTimeAnalysis')
        return route.fulfill({ json: { data: { departmentTimeAnalysis: analysis } } })
      return route.continue()
    })
    await page.goto('/department-analysis')
    await settle(page)
    if (tab === 'absences') await page.getByRole('button', { name: /Absences|Abwesenheiten/ }).click()
    await page.waitForTimeout(800)
    await screenshot(page, testInfo, `department-analysis-${tab}`)
    await expectNoOverflow(page)
  })
}
